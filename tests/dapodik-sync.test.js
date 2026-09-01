import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { buildDapodikPreview } from '../src/services/dapodik-sync.js';
import { loadDb, updateDb } from '../src/services/storage.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};globalThis.sessionStorage=globalThis.localStorage;}
const ganjil=`Ganjil ${ACADEMIC_YEAR}`;
const admin={role:'admin',accountId:'admin',academicYear:ACADEMIC_YEAR,semester:ganjil};
const guru={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:ganjil};

/* Siswa ditanam langsung supaya test dapat menyiapkan origin dan dapodikId apa pun,
   termasuk kombinasi yang tidak bisa dibuat lewat UI. */
function seedStudent(record){
  const student={academicYear:ACADEMIC_YEAR,semester:ganjil,isActive:true,gender:'P',...record};
  updateDb(db=>{db.students[`${ACADEMIC_YEAR}|${ganjil}|${student.classId}|${student.id}`]=student;return db;});
  return student;
}
function dataset(extra={}){
  return {
    school:{npsn:'20218098',name:'SDN SATRIA JAYA 01',semesterId:'20262'},
    teachers:[],classes:[{dapodikId:'rombel-5b',name:'5B',grade:5,teacherDapodikId:'',isActive:true}],
    subjects:[],lessons:[],students:[],...extra
  };
}
const konteks={npsn:'20218098',semesterId:'20262'};

test('Preview mencocokkan ID Dapodik lebih dulu lalu NISN',()=>{
  useMemoryStorage();
  seedStudent({id:'local-1',dapodikId:'pd-1',nisn:'0012345678',name:'Nama Lama',origin:'dapodik',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({students:[{dapodikId:'pd-1',nisn:'0099999999',name:'Nama Baru',gender:'P',classDapodikId:'rombel-5b',isActive:true}]}),konteks);
  assert.equal(preview.students[0].action,'update');
  assert.equal(preview.students[0].localId,'local-1');
  assert.equal(preview.students[0].matchedBy,'dapodik-id');
  assert.equal(preview.students[0].classId,'5B');
});

test('Pencocokan NISN dipakai saat ID Dapodik belum tercatat',()=>{
  useMemoryStorage();
  seedStudent({id:'local-1',nisn:'0012345678',name:'Alya',origin:'dapodik',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({students:[{dapodikId:'pd-1',nisn:'0012345678',name:'Alya',gender:'P',classDapodikId:'rombel-5b',isActive:true}]}),konteks);
  assert.equal(preview.students[0].action,'update');
  assert.equal(preview.students[0].matchedBy,'nisn');
});

test('Siswa manual yang tidak ada di Dapodik tidak pernah diarsipkan',()=>{
  useMemoryStorage();
  seedStudent({id:'manual-1',nisn:'0012345678',name:'Siswa Manual',origin:'manual-teacher',classId:'5B'});
  seedStudent({id:'manual-2',nisn:'0012345679',name:'Siswa Admin',origin:'manual-admin',classId:'5B'});
  seedStudent({id:'lama-1',nisn:'0012345680',name:'Siswa Lama',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({students:[]}),konteks);
  assert.equal(preview.students.some(item=>item.action==='archive'),false);
  assert.equal(preview.counts.archive,0);
});

test('Siswa asal Dapodik yang hilang dari respons ditandai archive, bukan dihapus',()=>{
  useMemoryStorage();
  seedStudent({id:'imported-1',dapodikId:'pd-9',nisn:'0012345681',name:'Siswa Impor',origin:'dapodik',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({students:[]}),konteks);
  const baris=preview.students.find(item=>item.localId==='imported-1');
  assert.equal(baris.action,'archive');
  assert.equal(preview.counts.archive,1);
  assert.equal(preview.students.some(item=>item.action==='delete'),false,'preview tidak pernah menawarkan penghapusan');
});

test('NISN kembar dengan identitas Dapodik yang tidak cocok menjadi conflict',()=>{
  useMemoryStorage();
  seedStudent({id:'manual-1',nisn:'0012345678',name:'Siswa Manual',origin:'manual-teacher',classId:'5B'});
  seedStudent({id:'manual-2',nisn:'0012345678',name:'Siswa Kembar',origin:'manual-teacher',classId:'5C'});
  const preview=buildDapodikPreview(admin,dataset({students:[{dapodikId:'pd-2',nisn:'0012345678',name:'Nama Berbeda',gender:'P',classDapodikId:'rombel-5b',isActive:true}]}),konteks);
  assert.equal(preview.students[0].action,'conflict');
  assert.equal(preview.counts.conflict,1);
});

test('Siswa Dapodik yang belum ada secara lokal menjadi create, yang identik menjadi unchanged',()=>{
  useMemoryStorage();
  seedStudent({id:'local-1',dapodikId:'pd-1',nisn:'0012345678',nis:'5001',name:'Alya',gender:'P',origin:'dapodik',classId:'5B'});
  const preview=buildDapodikPreview(admin,dataset({students:[
    {dapodikId:'pd-1',nisn:'0012345678',nis:'5001',name:'Alya',gender:'P',classDapodikId:'rombel-5b',isActive:true},
    {dapodikId:'pd-2',nisn:'0012345679',nis:'5002',name:'Budi',gender:'L',classDapodikId:'rombel-5b',isActive:true}
  ]}),konteks);
  const byId=Object.fromEntries(preview.students.map(item=>[item.dapodikId,item.action]));
  assert.equal(byId['pd-1'],'unchanged');
  assert.equal(byId['pd-2'],'create');
  assert.equal(preview.counts.create,1);
  assert.equal(preview.counts.unchanged,1);
});

test('Rombel Dapodik yang tidak dikenal menjadi conflict, bukan tebakan rombel',()=>{
  useMemoryStorage();
  const preview=buildDapodikPreview(admin,dataset({students:[{dapodikId:'pd-3',nisn:'0012345682',name:'Tanpa Rombel',gender:'L',classDapodikId:'rombel-entah',isActive:true}]}),konteks);
  assert.equal(preview.students[0].action,'conflict');
  assert.match(preview.students[0].reason,/rombel/i);
});

test('Preview bersifat sekali pakai, punya ID, dan tidak mengubah data lokal',()=>{
  useMemoryStorage();
  seedStudent({id:'local-1',dapodikId:'pd-1',nisn:'0012345678',name:'Nama Lama',origin:'dapodik',classId:'5B'});
  const sebelum=JSON.parse(JSON.stringify(loadDb().students));
  const preview=buildDapodikPreview(admin,dataset({students:[{dapodikId:'pd-1',nisn:'0012345678',name:'Nama Baru',gender:'P',classDapodikId:'rombel-5b',isActive:true}]}),konteks);
  assert.match(preview.previewId,/.+/);
  assert.match(preview.createdAt,/^\d{4}-\d{2}-\d{2}T/);
  assert.equal(preview.context.npsn,'20218098');
  assert.deepEqual(loadDb().students,sebelum,'membuat preview tidak menyentuh data siswa');
  assert.throws(()=>{preview.students[0].action='create';},TypeError,'baris preview beku');
  const kedua=buildDapodikPreview(admin,dataset({students:[]}),konteks);
  assert.notEqual(kedua.previewId,preview.previewId);
});

test('Preview hanya untuk Admin dan menolak konteks sekolah yang berbeda',()=>{
  useMemoryStorage();
  assert.throws(()=>buildDapodikPreview(guru,dataset(),konteks),/Hanya Admin/);
  assert.throws(()=>buildDapodikPreview(admin,dataset(),{npsn:'99999999',semesterId:'20262'}),/NPSN Dapodik berbeda/);
  assert.throws(()=>buildDapodikPreview(admin,dataset(),{npsn:'20218098',semesterId:'20261'}),/Semester Dapodik berbeda/);
});
