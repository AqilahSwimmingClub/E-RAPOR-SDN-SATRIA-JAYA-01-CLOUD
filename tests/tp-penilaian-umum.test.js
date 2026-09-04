import test from 'node:test';
import assert from 'node:assert/strict';
import { cpElements } from '../src/data/curriculum-cp.js';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentScores,
  saveAssessmentSettings } from '../src/services/assessment.js';
import { generateReportDescription, ringkasObjectives } from '../src/services/descriptions.js';
import { INTRACURRICULAR_PREDICATES, composeIntracurricularDescription,
  listIntracurricularObjectives } from '../src/services/intracurricular.js';
import { addReferenceObjectives, listActiveObjectives, listObjectivesForAssessment,
  listReferenceObjectives, listSchoolObjectives, phaseForClassId,
  setActiveObjective } from '../src/services/learning-objectives.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* Sepadan dengan alur nyata: buka + Tambah TP, centang semua, lalu Simpan. */
function masukkanSemuaTp(session,subjectId){
  const referensi=listReferenceObjectives(session,subjectId);
  if(referensi.some(item=>!item.sudahDipakai))
    addReferenceObjectives(session,subjectId,referensi.filter(item=>!item.sudahDipakai).map(item=>item.id));
  return listSchoolObjectives(session,subjectId);
}

/* SATU SUMBER: menu Tujuan Pembelajaran.

   Guru mencentang TP di satu tempat saja. Penilaian, Intrakurikuler, dan deskripsi rapor
   membaca hasilnya. Tidak ada pemilihan TP kedua, tidak ada daftar TP per komponen, dan tidak
   ada nilai per TP — satu komponen tetap menghasilkan SATU nilai per siswa. */

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
/* Meniru guru yang mencentang sebagian TP pada menu Tujuan Pembelajaran. */
function aktifkanHanya(session,subjectId,ids){
  const semua=masukkanSemuaTp(session,subjectId);
  for(const item of semua)setActiveObjective(session,subjectId,item.id,ids.includes(item.id));
  return listActiveObjectives(session,subjectId);
}

/* ---------------------------------------------------- TP aktif hanya dari satu menu (§1,§2) */

test('1. TP aktif ditentukan hanya dari menu Tujuan Pembelajaran',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const semua=masukkanSemuaTp(session,'mtk');
  assert.ok(semua.length>=3);

  const pilih=semua.slice(0,2).map(item=>item.id);
  assert.deepEqual(aktifkanHanya(session,'mtk',pilih).map(item=>item.id),pilih);

  /* Tidak ada koleksi pemilihan TP tersendiri di database. */
  assert.equal(loadDb().assessmentObjectiveSelection,undefined,
    'tidak ada penyimpanan pilihan TP terpisah dari menu Tujuan Pembelajaran');

  /* TP nonaktif tidak dihapus, hanya tidak dipakai. */
  assert.equal(listObjectivesForAssessment(session,'mtk',{activeOnly:false}).length,semua.length);
  assert.equal(listActiveObjectives(session,'mtk').length,2);
});

test('2. TP aktif terikat tahun pelajaran, semester, rombel, dan mata pelajaran',()=>{
  useMemoryStorage();
  const lima=guru('5B');
  aktifkanMapel(lima);
  const semua=masukkanSemuaTp(lima,'ipas');
  aktifkanHanya(lima,'ipas',[semua[0].id]);
  assert.equal(listActiveObjectives(lima,'ipas').length,1);

  /* Mapel lain pada rombel yang sama berdiri sendiri. */
  assert.equal(listActiveObjectives(lima,'mtk').length,
    listObjectivesForAssessment(lima,'mtk').length,'mapel lain tidak ikut terpengaruh');

  /* Rombel lain berdiri sendiri, termasuk fasenya. */
  const tiga=guru('3A');
  aktifkanMapel(tiga);
  assert.equal(phaseForClassId('5B'),'C');
  assert.equal(phaseForClassId('3A'),'B');
  assert.notDeepEqual(listObjectivesForAssessment(tiga,'ipas').map(item=>item.id),
    listObjectivesForAssessment(lima,'ipas').map(item=>item.id),'TP berbeda antar fase');
});

/* ---------------------------------------- Penilaian membaca TP aktif otomatis (§1,§3,§4) */

test('3. Kelima komponen penilaian memakai TP aktif yang sama tanpa memilih ulang',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  siapkanSiswa(session,3);
  const semua=masukkanSemuaTp(session,'mtk');
  const dipakai=semua.slice(0,3).map(item=>item.id);
  aktifkanHanya(session,'mtk',dipakai);

  /* Setiap komponen membaca daftar yang sama persis. */
  for(const type of ASSESSMENT_TYPES){
    const aktif=listActiveObjectives(session,'mtk').map(item=>item.id);
    assert.deepEqual(aktif,dipakai,`${type.label} memakai TP aktif yang sama`);
  }

  /* Halaman Penilaian tidak punya jalur untuk memilih atau mengubah TP. */
  const halaman=read('src/pages/assessment.js');
  assert.match(halaman,/listActiveObjectives/,'Penilaian membaca TP aktif');
  for(const larangan of ['setActiveObjective','setSelectedAssessmentObjectives',
    'getComponentObjectiveSummary','data-edit-tp','data-pick'])
    assert.equal(halaman.includes(larangan),false,
      `Penilaian tidak boleh memuat ${larangan}`);
  assert.match(halaman,/Tujuan Pembelajaran/,'Penilaian menunjuk ke menu Tujuan Pembelajaran');
});

test('4. Satu komponen tetap menghasilkan SATU nilai per siswa',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  siapkanSiswa(session,3);
  const semua=masukkanSemuaTp(session,'mtk');
  aktifkanHanya(session,'mtk',semua.slice(0,3).map(item=>item.id));

  const lembar=getAssessmentSheet(session,'mtk','scopeSummative');
  assert.equal(lembar.rows.length,3,'satu baris per siswa, bukan per TP');
  saveAssessmentScores(session,'mtk','scopeSummative',
    Object.fromEntries(lembar.rows.map(row=>[row.studentId,85])));
  for(const row of getAssessmentSheet(session,'mtk','scopeSummative').rows)
    assert.equal(row.score,85,'TP1+TP2+TP3 menjadi dasar SATU nilai');

  /* Menambah TP aktif tidak menambah satu pun nilai. */
  const sebelum=Object.keys(loadDb().assessmentScores).length;
  aktifkanHanya(session,'mtk',semua.map(item=>item.id));
  assert.equal(Object.keys(loadDb().assessmentScores).length,sebelum,
    'jumlah nilai tersimpan tidak berubah saat TP aktif bertambah');

  /* Tidak ada satu pun kunci nilai yang memuat id TP. */
  for(const kunci of Object.keys(loadDb().assessmentScores))
    for(const item of semua)
      assert.equal(kunci.includes(item.id),false,`kunci nilai ${kunci} tidak memuat TP`);
});

/* --------------------------------------------------- Deskripsi otomatis dan ringkas (§5–§7) */

test('5. Satu TP aktif menghasilkan deskripsi sesuai TP itu',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  siapkanSiswa(session,1);
  saveAssessmentSettings(session,'mtk',{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  const tp=createLearningObjective(session,'mtk',
    {description:'Menjelaskan perubahan wujud benda dalam kehidupan sehari-hari.',active:true});
  aktifkanHanya(session,'mtk',[tp.id]);
  const siswa=getAssessmentSheet(session,'mtk','formative').rows[0];
  for(const jenis of ASSESSMENT_TYPES)
    saveAssessmentScores(session,'mtk',jenis.id,{[siswa.studentId]:85});

  /* Tanpa menyebut TP satu pun: deskripsi Nilai Rapor kini bersumber CP mata pelajaran pada
     fase rombel, bukan TP. TP tetap dipakai bila pemanggil menyebutnya sendiri. */
  const hasil=generateReportDescription(session,'mtk',siswa.studentId,{});
  assert.match(hasil.text,/^Ananda /);
  assert.equal(hasil.source,'CP');
  assert.equal(hasil.cpPhase,'C');
  const kalimat=hasil.text.toLowerCase();
  for(const elemen of cpElements('mtk','C').map(item=>item.name))
    assert.ok(kalimat.includes(elemen.toLowerCase()),`elemen CP ${elemen} terbawa`);
  assert.equal(/TP-\d/.test(hasil.text),false,'tidak menulis kode TP');

  /* Menyebut TP secara eksplisit tetap menghasilkan deskripsi berbasis TP itu. */
  const lewatTp=generateReportDescription(session,'mtk',siswa.studentId,{objectiveIds:[tp.id]});
  assert.match(lewatTp.text,/menjelaskan perubahan wujud benda/,'inti TP terbawa bila diminta');
  assert.notEqual(lewatTp.text,hasil.text);
});

test('6. Dua dan tiga TP aktif diringkas menjadi satu deskripsi natural',()=>{
  const contoh=[
    'Menjelaskan perubahan wujud benda dalam kehidupan sehari-hari.',
    'Mengidentifikasi pengaruh kalor terhadap perubahan wujud benda.',
    'Menyajikan hasil pengamatan sederhana tentang perubahan wujud benda.',
  ].map(description=>({description}));

  const dua=ringkasObjectives(contoh.slice(0,2));
  assert.equal(dua,'menjelaskan perubahan wujud benda serta mengidentifikasi pengaruh kalor');

  const tiga=ringkasObjectives(contoh);
  assert.equal(tiga,'menjelaskan perubahan wujud benda, mengidentifikasi pengaruh kalor, '
    +'serta menyajikan hasil pengamatan sederhana');

  /* Bukan tiga kalimat TP yang ditempel mentah. */
  for(const item of contoh)
    assert.equal(tiga.includes(item.description),false,`TP mentah "${item.description}" tidak disalin utuh`);
  assert.equal(/TP-?\d/.test(tiga),false,'tidak ada penomoran TP');
  assert.equal(tiga.split('.').length-1,0,'satu frasa, bukan beberapa kalimat');
  assert.ok(tiga.length<200,'kalimat tetap ringkas');
  /* Frasa yang berulang antar-TP tidak disebut dua kali. */
  assert.equal(tiga.split('perubahan wujud benda').length-1,1,'frasa berulang hanya sekali');
});

test('7. TP yang intinya sama tidak diulang, dan TP pendek tidak dipangkas',()=>{
  const kembar=ringkasObjectives([
    {description:'Menjelaskan perubahan wujud benda dalam kehidupan sehari-hari.'},
    {description:'Menjelaskan perubahan wujud benda secara sederhana.'},
  ]);
  assert.equal(kembar,'menjelaskan perubahan wujud benda','inti yang sama cukup sekali');
  /* Frasa pendek tetap utuh supaya tidak kehilangan makna. */
  assert.equal(ringkasObjectives([{description:'Menyebutkan bagian dari tumbuhan.'}]),
    'menyebutkan bagian dari tumbuhan');
});

test('8. Tingkat capaian memakai Nilai Akhir dan KKTP existing',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  siapkanSiswa(session,1);
  saveAssessmentSettings(session,'mtk',{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  const tp=createLearningObjective(session,'mtk',
    {description:'Menyelesaikan operasi hitung pecahan dalam soal cerita.',active:true});
  aktifkanHanya(session,'mtk',[tp.id]);
  const siswa=getAssessmentSheet(session,'mtk','formative').rows[0];
  const deskripsi=nilai=>{
    for(const jenis of ASSESSMENT_TYPES)
      saveAssessmentScores(session,'mtk',jenis.id,{[siswa.studentId]:nilai});
    return generateReportDescription(session,'mtk',siswa.studentId,{}).text;
  };
  /* Nilai Akhir tetap yang menentukan tingkat capaian; kalimatnya kini bernada akademik
     karena bersumber CP, bukan TP. */
  assert.match(deskripsi(95),/penguasaan sangat baik pada kompetensi/);
  assert.match(deskripsi(80),/penguasaan baik pada kompetensi/);
  assert.match(deskripsi(60),/masih memerlukan bimbingan dan penguatan/);
  assert.equal(new Set([deskripsi(95),deskripsi(80),deskripsi(60)]).size,3,
    'tiga tingkat nilai menghasilkan tiga kalimat berbeda');
});

/* --------------------------------------------------------- Intrakurikuler dan sumber tunggal */

test('9. Intrakurikuler memakai TP aktif yang sama',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const semua=masukkanSemuaTp(session,'mtk');
  aktifkanHanya(session,'mtk',semua.slice(0,2).map(item=>item.id));

  assert.deepEqual(listIntracurricularObjectives(session,'mtk').map(item=>item.id),
    listActiveObjectives(session,'mtk').map(item=>item.id),
    'Intrakurikuler membaca daftar TP aktif yang sama persis');

  /* Alur Intrakurikuler tetap: TP → Predikat → Deskripsi. */
  for(const predikat of ['Cukup','Baik','Sangat Baik'])
    assert.ok(INTRACURRICULAR_PREDICATES.includes(predikat),`predikat ${predikat} tetap ada`);
  const deskripsi=composeIntracurricularDescription({studentName:'Siswa 1',subjectName:'Matematika',
    objectives:listActiveObjectives(session,'mtk').slice(0,2),predicate:'Sangat Baik'});
  assert.ok(deskripsi.includes('Siswa 1')&&deskripsi.length>20);
});

test('10. Hanya ada satu sumber TP di seluruh aplikasi',()=>{
  /* Setiap modul membaca lewat layanan TP bersama, bukan koleksi sendiri. */
  for(const berkas of ['src/services/intracurricular.js','src/services/descriptions.js',
    'src/services/report-bulk.js','src/pages/assessment.js','src/pages/reports.js'])
    assert.match(read(berkas),/from '\.\.\/services\/learning-objectives\.js'|from '\.\/learning-objectives\.js'/,
      `${berkas} membaca TP dari layanan bersama`);
  for(const berkas of ['src/services/intracurricular.js','src/services/assessment.js'])
    assert.equal(/learningObjectives\s*[:=]/.test(read(berkas)),false,
      `${berkas} tidak membuat koleksi TP sendiri`);
  /* Layanan TP tidak lagi menyimpan pilihan tersendiri. */
  const layanan=read('src/services/learning-objectives.js');
  assert.equal(layanan.includes('assessmentObjectiveSelection'),false,
    'koleksi pemilihan TP terpisah sudah tidak dipakai');
  assert.match(layanan,/export function listActiveObjectives/,'ada satu pembaca TP aktif');
});

/* ------------------------------------------------------- Data existing dan rapor (§10,§11) */

test('11. Data existing tetap aman dan kunci penyimpanan tidak berubah',()=>{
  assert.match(read('src/services/storage.js'),/const DB_KEY = 'erapor_satria_jaya_01_v1';/);
  const layanan=read('src/services/learning-objectives.js');
  for(const larangan of ['delete db','replaceDb','localStorage.clear','assessmentScores','reportScores'])
    assert.equal(layanan.includes(larangan),false,`layanan TP tidak pernah ${larangan}`);

  /* Pilihan TP lama yang terlanjur tersimpan tidak dihapus, hanya tidak lagi dibaca. */
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  masukkanSemuaTp(session,'mtk');
  const kunci=`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|mtk`;
  const db=loadDb();
  db.assessmentObjectiveSelection={[kunci]:{subjectId:'mtk',objectiveIds:['lama-1']}};
  globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
  invalidateDbCache();
  assert.ok(listActiveObjectives(session,'mtk').length>0,'TP aktif tetap terbaca');
  assert.deepEqual(loadDb().assessmentObjectiveSelection[kunci].objectiveIds,['lama-1'],
    'record pilihan TP lama tidak dihapus');
});

test('12. Desain rapor tidak berubah dan tidak ada bagian baru berisi daftar TP',()=>{
  const cetak=read('src/pages/print.js');
  const css=read('src/styles/app.css');
  assert.match(css,/\.report-cover-a4\{display:flow-root;text-align:center;padding:37\.8px\}/);
  assert.match(css,/\.report-cover-a4>\.cover-logo-ministry\{width:188px;height:189px\}/);
  assert.match(css,/Times New Roman/);
  assert.equal(/listActiveObjectives|OBJECTIVE_COMPONENTS/.test(cetak),false,
    'halaman cetak tidak menambah bagian daftar TP');
  assert.equal(cetak.includes('Daftar Tujuan Pembelajaran'),false);
});

test('13. Menu Tujuan Pembelajaran menjadi pusat pengaturan TP',()=>{
  const halaman=read('src/pages/objectives.js');
  /* Alurnya: pilih mapel, + Tambah TP, centang, Simpan. Tanpa langkah adopsi katalog. */
  assert.match(halaman,/Tambah TP/,'tombol Tambah TP tersedia');
  assert.match(halaman,/Pilih Tujuan Pembelajaran/,'modal pemilihan TP');
  assert.match(halaman,/Simpan TP Terpilih/,'hanya TP terpilih yang disimpan');
  assert.match(halaman,/data-pilih-semua/,'tersedia Pilih Semua');
  assert.match(halaman,/Buat TP Manual/,'guru tetap dapat merumuskan TP sendiri');
  assert.match(halaman,/addReferenceObjectives/,'penambahan lewat layanan TP referensi');
  assert.equal(/Simpan Katalog sebagai TP Sekolah|adoptCatalogueObjectives|isCatalogueOnly/.test(halaman),false,
    'alur adopsi katalog sudah dihapus dari UI');
  /* Fase read-only dan tabel memuat kolom yang diminta. */
  assert.match(halaman,/id="objectivePhase"[^>]*readonly|readonly/,'fase tidak dipilih manual');
  for(const kolom of ['<th>No</th>','<th>Tingkat</th>','<th>Fase</th>','<th>Semester</th>',
    '<th>Tujuan Pembelajaran</th>','<th>Status</th>','<th>Aksi</th>'])
    assert.ok(halaman.includes(kolom),`kolom ${kolom} tersedia`);

  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  /* Membuka mapel tidak memasukkan TP apa pun. */
  assert.deepEqual(listActiveObjectives(session,'mtk'),[]);
  const referensi=listReferenceObjectives(session,'mtk');
  assert.ok(referensi.length>=3,'katalog referensi tersedia sebagai pilihan');
  const hasil=addReferenceObjectives(session,'mtk',referensi.slice(0,2).map(item=>item.id));
  assert.equal(hasil.added,2,'hanya TP yang dicentang yang masuk');
  const tabel=listSchoolObjectives(session,'mtk');
  assert.equal(tabel.length,2);
  for(const baris of tabel){
    assert.equal(baris.grade,5);
    assert.equal(baris.phase,'C');
    assert.equal(baris.semester,`Ganjil ${ACADEMIC_YEAR}`);
    assert.equal(baris.active,true);
  }
  /* Menekan Simpan lagi tidak menghasilkan TP kembar. */
  assert.equal(addReferenceObjectives(session,'mtk',
    listReferenceObjectives(session,'mtk').slice(0,2).map(item=>item.id)).added,0);
});
