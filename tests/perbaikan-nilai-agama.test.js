import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { saveAssessmentScores } from '../src/services/assessment.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { getStoredReportRows, saveAutomaticReportScores, visibleStoredReportRows } from '../src/services/report.js';
import { saveAllAutomaticReports } from '../src/services/report-bulk.js';
import { getLeger, getReportDocument } from '../src/services/documents.js';
import { createStudent } from '../src/services/students.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';
import { loadDb, invalidateDbCache, storageKey } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
let simpanan=new Map();
function useMemoryStorage(){simpanan=new Map();globalThis.localStorage={getItem:key=>simpanan.has(key)?simpanan.get(key):null,setItem:(key,value)=>simpanan.set(key,String(value)),removeItem:key=>simpanan.delete(key),clear:()=>simpanan.clear()};invalidateDbCache();}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}
const PAI='Pendidikan Agama Islam dan Budi Pekerti';
const PAK='Pendidikan Agama Kristen dan Budi Pekerti';
const barisMapel=(session,subjectId)=>getStoredReportRows(session).filter(row=>row.subject.id===subjectId);
/* Baris yang benar-benar digambar halaman Nilai Tersimpan. */
const tampil=session=>visibleStoredReportRows(getStoredReportRows(session));
const adaBaris=(rows,studentId,subjectId)=>rows.some(row=>row.student.id===studentId&&row.subject.id===subjectId);
function tp(session,subjectId){
  createLearningObjective(session,subjectId,{code:`TP-B-${subjectId}`,description:`memahami ${subjectId} dengan baik.`});
  createLearningObjective(session,subjectId,{code:`TP-I-${subjectId}`,description:`menerapkan ${subjectId} secara mandiri.`});
}

/* ------------------------------------------------- Nilai agama masuk ke Nilai Tersimpan */

test('Nilai PAI tersimpan dan muncul di Nilai Tersimpan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'ISL',{religion:'Islam'});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');

  const baris=barisMapel(session,'agama');
  assert.equal(baris.length,1,'baris PAI dibuat untuk siswa');
  assert.equal(baris[0].student.id,anak.id);
  assert.equal(baris[0].score.finalScore,85,'nilai PAI terbaca kembali di Nilai Tersimpan');
  assert.equal(baris[0].scoreComplete,true);
  /* Kunci penyimpanan memakai ID internal siswa, bukan NIS/NISN. */
  assert.ok(Object.keys(loadDb().reportScores).includes(`${session.academicYear}|${session.semester}|5B|agama|${anak.id}`));
});

test('Nilai PAK tersimpan dan muncul di Nilai Tersimpan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama_kristen','90');
  saveAutomaticReportScores(session,'agama_kristen');

  const baris=barisMapel(session,'agama_kristen');
  assert.equal(baris.length,1);
  assert.equal(baris[0].student.id,anak.id);
  assert.equal(baris[0].score.finalScore,90);
});

test('Nilai agama yang sudah tersimpan tidak pernah hilang dari Nilai Tersimpan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  /* Kondisi nyata siswa seed: kolom agama masih kosong ketika nilai PAI sudah diinput. */
  const kosong=siswa(session,'KOSONG',{religion:''});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');

  const kunci=`${session.academicYear}|${session.semester}|5B|agama|${kosong.id}`;
  assert.equal(loadDb().reportScores[kunci].finalScore,85,'nilai memang tersimpan di database');
  const baris=barisMapel(session,'agama');
  assert.ok(baris.some(row=>row.student.id===kosong.id&&row.score?.finalScore===85),'nilai tetap terlihat walau agama siswa masih kosong');
  assert.ok(baris.some(row=>row.student.id===kristen.id),'record nilai PAI siswa Kristen yang terlanjur tersimpan tidak dihapus');
  /* Penyaringan agama tetap berlaku pada dokumen rapor. */
  assert.equal(getReportDocument(session,kosong.id).subjects.some(item=>item.subject.name===PAI),false,'agama kosong tidak menampilkan PAI di rapor');
  assert.equal(getReportDocument(session,kristen.id).subjects.some(item=>item.subject.name===PAI),false,'siswa Kristen tidak menerima PAI di rapor');
});

test('Siswa Islam tidak mendapatkan PAK dan siswa Kristen tidak mendapatkan PAI',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama','85');
  fillAllAssessmentScores(session,'agama_kristen','90');
  fillAllAssessmentScores(session,'mtk','80');
  saveAllAutomaticReports(session);

  const mapelIslam=getReportDocument(session,islam.id).subjects.map(item=>item.subject.name);
  assert.ok(mapelIslam.includes(PAI)&&!mapelIslam.includes(PAK));
  const mapelKristen=getReportDocument(session,kristen.id).subjects.map(item=>item.subject.name);
  assert.ok(mapelKristen.includes(PAK)&&!mapelKristen.includes(PAI));
  assert.deepEqual(listSubjectsForStudent(session,islam).map(item=>item.id),['agama','mtk']);
  assert.deepEqual(listSubjectsForStudent(session,kristen).map(item=>item.id),['agama_kristen','mtk']);
});

test('Nilai agama muncul di getReportDocument dan di Leger',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  saveAssessmentScores(session,'agama','formative',{[islam.id]:85});
  saveAssessmentScores(session,'agama_kristen','formative',{[kristen.id]:90});
  saveAllAutomaticReports(session);

  assert.equal(getReportDocument(session,islam.id).subjects.find(item=>item.subject.id==='agama').score,85,'nilai PAI ada di dokumen rapor');
  assert.equal(getReportDocument(session,kristen.id).subjects.find(item=>item.subject.id==='agama_kristen').score,90,'nilai PAK ada di dokumen rapor');
  const leger=getLeger(session);
  assert.equal(leger.students.find(row=>row.student.id===islam.id).scores.find(item=>item.subject.id==='agama').score,85,'nilai PAI ada di Leger');
  assert.equal(leger.students.find(row=>row.student.id===kristen.id).scores.find(item=>item.subject.id==='agama_kristen').score,90,'nilai PAK ada di Leger');
});

test('Nilai agama tetap ada setelah aplikasi ditutup dan dibuka kembali',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama','85');
  fillAllAssessmentScores(session,'agama_kristen','90');
  saveAllAutomaticReports(session);

  /* Meniru menutup aplikasi: cache memori dibuang, data dibaca ulang dari penyimpanan. */
  const isiPenyimpanan=simpanan.get(storageKey());
  invalidateDbCache();
  simpanan=new Map([[storageKey(),isiPenyimpanan]]);
  globalThis.localStorage={getItem:key=>simpanan.has(key)?simpanan.get(key):null,setItem:(key,value)=>simpanan.set(key,String(value)),removeItem:key=>simpanan.delete(key),clear:()=>simpanan.clear()};

  assert.equal(barisMapel(session,'agama').find(row=>row.student.id===islam.id).score.finalScore,85,'nilai PAI bertahan setelah dibuka kembali');
  assert.equal(barisMapel(session,'agama_kristen').find(row=>row.student.id===kristen.id).score.finalScore,90,'nilai PAK bertahan setelah dibuka kembali');
  assert.equal(loadDb().students[`${session.academicYear}|${session.semester}|5B|${kristen.id}`].religion,'Kristen','agama siswa bertahan');
});

test('Siswa tanpa NIS tetap dapat mempunyai nilai agama',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','mtk']);
  const tanpaNis=siswa(session,'TANPA',{nis:'',religion:'Islam'});
  fillAllAssessmentScores(session,'agama','88',{studentId:tanpaNis.id});
  saveAutomaticReportScores(session,'agama');

  assert.equal(tanpaNis.nis,'');
  const baris=barisMapel(session,'agama').find(row=>row.student.id===tanpaNis.id);
  assert.equal(baris.score.finalScore,88,'nilai agama siswa tanpa NIS terbaca di Nilai Tersimpan');
  assert.equal(getReportDocument(session,tanpaNis.id).subjects.find(item=>item.subject.id==='agama').score,88,'nilai agama masuk rapor');
  assert.equal(getLeger(session).students.find(row=>row.student.id===tanpaNis.id).scores.find(item=>item.subject.id==='agama').score,88,'nilai agama masuk Leger');
});

/* ------------------------------------------ Penyaringan tampilan halaman Nilai Tersimpan */

test('Nilai Tersimpan menyembunyikan baris mapel agama yang tidak sesuai agama siswa',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  ['agama','agama_kristen','mtk'].forEach(id=>tp(session,id));
  saveAssessmentScores(session,'agama','formative',{[islam.id]:85});
  saveAssessmentScores(session,'agama_kristen','formative',{[kristen.id]:90});
  /* Simpan Semua Nilai Otomatis menulis record nilai dan deskripsi untuk semua mapel aktif x
     semua siswa, termasuk baris PAK milik siswa Islam dan sebaliknya. */
  saveAllAutomaticReports(session);

  const rows=tampil(session);
  assert.equal(adaBaris(rows,islam.id,'agama'),true,'siswa Islam melihat baris PAI');
  assert.equal(adaBaris(rows,islam.id,'agama_kristen'),false,'baris PAK tidak muncul pada siswa Islam');
  assert.equal(adaBaris(rows,kristen.id,'agama_kristen'),true,'siswa Kristen melihat baris PAK');
  assert.equal(adaBaris(rows,kristen.id,'agama'),false,'baris PAI tidak muncul pada siswa Kristen');
  assert.equal(adaBaris(rows,islam.id,'mtk')&&adaBaris(rows,kristen.id,'mtk'),true,'mapel non-agama tidak ikut disaring');
});

test('Baris mapel agama kosong tanpa nilai dan deskripsi tidak ditampilkan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');
  saveAutomaticReportScores(session,'agama_kristen');
  saveAutomaticReportScores(session,'mtk');

  const kunciPak=`${session.academicYear}|${session.semester}|5B|agama_kristen|${islam.id}`;
  assert.equal(loadDb().reportScores[kunciPak].finalScore,null,'record PAK kosong memang terbentuk');
  const rows=tampil(session);
  assert.equal(adaBaris(rows,islam.id,'agama_kristen'),false,'baris PAK kosong disembunyikan');
  assert.equal(adaBaris(rows,islam.id,'agama'),true,'baris PAI yang berisi nilai tetap tampil');
  assert.equal(adaBaris(rows,islam.id,'mtk'),true,'mapel non-agama tanpa nilai tetap tampil sebagai penanda belum lengkap');
});

test('Penyaringan Nilai Tersimpan tidak menghapus record apa pun dari database',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  ['agama','agama_kristen'].forEach(id=>tp(session,id));
  fillAllAssessmentScores(session,'agama','85');
  saveAllAutomaticReports(session);

  const kunciPai=`${session.academicYear}|${session.semester}|5B|agama|${kristen.id}`;
  const rows=tampil(session);
  assert.equal(adaBaris(rows,kristen.id,'agama'),false,'baris PAI siswa Kristen tidak ditampilkan');
  /* Hanya TAMPILAN yang disaring: nilai dan deskripsi lama tetap utuh di penyimpanan. */
  const db=loadDb();
  assert.equal(db.reportScores[kunciPai].finalScore,85,'nilai PAI lama tetap tersimpan');
  assert.ok(db.reportDescriptions[kunciPai].text,'deskripsi PAI lama tetap tersimpan');
  assert.equal(barisMapel(session,'agama').some(row=>row.student.id===kristen.id),true,'record tetap terbaca di lapisan data');
});

test('Nilai agama tetap tampil saat kolom Agama siswa masih kosong',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  /* Kondisi nyata siswa seed 5B: kolom agama belum diisi. Agama tidak boleh ditebak, dan nilai
     yang sudah diinput guru tidak boleh hilang dari layar. */
  const kosong=siswa(session,'KOSONG',{religion:''});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');
  saveAutomaticReportScores(session,'agama_kristen');

  const rows=tampil(session);
  assert.equal(adaBaris(rows,kosong.id,'agama'),true,'nilai PAI yang sudah tersimpan tetap terlihat');
  assert.equal(adaBaris(rows,kosong.id,'agama_kristen'),false,'baris PAK kosong tetap disembunyikan');
});

test('Halaman Nilai Tersimpan memakai penyaringan tampilan, bukan penghapusan data',()=>{
  const page=read('src/pages/reports.js');
  assert.match(page,/visibleStoredReportRows\(getStoredReportRows\(session\)\)/,'daftar Nilai Tersimpan disaring saat digambar');
  assert.doesNotMatch(read('src/services/report.js'),/delete db\.reportScores|delete db\.reportDescriptions/,'tidak ada penghapusan record nilai atau deskripsi');
});

/* ------------------------------------------------------------ Warna latar area cetak */

test('Latar area cetak Rapor dan Cover putih pada Preview, PDF, dan Cetak',()=>{
  const css=read('src/styles/app.css');
  assert.match(read('src/pages/print.js'),/<div class="print-workspace">/,'halaman Cetak Nilai memakai area kerja tersendiri');
  assert.match(css,/\.print-workspace\{background:#fff\}/,'area sekitar kertas putih');
  assert.match(css,/\.content:has\(\.print-workspace\)\{background:#fff\}/,'padding halaman ikut putih');
  assert.match(css,/\.print-workspace \.report-a4,\.print-workspace \.report-cover-a4\{background:#fff;border-color:#fff;box-shadow:none\}/,'pinggiran kertas menyatu dengan kertas');
  const blokCetak=css.match(/@media print\{\n  html,body,\.print-workspace,\.document-a4,\.document-sheet,\.report-a4,\.report-cover-a4\{background:#fff!important\}[^}]*\}[^}]*\}/)[0];
  assert.match(blokCetak,/html,body,\.print-workspace,\.document-a4,\.document-sheet,\.report-a4,\.report-cover-a4\{background:#fff!important\}/,'saat mencetak seluruh latar putih');
  assert.match(blokCetak,/\.report-a4,\.report-cover-a4\{border:0!important;box-shadow:none!important\}/);
});

test('Format Rapor, Cover, Perlengkapan, dan Leger tidak berubah',()=>{
  const css=read('src/styles/app.css');
  /* Ukuran A4, margin isi, tabel, dan font rapor tetap. */
  assert.match(css,/\.document-a4\{width:min\(100%,794px\);min-height:1123px/,'ukuran A4 tetap');
  assert.match(css,/\.report-a4\{padding:14mm 13mm\}/,'margin isi rapor tetap');
  assert.match(css,/\.report-learning-table th:nth-child\(3\),\.report-learning-table \.subject-score-cell\{text-align:center;vertical-align:middle\}/,'posisi Nilai Akhir tetap');
  /* Arsiran header tabel adalah bagian format final dan tidak ikut diputihkan. */
  assert.match(css,/\.document-table th\{text-align:center;background:#f3f0ed\}/,'arsiran header tabel dokumen tetap');
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/COVER_LOGO_DEFAULTS=Object\.freeze\(\{/,'logo Cover tetap');
  assert.match(cetak,/if\(tab==='leger'\)setPrintPageSize\('landscape',marginRule\('leger'\)\)/,'Leger A4 landscape tetap');
  assert.match(cetak,/return mode==='report'\?'10mm 0':'8mm';/,'margin leger bawaan tetap 8mm');
  assert.match(css,/@media print\{\.report-a4\+\.report-a4,\.report-cover-a4\+\.report-cover-a4\{break-before:page\}\}/,'pemisah halaman rapor dan cover tetap');
  assert.match(css,/\.leger-table th,\.leger-table td\{text-align:center;min-width:78px\}/,'format Leger tetap');
  assert.match(css,/\.equipment-title strong\{font-size:14px\}/,'format Perlengkapan tetap');
});
