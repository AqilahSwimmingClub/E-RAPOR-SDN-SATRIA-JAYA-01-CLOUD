import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { getReportDocument } from '../src/services/documents.js';
import { saveAutomaticReportScores } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css');
let simpanan=new Map();
function useMemoryStorage(){simpanan=new Map();globalThis.localStorage={getItem:key=>simpanan.has(key)?simpanan.get(key):null,setItem:(key,value)=>simpanan.set(key,String(value)),removeItem:key=>simpanan.delete(key),clear:()=>simpanan.clear()};invalidateDbCache();}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}
const PAI='Pendidikan Agama Islam dan Budi Pekerti';
const PAK='Pendidikan Agama Kristen dan Budi Pekerti';

/* ------------------------------------------------------------- 1-2. Font dan spacing */

test('1. Font dokumen memakai Arial dengan padanan yang sama ukurannya di semua perangkat',()=>{
  /* Arial tidak tersedia di Android dan Linux, sehingga disiapkan padanan yang metriknya
     sama persis (Liberation Sans, Nimbus Sans, Helvetica) sebelum jatuh ke Roboto. */
  assert.match(css(),/font-family:Arial,"Liberation Sans","Helvetica Neue",Helvetica,"Nimbus Sans",Roboto,sans-serif/,'urutan font dokumen');
  assert.doesNotMatch(css(),/\.document-a4\{[^}]*font-family:Arial,sans-serif/,'stack lama sudah tidak dipakai');
  const dokumen=css().match(/\.document-a4\{[^}]*\}/)[0];
  assert.doesNotMatch(dokumen,/cursive|fantasy|monospace|Comic|Times/i,'tidak memakai font dekoratif atau berkait');
});

test('2. Spacing identitas, judul, dan bagian rapor mengikuti acuan yang lebih rapat',()=>{
  const t=css();
  assert.match(t,/\.report-a4 \.report-head-table\{margin-bottom:12px;padding-bottom:8px\}/,'jarak identitas ke judul');
  assert.match(t,/\.report-a4 \.report-head-table td\{font-size:10\.5px;padding:2px 4px;line-height:1\.4\}/,'baris identitas rapat dan konsisten');
  assert.match(t,/\.report-a4 \.document-heading\{font-size:14px;margin:0 0 14px;letter-spacing:\.03em\}/,'judul LAPORAN HASIL BELAJAR');
  assert.match(t,/\.report-a4 \.document-section\{font-size:11\.5px;margin:14px 0 7px\}/,'jarak judul bagian A dan B ke tabel');
  assert.match(t,/\.report-a4 \.document-table th,\.report-a4 \.document-table td\{padding:5px 7px;font-size:10\.5px;line-height:1\.4\}/,'tinggi baris tabel lebih efisien');
  assert.match(t,/\.report-a4 \.subject-group-row td\{padding:4px 8px;font-size:10\.5px\}/,'baris Kelompok A/B');
  /* Ukuran huruf tidak dikecilkan hanya agar muat. */
  assert.match(t,/\.report-a4 \.document-box-body\{font-size:10\.5px;line-height:1\.5;padding:8px 10px\}/);
  assert.equal(/\.report-a4[^{]*\{[^}]*font-size:(?:[0-8](?:\.\d+)?)px/.test(t),false,'tidak ada teks rapor di bawah 9px');
});

test('3. Nilai Akhir tetap center horizontal dan vertikal, kolom lain tidak berubah',()=>{
  const t=css();
  assert.match(t,/\.report-learning-table th:nth-child\(3\),\.report-learning-table \.subject-score-cell\{text-align:center;vertical-align:middle\}/);
  assert.match(t,/\.subject-name-cell\{text-align:left!important\}/,'Mata Pelajaran rata kiri');
  assert.match(t,/\.subject-description-cell\{text-align:left!important;line-height:1\.45\}/,'Capaian Kompetensi rata kiri');
  assert.match(t,/\.document-table td:first-child,\.document-table td:last-child\{text-align:center\}/,'kolom No center');
  assert.match(read('src/pages/print.js'),/<td class="subject-score-cell">\$\{row\.score\?\?'—'\}<\/td>/);
});

/* --------------------------------------------------------- 4-5. Ukuran halaman dokumen */

test('4. Rapor tetap A4 portrait dengan margin isi 13mm kiri dan kanan',()=>{
  const t=css();
  assert.match(t,/\.document-a4\{width:min\(100%,794px\);min-height:1123px/,'ukuran A4 layar');
  assert.match(t,/\.report-a4\{padding:14mm 13mm\}/,'margin isi pada preview layar');
  assert.match(t,/\.report-a4\{padding:0 13mm!important\}/,'margin samping dibawa lembar saat cetak');
  assert.match(read('src/pages/print.js'),/else if\(tab==='report'\)setPrintPageSize\('portrait','10mm 0'\)/);
});

test('5. Cover tetap A4 portrait satu halaman dan desainnya tidak diubah',()=>{
  const t=css();
  const cetak=read('src/pages/print.js');
  assert.match(t,/\.report-cover-a4\{display:flow-root;text-align:center;padding:37\.8px\}/,'geometri cover');
  assert.match(t,/\.report-cover-a4>\.cover-logo-ministry\{width:188px;height:189px\}/,'ukuran logo kementerian');
  assert.match(t,/\.report-cover-a4>\.cover-logo-region\{width:172px;height:189px;margin-top:45\.3px\}/,'ukuran dan posisi lambang daerah');
  assert.match(t,/\.cover-fields\{display:block;width:453px;margin:51\.5px auto 0\}/,'blok Nama dan NISN/NIS');
  assert.match(cetak,/KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH/,'teks kementerian');
  assert.match(cetak,/else setPrintPageSize\(null\)/,'cover memakai @page bawaan, bukan override rapor');
  assert.match(t,/@media print\{@page\{size:A4 portrait;margin:10mm\}/);
});

/* --------------------------------------------------------------- 6-7. Mapel agama */

test('6. Siswa Islam tetap mendapat PAI BP pada rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'ISL',{religion:'Islam'});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');
  const mapel=getReportDocument(session,anak.id).subjects;
  assert.equal(mapel.find(item=>item.subject.name===PAI)?.score,85);
  assert.equal(mapel.some(item=>item.subject.name===PAK),false);
});

test('7. Siswa Kristen tetap mendapat PAK BP pada rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama_kristen','91');
  saveAutomaticReportScores(session,'agama_kristen');
  const mapel=getReportDocument(session,anak.id).subjects;
  assert.equal(mapel.find(item=>item.subject.name===PAK)?.score,91);
  assert.equal(mapel.some(item=>item.subject.name===PAI),false);
});

/* ------------------------------------------------------- 8-12. Warna kertas dan cetak */

test('8. Seluruh induk halaman cetak berlatar putih tanpa bergantung pada :has()',()=>{
  assert.match(css(),/html\[data-route="print"\],html\[data-route="print"\] body,html\[data-route="print"\] \.app-shell,html\[data-route="print"\] \.main,html\[data-route="print"\] \.content,html\[data-route="print"\] \.footer\{background:#fff\}/);
  assert.match(read('src/app.js'),/document\.documentElement\.dataset\.route=route;/);
  assert.match(css(),/\.print-workspace\{background:#fff\}/);
});

test('9-10. Kertas Rapor dan Cover berlatar putih pada layar maupun cetak',()=>{
  const t=css();
  assert.match(t,/\.print-workspace \.report-a4,\.print-workspace \.report-cover-a4\{background:#fff;border-color:#fff;box-shadow:none\}/);
  const blok=t.match(/@media print\{\n  html,body,\.print-workspace,\.document-a4,\.document-sheet,\.report-a4,\.report-cover-a4\{background:#fff!important\}[\s\S]*?\n\}/)[0];
  assert.match(blok,/background:#fff!important/);
  /* Latar hitam WebView adalah sumber pinggiran hitam saat cetak dari Android. */
  const capacitor=JSON.parse(read('capacitor.config.json'));
  assert.equal(capacitor.backgroundColor,'#ffffff');
  assert.equal(capacitor.android.backgroundColor,'#ffffff');
  assert.equal(capacitor.ios.backgroundColor,'#ffffff');
});

test('11. Dokumen cetak tidak memakai box-shadow',()=>{
  const t=css();
  assert.match(t,/\.print-workspace \.card\{box-shadow:none\}/);
  assert.match(t,/\.report-a4,\.report-cover-a4\{border:0!important;box-shadow:none!important\}/);
  assert.match(t,/\.sidebar\{position:fixed;left:0;top:0;width:min\(84vw,300px\);transform:translateX\(-105%\);transition:transform \.2s ease;box-shadow:none\}/);
});

test('12. Tema gelap dan mode kontras tinggi tidak mengubah warna kertas',()=>{
  const t=css();
  assert.match(t,/:root\{color-scheme:light\}/);
  assert.match(t,/\.print-workspace,\.document-sheet,\.report-a4,\.report-cover-a4\{color-scheme:light;forced-color-adjust:none;-webkit-print-color-adjust:exact;print-color-adjust:exact\}/);
  const gelap=t.match(/@media \(prefers-color-scheme:dark\)\{[\s\S]*?\n\}/)[0];
  assert.match(gelap,/\.document-a4,\.document-sheet,\.report-a4,\.report-cover-a4,\.print-workspace\{background:#fff;color:#171412\}/);
  const kontras=t.match(/@media \(forced-colors:active\)\{[\s\S]*?\n\}/)[0];
  assert.match(kontras,/forced-color-adjust:none;background:#fff;color:#171412/);
  assert.match(read('index.html'),/<meta name="color-scheme" content="light" \/>/);
});

/* ------------------------------------------------- 13-15. Hasil cetak dan jumlah halaman */

test('13-14. Cetak memakai warna apa adanya sehingga kertas PDF tetap putih',()=>{
  const t=css();
  const blokCetak=t.match(/@media print\{\n  html,body,\.print-workspace,\.document-a4,\.document-sheet,\.report-a4,\.report-cover-a4\{-webkit-print-color-adjust:exact[\s\S]*?\n\}/)[0];
  assert.match(blokCetak,/print-color-adjust:exact;color-scheme:light;forced-color-adjust:none/);
  /* Tidak ada bidang gelap seukuran halaman pada dokumen cetak. */
  for(const aturan of t.match(/\.(?:document-a4|report-a4|report-cover-a4|print-workspace)[^{]*\{[^}]*background:[^};]*/g)||[]){
    assert.equal(/background:\s*(#000|black|rgba?\(0,\s*0,\s*0)/i.test(aturan),false,`latar gelap pada ${aturan.slice(0,60)}`);
  }
});

test('15. Perubahan typography tidak mengubah struktur maupun pemisah halaman rapor',()=>{
  const t=css();
  const cetak=read('src/pages/print.js');
  assert.match(t,/@media print\{\.report-a4\+\.report-a4,\.report-cover-a4\+\.report-cover-a4\{break-before:page\}\}/,'pemisah halaman tetap');
  assert.match(t,/\.report-a4 \.document-table tr,\.report-a4 \.subject-group-row\{break-inside:avoid\}/,'baris tabel tidak terpotong');
  assert.match(t,/\.report-a4 \.report-lower-grid,\.report-a4 \.response-box,\.report-a4 \.report-signatures\{break-inside:avoid\}/);
  assert.match(t,/\.report-a4 \.report-learning-table thead\{display:table-header-group\}/,'header tabel diulang di halaman berikutnya');
  /* Struktur isi rapor tidak berubah. */
  for(const bagian of ['A. Sikap','B. Pengetahuan dan Keterampilan','Kelompok \\$\\{group\\}','Ketidakhadiran','Catatan Wali Kelas','Tanggapan Orang Tua/Wali Murid']){
    assert.match(cetak,new RegExp(bagian),`bagian ${bagian} tetap ada`);
  }
  assert.match(t,/\.document-table th\{text-align:center;background:#f3f0ed\}/,'arsiran header tabel tetap');
});
