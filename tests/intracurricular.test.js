import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, availableAcademicYears } from '../src/data/constants.js';
import { createCocurricularActivity, listCocurricularActivities } from '../src/services/cocurricular.js';
import {
  createIntracurricularActivity, deleteIntracurricularActivity,
  listAssignedIntracurricularActivities, listIntracurricularActivities, updateIntracurricularActivity
} from '../src/services/intracurricular.js';
import { createAcademicYear } from '../src/services/references.js';
import { loadDb } from '../src/services/storage.js';

/* Tahun pelajaran pembanding dipilih dari tahun yang belum disediakan aplikasi supaya test
   tidak bentrok saat tahun berjalan bergeser. Pola ini mengikuti tests/stage10.test.js. */
const TAHUN_LAIN=(()=>{const tersedia=new Set(availableAcademicYears());let mulai=Number(ACADEMIC_YEAR.slice(0,4))+9;while(tersedia.has(`${mulai}/${mulai+1}`))mulai+=1;return `${mulai}/${mulai+1}`;})();
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};globalThis.sessionStorage=globalThis.localStorage;}
const ganjil=`Ganjil ${ACADEMIC_YEAR}`,genap=`Genap ${ACADEMIC_YEAR}`;
const admin={role:'admin',classId:null,accountId:'admin',academicYear:ACADEMIC_YEAR,semester:ganjil};
function isi(extra={}){return {name:'Literasi Matematika',description:'Penguatan pembelajaran intrakurikuler.',classId:'5B',academicYear:ACADEMIC_YEAR,semester:ganjil,active:true,...extra};}

test('Data Intrakurikuler tersimpan terpisah dari Data Kokurikuler',()=>{
  useMemoryStorage();
  createCocurricularActivity(admin,{name:'Projek Lingkungan',description:'Kegiatan projek.',classId:'5B',academicYear:ACADEMIC_YEAR,semester:ganjil,active:true});
  const intra=createIntracurricularActivity(admin,isi());
  assert.deepEqual(listIntracurricularActivities(admin).map(item=>item.name),['Literasi Matematika']);
  assert.deepEqual(listCocurricularActivities(admin).map(item=>item.name),['Projek Lingkungan']);
  const db=loadDb();
  assert.equal(Object.values(db.intracurricularActivities)[0].id,intra.id);
  assert.equal(Object.keys(db.intracurricularActivities).length,1);
  assert.equal(Object.keys(db.cocurricularActivities).length,1);
});

test('Guru tidak dapat mengelola master data Intrakurikuler',()=>{
  useMemoryStorage();
  const guru={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:ganjil};
  assert.throws(()=>createIntracurricularActivity(guru,isi({name:'Tidak Sah'})),/Hanya Admin/);
  assert.throws(()=>listIntracurricularActivities(guru),/Hanya Admin/);
  assert.throws(()=>updateIntracurricularActivity(guru,'apa-saja',isi()),/Hanya Admin/);
  assert.throws(()=>deleteIntracurricularActivity(guru,'apa-saja'),/Hanya Admin/);
});

test('CRUD intrakurikuler terisolasi per rombel, semester, dan tahun pelajaran',()=>{
  useMemoryStorage();createAcademicYear(admin,TAHUN_LAIN);
  const pertama=createIntracurricularActivity(admin,isi());
  assert.throws(()=>createIntracurricularActivity(admin,isi({name:'literasi matematika'})),/sudah tersedia/);
  createIntracurricularActivity(admin,isi({semester:genap}));
  createIntracurricularActivity(admin,isi({classId:'5A'}));
  createIntracurricularActivity(admin,isi({academicYear:TAHUN_LAIN,semester:`Ganjil ${TAHUN_LAIN}`}));
  assert.equal(listIntracurricularActivities(admin,{classId:'5B',semester:ganjil,academicYear:ACADEMIC_YEAR}).length,1);
  assert.equal(listIntracurricularActivities(admin).length,4);
  const diperbarui=updateIntracurricularActivity(admin,pertama.id,isi({description:'Deskripsi diperbarui.',active:false}));
  assert.equal(diperbarui.active,false);
  assert.match(diperbarui.description,/diperbarui/);
  assert.equal(diperbarui.createdAt,pertama.createdAt);
  assert.equal(deleteIntracurricularActivity(admin,pertama.id),true);
  assert.equal(listIntracurricularActivities(admin,{classId:'5B',semester:ganjil,academicYear:ACADEMIC_YEAR}).length,0);
});

test('Isian intrakurikuler divalidasi sebelum tersimpan',()=>{
  useMemoryStorage();
  assert.throws(()=>createIntracurricularActivity(admin,isi({name:''})),/Nama kegiatan/);
  assert.throws(()=>createIntracurricularActivity(admin,isi({description:''})),/Deskripsi kegiatan/);
  assert.throws(()=>createIntracurricularActivity(admin,isi({classId:'9Z'})),/Rombel intrakurikuler/);
  assert.throws(()=>createIntracurricularActivity(admin,isi({academicYear:'1999/2000'})),/Tahun pelajaran intrakurikuler/);
  assert.throws(()=>createIntracurricularActivity(admin,isi({semester:'Ganjil 1999/2000'})),/Semester intrakurikuler/);
  assert.throws(()=>updateIntracurricularActivity(admin,'tidak-ada',isi()),/tidak ditemukan/);
  assert.throws(()=>deleteIntracurricularActivity(admin,'tidak-ada'),/tidak ditemukan/);
  assert.equal(Object.keys(loadDb().intracurricularActivities).length,0);
});

test('Wali kelas membaca kegiatan aktif rombelnya sendiri tanpa hak kelola',()=>{
  useMemoryStorage();
  createIntracurricularActivity(admin,isi());
  createIntracurricularActivity(admin,isi({name:'Numerasi Dasar',active:false}));
  createIntracurricularActivity(admin,isi({classId:'5A',name:'Literasi Kelas Lain'}));
  createIntracurricularActivity(admin,isi({semester:genap,name:'Literasi Genap'}));
  const guru={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:ganjil};
  assert.deepEqual(listAssignedIntracurricularActivities(guru).map(item=>item.name),['Literasi Matematika']);
  assert.throws(()=>listAssignedIntracurricularActivities({role:'teacher'}),/tidak berwenang/);
  assert.throws(()=>listAssignedIntracurricularActivities({role:'owner'}),/tidak berwenang/);
  assert.deepEqual(listAssignedIntracurricularActivities(admin).map(item=>item.name),['Literasi Kelas Lain','Literasi Matematika']);
});
