import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentScores } from '../src/services/assessment.js';
import { OBJECTIVE_COMPONENTS, getComponentObjectiveSummary, getSelectedAssessmentObjectives,
  getSelectedObjectiveRecords, listObjectivesForAssessment, objectiveScopeKey, phaseForClassId,
  setSelectedAssessmentObjectives } from '../src/services/learning-objectives.js';
import { INTRACURRICULAR_PREDICATES, composeIntracurricularDescription,
  listIntracurricularObjectives } from '../src/services/intracurricular.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* CP/TP adalah SATU sumber bersama untuk Penilaian Umum dan Intrakurikuler.

   Fungsinya berbeda: pada Penilaian Umum TP menjadi acuan nilai angka yang sudah ada, pada
   Intrakurikuler TP menjadi dasar predikat dan deskripsi. Yang dijaga suite ini: sumbernya
   tidak digandakan, TP dapat dipilih banyak sekaligus per komponen, dan satu komponen tetap
   menghasilkan SATU nilai per siswa — tidak pernah satu nilai per TP. */

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
    ({...item,active:['mtk','bindo','ipas'].includes(item.id),order:index+1})));
}
function siapkanSiswa(session,jumlah=3){
  for(let i=1;i<=jumlah;i++)
    createStudent(session,{classId:session.classId,nis:`N${i}`,nisn:`00510000${i}`,
      name:`Siswa ${i}`,gender:'L',religion:'Islam',birthPlace:'Kota',birthDate:'2015-01-02',
      parentName:'Orang Tua',phone:'08',address:'Jl',photo:''});
}

/* ------------------------------------------------------------ CP sesuai fase (§H) */

test('1. CP dan TP mengikuti fase serta mata pelajaran',()=>{
  useMemoryStorage();
  assert.equal(phaseForClassId('1A'),'A','Kelas 1–2 Fase A');
  assert.equal(phaseForClassId('2C'),'A');
  assert.equal(phaseForClassId('3A'),'B','Kelas 3–4 Fase B');
  assert.equal(phaseForClassId('4D'),'B');
  assert.equal(phaseForClassId('5B'),'C','Kelas 5–6 Fase C');
  assert.equal(phaseForClassId('6A'),'C');

  const lima=guru('5B'),tiga=guru('3A');
  aktifkanMapel(lima);aktifkanMapel(tiga);
  const mtkC=listObjectivesForAssessment(lima,'mtk');
  const mtkB=listObjectivesForAssessment(tiga,'mtk');
  assert.ok(mtkC.length&&mtkB.length,'setiap fase punya TP');
  assert.notDeepEqual(mtkC.map(item=>item.id),mtkB.map(item=>item.id),'TP berbeda antar fase');
  assert.notDeepEqual(mtkC.map(item=>item.id),listObjectivesForAssessment(lima,'bindo').map(item=>item.id),
    'TP berbeda antar mata pelajaran');
});

test('2. Sumber TP tidak digandakan antara Penilaian Umum dan Intrakurikuler',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const umum=listObjectivesForAssessment(session,'mtk',{activeOnly:true}).map(item=>item.id);
  const intra=listIntracurricularObjectives(session,'mtk').map(item=>item.id);
  assert.deepEqual(intra,umum,'keduanya membaca daftar TP yang sama');

  /* Hanya ada SATU koleksi TP di database, dan Intrakurikuler membacanya lewat layanan yang sama. */
  assert.match(read('src/services/intracurricular.js'),/listObjectivesForAssessment/,
    'Intrakurikuler memakai sumber TP bersama');
  for(const berkas of ['src/services/intracurricular.js','src/services/assessment.js'])
    assert.equal(/learningObjectives\s*[:=]/.test(read(berkas)),false,
      `${berkas} tidak membuat koleksi TP sendiri`);
});

/* --------------------------------------- Multi-TP per komponen penilaian (§I, §J) */

test('3. Kelima komponen Penilaian Umum dapat memilih banyak TP',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const tersedia=listObjectivesForAssessment(session,'mtk');
  assert.ok(tersedia.length>=4,'TP cukup untuk menguji multi-select');

  assert.deepEqual(OBJECTIVE_COMPONENTS.map(item=>item.id),ASSESSMENT_TYPES.map(item=>item.id),
    'komponen TP persis mengikuti jenis penilaian yang sudah ada');
  for(const wajib of ['formative','daily','practice','scopeSummative','semesterSummative'])
    assert.ok(OBJECTIVE_COMPONENTS.some(item=>item.id===wajib),`komponen ${wajib} tersedia`);

  /* Setiap komponen menerima 1, 2, 3, atau lebih TP sekaligus. */
  for(const [index,type] of OBJECTIVE_COMPONENTS.entries()){
    const jumlah=Math.min(index+1,tersedia.length);
    const pilih=tersedia.slice(0,jumlah).map(item=>item.id);
    const hasil=setSelectedAssessmentObjectives(session,'mtk',pilih,type.id);
    assert.deepEqual(hasil.objectiveIds,pilih,`${type.label} menyimpan ${jumlah} TP`);
    assert.deepEqual(getSelectedAssessmentObjectives(session,'mtk',type.id),pilih);
  }
});

test('4. Pilihan TP tersimpan terpisah untuk setiap komponen',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const tp=listObjectivesForAssessment(session,'mtk').map(item=>item.id);

  const rencana={
    formative:[tp[0],tp[1]],
    daily:[tp[1],tp[2]],
    practice:[tp[3]],
    scopeSummative:[tp[0],tp[1],tp[2],tp[3]],
    semesterSummative:[tp[2],tp[3]],
  };
  for(const [komponen,ids] of Object.entries(rencana))
    setSelectedAssessmentObjectives(session,'mtk',ids,komponen);
  for(const [komponen,ids] of Object.entries(rencana))
    assert.deepEqual(getSelectedAssessmentObjectives(session,'mtk',komponen),ids,
      `${komponen} mempertahankan pilihannya sendiri`);

  /* Kuncinya memuat tahun, semester, rombel, mapel, dan komponen sekaligus. */
  assert.equal(objectiveScopeKey(session,'mtk','daily'),
    `${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|mtk|daily`);
  const kunci=Object.keys(loadDb().assessmentObjectiveSelection);
  assert.equal(kunci.length,5,'satu record per komponen, tidak ada duplikasi');

  /* Mapel dan rombel lain tidak ikut terpengaruh. */
  assert.deepEqual(getSelectedAssessmentObjectives(session,'bindo','formative'),[]);
  assert.deepEqual(getSelectedAssessmentObjectives(guru('5A'),'mtk','formative'),[]);

  const ringkas=getComponentObjectiveSummary(session,'mtk');
  assert.deepEqual(ringkas.map(item=>item.count),[2,2,1,4,2]);
});

test('5. Satu komponen tetap menghasilkan SATU nilai per siswa',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  siapkanSiswa(session,3);
  const tp=listObjectivesForAssessment(session,'mtk').map(item=>item.id);

  /* TP1 + TP2 + TP3 menjadi dasar SATU nilai Sumatif Lingkup Materi. */
  setSelectedAssessmentObjectives(session,'mtk',tp.slice(0,3),'scopeSummative');
  const lembar=getAssessmentSheet(session,'mtk','scopeSummative');
  assert.equal(lembar.rows.length,3,'satu baris per siswa, bukan per TP');
  saveAssessmentScores(session,'mtk','scopeSummative',
    Object.fromEntries(lembar.rows.map(row=>[row.studentId,85])));

  const sesudah=getAssessmentSheet(session,'mtk','scopeSummative');
  assert.equal(sesudah.rows.length,3,'jumlah baris tidak bertambah karena TP');
  for(const row of sesudah.rows)assert.equal(row.score,85);

  /* Menambah TP tidak menambah satu pun nilai. */
  const sebelumJumlah=Object.keys(loadDb().assessmentScores).length;
  setSelectedAssessmentObjectives(session,'mtk',tp.slice(0,4),'scopeSummative');
  assert.equal(Object.keys(loadDb().assessmentScores).length,sebelumJumlah,
    'jumlah nilai tersimpan tidak berubah saat TP ditambah');

  /* Tidak ada satu pun kunci nilai yang memuat id TP. */
  for(const kunci of Object.keys(loadDb().assessmentScores))
    for(const id of tp)
      assert.equal(kunci.includes(id),false,`kunci nilai ${kunci} tidak memuat TP ${id}`);
  /* Record pemilihan TP tidak pernah memuat angka. */
  for(const record of Object.values(loadDb().assessmentObjectiveSelection))
    for(const nilai of Object.values(record))
      assert.equal(typeof nilai==='number',false,'pemilihan TP tidak menyimpan angka');
});

test('6. TP komponen tersedia bagi penyusun deskripsi tanpa mengubah nilai',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const tp=listObjectivesForAssessment(session,'mtk').map(item=>item.id);
  setSelectedAssessmentObjectives(session,'mtk',[tp[0]],'formative');
  setSelectedAssessmentObjectives(session,'mtk',[tp[1],tp[2]],'scopeSummative');

  const dipakai=getSelectedObjectiveRecords(session,'mtk').map(item=>item.id);
  assert.deepEqual(dipakai.sort(),[tp[0],tp[1],tp[2]].sort(),
    'TP dari komponen ikut tersedia bagi deskripsi');
  /* Tiap TP hanya muncul sekali walau dipakai beberapa komponen. */
  setSelectedAssessmentObjectives(session,'mtk',[tp[0],tp[1]],'daily');
  const ulang=getSelectedObjectiveRecords(session,'mtk').map(item=>item.id);
  assert.equal(new Set(ulang).size,ulang.length,'tidak ada TP ganda');
});

/* -------------------------------------------------- Intrakurikuler tetap jalan (§L) */

test('7. Intrakurikuler tetap memakai TP untuk predikat dan deskripsi',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const tp=listIntracurricularObjectives(session,'mtk');
  assert.ok(tp.length,'TP tersedia untuk Intrakurikuler');

  for(const predikat of ['Cukup','Baik','Sangat Baik'])
    assert.ok(INTRACURRICULAR_PREDICATES.includes(predikat),`predikat ${predikat} tetap ada`);

  /* Alur Intrakurikuler tetap: Mapel → TP → Predikat → Deskripsi otomatis. */
  const deskripsi=composeIntracurricularDescription({studentName:'Siswa 1',subjectName:'Matematika',
    objectives:tp.slice(0,2),predicate:'Sangat Baik'});
  assert.ok(deskripsi.includes('Siswa 1'),'deskripsi menyebut nama siswa');
  assert.ok(deskripsi.length>20,'deskripsi tersusun otomatis dari TP dan predikat');

  /* Intrakurikuler tidak menyimpan nilai angka Penilaian Umum. */
  const layanan=read('src/services/intracurricular.js');
  assert.equal(/assessmentScores/.test(layanan),false,
    'Intrakurikuler tidak menyentuh nilai angka Penilaian Umum');
});

/* ----------------------------------------------------------- UI dan rapor (§K, §M) */

test('8. UI Penilaian memakai kontrol ringkas, bukan tabel penuh teks TP',()=>{
  const halaman=read('src/pages/assessment.js');
  assert.match(halaman,/getComponentObjectiveSummary/,'ringkasan per komponen dipakai');
  assert.match(halaman,/Pilih Tujuan Pembelajaran/,'kontrol pemilihan tersedia');
  assert.match(halaman,/TP dipilih/,'jumlah TP ditampilkan ringkas');
  assert.match(halaman,/Lihat TP/,'TP dapat dilihat');
  assert.match(halaman,/Ubah TP/,'TP dapat diubah');
  assert.match(halaman,/setSelectedAssessmentObjectives\(session,subjectId,ids,type\.id\)/,
    'pilihan disimpan per komponen');
  /* Modal menampilkan mapel, fase, dan daftar TP dengan checkbox. */
  assert.match(halaman,/Fase \$\{escapeHtml\(fase\)\}/,'fase ditampilkan pada panel pemilihan');
  assert.match(halaman,/type="checkbox" data-pick/,'daftar TP memakai multi-select');

  /* Responsif: kartu komponen dan panel TP punya aturan layar kecil. */
  const css=read('src/styles/app.css');
  assert.match(css,/\.objective-component-grid\{[^}]*auto-fit/,'kartu komponen mengalir mengikuti lebar');
  assert.match(css,/@media \(max-width:520px\)\{\.objective-component-grid\{grid-template-columns:1fr\}/,
    'satu kolom di layar HP');
});

test('9. Desain rapor tidak berubah dan tidak ada bagian baru berisi daftar TP',()=>{
  const cetak=read('src/pages/print.js');
  const css=read('src/styles/app.css');
  /* Geometri kunci lembar rapor tetap seperti desain final. */
  assert.match(css,/\.report-cover-a4\{display:flow-root;text-align:center;padding:37\.8px\}/);
  assert.match(css,/\.report-cover-a4>\.cover-logo-ministry\{width:188px;height:189px\}/);
  assert.match(css,/Times New Roman/);
  /* Tidak ada seksi baru yang mencetak seluruh daftar TP. */
  assert.equal(/getComponentObjectiveSummary|OBJECTIVE_COMPONENTS/.test(cetak),false,
    'halaman cetak tidak menambah bagian daftar TP');
  assert.equal(cetak.includes('Daftar Tujuan Pembelajaran'),false,
    'tidak ada bagian baru berisi seluruh TP pada rapor');
});

test('10. Data existing tetap aman dan kunci penyimpanan tidak berubah',()=>{
  const penyimpanan=read('src/services/storage.js');
  assert.match(penyimpanan,/const DB_KEY = 'erapor_satria_jaya_01_v1';/,'DB_KEY tidak berubah');
  /* Layanan baru hanya menambah koleksi, tidak pernah menghapus. */
  const penugasan=read('src/services/teacher-assignments.js');
  for(const larangan of ['delete db','replaceDb','localStorage.clear'])
    assert.equal(penugasan.includes(larangan),false,`layanan penugasan tidak pernah ${larangan}`);
  const tp=read('src/services/learning-objectives.js');
  for(const larangan of ['delete db','replaceDb','assessmentScores','reportScores'])
    assert.equal(tp.includes(larangan),false,`layanan TP tidak pernah menyentuh ${larangan}`);

  /* Pilihan TP tingkat mata pelajaran yang sudah tersimpan tetap terbaca apa adanya. */
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const tersedia=listObjectivesForAssessment(session,'mtk');
  setSelectedAssessmentObjectives(session,'mtk',[tersedia[0].id]);
  assert.equal(objectiveScopeKey(session,'mtk'),`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|mtk`,
    'kunci lama tanpa komponen tidak berubah bentuknya');
  assert.deepEqual(getSelectedAssessmentObjectives(session,'mtk'),[tersedia[0].id]);
});
