import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { getReportDocument } from '../src/services/documents.js';
import { getStoredReportRows, saveAutomaticReportScores, visibleStoredReportRows } from '../src/services/report.js';
import { createStudent, updateStudent } from '../src/services/students.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';
import { resolveRoute } from '../src/core/router.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
let simpanan=new Map();
function useMemoryStorage(){simpanan=new Map();globalThis.localStorage={getItem:key=>simpanan.has(key)?simpanan.get(key):null,setItem:(key,value)=>simpanan.set(key,String(value)),removeItem:key=>simpanan.delete(key),clear:()=>simpanan.clear()};invalidateDbCache();}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}
const PAI='Pendidikan Agama Islam dan Budi Pekerti';
const PAK='Pendidikan Agama Kristen dan Budi Pekerti';
const mapelRapor=(session,studentId)=>getReportDocument(session,studentId).subjects.map(item=>item.subject.name);

/* ------------------------------------------------- Akar bug: tautan indikator Agama */

test('Rute "#/students" dari indikator kelengkapan tidak lagi jatuh ke Dashboard',()=>{
  const session=guru('5B');
  /* Tombol "! Agama" mengarahkan guru ke Data Siswa. Bentuk lama "#/students" tidak dikenali
     router sehingga guru selalu mendarat di Dashboard dan agama tidak pernah terisi. */
  assert.equal(resolveRoute('#/students',session),'students');
  assert.equal(resolveRoute('/students',session),'students');
  assert.equal(resolveRoute('#students',session),'students');
  assert.equal(resolveRoute('students',session),'students');
  assert.equal(resolveRoute('#/tidak-ada',session),'dashboard','rute asing tetap jatuh ke Dashboard');
});

test('Indikator kelengkapan memakai hash tanpa garis miring dan membawa id siswa',()=>{
  const halaman=read('src/pages/print.js');
  assert.match(halaman,/globalThis\.location\.hash=`#\$\{route\}`/,'navigasi memakai #route');
  assert.doesNotMatch(halaman,/hash=`#\/\$\{route\}`/,'bentuk #/route sudah tidak dipakai');
  assert.match(halaman,/religion:'students'/,'indikator Agama menuju Data Siswa');
  assert.match(halaman,/data-goto="religion" data-goto-student="\$\{escapeHtml\(doc\.student\.id\)\}"/,'tombol membawa siswa yang bersangkutan');
  assert.match(read('src/pages/students.js'),/sessionStorage\.getItem\('erapor-focus-student'\)/,'Data Siswa membuka form Edit siswa itu');
});

test('Preview Rapor memberi tahu penyebab mapel agama belum tampil',()=>{
  const halaman=read('src/pages/print.js');
  assert.match(halaman,/function religionNotice\(doc\)\{/);
  assert.match(halaman,/if\(doc\.categories\?\.religion!==false\)return '';/,'peringatan hanya muncul saat agama kosong');
  assert.match(halaman,/Isi Agama Siswa<\/button>/,'tersedia tombol menuju Data Siswa');
  assert.match(halaman,/\$\{religionNotice\(doc\)\}/,'peringatan dirender di atas lembar preview');
});

/* ------------------------------------------------- Mapel agama di Nilai Tersimpan & Rapor */

test('Siswa Islam mendapat PAI BP di Nilai Tersimpan dan Rapor, tanpa PAK BP',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'ISL',{religion:'Islam'});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');
  saveAutomaticReportScores(session,'agama_kristen');

  const tampil=visibleStoredReportRows(getStoredReportRows(session)).filter(row=>row.student.id===anak.id);
  assert.deepEqual(tampil.filter(row=>/Agama/.test(row.subject.name)).map(row=>`${row.subject.name}=${row.score?.finalScore}`),[`${PAI}=85`]);
  const mapel=mapelRapor(session,anak.id);
  assert.ok(mapel.includes(PAI),'PAI BP muncul di rapor');
  assert.ok(!mapel.includes(PAK),'PAK BP tidak muncul di rapor');
});

test('Siswa Kristen mendapat PAK BP di Nilai Tersimpan dan Rapor, tanpa PAI BP',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama_kristen','90');
  saveAutomaticReportScores(session,'agama');
  saveAutomaticReportScores(session,'agama_kristen');

  const tampil=visibleStoredReportRows(getStoredReportRows(session)).filter(row=>row.student.id===anak.id);
  assert.deepEqual(tampil.filter(row=>/Agama/.test(row.subject.name)).map(row=>`${row.subject.name}=${row.score?.finalScore}`),[`${PAK}=90`]);
  const mapel=mapelRapor(session,anak.id);
  assert.ok(mapel.includes(PAK),'PAK BP muncul di rapor');
  assert.ok(!mapel.includes(PAI),'PAI BP tidak muncul di rapor');
});

test('Mengisi Agama pada Data Siswa langsung memunculkan mapel agama di rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'KOSONG',{religion:''});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');

  /* Sebelum agama diisi: tidak ditebak, tidak ada mapel agama, dan penyebabnya dilaporkan. */
  const sebelum=getReportDocument(session,anak.id);
  assert.equal(sebelum.subjects.some(item=>/Agama/.test(item.subject.name)),false,'agama kosong tidak menampilkan mapel agama');
  assert.equal(sebelum.categories.religion,false);
  assert.ok(sebelum.missing.includes('Agama belum diisi'));

  updateStudent(session,anak.id,{...anak,religion:'Islam'});
  const sesudah=getReportDocument(session,anak.id);
  assert.ok(sesudah.subjects.some(item=>item.subject.name===PAI),'PAI BP muncul setelah agama diisi');
  assert.equal(sesudah.subjects.find(item=>item.subject.name===PAI).score,85,'nilai lama langsung terpakai, tidak hilang');
  assert.equal(sesudah.categories.religion,true);
});

test('Mapel agama tetap terbaca walau Mapping memakai id lama seperti "pai"',()=>{
  useMemoryStorage();
  const session=guru('5B');
  /* Mapping lama sebelum id "agama" dipakai: mapel agama memakai id "pai". */
  saveSubjectMapping(session,[
    {id:'pai',name:'Pendidikan Agama Islam dan Budi Pekerti',group:'A',order:1,active:true},
    {id:'mtk',name:'Matematika',group:'A',order:2,active:true},
  ]);
  const anak=siswa(session,'LAMA',{religion:'Islam'});
  assert.deepEqual(listSubjectsForStudent(session,anak).map(item=>item.id),['pai','mtk'],'id lama tetap dikenali sebagai mapel agama siswa');
  fillAllAssessmentScores(session,'pai','80');
  saveAutomaticReportScores(session,'pai');
  const baris=visibleStoredReportRows(getStoredReportRows(session)).find(row=>row.subject.id==='pai'&&row.student.id===anak.id);
  assert.equal(baris.score.finalScore,80,'nilai tersimpan dengan id lama tetap muncul di Nilai Tersimpan');
  assert.equal(getReportDocument(session,anak.id).subjects.find(item=>item.subject.id==='pai').score,80,'nilai id lama masuk rapor');
});

test('Mapel agama tidak hilang walau statusnya nonaktif pada Mapping',()=>{
  useMemoryStorage();
  const session=guru('5B');
  /* PAK sengaja dinonaktifkan di Mapping rombel; siswa Kristen tetap harus dapat PAK. */
  aktifkan(session,['agama','mtk']);
  const anak=siswa(session,'KRS',{religion:'Kristen'});
  assert.deepEqual(listSubjectsForStudent(session,anak).map(item=>item.id),['agama_kristen','mtk']);
  assert.ok(mapelRapor(session,anak.id).includes(PAK));
});

/* ------------------------------------------------------------- Warna area luar kertas */

test('Latar halaman Cetak Nilai putih sampai tepi tanpa bergantung pada :has()',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/html\[data-route="print"\],html\[data-route="print"\] body,html\[data-route="print"\] \.app-shell,html\[data-route="print"\] \.main,html\[data-route="print"\] \.content,html\[data-route="print"\] \.footer\{background:#fff\}/,'html, body, shell, main, content, dan footer ikut putih');
  assert.match(read('src/app.js'),/document\.documentElement\.dataset\.route=route;/,'rute aktif ditandai di <html>');
  /* Aturan lama dengan :has() dipertahankan sebagai pelengkap, bukan satu-satunya penopang. */
  assert.match(css,/\.content:has\(\.print-workspace\)\{background:#fff\}/);
  assert.match(css,/\.print-workspace\{background:#fff\}/);
});

test('Tidak ada bayangan yang menjatuhkan warna abu ke sekitar kertas',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/\.print-workspace \.card\{box-shadow:none\}/,'kartu kontrol tidak berbayang di halaman cetak');
  assert.match(css,/\.print-workspace \.report-a4,\.print-workspace \.report-cover-a4\{background:#fff;border-color:#fff;box-shadow:none\}/,'kertas Rapor dan Cover tanpa bingkai abu dan tanpa bayangan');
  /* Laci sidebar tersembunyi memakai transform, tetapi bayangannya tetap tergambar ke halaman. */
  assert.match(css,/\.sidebar\{position:fixed;left:0;top:0;width:min\(84vw,300px\);transform:translateX\(-105%\);transition:transform \.2s ease;box-shadow:none\}/,'laci tertutup tidak berbayang');
  assert.match(css,/\.sidebar\.open\{transform:translateX\(0\);box-shadow:14px 0 40px rgba\(0,0,0,\.2\)\}/,'bayangan hanya saat laci dibuka');
});

test('Perubahan warna tidak menyentuh ukuran, margin, tabel, atau jumlah halaman',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/\.document-a4\{width:min\(100%,794px\);min-height:1123px/,'ukuran A4 tetap');
  assert.match(css,/\.report-a4\{padding:14mm 13mm\}/,'margin isi rapor tetap');
  assert.match(css,/\.report-cover-a4\{display:flow-root;text-align:center;padding:37\.8px\}/,'geometri Cover tetap');
  assert.match(css,/\.document-table th\{text-align:center;background:#f3f0ed\}/,'arsiran header tabel tetap');
  assert.match(css,/@media print\{\.report-a4\+\.report-a4,\.report-cover-a4\+\.report-cover-a4\{break-before:page\}\}/,'pemisah halaman tetap');
  /* Aturan warna baru hanya berisi properti cat, tidak ada properti tata letak. */
  const barisBaru=css.split('\n').filter(baris=>/data-route="print"|\.print-workspace \.card\{/.test(baris)).join('\n');
  assert.doesNotMatch(barisBaru,/width|height|margin|padding|display|position|font/,'tidak ada properti geometri pada aturan warna baru');
});

test('Cetak tetap memutihkan seluruh latar dan tidak mengubah arsiran tabel',()=>{
  const css=read('src/styles/app.css');
  const blok=css.match(/@media print\{\n  html,body,\.print-workspace,[^}]*\}[^}]*\}/)[0];
  assert.match(blok,/html,body,\.print-workspace,\.document-a4,\.document-sheet,\.report-a4,\.report-cover-a4\{background:#fff!important\}/);
  assert.match(blok,/\.report-a4,\.report-cover-a4\{border:0!important;box-shadow:none!important\}/);
  assert.doesNotMatch(blok,/document-table|document-box-head/,'arsiran isi dokumen tidak ikut diputihkan');
});
