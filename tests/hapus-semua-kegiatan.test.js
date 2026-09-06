import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { setTeacherAssignment } from '../src/services/teacher-assignments.js';
import { invalidateDbCache, loadDb, saveSubjectMapping as simpanMapping } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { buktiButirSiswa } from '../src/services/cp-attainment.js';
import {
  getStudentCocurricular, hapusSemuaCocurricular, hapusSemuaExtracurricular,
  hapusSemuaIntracurricular, listExtracurriculars, saveAllCocurricular,
  saveAllExtracurricular,
} from '../src/services/completeness.js';
import {
  getStudentIntracurricularSelection, saveStudentIntracurricularSelection,
} from '../src/services/intracurricular.js';
import { getReportDocument } from '../src/services/documents.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';

/* MEMBATALKAN SATU KEGIATAN YANG SUDAH TERLANJUR DISIMPAN.

   Guru mencoba sebuah kegiatan, mengisi seluruh siswa, lalu menyimpannya - dan kemudian
   memutuskan kegiatan itu tidak jadi dipakai. Sampai sebelum ini catatannya tetap tersimpan
   dan tetap terbawa ke Rapor, tanpa satu pun cara untuk membatalkannya.

   Yang diuji berkas ini ada dua dan keduanya harus benar bersamaan:

     Hapus Semua BENAR-BENAR membersihkan kegiatan yang sedang dibuka, sampai ke penyimpanan,
     sehingga Rapor tidak lagi membacanya.

     Hapus Semua TIDAK PERNAH melewati batas kotaknya: kegiatan lain, mapel lain, rombel lain,
     semester lain, tahun lain, dan seluruh data akademik di luar menu itu tetap utuh. */

function useMemoryStorage(){
  const values=new Map();
  const buat=()=>({getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),
    clear:()=>values.clear()});
  globalThis.localStorage=buat();globalThis.sessionStorage=buat();
  invalidateDbCache();
}
const SEMESTER=`Ganjil ${ACADEMIC_YEAR}`;
const admin=(semester=SEMESTER)=>({role:'admin',academicYear:ACADEMIC_YEAR,semester,userName:'Admin'});
const guru=(classId='5B',semester=SEMESTER)=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});

function siapkanScope(classId='5B',semester=SEMESTER){
  const sesi=guru(classId,semester);
  simpanMapping(sesi,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  setTeacherAssignment(admin(semester),classId,
    {subjectIds:SUBJECTS_DEFAULT.map(item=>item.id),active:true});
  return sesi;
}
function tambahSiswa(sesi,index=1){
  return createStudent(sesi,{classId:sesi.classId,nis:`${sesi.classId}-D${index}`,
    nisn:`9911${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,
    gender:index%2?'L':'P',religion:'Islam',photo:''});
}
/* Mapel diambil dari daftar milik SISWA ITU SENDIRI, sehingga mapel agama yang bukan agamanya
   tidak pernah terpilih - baris rapornya memang tidak akan pernah ada. */
function mapelBerbutir(sesi,student,jumlah=2){
  const hasil=[];
  for(const item of listSubjectsForStudent(sesi,student)){
    let butir=[];
    try{butir=listCpButir(sesi,item.id,{activeOnly:true});}catch{continue;}
    if(butir.length)hasil.push(item.id);
    if(hasil.length>=jumlah)break;
  }
  return hasil;
}
/* Satu rombel dengan dua siswa dan dua mata pelajaran berbutir. */
function panggung(){
  useMemoryStorage();
  const sesi=siapkanScope();
  const satu=tambahSiswa(sesi,1),dua=tambahSiswa(sesi,2);
  const [mapelA,mapelB]=mapelBerbutir(sesi,satu,2);
  for(const id of [mapelA,mapelB])
    saveAssessmentSettings(sesi,id,{formative:20,daily:20,practice:20,
      scopeSummative:20,semesterSummative:20,kktp:75});
  return {sesi,satu,dua,mapelA,mapelB};
}
function isiIntra(sesi,siswaList,mapel){
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  for(const siswa of siswaList)
    saveStudentIntracurricularSelection(sesi,siswa.id,
      {subjectId:mapel,butirIds:[butir.id],jenis:'teori',predicate:'Baik'});
  return butir;
}
function isiKoku(sesi,siswaList,kegiatan){
  saveAllCocurricular(sesi,{activity:kegiatan,rows:siswaList.map(siswa=>({
    studentId:siswa.id,name:siswa.name,activity:kegiatan,predicate:'Baik',
    description:`Ananda ${siswa.name} terlibat dengan baik pada kegiatan ${kegiatan}.`}))});
}
function isiEkstra(sesi,siswaList,kegiatan){
  saveAllExtracurricular(sesi,{name:kegiatan,rows:siswaList.map(siswa=>({
    studentId:siswa.id,name:siswa.name,predicate:'Baik',
    description:`Ananda ${siswa.name} mengikuti ${kegiatan} dengan baik.`}))});
}
const intraRapor=(sesi,siswa)=>(getReportDocument(sesi,siswa.id).intracurricular||[])
  .map(row=>row.subjectId);
const kokuRapor=(sesi,siswa)=>{
  const doc=getReportDocument(sesi,siswa.id);
  const daftar=doc.cocurricular;
  return (Array.isArray(daftar)?daftar:daftar?[daftar]:[]).map(row=>row.activity);
};
const ekstraRapor=(sesi,siswa)=>(getReportDocument(sesi,siswa.id).extracurricular||[])
  .map(row=>row.name);

/* ------------------------------------------------------- §27.1-8 INTRAKURIKULER */

test('1. Data Intrakurikuler seluruh siswa tersimpan',()=>{
  const {sesi,satu,dua,mapelA}=panggung();
  isiIntra(sesi,[satu,dua],mapelA);
  assert.ok(getStudentIntracurricularSelection(sesi,satu.id,mapelA));
  assert.ok(getStudentIntracurricularSelection(sesi,dua.id,mapelA));
});

test('2. Data Intrakurikuler yang tersimpan muncul di Rapor',()=>{
  const {sesi,satu,dua,mapelA}=panggung();
  isiIntra(sesi,[satu,dua],mapelA);
  assert.deepEqual(intraRapor(sesi,satu),[mapelA]);
  assert.deepEqual(intraRapor(sesi,dua),[mapelA]);
});

test('3-4. Hapus Semua membersihkan seluruh record mata pelajaran yang dibuka',()=>{
  const {sesi,satu,dua,mapelA}=panggung();
  isiIntra(sesi,[satu,dua],mapelA);
  const hasil=hapusSemuaIntracurricular(sesi,mapelA);
  assert.equal(hasil.terhapus,2,'kedua siswa ikut dibersihkan');
  assert.equal(hasil.subjectId,mapelA);
  assert.equal(getStudentIntracurricularSelection(sesi,satu.id,mapelA),null);
  assert.equal(getStudentIntracurricularSelection(sesi,dua.id,mapelA),null);
});

test('5. Sesudah Hapus Semua data itu tidak muncul lagi di Rapor',()=>{
  const {sesi,satu,dua,mapelA}=panggung();
  isiIntra(sesi,[satu,dua],mapelA);
  hapusSemuaIntracurricular(sesi,mapelA);
  assert.deepEqual(intraRapor(sesi,satu),[]);
  assert.deepEqual(intraRapor(sesi,dua),[]);
});

test('6. Nilai Penilaian tidak ikut terhapus',()=>{
  const {sesi,satu,mapelA}=panggung();
  saveAssessmentScores(sesi,mapelA,'daily',{[satu.id]:88});
  isiIntra(sesi,[satu],mapelA);
  const sebelum=JSON.stringify(loadDb().assessmentScores);
  hapusSemuaIntracurricular(sesi,mapelA);
  assert.equal(JSON.stringify(loadDb().assessmentScores),sebelum,
    'catatan nilai tidak tersentuh sama sekali');
});

test('7. Bukti Butir CP tidak ikut terhapus',()=>{
  const {sesi,satu,mapelA}=panggung();
  const butir=listCpButir(sesi,mapelA,{activeOnly:true})[0];
  saveAssessmentScores(sesi,mapelA,'daily',{[satu.id]:88},{cpButirId:butir.id});
  isiIntra(sesi,[satu],mapelA);
  const sebelum=JSON.stringify(loadDb().cpEvidenceScores);
  hapusSemuaIntracurricular(sesi,mapelA);
  assert.equal(JSON.stringify(loadDb().cpEvidenceScores),sebelum);
  assert.deepEqual(buktiButirSiswa(sesi,mapelA,satu.id).get(butir.id).map(item=>item.score),[88]);
});

test('8. Mata pelajaran lain tidak berubah',()=>{
  const {sesi,satu,mapelA,mapelB}=panggung();
  isiIntra(sesi,[satu],mapelA);
  isiIntra(sesi,[satu],mapelB);
  hapusSemuaIntracurricular(sesi,mapelA);
  assert.equal(getStudentIntracurricularSelection(sesi,satu.id,mapelA),null);
  assert.ok(getStudentIntracurricularSelection(sesi,satu.id,mapelB),'mapel kedua utuh');
  assert.deepEqual(intraRapor(sesi,satu),[mapelB]);
});

/* ------------------------------------------------------ §27.9-16 KOKURIKULER */

test('9-10. Dua kegiatan kokurikuler tersimpan berdampingan',()=>{
  const {sesi,satu,dua}=panggung();
  isiKoku(sesi,[satu,dua],'Kegiatan A');
  assert.equal(getStudentCocurricular(sesi,satu.id).activity,'Kegiatan A');
  isiKoku(sesi,[satu,dua],'Kegiatan B');
  assert.equal(getStudentCocurricular(sesi,satu.id).activity,'Kegiatan B');
});

test('11-12. Hapus Semua kegiatan A membersihkan kegiatan A',()=>{
  const {sesi,satu,dua}=panggung();
  isiKoku(sesi,[satu,dua],'Kegiatan A');
  const hasil=hapusSemuaCocurricular(sesi,'Kegiatan A');
  assert.equal(hasil.terhapus,2);
  assert.equal(getStudentCocurricular(sesi,satu.id),null);
  assert.equal(getStudentCocurricular(sesi,dua.id),null);
});

test('13. Kegiatan B tetap ada ketika kegiatan A dihapus',()=>{
  const {sesi,satu,dua}=panggung();
  /* Siswa pertama pada kegiatan A, siswa kedua pada kegiatan B. */
  isiKoku(sesi,[satu],'Kegiatan A');
  isiKoku(sesi,[dua],'Kegiatan B');
  hapusSemuaCocurricular(sesi,'Kegiatan A');
  assert.equal(getStudentCocurricular(sesi,satu.id),null,'kegiatan A hilang');
  assert.equal(getStudentCocurricular(sesi,dua.id)?.activity,'Kegiatan B','kegiatan B utuh');
});

test('14-15. Kegiatan A tidak muncul di Rapor, kegiatan B masih muncul',()=>{
  const {sesi,satu,dua}=panggung();
  isiKoku(sesi,[satu],'Kegiatan A');
  isiKoku(sesi,[dua],'Kegiatan B');
  assert.deepEqual(kokuRapor(sesi,satu),['Kegiatan A']);
  hapusSemuaCocurricular(sesi,'Kegiatan A');
  assert.deepEqual(kokuRapor(sesi,satu),[],'kegiatan A tidak lagi terbaca Rapor');
  assert.deepEqual(kokuRapor(sesi,dua),['Kegiatan B'],'kegiatan B masih terbaca Rapor');
});

test('16. Memuat ulang database tidak mengembalikan kegiatan yang dihapus',()=>{
  const {sesi,satu,dua}=panggung();
  isiKoku(sesi,[satu,dua],'Kegiatan A');
  hapusSemuaCocurricular(sesi,'Kegiatan A');
  /* Membaca ulang teks mentah localStorage: inilah keadaan sesudah aplikasi dimuat ulang. */
  invalidateDbCache();
  const mentah=JSON.parse(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'));
  const tersisa=Object.values(mentah.cocurricularScores||{})
    .filter(record=>String(record.activity||'')==='Kegiatan A');
  assert.equal(tersisa.length,0,'penghapusannya mengenai penyimpanan, bukan tampilan');
  assert.equal(getStudentCocurricular(sesi,satu.id),null);
});

/* --------------------------------------------------- §27.17-22 EKSTRAKURIKULER */

test('17-18. Dua kegiatan ekstrakurikuler tersimpan',()=>{
  const {sesi,satu,dua}=panggung();
  isiEkstra(sesi,[satu,dua],'Pramuka');
  isiEkstra(sesi,[satu,dua],'Futsal');
  assert.deepEqual(listExtracurriculars(sesi,satu.id).map(item=>item.name).sort(),
    ['Futsal','Pramuka']);
});

test('19-21. Hapus Semua Pramuka menghapus Pramuka dan menyisakan Futsal',()=>{
  const {sesi,satu,dua}=panggung();
  isiEkstra(sesi,[satu,dua],'Pramuka');
  isiEkstra(sesi,[satu,dua],'Futsal');
  const hasil=hapusSemuaExtracurricular(sesi,'Pramuka');
  assert.equal(hasil.terhapus,2);
  assert.deepEqual(listExtracurriculars(sesi,satu.id).map(item=>item.name),['Futsal']);
  assert.deepEqual(listExtracurriculars(sesi,dua.id).map(item=>item.name),['Futsal']);
});

test('22. Rapor mengikuti: Pramuka hilang, Futsal tetap',()=>{
  const {sesi,satu,dua}=panggung();
  isiEkstra(sesi,[satu,dua],'Pramuka');
  isiEkstra(sesi,[satu,dua],'Futsal');
  hapusSemuaExtracurricular(sesi,'Pramuka');
  assert.deepEqual(ekstraRapor(sesi,satu),['Futsal']);
  assert.equal(ekstraRapor(sesi,satu).includes('Pramuka'),false);
});

/* ------------------------------------------------------------- §27.23-27 SCOPE */

test('23. Rombel lain tidak berubah',()=>{
  const {sesi,satu}=panggung();
  isiKoku(sesi,[satu],'Kegiatan A');
  const lain=siapkanScope('5A');
  const siswaLain=tambahSiswa(lain,3);
  isiKoku(lain,[siswaLain],'Kegiatan A');
  hapusSemuaCocurricular(sesi,'Kegiatan A');
  assert.equal(getStudentCocurricular(sesi,satu.id),null,'rombel yang dibuka bersih');
  assert.equal(getStudentCocurricular(lain,siswaLain.id)?.activity,'Kegiatan A',
    'rombel lain tidak tersentuh');
});

test('24. Semester lain tidak berubah',()=>{
  const {sesi,satu}=panggung();
  isiKoku(sesi,[satu],'Kegiatan A');
  const genap={...sesi,semester:`Genap ${ACADEMIC_YEAR}`};
  simpanMapping(genap,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  setTeacherAssignment(admin(genap.semester),genap.classId,
    {subjectIds:SUBJECTS_DEFAULT.map(item=>item.id),active:true});
  /* Daftar siswa ikut ter-scope semester, jadi semester berikutnya punya pendaftarannya sendiri. */
  const siswaGenap=tambahSiswa(genap,1);
  isiKoku(genap,[siswaGenap],'Kegiatan A');
  hapusSemuaCocurricular(sesi,'Kegiatan A');
  assert.equal(getStudentCocurricular(sesi,satu.id),null);
  assert.equal(getStudentCocurricular(genap,siswaGenap.id)?.activity,'Kegiatan A',
    'semester lain tidak tersentuh');
});

test('25. Tahun pelajaran lain tidak berubah',()=>{
  const {sesi,satu}=panggung();
  isiKoku(sesi,[satu],'Kegiatan A');
  const sebelum=Object.keys(loadDb().cocurricularScores).length;
  /* Catatan tahun lain ditulis langsung supaya tahunnya benar-benar berbeda. */
  const kunciLain=`2019/2020|Ganjil 2019/2020|5B|${satu.id}`;
  const db=loadDb();
  db.cocurricularScores[kunciLain]={classId:'5B',studentId:satu.id,semester:'Ganjil 2019/2020',
    academicYear:'2019/2020',activity:'Kegiatan A',predicate:'Baik',description:'Catatan lama.'};
  globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
  invalidateDbCache();
  assert.equal(Object.keys(loadDb().cocurricularScores).length,sebelum+1);
  hapusSemuaCocurricular(sesi,'Kegiatan A');
  assert.ok(loadDb().cocurricularScores[kunciLain],'catatan tahun pelajaran lain tetap ada');
});

test('26. Data siswa dan master kegiatan tidak ikut terhapus',()=>{
  const {sesi,satu,dua,mapelA}=panggung();
  isiKoku(sesi,[satu,dua],'Kegiatan A');
  isiIntra(sesi,[satu],mapelA);
  isiEkstra(sesi,[satu],'Pramuka');
  const siswaSebelum=JSON.stringify(loadDb().students);
  const mapelSebelum=JSON.stringify(loadDb().subjectMappings);
  const butirSebelum=JSON.stringify(loadDb().cpButir);
  const bobotSebelum=JSON.stringify(loadDb().assessmentSettings);
  hapusSemuaCocurricular(sesi,'Kegiatan A');
  hapusSemuaIntracurricular(sesi,mapelA);
  hapusSemuaExtracurricular(sesi,'Pramuka');
  assert.equal(JSON.stringify(loadDb().students),siswaSebelum,'data siswa utuh');
  assert.equal(JSON.stringify(loadDb().subjectMappings),mapelSebelum,'Mapping mapel utuh');
  assert.equal(JSON.stringify(loadDb().cpButir),butirSebelum,'Butir CP utuh');
  assert.equal(JSON.stringify(loadDb().assessmentSettings),bobotSebelum,'Bobot dan KKTP utuh');
});

test('27. Permintaan di luar scope ditolak layanan, bukan hanya disembunyikan tombolnya',()=>{
  const {sesi,mapelA}=panggung();
  /* Session yang bukan Guru sama sekali. */
  const bukanGuru={role:'admin',academicYear:ACADEMIC_YEAR,semester:SEMESTER,userName:'Admin'};
  assert.throws(()=>hapusSemuaIntracurricular(bukanGuru,mapelA),/Session Guru tidak valid/);
  assert.throws(()=>hapusSemuaCocurricular(bukanGuru,'Kegiatan A'),/Session Guru tidak valid/);
  assert.throws(()=>hapusSemuaExtracurricular(bukanGuru,'Pramuka'),/Session Guru tidak valid/);

  /* Guru yang rombelnya tidak mendapat penugasan apa pun. */
  const tanpaTugas=guru('4A');
  assert.throws(()=>hapusSemuaIntracurricular(tanpaTugas,mapelA),/./,
    'mapel di luar penugasan ditolak');

  /* Nama kegiatan kosong tidak boleh menjadi "hapus apa saja". */
  assert.throws(()=>hapusSemuaCocurricular(sesi,''),/Pilih kegiatan kokurikuler/);
  assert.throws(()=>hapusSemuaExtracurricular(sesi,'   '),/Pilih kegiatan ekstrakurikuler/);
  assert.throws(()=>hapusSemuaIntracurricular(sesi,''),/Pilih mata pelajaran/);
});
