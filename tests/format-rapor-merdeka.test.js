import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ASSESSMENT_TYPES, saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { saveAutomaticReportScores } from '../src/services/report.js';
import { ATTITUDE_EVIDENCE_BANK, saveStudentAttitude } from '../src/services/attitudes.js';
import { getReportDocument } from '../src/services/documents.js';
import { getSubjectMapping, invalidateDbCache } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { listSubjectsForStudent, reportSubjectName } from '../src/services/subjects.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { extractFunctionSource } from './helpers/report-markup.js';
import { escapeHtml } from '../src/ui/dom.js';

/* FORMAT RAPOR KURIKULUM MERDEKA.

   Dua koreksi tata letak dari Panduan Pembelajaran dan Asesmen:

     1. Lembar rapor tidak mengenal sekat "Kelompok A" dan "Kelompok B". PJOK, Seni Budaya, dan
        Muatan Lokal berbaris bersama mapel lain dalam satu daftar yang bernomor terus dari 1.
     2. Nama mapel resmi ditulis utuh tanpa singkatan dalam kurung.

   Keduanya menyentuh TAMPILAN saja. Metadata group tetap ada dan tetap menentukan urutan, id
   mapel dan nama masternya tidak berubah, dan tidak ada satu pun mapel yang hilang dari rapor.
   Itulah yang dijaga di sini - bukan sekadar bahwa labelnya tidak tercetak lagi. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkanSemuaMapel(session){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
}
function tambahSiswa(session,index=1,nama){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`6611${String(index).padStart(6,'0')}`,name:nama||`Siswa ${index}`,gender:'P',photo:''});
}
function nilaiPenuh(session,subjectId,studentId,nilai){
  saveAssessmentSettings(session,subjectId,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,subjectId,jenis.id,{[studentId]:nilai});
}

/* `subjectRows` dan `attitudeBlock` adalah fungsi dalam renderPrint dan tidak diekspor.
   Sumbernya dijalankan apa adanya bersama ketergantungan aslinya, sehingga yang diperiksa
   benar-benar kode yang dipakai rapor. */
function jalankan(nama,argumen){
  const sumber=extractFunctionSource(read('src/pages/print.js'),nama);
  return new Function('escapeHtml','reportSubjectName',`${sumber}\nreturn ${nama};`)(escapeHtml,reportSubjectName)(argumen);
}
const docMapel=daftar=>({subjects:daftar.map(item=>({subject:item,score:80,description:`Deskripsi ${item.id}.`}))});

/* --------------------------------------------------------------- Satu daftar mata pelajaran */

test('1. Tabel mapel rapor tidak memuat baris pemisah Kelompok A maupun Kelompok B',()=>{
  const html=jalankan('subjectRows',docMapel(SUBJECTS_DEFAULT));
  assert.doesNotMatch(html,/Kelompok/,'tidak ada label kelompok apa pun');
  assert.doesNotMatch(html,/subject-group-row/,'tidak ada baris pemisah');
  assert.doesNotMatch(html,/colspan/,'tidak ada sel yang menyeberangi kolom di tabel mapel');
});

test('2. Nomor mengalir 1 sampai jumlah mapel dan tidak pernah diulang dari 1',()=>{
  /* Dinamis: jumlah mapel diambil dari konfigurasi aplikasi, bukan ditulis tangan. */
  const daftar=SUBJECTS_DEFAULT;
  assert.ok(daftar.filter(item=>item.group==='A').length>0&&daftar.filter(item=>item.group==='B').length>0,
    'uji ini hanya bermakna bila kedua kelompok memang terisi');
  const nomor=[...jalankan('subjectRows',docMapel(daftar))
    .matchAll(/<td class="subject-no-cell">(\d+)<\/td>/g)].map(item=>Number(item[1]));
  assert.deepEqual(nomor,daftar.map((_,index)=>index+1),'satu deret nomor untuk seluruh mapel');
  assert.equal(nomor.filter(angka=>angka===1).length,1,'angka 1 hanya muncul sekali');
});

test('3. Seluruh mapel tetap tercetak dan urutannya tidak berubah',()=>{
  const daftar=SUBJECTS_DEFAULT;
  const nama=[...jalankan('subjectRows',docMapel(daftar))
    .matchAll(/<td class="subject-name-cell">([^<]*)<\/td>/g)].map(item=>item[1]);
  const urutanLama=[...daftar.filter(item=>item.group==='A'),...daftar.filter(item=>item.group!=='A')];
  assert.equal(nama.length,daftar.length,'tidak ada mapel yang hilang');
  assert.deepEqual(nama,urutanLama.map(item=>escapeHtml(reportSubjectName(item.name))),
    'urutan Kelompok A lalu B tetap dipakai untuk mengurutkan, hanya sekatnya yang hilang');
});

test('4. Metadata group tidak dihapus dari master maupun Mapping',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanSemuaMapel(session);
  for(const item of SUBJECTS_DEFAULT)assert.ok(['A','B'].includes(item.group),`${item.id} tetap punya group`);
  const mapping=getSubjectMapping(session);
  assert.equal(mapping.length,SUBJECTS_DEFAULT.length);
  for(const item of mapping){
    assert.ok(['A','B'].includes(item.group),`${item.id} tetap membawa group pada Mapping`);
    assert.ok(item.groupLabel,`${item.id} tetap membawa groupLabel untuk konfigurasi Admin`);
  }
});

/* ----------------------------------------------------- Nama mapel untuk lembar rapor resmi */

test('5. Singkatan dalam kurung dilepas hanya bila benar-benar akronim namanya sendiri',()=>{
  assert.equal(reportSubjectName('Ilmu Pengetahuan Alam dan Sosial (IPAS)'),'Ilmu Pengetahuan Alam dan Sosial');
  assert.equal(reportSubjectName('Pendidikan Agama Islam dan Budi Pekerti (PAI)'),'Pendidikan Agama Islam dan Budi Pekerti');
  /* Keterangan yang bermakna lain TIDAK ikut dibuang. */
  assert.equal(reportSubjectName('Bahasa Sunda (Muatan Lokal)'),'Bahasa Sunda (Muatan Lokal)');
  assert.equal(reportSubjectName('Matematika (Peminatan)'),'Matematika (Peminatan)');
  assert.equal(reportSubjectName('Bahasa Inggris (XYZ)'),'Bahasa Inggris (XYZ)','kurung yang bukan akronim namanya tetap utuh');
  /* Nama tanpa kurung dan masukan kosong aman. */
  assert.equal(reportSubjectName('Pendidikan Jasmani, Olahraga, dan Kesehatan'),'Pendidikan Jasmani, Olahraga, dan Kesehatan');
  assert.equal(reportSubjectName(''),'');
  assert.equal(reportSubjectName(null),'');
});

test('6. Id mapel, nama master, dan Mapping tidak ikut berubah oleh perapian nama',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanSemuaMapel(session);
  const ipas=getSubjectMapping(session).find(item=>item.id==='ipas');
  assert.equal(ipas.id,'ipas','id mapel tidak di-rename');
  assert.equal(ipas.name,'Ilmu Pengetahuan Alam dan Sosial (IPAS)','nama master tetap apa adanya');
  assert.equal(SUBJECTS_DEFAULT.find(item=>item.id==='ipas').name,'Ilmu Pengetahuan Alam dan Sosial (IPAS)');
  /* Yang berubah hanya yang tercetak. */
  const html=jalankan('subjectRows',docMapel([ipas]));
  assert.match(html,/Ilmu Pengetahuan Alam dan Sosial</);
  assert.doesNotMatch(html,/\(IPAS\)/);
});

test('7. Rapor satu siswa: satu Nilai Akhir dan satu Capaian Kompetensi per mapel',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1,'Nadia');
  const mapel=listSubjectsForStudent(session,anak);
  for(const item of mapel){nilaiPenuh(session,item.id,anak.id,84);saveAutomaticReportScores(session,item.id);}
  const doc=getReportDocument(session,anak.id);
  assert.equal(doc.subjects.length,mapel.length,'satu baris untuk setiap mapel siswa itu');
  assert.equal(new Set(doc.subjects.map(row=>row.subject.id)).size,doc.subjects.length,'tidak ada mapel kembar');
  for(const row of doc.subjects){
    assert.equal(typeof row.score,'number','satu Nilai Akhir untuk satu mapel, bukan dua');
    assert.equal(row.score,84,'nilainya berasal dari lima komponen yang sudah ada, tanpa perubahan formula');
    assert.equal(Object.hasOwn(row,'knowledgeScore'),false,'tidak ada pemisahan Pengetahuan');
    assert.equal(Object.hasOwn(row,'skillScore'),false,'tidak ada pemisahan Keterampilan');
    assert.equal(typeof row.description,'string','satu Capaian Kompetensi untuk satu mapel');
  }
  /* Kepala tabelnya pun tetap empat kolom yang sama. */
  const markup=read('src/pages/print.js');
  assert.match(markup,/<th>No<\/th><th>Mata Pelajaran<\/th><th>Nilai Akhir<\/th><th>Capaian Kompetensi<\/th>/);
});

/* ------------------------------------------------------------------ Nilai Sikap pada rapor */

test('8. Sikap dicetak satu dimensi satu baris, bukan satu paragraf gabungan',()=>{
  const doc={attitudes:[
    {dimensionId:'faith',dimensionLabel:'Beriman',level:'Berkembang Sesuai Harapan',description:'Ananda Nadia berkembang sesuai harapan dalam dimensi Beriman.'},
    {dimensionId:'creative',dimensionLabel:'Kreatif',level:'Berkembang Sangat Baik',description:'Ananda Nadia berkembang sangat baik dalam dimensi Kreatif.'},
  ]};
  const html=jalankan('attitudeBlock',doc);
  assert.equal((html.match(/<li>/g)||[]).length,2,'dua dimensi, dua baris');
  assert.match(html,/<ul class="attitude-points">/);
  assert.doesNotMatch(html,/<p>Ananda/,'bukan lagi deretan paragraf');
  /* Setiap butir memuat satu kalimat utuh dan tidak menempel dengan kalimat berikutnya. */
  for(const isi of [...html.matchAll(/<li>([^<]*)<\/li>/g)].map(item=>item[1])){
    assert.ok(isi.endsWith('.'),'kalimat butir berakhir dengan titik');
    assert.equal((isi.match(/Ananda/g)||[]).length,1,'satu butir memuat satu kalimat');
  }
});

test('9. Rapor hanya memuat dimensi yang benar-benar disimpan guru, tanpa cadangan enam dimensi',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1,'Nadia');
  saveStudentAttitude(session,anak.id,'mutual-cooperation',
    {level:'Berkembang Sesuai Harapan',behaviorEvidence:ATTITUDE_EVIDENCE_BANK['mutual-cooperation'][1]});
  saveStudentAttitude(session,anak.id,'creative',
    {level:'Berkembang Sangat Baik',behaviorEvidence:ATTITUDE_EVIDENCE_BANK.creative[0]});
  const doc=getReportDocument(session,anak.id);
  assert.equal(doc.attitudes.length,2,'dua dimensi disimpan, dua dimensi tercetak');
  const html=jalankan('attitudeBlock',doc);
  assert.equal((html.match(/<li>/g)||[]).length,2);
  assert.match(html,/dalam dimensi Gotong Royong, yang ditunjukkan melalui /);
  assert.match(html,/dalam dimensi Kreatif, yang ditunjukkan melalui /);
  /* Tanpa satu pun dimensi, yang muncul adalah keterangan kosong - bukan daftar kosong. */
  const kosong=jalankan('attitudeBlock',{attitudes:[]});
  assert.doesNotMatch(kosong,/<ul/,'tidak ada daftar berbutir yang kosong');
  assert.match(kosong,/belum tersedia/);
});

test('10. Butir sikap punya ruang indentasi dan tidak terbelah antar halaman saat dicetak',()=>{
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/\.attitude-points\{margin:0;padding:0 0 0 15px;list-style:disc outside\}/,
    'bulatan butir punya ruang sendiri sehingga tidak terpotong tepi kotak');
  assert.match(gaya,/\.attitude-points li\{text-align:justify;margin:0 0 3px;padding-left:2px;line-height:1\.45;break-inside:avoid\}/,
    'tinggi baris tumbuh mengikuti isi dan satu butir tidak terbelah');
  assert.match(gaya,/\.report-a4 \.attitude-points\{padding-left:14px\}/,'indentasi tetap ada pada lembar A4');
  assert.match(gaya,/@media print\{[\s\S]*\.report-a4 \.attitude-points li,\.report-a4 \.attitude-points\{break-inside:avoid\}/,
    'aturan cetak menjaga butir tetap utuh');
  /* Seluruh isinya berada di dalam kotak Deskripsi Capaian Profil Lulusan, tidak ada teks lepas. */
  const blok=extractFunctionSource(read('src/pages/print.js'),'attitudeBlock');
  assert.match(blok,/<div class="document-box-body attitude-body">\$\{body\}<\/div>/,
    'daftar butir berada di dalam kotak, bukan di luarnya');
});
