import test from 'node:test';
import assert from 'node:assert/strict';
import { cpElements } from '../src/data/curriculum-cp.js';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { composeIntracurricularDescription, getStudentIntracurricularSelection,
  listInactiveReferencedObjectives, listIntracurricularObjectives,
  saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { addReferenceObjectives, listActiveObjectives, listReferenceObjectives,
  listSchoolObjectives, setActiveObjective } from '../src/services/learning-objectives.js';
import { ringkasObjectives } from '../src/services/objective-summary.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* Sepadan dengan alur nyata: buka + Tambah TP, centang semua, lalu Simpan. */
function masukkanSemuaTp(session,subjectId){
  const referensi=listReferenceObjectives(session,subjectId);
  if(referensi.some(item=>!item.sudahDipakai))
    addReferenceObjectives(session,subjectId,referensi.filter(item=>!item.sudahDipakai).map(item=>item.id));
  return listSchoolObjectives(session,subjectId);
}

/* Penilaian dan Intrakurikuler SENGAJA berbeda.

   Penilaian membaca seluruh TP aktif secara otomatis dan tidak pernah meminta guru memilih.
   Intrakurikuler justru mewajibkan guru memilih TP mana yang menjadi dasar predikat dan
   deskripsinya — tetapi pilihannya hanya boleh berasal dari TP yang aktif. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
  return nilai;
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,
  semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkanMapel(session){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:['mtk','ipas'].includes(item.id),order:index+1})));
}
function tambahSiswa(session){
  return createStudent(session,{classId:session.classId,nis:'5B01',nisn:'0051000001',
    name:'Alya Putri',gender:'P',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-10',
    parentName:'Orang Tua',phone:'08',address:'Jl. Melati',photo:''});
}
/* Skenario §8: empat TP dibuat, tiga diaktifkan. */
function siapkanEmpatTp(session,subjectId='ipas'){
  const semua=masukkanSemuaTp(session,subjectId);
  assert.ok(semua.length>=4,'katalog menyediakan minimal empat TP');
  const empat=semua.slice(0,4);
  for(const item of semua)setActiveObjective(session,subjectId,item.id,empat.slice(0,3).includes(item));
  return {semua:empat,aktif:empat.slice(0,3),nonaktif:empat[3]};
}

/* -------------------------------------------------- Penilaian tidak memilih TP (§2,§7) */

test('1. Penilaian membaca TP aktif otomatis dan tidak punya pemilihan TP',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const {aktif}=siapkanEmpatTp(session);
  assert.equal(listActiveObjectives(session,'ipas').length,3);

  const halaman=read('src/pages/assessment.js');
  assert.match(halaman,/listActiveObjectives/,'Penilaian membaca TP aktif');
  for(const larangan of ['data-pick','data-edit-tp','setActiveObjective',
    'setSelectedAssessmentObjectives','getComponentObjectiveSummary'])
    assert.equal(halaman.includes(larangan),false,`Penilaian tidak boleh memuat ${larangan}`);
  /* Tidak ada satu pun kotak centang di halaman Penilaian: TP tidak dipilih di sini. */
  assert.equal(/type="checkbox"/.test(halaman),false,'tidak ada checkbox TP di Penilaian');
  assert.equal(/data-objective[\s=]/.test(halaman),false,'tidak ada kontrol pemilihan TP');
  assert.equal(aktif.length,3);
});

/* ------------------------------------------- Intrakurikuler wajib memilih TP (§3,§4) */

test('2. Daftar TP aktif tetap ada untuk fitur lain, tetapi Intrakurikuler memakai CP',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const {aktif,nonaktif}=siapkanEmpatTp(session);

  const pilihan=listIntracurricularObjectives(session,'ipas');
  assert.deepEqual(pilihan.map(item=>item.id),aktif.map(item=>item.id),
    'hanya tiga TP aktif yang boleh dipilih');
  assert.equal(pilihan.some(item=>item.id===nonaktif.id),false,
    'TP nonaktif tidak muncul sebagai pilihan');

  /* Daftar TP aktif tetap dipakai fitur lain, tetapi halaman Intrakurikuler TIDAK LAGI
     menyediakan pemilihan TP: acuannya CP. Inilah penjaganya. */
  const halaman=read('src/pages/intracurricular-input.js');
  assert.match(halaman,/getIntracurricularCp/,'halaman membaca CP mapel pada fase rombel');
  assert.equal(/data-objective|listIntracurricularObjectives|listInactiveReferencedObjectives/.test(halaman),
    false,'tidak ada satu pun checkbox atau daftar TP di halaman Intrakurikuler');
  assert.match(halaman,/Acuan Capaian Pembelajaran/,'yang ditampilkan adalah acuan CP');
  assert.equal(/Tujuan Pembelajaran \*/.test(halaman),false,'TP bukan lagi isian wajib di sini');
});

test('3. Intrakurikuler tidak lagi meminta pemilihan TP; deskripsinya dari CP',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  siapkanEmpatTp(session);
  const siswa=tambahSiswa(session);

  /* Tanpa satu pun objectiveIds, penyimpanan tetap berhasil. Inilah inti perubahannya:
     guru tidak perlu mencentang TP, apalagi mencentang ulang TP yang sudah aktif. */
  const saved=saveStudentIntracurricularSelection(session,siswa.id,
    {subjectId:'ipas',predicate:'Sangat Baik'});
  assert.equal(saved.predicate,'Sangat Baik');
  assert.equal(saved.source,'CP');
  assert.equal(saved.cpPhase,'C');
  assert.ok(saved.description,'deskripsi tersusun tanpa TP');

  /* Isinya bersumber elemen CP, bukan kalimat TP mana pun. */
  const kalimat=saved.description.toLowerCase();
  for(const elemen of cpElements('ipas','C').map(item=>item.name))
    assert.ok(kalimat.includes(elemen.toLowerCase()),`elemen CP ${elemen} terbawa`);
});

/* ------------------------------------------------------ Deskripsi Intrakurikuler (§6) */

test('4. Deskripsi Intrakurikuler dibuat dari TP terpilih dan diringkas',()=>{
  const satu=composeIntracurricularDescription({studentName:'Alya Putri',subjectName:'IPAS',
    objectives:[{description:'Menjelaskan perubahan wujud benda dalam kehidupan sehari-hari.'}],
    predicate:'Baik'});
  assert.match(satu,/Alya Putri/);
  assert.match(satu,/menjelaskan perubahan wujud benda/);
  assert.equal(/dalam kehidupan sehari-hari/.test(satu),false,'keterangan dipangkas');

  const banyak=composeIntracurricularDescription({studentName:'Alya Putri',subjectName:'IPAS',
    objectives:[
      {description:'Menjelaskan perubahan wujud benda dalam kehidupan sehari-hari.'},
      {description:'Mengidentifikasi pengaruh kalor terhadap perubahan wujud benda.'},
    ],predicate:'Sangat Baik'});
  assert.match(banyak,/menjelaskan perubahan wujud benda serta mengidentifikasi pengaruh kalor/);
  assert.equal(banyak.split('perubahan wujud benda').length-1,1,'frasa berulang hanya sekali');
  assert.match(banyak,/\.$/);

  /* Aturan meringkas ditulis satu kali dan dipakai bersama dengan deskripsi rapor. */
  assert.match(read('src/services/intracurricular.js'),/from '\.\/objective-summary\.js'/);
  assert.match(read('src/services/descriptions.js'),/from '\.\/objective-summary\.js'/);
});

/* ----------------------------------------- TP dinonaktifkan setelah dipilih (§5) */

test('5. TP yang dinonaktifkan tidak dapat dipakai untuk input baru',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const {aktif}=siapkanEmpatTp(session);
  const siswa=tambahSiswa(session);
  const dipilih=aktif.slice(0,2);
  saveStudentIntracurricularSelection(session,siswa.id,
    {subjectId:'ipas',objectiveIds:dipilih.map(item=>item.id),predicate:'Baik'});

  /* Guru menonaktifkan salah satu TP yang sudah terlanjur dipilih. */
  setActiveObjective(session,'ipas',dipilih[0].id,false);
  assert.equal(listIntracurricularObjectives(session,'ipas').some(item=>item.id===dipilih[0].id),
    false,'TP nonaktif hilang dari pilihan');
  /* Input baru tidak lagi bergantung pada TP sama sekali, sehingga menonaktifkan TP tidak
     memblokir Intrakurikuler. Yang tetap dijaga adalah riwayatnya. */
  const sesudah=saveStudentIntracurricularSelection(session,siswa.id,
    {subjectId:'ipas',objectiveIds:dipilih.map(item=>item.id),predicate:'Baik'});
  assert.ok(sesudah.description,'input baru tetap berhasil walau TP dinonaktifkan');

  /* Catatan lama tidak dihapus. */
  const lama=getStudentIntracurricularSelection(session,siswa.id);
  assert.deepEqual(lama.objectiveIds,dipilih.map(item=>item.id),'rujukan TP lama tetap tersimpan');
  assert.ok(lama.description,'deskripsi lama tetap ada');

  /* Dan UI diberi bahan untuk menandainya sebagai nonaktif. */
  const tertinggal=listInactiveReferencedObjectives(session,'ipas',lama.objectiveIds);
  assert.equal(tertinggal.length,1);
  assert.equal(tertinggal[0].id,dipilih[0].id);
  assert.equal(tertinggal[0].active,false);
  assert.equal(tertinggal[0].inactive,true);

  /* Rujukan TP nonaktif tetap dapat dibaca layanan untuk keperluan riwayat, walau halaman
     Intrakurikuler sudah tidak menampilkannya lagi. */
  assert.equal(listInactiveReferencedObjectives(session,'ipas',lama.objectiveIds).length,1);
});

test('6. TP aktif kembali dapat dipilih lagi tanpa kehilangan catatan',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const {aktif}=siapkanEmpatTp(session);
  const siswa=tambahSiswa(session);
  saveStudentIntracurricularSelection(session,siswa.id,
    {subjectId:'ipas',objectiveIds:[aktif[0].id],predicate:'Baik'});

  setActiveObjective(session,'ipas',aktif[0].id,false);
  assert.equal(listInactiveReferencedObjectives(session,'ipas',[aktif[0].id]).length,1);

  setActiveObjective(session,'ipas',aktif[0].id,true);
  assert.equal(listInactiveReferencedObjectives(session,'ipas',[aktif[0].id]).length,0,
    'tidak lagi ditandai nonaktif');
  const ulang=saveStudentIntracurricularSelection(session,siswa.id,
    {subjectId:'ipas',objectiveIds:[aktif[0].id],predicate:'Sangat Baik'});
  assert.deepEqual(ulang.objectiveIds,[aktif[0].id]);
});

/* -------------------------------------------------- Pemisahan alur dan data aman */

test('7. Intrakurikuler tidak menyentuh nilai maupun TP aktif',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const {aktif}=siapkanEmpatTp(session);
  const siswa=tambahSiswa(session);
  const sebelum=listActiveObjectives(session,'ipas').map(item=>item.id);

  saveStudentIntracurricularSelection(session,siswa.id,
    {subjectId:'ipas',objectiveIds:[aktif[1].id],predicate:'Cukup'});

  assert.deepEqual(listActiveObjectives(session,'ipas').map(item=>item.id),sebelum,
    'memilih TP di Intrakurikuler tidak mengubah TP aktif');
  assert.equal(loadDb().assessmentScores&&Object.keys(loadDb().assessmentScores).length,0,
    'tidak ada nilai yang tersentuh');
  const layanan=read('src/services/intracurricular.js');
  for(const larangan of ['setActiveObjective','saveAssessmentScores','assessmentScores'])
    assert.equal(layanan.includes(larangan),false,`Intrakurikuler tidak pernah ${larangan}`);
});

test('8. Desain rapor dan kunci penyimpanan tidak berubah',()=>{
  assert.match(read('src/services/storage.js'),/const DB_KEY = 'erapor_satria_jaya_01_v1';/);
  const css=read('src/styles/app.css');
  assert.match(css,/\.report-cover-a4\{display:flow-root;text-align:center;padding:37\.8px\}/);
  assert.match(css,/Times New Roman/);
  assert.equal(/listIntracurricularObjectives/.test(read('src/pages/print.js')),false,
    'halaman cetak tidak menambah bagian TP');
});
