import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { generateReportDescription } from '../src/services/descriptions.js';
import { composeIntracurricularDescription, listIntracurricularObjectives,
  listIntracurricularSubjects, saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { addReferenceObjectives, listObjectivesForAssessment,
  listReferenceObjectives } from '../src/services/learning-objectives.js';
import { listCpButirForSemester } from '../src/services/cp-butir.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { activityTable, cocurricularTable, extracurricularTable, intracurricularTable } from '../src/pages/print.js';
import { extractReportLayout } from './helpers/report-layout.js';
import { extractFunctionSource } from './helpers/report-markup.js';

/* KUNCI TAMPILAN RAPOR.

   Tampilan rapor yang berlaku sekarang adalah baseline d093b99 dan tidak boleh berubah:
   Times New Roman, ukuran huruf, posisi teks, posisi angka, perataan mendatar dan tegak,
   nomor urut, lebar kolom, spasi, struktur tabel, header, pemisah halaman, urutan bagian, dan
   format dua halaman A4.

   Tahap 8D dan 8E hanya boleh mengubah SUMBER ISI yang masuk ke tata letak itu. Karena itu
   suite ini membandingkan aturan gaya dan penyusun markup rapor terhadap salinan baseline,
   lalu memastikan deskripsi TP hanya menghasilkan teks biasa. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const readJson=path=>JSON.parse(read(path));

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
function siapkan(){
  useMemoryStorage();
  saveSubjectMapping(guru,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:item.id==='mtk',order:index+1})));
  /* TP dimasukkan lewat + Tambah TP seperti yang dilakukan guru di menu Tujuan Pembelajaran. */
  const referensi=listReferenceObjectives(guru,'mtk').filter(item=>!item.sudahDipakai);
  if(referensi.length)addReferenceObjectives(guru,'mtk',referensi.map(item=>item.id));
  const siswa=createStudent(guru,{classId:guru.classId,nis:'5B-1',nisn:'9988000001',name:'Siswa 1',gender:'P',photo:''});
  saveAssessmentSettings(guru,'mtk',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ['formative','daily','practice','scopeSummative','semesterSummative'])
    saveAssessmentScores(guru,'mtk',jenis,{[siswa.id]:82});
  return siswa;
}

/* --------------------------------------------------------------------- Gaya lembar rapor */

test('1. Seluruh aturan gaya lembar rapor identik dengan baseline d093b99',()=>{
  const baseline=readJson('tests/fixtures/report-layout-baseline.json');
  const sekarang=extractReportLayout(read('src/styles/app.css'));
  const hilang=Object.keys(baseline).filter(kunci=>!(kunci in sekarang));
  assert.deepEqual(hilang,[],'tidak boleh ada aturan tampilan rapor yang dihapus');
  for(const [kunci,nilai] of Object.entries(baseline))
    assert.equal(sekarang[kunci],nilai,`aturan "${kunci}" berubah dari baseline`);
  const tambahan=Object.keys(sekarang).filter(kunci=>!(kunci in baseline));
  assert.deepEqual(tambahan,[],'tidak boleh ada aturan tampilan rapor baru');
});

test('2. Huruf, ukuran, perataan, dan lebar kolom rapor tetap seperti baseline',()=>{
  const baseline=readJson('tests/fixtures/report-layout-baseline.json');
  assert.match(baseline['.report-a4'],/font-family:"Times New Roman",Times,serif/);
  assert.match(baseline['.report-a4'],/padding:14mm 13mm/);
  assert.match(baseline['.report-learning-table th:nth-child(1)'],/width:34px/);
  assert.match(baseline['.report-learning-table th:nth-child(3)'],/width:60px/);
  assert.match(baseline['.report-learning-table th:nth-child(3)'],/text-align:center;vertical-align:middle/);
  assert.match(baseline['.report-learning-table td:nth-child(2)'],/text-align:left/);
  assert.match(baseline['.report-learning-table td:nth-child(4)'],/text-align:left/);
  assert.match(baseline['.document-table th'],/text-align:center/);
  assert.equal(baseline['@page'],'size:A4 portrait;margin:10mm | size:A4 portrait;margin:10mm');
});

test('3. Aturan pemisah halaman dan pengulangan header tabel tidak berubah',()=>{
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/@media print\{\.report-a4\+\.report-a4,\.report-cover-a4\+\.report-cover-a4\{break-before:page\}\}/);
  assert.match(gaya,/\.report-a4 \.document-table tr,\.report-a4 \.subject-group-row\{break-inside:avoid\}/);
  assert.match(gaya,/\.report-a4 \.report-lower-grid,\.report-a4 \.response-box,\.report-a4 \.report-signatures\{break-inside:avoid\}/);
  assert.match(gaya,/\.report-a4 \.report-learning-table thead\{display:table-header-group\}/);
});

/* ------------------------------------------------------------------ Penyusun markup rapor */

test('4. Penyusun markup rapor identik dengan baseline d093b99',()=>{
  const baseline=readJson('tests/fixtures/report-markup-baseline.json');
  const sumber=read('src/pages/print.js');
  for(const [nama,teks] of Object.entries(baseline))
    assert.equal(extractFunctionSource(sumber,nama),teks,`fungsi ${nama} berubah dari baseline`);
});

/* PERUBAHAN BASELINE KEDUA YANG DISENGAJA DAN DIMINTA.

   `intracurricularTable` dulu memanggil `singleActivityRows`, sehingga rapor mencetak SATU
   catatan Intrakurikuler saja untuk seluruh mata pelajaran. Dokumen memilih catatan itu tanpa
   menyebut mapel, dan yang terpilih bisa saja mapel yang salah - guru menyimpan IPAS tetapi
   rapor mencetak Pendidikan Pancasila beserta predikat dan deskripsinya.

   Karena Intrakurikuler dinilai per mata pelajaran, tabelnya sekarang menerima daftar dan
   mencetak satu baris per mapel. Bentuk tabel, kolom, dan gayanya tidak berubah sama sekali;
   yang berubah hanya jumlah baris isinya, mengikuti berapa mapel yang benar-benar dinilai. */
test('4c. Tabel Intrakurikuler mencetak satu baris per mata pelajaran',()=>{
  const doc={student:{name:'Siswa 1'},intracurricular:[
    {activity:'IPAS',predicate:'Sangat Baik',description:'Deskripsi IPAS.'},
    {activity:'Pendidikan Pancasila',predicate:'Baik',description:'Deskripsi Pancasila.'},
  ]};
  const html=intracurricularTable(doc);
  assert.equal((html.match(/<td class="activity-no">/g)||[]).length,2,'dua mapel, dua baris');
  assert.match(html,/IPAS<\/span><span class="activity-predicate">SANGAT BAIK[\s\S]*deskripsi IPAS\./);
  assert.match(html,/Pendidikan Pancasila<\/span><span class="activity-predicate">BAIK[\s\S]*deskripsi Pancasila\./);
  /* Bentuk lama (satu objek) tetap tercetak apa adanya. */
  assert.equal((intracurricularTable({student:{name:'Siswa 1'},
    intracurricular:{activity:'Matematika',predicate:'Baik',description:'Deskripsi.'}})
    .match(/<td class="activity-no">/g)||[]).length,1);
  /* Tanpa catatan sama sekali, tidak ada tabel - bukan tabel kosong. */
  assert.equal(intracurricularTable({student:{name:'Siswa 1'},intracurricular:[]}),'');
});

/* SATU PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA.

   Baseline `reportA4` digeser satu kali untuk memperbaiki blok tanda tangan: dulu hanya kolom
   Wali Kelas yang membawa baris tanggal "Kab. Bekasi, ......", sehingga peran, area tanda
   tangan, nama, dan NIP-nya turun satu baris dan tidak pernah sejajar dengan Kepala Sekolah.

   Karena baseline tidak lagi dapat menjaga bagian ini sendirian, strukturnya dikunci di sini
   secara eksplisit - lebih ketat daripada sekadar "tidak berubah". */
test('4b. Tiga blok tanda tangan sejajar dan barisnya seragam',()=>{
  const sumber=read('src/pages/print.js');
  const blok=sumber.slice(sumber.indexOf('const barisTanggal='),sumber.indexOf('return `<section class="document-a4 document-sheet report-a4">'));
  /* Tetap TIGA kolom, dengan urutan peran yang tidak berubah. */
  const peran=[...blok.matchAll(/class="signature-role">([^<]+)</g)].map(item=>item[1]);
  assert.deepEqual(peran,['Orang Tua Murid','Kepala Sekolah','Wali Kelas'],
    'tiga kolom tanda tangan dengan urutan peran yang tetap');
  /* Setiap kolom memuat lima baris yang sama. */
  assert.equal((blok.match(/class="signature-col"/g)||[]).length,3);
  assert.equal((blok.match(/barisTanggal\(/g)||[]).length,3,'ketiga kolom memanggil baris tanggal');
  assert.equal((blok.match(/class="signature-spacer"/g)||[]).length,3,'tiga area tanda tangan');
  assert.equal((blok.match(/signatureBlock\(/g)||[]).length,2,'nama dan NIP untuk Kepala Sekolah dan Wali Kelas');
  /* Baris "Kab. Bekasi, ..." tetap ada, dan hanya pada kolom Wali Kelas. */
  assert.match(blok,/settings\.printDateLabel\|\|`\$\{settings\.city\|\|'Bekasi'\}, \$\{DOTS\.slice\(0,18\)\}`/,
    'baris tanggal Wali Kelas dipertahankan');
  assert.ok(blok.includes('barisTanggal(tanggalCetak)'),'tanggal dipasang di kolom Wali Kelas');
  const wali=blok.slice(blok.indexOf('barisTanggal(tanggalCetak)'));
  assert.match(wali,/signature-role">Wali Kelas/,'tanggal berada tepat di atas peran Wali Kelas');
  /* Kolom lain menyediakan barisnya sebagai ruang kosong, bukan menghilangkannya. */
  assert.equal((blok.match(/barisTanggal\(''\)/g)||[]).length,2,
    'dua kolom lain tetap punya baris tanggal kosong agar tingginya sama');
  assert.match(blok,/barisNip\(null\)/,'kolom Orang Tua punya baris NIP kosong agar sejajar');

  /* Aturan gayanya menegakkan hal yang sama. */
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/\.report-signatures\{display:grid;grid-template-columns:repeat\(3,1fr\)/,'tetap tiga kolom');
  assert.match(gaya,/\.report-signatures \.signature-col\{display:flex;flex-direction:column\}/);
  assert.match(gaya,/\.report-signatures \.signature-date,\.report-signatures \.signature-role\{min-height:1\.4em/,
    'baris tanggal dan peran punya tinggi yang sama di ketiga kolom');
  assert.match(gaya,/\.report-signatures \.signature-nip-empty\{visibility:hidden\}/);
  /* Cetak tetap tiga kolom dan tidak terpotong halaman. */
  assert.match(gaya,/\.report-a4 \.report-signatures\{grid-template-columns:repeat\(3,1fr\)/,'cetak tetap tiga kolom');
  assert.match(gaya,/break-inside:avoid/,'blok tanda tangan tidak terbelah halaman');
});

/* Footer identitas siswa yang miring SENGAJA dipertahankan apa adanya. */
test('4c. Footer identitas siswa tetap miring dan tidak diubah',()=>{
  const sumber=read('src/pages/print.js');
  assert.match(sumber,/<div class="document-foot">\$\{escapeHtml\(doc\.classLabel\)\} \| \$\{escapeHtml\(student\.name\)\} \| \$\{escapeHtml\(student\.nis\)\}<\/div>/,
    'isi footer identitas siswa tidak berubah');
  const gaya=read('src/styles/app.css');
  const aturan=gaya.slice(gaya.indexOf('.document-foot'),gaya.indexOf('.document-foot')+220);
  assert.match(aturan,/font-style:italic/,'footer identitas siswa tetap miring');
});

test('5. Header dan urutan bagian rapor tetap',()=>{
  const baseline=readJson('tests/fixtures/report-markup-baseline.json');
  assert.match(baseline.reportA4,/<th>No<\/th><th>Mata Pelajaran<\/th><th>Nilai Akhir<\/th><th>Capaian Kompetensi<\/th>/);
  assert.match(baseline.attitudeBlock,/A\. Sikap/,'bagian A tetap Sikap');
  const urutan=['LAPORAN HASIL BELAJAR','${attitudeBlock(doc)}','B. Pengetahuan dan Keterampilan',
    'extracurricularTable(doc)','cocurricularTable(doc)','intracurricularTable(doc)',
    'Ketidakhadiran','Catatan Wali Kelas','finalStatusBlock(doc)','Tanggapan Orang Tua/Wali Murid',
    '${signatures}','document-foot'];
  let posisi=-1;
  for(const bagian of urutan){
    const berikut=baseline.reportA4.indexOf(bagian);
    assert.ok(berikut>posisi,`urutan bagian ${bagian} tidak boleh bergeser`);
    posisi=berikut;
  }
  assert.match(baseline.subjectRows,/<td class="subject-no-cell">\$\{index\+1\}<\/td>/);
  assert.match(baseline.subjectRows,/<td class="subject-score-cell">\$\{row\.score\?\?'—'\}<\/td>/);
  assert.match(baseline.activityTable,/<th>No<\/th><th>\$\{escapeHtml\(label\)\}<\/th><th>Keterangan<\/th>/);
});

test('6. Nol sampai tiga bagian kegiatan tidak menambah baris atau judul kosong',()=>{
  const doc={student:{name:'Siswa 1'},extracurricular:[],cocurricular:null,intracurricular:null};
  assert.equal(extracurricularTable(doc),'','tanpa isi tidak menghasilkan markup apa pun');
  assert.equal(cocurricularTable(doc),'');
  assert.equal(intracurricularTable(doc),'');
  const isi={
    student:{name:'Siswa 1'},
    extracurricular:[{name:'Pramuka Penggalang',predicate:'Baik',description:'Aktif mengikuti latihan.'}],
    cocurricular:{activity:'Projek Penguatan Profil Pelajar Pancasila',predicate:'Baik',description:'Aktif dalam projek.'},
    intracurricular:{activity:'Matematika',predicate:'Baik',description:'Menguasai materi dengan baik.'},
  };
  const bagian=[extracurricularTable(isi),cocurricularTable(isi),intracurricularTable(isi)];
  for(const html of bagian){
    assert.match(html,/^<table class="document-table activity-table">/);
    assert.equal((html.match(/<tbody>/g)||[]).length,1);
    assert.equal((html.match(/<tr>/g)||[]).length,3,'satu baris judul, satu baris header, satu baris isi');
    assert.match(html,/<td class="activity-no">1<\/td>/);
  }
  /* Satu, dua, atau tiga bagian terisi: jumlah tabel mengikuti apa yang diisi, tanpa
     placeholder, sehingga tinggi lembar tidak pernah bertambah oleh bagian kosong. */
  for(const jumlah of [0,1,2,3]){
    const sebagian={...doc,student:{name:'Siswa 1'}};
    if(jumlah>=1)sebagian.extracurricular=isi.extracurricular;
    if(jumlah>=2)sebagian.cocurricular=isi.cocurricular;
    if(jumlah>=3)sebagian.intracurricular=[isi.intracurricular];
    const gabungan=[extracurricularTable(sebagian),cocurricularTable(sebagian),intracurricularTable(sebagian)];
    assert.equal(gabungan.filter(Boolean).length,jumlah,`${jumlah} bagian menghasilkan ${jumlah} tabel`);
  }
});

/* ------------------------------------------- Deskripsi TP hanya mengubah teks, bukan tata letak */

test('7. Deskripsi TP Penilaian Umum berupa teks biasa tanpa markup',()=>{
  const siswa=siapkan();
  const tp=listObjectivesForAssessment(guru,'mtk').slice(0,3);
  for(const jumlah of [1,2,3]){
    const {text}=generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:tp.slice(0,jumlah).map(item=>item.id)});
    assert.equal(/[<>]/.test(text),false,'deskripsi tidak boleh membawa tag');
    assert.equal(/[\r\n\t]/.test(text),false,'deskripsi tetap satu paragraf');
    assert.ok(text.length<1500,'deskripsi tetap muat pada sel Capaian Kompetensi');
  }
});

test('8. Deskripsi TP Intrakurikuler juga teks biasa dan mengisi sel yang sama',()=>{
  const siswa=siapkan();
  const subject=listIntracurricularSubjects(guru)[0];
  const tp=listIntracurricularObjectives(guru,subject.id).slice(0,2);
  /* Butir CP kini WAJIB dipilih guru; rujukan TP lama tetap boleh menyertainya. */
  const record=saveStudentIntracurricularSelection(guru,siswa.id,
    {subjectId:subject.id,butirIds:listCpButirForSemester(guru,subject.id).slice(0,1).map(item=>item.id),
      objectiveIds:tp.map(item=>item.id),predicate:'Baik'});
  assert.equal(/[<>\r\n\t]/.test(record.description),false);
  const html=activityTable('Intrakurikuler',
    [{name:record.activity,predicate:record.predicate,description:record.description}],
    {studentName:siswa.name});
  /* Struktur baris tetap tiga sel dengan kelas yang sama; hanya isi selnya yang berbeda. */
  assert.equal((html.match(/<td/g)||[]).length,3);
  assert.match(html,/<td class="activity-no">1<\/td><td class="activity-name-cell">/);
  assert.match(html,/<td class="activity-note-cell">/);
  const kosong=activityTable('Intrakurikuler',
    [{name:record.activity,predicate:record.predicate,description:'Deskripsi lama.'}],
    {studentName:siswa.name});
  assert.equal(html.replace(/<td class="activity-note-cell">[^<]*<\/td>/,''),
    kosong.replace(/<td class="activity-note-cell">[^<]*<\/td>/,''),
    'perbedaan hanya pada isi kolom Keterangan');
});

test('9. Penyusun deskripsi tidak menyentuh berkas tampilan rapor',()=>{
  const deskripsi=read('src/services/descriptions.js');
  const intra=read('src/services/intracurricular.js');
  for(const sumber of [deskripsi,intra]){
    assert.equal(/report-a4|document-table|activity-table|<table|<td|<tr/.test(sumber),false,
      'layanan deskripsi hanya menghasilkan teks, bukan markup rapor');
  }
  assert.equal(composeIntracurricularDescription({studentName:'Siswa 1',subjectName:'Matematika',
    objectives:[],predicate:'Baik'}).includes('<'),false);
});
