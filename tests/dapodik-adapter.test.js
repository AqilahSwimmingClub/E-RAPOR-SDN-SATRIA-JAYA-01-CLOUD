import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDapodikDataset, normalizeDapodikEnvelope, normalizeSchool, validateSchoolContext
} from '../src/services/dapodik-adapter.js';

const sekolah={data:[{npsn:'20218098',nama:'SDN SATRIA JAYA 01',semester_id:'20262'}]};

test('Adapter membuka amplop respons Dapodik yang lazim tanpa kehilangan baris',()=>{
  assert.deepEqual(normalizeDapodikEnvelope([{id:1}]),[{id:1}]);
  assert.deepEqual(normalizeDapodikEnvelope({rows:[{id:2}]}),[{id:2}]);
  assert.deepEqual(normalizeDapodikEnvelope({data:[{id:3}]}),[{id:3}]);
  assert.deepEqual(normalizeDapodikEnvelope({result:{rows:[{id:4}]}}),[{id:4}]);
  assert.deepEqual(normalizeDapodikEnvelope({results:[{id:5}]}),[{id:5}]);
  assert.deepEqual(normalizeDapodikEnvelope([]),[]);
});

test('Adapter menormalkan identitas sekolah dan siswa',()=>{
  const data=normalizeDapodikDataset({
    school:sekolah,
    students:{rows:[{peserta_didik_id:'pd-1',nisn:'0012345678',nis:'5001',nama:'Alya',jenis_kelamin:'P',rombongan_belajar_id:'rombel-5b'}]},
    teachers:[],classes:[],subjects:[],lessons:[]
  });
  assert.equal(data.school.npsn,'20218098');
  assert.equal(data.school.name,'SDN SATRIA JAYA 01');
  assert.equal(data.school.semesterId,'20262');
  assert.equal(data.students[0].dapodikId,'pd-1');
  assert.equal(data.students[0].name,'Alya');
  assert.equal(data.students[0].nisn,'0012345678');
  assert.equal(data.students[0].gender,'P');
  assert.equal(data.students[0].classDapodikId,'rombel-5b');
  assert.equal(data.students[0].isActive,true);
});

test('Amplop tak dikenal dan konteks sekolah berbeda menghentikan sinkronisasi',()=>{
  assert.throws(()=>normalizeDapodikEnvelope({unexpected:true}),/Format respons Dapodik tidak didukung/);
  assert.throws(()=>normalizeDapodikEnvelope(null),/Format respons Dapodik tidak didukung/);
  assert.throws(()=>normalizeDapodikEnvelope('teks'),/Format respons Dapodik tidak didukung/);
  assert.throws(()=>validateSchoolContext({npsn:'99999999',semesterId:'20262'},{npsn:'20218098',semesterId:'20262'}),/NPSN Dapodik berbeda/);
  assert.throws(()=>validateSchoolContext({npsn:'20218098',semesterId:'20261'},{npsn:'20218098',semesterId:'20262'}),/Semester Dapodik berbeda/);
  assert.equal(validateSchoolContext({npsn:'20218098',semesterId:'20262'},{npsn:'20218098',semesterId:'20262'}),true);
});

test('Siswa nonaktif Dapodik ditandai, bukan dibuang diam-diam',()=>{
  const data=normalizeDapodikDataset({school:sekolah,students:[
    {peserta_didik_id:'pd-1',nisn:'0012345678',nama:'Alya',jenis_kelamin:'P',rombongan_belajar_id:'r1'},
    {peserta_didik_id:'pd-2',nisn:'0012345679',nama:'Budi',jenis_kelamin:'L',rombongan_belajar_id:'r1',soft_delete:1},
    {peserta_didik_id:'pd-3',nisn:'0012345680',nama:'Citra',jenis_kelamin:'P',rombongan_belajar_id:'r1',soft_delete:'1'}
  ],teachers:[],classes:[],subjects:[],lessons:[]});
  assert.equal(data.students.length,3);
  assert.deepEqual(data.students.map(item=>item.isActive),[true,false,false]);
});

test('Baris tanpa ID wajib atau ber-ID kembar ditolak sebelum menyentuh data lokal',()=>{
  const dengan=students=>()=>normalizeDapodikDataset({school:sekolah,students,teachers:[],classes:[],subjects:[],lessons:[]});
  assert.throws(dengan([{nisn:'0012345678',nama:'Tanpa ID'}]),/ID Dapodik/);
  assert.throws(dengan([{peserta_didik_id:'pd-1',nama:''}]),/Nama/);
  assert.throws(dengan([
    {peserta_didik_id:'pd-1',nama:'Alya',nisn:'0012345678'},
    {peserta_didik_id:'pd-1',nama:'Alya Kembar',nisn:'0012345699'}
  ]),/kembar/);
});

test('Sekolah, guru, rombel, mapel, dan pembelajaran dinormalkan dengan peta kolom eksplisit',()=>{
  const data=normalizeDapodikDataset({
    school:sekolah,
    students:[],
    teachers:[{ptk_id:'ptk-1',nama:'Ibu Sri',nip:'19800101',jenis_kelamin:'P'}],
    classes:[{rombongan_belajar_id:'r1',nama:'5B',tingkat_pendidikan_id:'5',ptk_id:'ptk-1'}],
    subjects:[{mata_pelajaran_id:'mp-1',nama:'Matematika'}],
    lessons:[{pembelajaran_id:'pb-1',rombongan_belajar_id:'r1',mata_pelajaran_id:'mp-1',ptk_id:'ptk-1'}]
  });
  assert.equal(data.teachers[0].dapodikId,'ptk-1');
  assert.equal(data.teachers[0].name,'Ibu Sri');
  assert.equal(data.teachers[0].nip,'19800101');
  assert.equal(data.classes[0].dapodikId,'r1');
  assert.equal(data.classes[0].name,'5B');
  assert.equal(data.classes[0].grade,5);
  assert.equal(data.classes[0].teacherDapodikId,'ptk-1');
  assert.equal(data.subjects[0].dapodikId,'mp-1');
  assert.equal(data.subjects[0].name,'Matematika');
  assert.equal(data.lessons[0].dapodikId,'pb-1');
  assert.equal(data.lessons[0].classDapodikId,'r1');
  assert.equal(data.lessons[0].subjectDapodikId,'mp-1');
  assert.equal(data.lessons[0].teacherDapodikId,'ptk-1');
});

test('normalizeSchool menolak sekolah tanpa NPSN dan hanya menyimpan kolom yang dipakai',()=>{
  assert.throws(()=>normalizeSchool({data:[{nama:'Tanpa NPSN'}]}),/NPSN/);
  const school=normalizeSchool(sekolah);
  assert.deepEqual(Object.keys(school).sort(),['name','npsn','semesterId']);
});

test('Adapter tidak menyentuh localStorage sama sekali',async()=>{
  const asli=globalThis.localStorage;
  let disentuh=false;
  globalThis.localStorage={getItem(){disentuh=true;return null;},setItem(){disentuh=true;},removeItem(){disentuh=true;},clear(){disentuh=true;}};
  try{
    normalizeDapodikDataset({school:sekolah,students:[],teachers:[],classes:[],subjects:[],lessons:[]});
    assert.equal(disentuh,false,'adapter murni, tanpa akses penyimpanan');
  }finally{if(asli===undefined)delete globalThis.localStorage;else globalThis.localStorage=asli;}
  const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../src/services/dapodik-adapter.js',import.meta.url),'utf8'));
  assert.doesNotMatch(source,/localStorage|loadDb|updateDb/);
});
