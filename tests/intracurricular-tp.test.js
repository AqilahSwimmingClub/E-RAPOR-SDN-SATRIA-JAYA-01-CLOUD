import test from 'node:test';
import assert from 'node:assert/strict';
import { cpElements } from '../src/data/curriculum-cp.js';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ACTIVITY_PREDICATES, getStudentCocurricular, getStudentIntracurricular,
  saveStudentCocurricular } from '../src/services/completeness.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { composeIntracurricularDescription, getStudentIntracurricularSelection,
  INTRACURRICULAR_PREDICATES, listIntracurricularObjectives, listIntracurricularSubjects,
  saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { addReferenceObjectives, listActiveObjectives, listReferenceObjectives,
  listSchoolObjectives, setActiveObjective } from '../src/services/learning-objectives.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { ringkasObjectives } from '../src/services/objective-summary.js';

/* Deskripsi Intrakurikuler diringkas, jadi yang dicari adalah INTI kompetensi tiap TP,
   bukan kalimat TP mentah. */
const inti=item=>ringkasObjectives([item]);
import { calculateReportScore } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';
import { activityTable } from '../src/pages/print.js';

/* Sepadan dengan alur nyata: buka + Tambah TP, centang semua, lalu Simpan. */
function masukkanSemuaTp(session,subjectId){
  const referensi=listReferenceObjectives(session,subjectId);
  if(referensi.some(item=>!item.sudahDipakai))
    addReferenceObjectives(session,subjectId,referensi.filter(item=>!item.sudahDipakai).map(item=>item.id));
  return listSchoolObjectives(session,subjectId);
}

/* Tahap 8E — Intrakurikuler: Mapel → TP → Predikat → Deskripsi otomatis.

   Intrakurikuler memakai katalog TP yang sama dengan Penilaian Umum, tetapi pilihan TP dan
   predikatnya disimpan terpisah supaya tidak pernah menimpa Penilaian Umum maupun
   Kokurikuler. Tampilan rapor tidak berubah: tetap No, Kegiatan beserta predikat, dan
   Keterangan. */

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
/* TP tidak lagi muncul sendiri: guru memasukkannya lewat + Tambah TP. Helper ini menirukan
   langkah itu supaya test berbicara tentang Intrakurikuler, bukan tentang penyiapan TP. */
function aktifkanMapel(session,ids){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
  for(const id of ids)masukkanSemuaTp(session,id);
}
function tambahSiswa(session,index=1){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`9977${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:'P',photo:''});
}

/* ------------------------------------------------------------------ Fase dan visibilitas mapel */

test('Daftar mapel intrakurikuler mengikuti fase dan hanya memuat mapel aktif',()=>{
  useMemoryStorage();
  const kelas5=guru('5B');
  aktifkanMapel(kelas5,['mtk','bindo','ipas']);
  const ids=listIntracurricularSubjects(kelas5).map(item=>item.id);
  assert.deepEqual([...ids].sort(),['bindo','ipas','mtk']);
  assert.equal(ids.includes('koding'),false,'mapel yang tidak diaktifkan tidak muncul');
});

test('IPAS tidak muncul pada Fase A dan muncul pada Fase B serta C',()=>{
  useMemoryStorage();
  const kelas1=guru('1A');
  aktifkanMapel(kelas1,['mtk','bindo','ipas']);
  assert.equal(listIntracurricularSubjects(kelas1).some(item=>item.id==='ipas'),false);
  const kelas3=guru('3A');
  aktifkanMapel(kelas3,['mtk','bindo','ipas']);
  assert.equal(listIntracurricularSubjects(kelas3).some(item=>item.id==='ipas'),true);
  const kelas6=guru('6A');
  aktifkanMapel(kelas6,['mtk','bindo','ipas']);
  assert.equal(listIntracurricularSubjects(kelas6).some(item=>item.id==='ipas'),true);
});

test('Mapel pilihan hanya tersedia bila sekolah mengaktifkannya',()=>{
  useMemoryStorage();
  const kelas=guru('4A');
  aktifkanMapel(kelas,['mtk']);
  assert.equal(listIntracurricularSubjects(kelas).some(item=>item.id==='sunda'),false);
  aktifkanMapel(kelas,['mtk','sunda']);
  assert.equal(listIntracurricularSubjects(kelas).some(item=>item.id==='sunda'),true);
});

test('TP intrakurikuler memakai katalog yang sama dan mengikuti fase kelas',()=>{
  useMemoryStorage();
  const kelas=guru('2A');
  aktifkanMapel(kelas,['mtk']);
  const tp=listIntracurricularObjectives(kelas,'mtk');
  assert.ok(tp.length>=2);
  /* Setelah dimasukkan lewat + Tambah TP, butirnya menjadi TP SEKOLAH yang dapat diedit.
     Status 'inspiratif' tetap melekat pada katalog referensinya, bukan pada TP sekolah. */
  for(const item of tp){assert.equal(item.phase,'A');assert.equal(item.editable,true);}
  for(const item of listReferenceObjectives(kelas,'mtk'))
    assert.equal(item.status,'inspiratif','katalog referensi tetap berstatus inspiratif');
  const kelas5=guru('5B');
  aktifkanMapel(kelas5,['mtk']);
  assert.equal(listIntracurricularObjectives(kelas5,'mtk')[0].phase,'C');
});

/* --------------------------------------------------------------- Predikat dan deskripsi otomatis */

test('Predikat intrakurikuler hanya Cukup, Baik, dan Sangat Baik',()=>{
  assert.deepEqual(INTRACURRICULAR_PREDICATES,['Cukup','Baik','Sangat Baik']);
  assert.deepEqual(INTRACURRICULAR_PREDICATES,ACTIVITY_PREDICATES);
});

test('Satu TP dan banyak TP menghasilkan deskripsi yang memuat setiap TP satu kali',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk']);
  const tp=listIntracurricularObjectives(kelas,'mtk');
  for(const jumlah of [1,2,3]){
    const dipakai=tp.slice(0,jumlah);
    const teks=composeIntracurricularDescription({studentName:'Siswa 1',subjectName:'Matematika',
      objectives:dipakai,predicate:'Baik'});
    assert.ok(teks.includes('Matematika'));
    for(const item of dipakai)
      assert.equal(teks.split(inti(item)).length-1,1,`${jumlah} TP: ${item.code} muncul sekali`);
    for(const item of tp.slice(jumlah))
      assert.equal(teks.includes(inti(item)),false,'TP di luar pilihan tidak ikut');
    /* Kalimat TP tidak pernah ditempel mentah. */
    for(const item of dipakai)
      if(inti(item)!==item.description.trim().replace(/[.!?]+$/,''))
        assert.equal(teks.includes(item.description),false,`${item.code} tidak disalin utuh`);
    assert.match(teks,/\.$/);
  }
});

test('Tiga predikat menghasilkan tiga kalimat capaian yang berbeda',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk']);
  const tp=listIntracurricularObjectives(kelas,'mtk').slice(0,2);
  const teks=INTRACURRICULAR_PREDICATES.map(predicate=>composeIntracurricularDescription(
    {studentName:'Siswa 1',subjectName:'Matematika',objectives:tp,predicate}));
  assert.equal(new Set(teks).size,3,'tiap predikat punya kalimat sendiri');
  for(const item of teks)for(const objective of tp)assert.ok(item.includes(inti(objective)));
});

/* --------------------------------------------------------------------- Penyimpanan per siswa */

test('Pilihan mapel dan predikat tersimpan beserta deskripsi otomatis dari CP',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk','bindo']);
  const siswa=tambahSiswa(kelas);
  /* Intrakurikuler tidak lagi meminta TP: cukup mata pelajaran dan predikat. */
  const saved=saveStudentIntracurricularSelection(kelas,siswa.id,
    {subjectId:'mtk',predicate:'Sangat Baik'});
  assert.equal(saved.subjectId,'mtk');
  assert.equal(saved.predicate,'Sangat Baik');
  assert.equal(saved.activity,'Matematika','kolom Kegiatan pada rapor memuat nama mapel');
  assert.equal(saved.source,'CP');
  assert.equal(saved.cpPhase,'C','kelas 5 berada pada Fase C');
  /* Isi kalimatnya berasal dari elemen CP resmi, bukan dari TP. */
  const kalimat=saved.description.toLowerCase();
  for(const elemen of cpElements('mtk','C').map(item=>item.name))
    assert.ok(kalimat.includes(elemen.toLowerCase()),`elemen CP ${elemen} terbawa`);
  const dibaca=getStudentIntracurricularSelection(kelas,siswa.id);
  assert.equal(dibaca.subjectId,'mtk');
});

test('Deskripsi Intrakurikuler berubah mengikuti predikat, dan tulisan guru dipertahankan',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk']);
  const siswa=tambahSiswa(kelas);
  const pertama=saveStudentIntracurricularSelection(kelas,siswa.id,{subjectId:'mtk',predicate:'Cukup'});
  const kedua=saveStudentIntracurricularSelection(kelas,siswa.id,{subjectId:'mtk',predicate:'Sangat Baik'});
  assert.notEqual(kedua.description,pertama.description,'predikat mengubah kalimat');
  const manual=saveStudentIntracurricularSelection(kelas,siswa.id,
    {subjectId:'mtk',predicate:'Sangat Baik',description:'Deskripsi tulisan wali kelas.'});
  assert.equal(manual.description,'Deskripsi tulisan wali kelas.');
  assert.equal(manual.status,'EDITED','tulisan guru ditandai supaya tidak ditimpa batch');
});

test('Pilihan ditolak bila mapel di luar daftar atau CP belum berlaku pada fasenya',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk']);
  const siswa=tambahSiswa(kelas);
  assert.throws(()=>saveStudentIntracurricularSelection(kelas,siswa.id,
    {subjectId:'bing',predicate:'Baik'}),/mata pelajaran/i);
  assert.throws(()=>saveStudentIntracurricularSelection(kelas,siswa.id,
    {subjectId:'mtk',predicate:'Istimewa'}),/Predikat/i);
  /* Koding & KA belum berlaku pada Fase A; menolaknya lebih jujur daripada mengarang CP. */
  const kelasSatu=guru('1A');
  aktifkanMapel(kelasSatu,['koding']);
  const anak=tambahSiswa(kelasSatu,7);
  assert.throws(()=>saveStudentIntracurricularSelection(kelasSatu,anak.id,
    {subjectId:'koding',predicate:'Baik'}),/Fase C|belum berlaku/i);
});

/* ------------------------------------------------------------- Kompatibilitas dan isolasi data */

test('Data intrakurikuler lama tanpa mapel dan TP tetap terbaca',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk']);
  const siswa=tambahSiswa(kelas);
  const db=loadDb();
  const key=`${kelas.academicYear}|${kelas.semester}|${kelas.classId}|${siswa.id}`;
  db.intracurricularScores[key]={studentId:siswa.id,classId:kelas.classId,semester:kelas.semester,
    academicYear:kelas.academicYear,activity:'Literasi Membaca',predicate:'Baik',
    description:'Aktif membaca dan menceritakan kembali.',createdAt:'2026-01-01T00:00:00.000Z',
    updatedAt:'2026-01-01T00:00:00.000Z'};
  globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
  invalidateDbCache();
  const lama=getStudentIntracurricularSelection(kelas,siswa.id);
  assert.equal(lama.activity,'Literasi Membaca');
  assert.equal(lama.subjectId,null);
  assert.deepEqual(lama.objectiveIds,[]);
  assert.equal(lama.description,'Aktif membaca dan menceritakan kembali.');
});

test('Intrakurikuler tidak menimpa Kokurikuler maupun Penilaian Umum',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk']);
  const siswa=tambahSiswa(kelas);
  saveAssessmentSettings(kelas,'mtk',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ['formative','daily','practice','scopeSummative','semesterSummative'])
    saveAssessmentScores(kelas,'mtk',jenis,{[siswa.id]:80});
  /* TP aktif ditentukan di menu Tujuan Pembelajaran, dan Intrakurikuler membaca daftar
     yang sama persis. */
  const semuaTp=masukkanSemuaTp(kelas,'mtk');
  for(const item of semuaTp)setActiveObjective(kelas,'mtk',item.id,item.id===semuaTp[0].id);
  const tpUmum=listIntracurricularObjectives(kelas,'mtk');
  assert.deepEqual(tpUmum.map(item=>item.id),[semuaTp[0].id],'Intrakurikuler memakai TP aktif yang sama');
  saveStudentCocurricular(kelas,siswa.id,{activity:'Projek Penguatan Profil Pelajar Pancasila',
    predicate:'Baik',description:'Aktif dalam projek kelompok.'});
  const nilaiSebelum=calculateReportScore(kelas,'mtk',siswa.id);

  saveStudentIntracurricularSelection(kelas,siswa.id,
    {subjectId:'mtk',objectiveIds:[tpUmum[0].id],predicate:'Cukup'});

  assert.deepEqual(listActiveObjectives(kelas,'mtk').map(item=>item.id),[semuaTp[0].id],
    'TP aktif tidak tersentuh oleh penilaian Intrakurikuler');
  assert.equal(JSON.stringify(calculateReportScore(kelas,'mtk',siswa.id)),JSON.stringify(nilaiSebelum));
  const koku=getStudentCocurricular(kelas,siswa.id);
  assert.equal(koku.activity,'Projek Penguatan Profil Pelajar Pancasila');
  assert.equal(koku.description,'Aktif dalam projek kelompok.');
  assert.equal(getStudentIntracurricular(kelas,siswa.id).activity,'Matematika');
});

/* --------------------------------------------------------------------- Tampilan rapor tetap */

test('Tabel rapor Intrakurikuler tetap No, Kegiatan dengan predikat, dan Keterangan',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  aktifkanMapel(kelas,['mtk']);
  const siswa=tambahSiswa(kelas);
  const record=saveStudentIntracurricularSelection(kelas,siswa.id,{subjectId:'mtk',predicate:'Baik'});
  const html=activityTable('Intrakurikuler',
    [{name:record.activity,predicate:record.predicate,description:record.description}],
    {studentName:siswa.name});
  assert.match(html,/<th>No<\/th><th>Intrakurikuler<\/th><th>Keterangan<\/th>/);
  assert.match(html,/class="activity-no">1</);
  assert.match(html,/class="activity-name">Matematika</);
  assert.match(html,/class="activity-predicate">BAIK</);
  /* Bentuk tabelnya tidak berubah; yang berubah hanya SUMBER kolom Keterangan: elemen CP. */
  const isi=html.toLowerCase();
  for(const elemen of cpElements('mtk','C').map(item=>item.name))
    assert.ok(isi.includes(elemen.toLowerCase()),`elemen CP ${elemen} ikut pada kolom Keterangan`);
});
