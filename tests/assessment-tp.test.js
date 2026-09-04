import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { addReferenceObjectives, listActiveObjectives, listObjectivesForAssessment,
  listReferenceObjectives, listSchoolObjectives, setActiveObjective } from '../src/services/learning-objectives.js';

/* TP yang dipakai ditentukan lewat status aktif pada menu Tujuan Pembelajaran. */
function aktifkanHanya(session,subjectId,ids){
  const semua=masukkanSemuaTp(session,subjectId);
  for(const item of semua)setActiveObjective(session,subjectId,item.id,ids.includes(item.id));
  return listActiveObjectives(session,subjectId);
}
import { createLearningObjective } from '../src/services/objectives.js';
import { calculateReportScore, calculateReportSheet } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* Sepadan dengan alur nyata: buka + Tambah TP, centang semua, lalu Simpan. */
function masukkanSemuaTp(session,subjectId){
  const referensi=listReferenceObjectives(session,subjectId);
  if(referensi.some(item=>!item.sudahDipakai))
    addReferenceObjectives(session,subjectId,referensi.filter(item=>!item.sudahDipakai).map(item=>item.id));
  return listSchoolObjectives(session,subjectId);
}

/* Tahap 8D — TP dipakai sebagai ACUAN penilaian.

   Dua janji yang dikunci suite ini:
   1. Perhitungan Nilai Akhir TIDAK berubah sama sekali oleh kehadiran TP. Lima komponen lama
      tetap menghasilkan satu Nilai Akhir dengan angka yang persis sama.
   2. Deskripsi rapor disusun HANYA dari TP yang dipilih guru, tanpa menambah kompetensi lain. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
function aktifkanMapel(session,ids=['mtk','bindo']){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
}
function tambahSiswa(session,index){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`9955${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:index%2?'L':'P',photo:''});
}
function isiLimaKomponen(session,subjectId,studentId,nilai){
  saveAssessmentScores(session,subjectId,'formative',{[studentId]:nilai.formative});
  saveAssessmentScores(session,subjectId,'daily',{[studentId]:nilai.daily});
  saveAssessmentScores(session,subjectId,'practice',{[studentId]:nilai.practice});
  saveAssessmentScores(session,subjectId,'scopeSummative',{[studentId]:nilai.scopeSummative});
  saveAssessmentScores(session,subjectId,'semesterSummative',{[studentId]:nilai.semesterSummative});
}
function siapkanKelas(){
  useMemoryStorage();aktifkanMapel(guru);
  const siswa=tambahSiswa(guru,1);
  saveAssessmentSettings(guru,'mtk',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  isiLimaKomponen(guru,'mtk',siswa.id,{formative:80,daily:70,practice:90,scopeSummative:85,semesterSummative:75});
  return siswa;
}
function tpLokal(jumlah,subjectId='mtk'){
  return Array.from({length:jumlah},(_,index)=>createLearningObjective(guru,subjectId,
    {description:`menyelesaikan soal bertingkat kelompok ${index+1}`,active:true}));
}

/* --------------------------------------------- Nilai Akhir terkunci: TP tidak boleh mengubahnya */

test('Nilai Akhir identik sebelum dan sesudah TP dipilih',()=>{
  const siswa=siapkanKelas();
  const sebelum=calculateReportScore(guru,'mtk',siswa.id);
  const daftar=tpLokal(3);
  aktifkanHanya(guru,'mtk',daftar.map(item=>item.id));
  const sesudah=calculateReportScore(guru,'mtk',siswa.id);
  assert.equal(sesudah.rawScore,sebelum.rawScore);
  assert.equal(sesudah.roundedScore,sebelum.roundedScore);
  assert.equal(sesudah.finalScore,sebelum.finalScore);
  assert.deepEqual(sesudah.components,sebelum.components);
  assert.equal(JSON.stringify(sesudah),JSON.stringify(sebelum),'seluruh objek nilai identik');
});

test('Nilai Akhir tetap 30/20/20/15/15 dari lima komponen lama',()=>{
  const siswa=siapkanKelas();
  tpLokal(2).forEach(()=>{});
  aktifkanHanya(guru,'mtk',listObjectivesForAssessment(guru,'mtk').map(item=>item.id));
  const harapan=(80*30+70*20+90*20+85*15+75*15)/100;
  const hasil=calculateReportScore(guru,'mtk',siswa.id);
  assert.equal(hasil.rawScore,harapan);
  assert.equal(hasil.finalScore,Math.round(harapan));
  assert.equal(hasil.components.length,5);
  const sheet=calculateReportSheet(guru,'mtk');
  assert.equal(sheet[0].finalScore,Math.round(harapan));
});

test('TP aktif tidak menyimpan satu pun angka per TP',()=>{
  const siswa=siapkanKelas();
  const daftar=tpLokal(3);
  const aktif=aktifkanHanya(guru,'mtk',daftar.map(item=>item.id));
  assert.deepEqual(aktif.map(item=>item.id),daftar.map(item=>item.id));
  /* Tidak ada koleksi pemilihan TP terpisah; statusnya melekat pada TP-nya sendiri. */
  assert.equal(loadDb().assessmentObjectiveSelection,undefined);
  assert.equal(Object.keys(loadDb().assessmentScores).length,5,'nilai tetap lima komponen lama');
  assert.ok(siswa.id);
});

/* --------------------------------------------------------- Deskripsi bersumber dari TP terpilih */

/* ------------------------------------------------- TP BUKAN LAGI BASIS DESKRIPSI RAPOR

   Enam test di blok ini dulu menjaga janji yang sudah RESMI BERUBAH: bahwa deskripsi rapor
   disusun dari TP yang dipilih guru. Sejak penilaian kompetensi beralih ke Butir CP, meminta
   guru memilih TP untuk menghasilkan deskripsi adalah pekerjaan yang tidak lagi dituntut
   siapa pun, dan jalur TP yang selalu didahulukan itulah yang membuat "Generate Semua" gagal
   pada mata pelajaran yang tidak punya TP.

   Yang dijaga sekarang adalah kebalikannya, dan itu diuji secara eksplisit:

   1. Untuk mata pelajaran yang PUNYA CP, deskripsi SELALU bersumber Butir CP - bahkan ketika
      objectiveIds dikirim pemanggil. TP tidak dapat lagi menyetir hasilnya.
   2. Jalur TP tetap ada sebagai CADANGAN untuk mata pelajaran yang memang belum berlaku pada
      fase rombel, supaya sekolah yang sudah memakainya tidak kehilangan apa pun.

   Nilai Akhir tidak tersentuh sama sekali oleh perubahan ini - itu tetap dijaga blok di atas. */

test('CP mengalahkan TP: objectiveIds yang dikirim tidak lagi menyetir deskripsi rapor',()=>{
  const siswa=siapkanKelas();
  const daftar=tpLokal(3);
  aktifkanHanya(guru,'mtk',[daftar[0].id]);
  const hasil=generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:[daftar[0].id]});
  assert.equal(hasil.source,'CP_BUTIR','deskripsi bersumber Butir CP, bukan TP');
  assert.equal(hasil.objectiveIds,null,'tidak ada TP yang menjadi acuan');
  for(const tp of daftar)
    assert.equal(hasil.text.includes(tp.description),false,`isi TP "${tp.description}" tidak masuk deskripsi`);
});

test('Deskripsi rapor tetap memakai Nilai Akhir existing untuk menentukan tingkat capaian',()=>{
  const siswa=siapkanKelas();
  const tinggi=generateReportDescription(guru,'mtk',siswa.id,{});
  assert.equal(tinggi.finalScore,calculateReportScore(guru,'mtk',siswa.id).finalScore,
    'tingkat capaian dibaca dari Nilai Akhir yang sudah ada');
  /* Bentuk kalimat rapor diubah atas permintaan resmi: empat kategori dinyatakan relatif
     terhadap KKTP mata pelajaran, dengan kalimat baku "Mencapai kompetensi dengan ...". */
  assert.match(tinggi.text,/^Mencapai kompetensi dengan (sangat )?baik dalam hal /);
  isiLimaKomponen(guru,'mtk',siswa.id,{formative:50,daily:55,practice:60,scopeSummative:50,semesterSummative:45});
  const rendah=generateReportDescription(guru,'mtk',siswa.id,{});
  assert.ok(rendah.finalScore<75);
  assert.match(rendah.text,/^Perlu meningkatkan kompetensi dalam hal /,'nilai jauh di bawah KKTP dinyatakan apa adanya');
});

test('Deskripsi rapor dapat disimpan dan berstatus AUTO bila tidak diedit',()=>{
  const siswa=siapkanKelas();
  const dibuat=generateReportDescription(guru,'mtk',siswa.id,{});
  const disimpan=saveReportDescription(guru,'mtk',siswa.id,{text:dibuat.text});
  assert.equal(disimpan.status,'AUTO');
  const diedit=saveReportDescription(guru,'mtk',siswa.id,{text:`${dibuat.text} Tetap semangat.`});
  assert.equal(diedit.status,'EDITED');
});

test('Jalur TP tetap menjadi cadangan bagi mapel yang belum berlaku pada fase rombel',()=>{
  /* Bahasa Inggris belum berlaku pada Fase A, jadi CP-nya memang tidak ada. Di sinilah - dan
     hanya di sini - TP masih dipakai, supaya sekolah yang sudah mengisinya tidak kehilangan
     deskripsi rapornya. */
  useMemoryStorage();
  const kelas1={role:'teacher',classId:'1A',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
  aktifkanMapel(kelas1,['bing']);
  const siswa=createStudent(kelas1,{classId:'1A',nis:'1A-1',nisn:'995500001',
    name:'Siswa Cadangan',gender:'P',photo:''});
  saveAssessmentSettings(kelas1,'bing',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  isiLimaKomponen(kelas1,'bing',siswa.id,{formative:80,daily:70,practice:90,scopeSummative:85,semesterSummative:75});
  const tp=createLearningObjective(kelas1,'bing',{description:'menyebutkan salam sederhana',active:true});
  const hasil=generateReportDescription(kelas1,'bing',siswa.id,{});
  assert.ok(hasil.text.includes(tp.description),'TP dipakai ketika CP memang belum tersedia');
  assert.deepEqual(hasil.objectiveIds,[tp.id]);
  /* Guru tetap tidak diminta MEMILIH TP: TP aktif dipakai apa adanya. */
  assert.equal(hasil.bestObjectiveId,null);
  assert.equal(hasil.improvementObjectiveId,null);
});

test('Cara lama TP terbaik dan TP perlu ditingkatkan tetap tersedia bagi mapel tanpa CP',()=>{
  useMemoryStorage();
  const kelas1={role:'teacher',classId:'1A',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
  aktifkanMapel(kelas1,['bing']);
  const siswa=createStudent(kelas1,{classId:'1A',nis:'1A-2',nisn:'995500002',
    name:'Siswa Lama',gender:'L',photo:''});
  saveAssessmentSettings(kelas1,'bing',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  const satu=createLearningObjective(kelas1,'bing',{description:'menyebutkan warna dasar',active:true});
  const dua=createLearningObjective(kelas1,'bing',{description:'menyebutkan angka satu sampai sepuluh',active:true});
  const lama=generateReportDescription(kelas1,'bing',siswa.id,
    {bestObjectiveId:satu.id,improvementObjectiveId:dua.id,objectiveIds:[satu.id,dua.id]});
  assert.ok(lama.text.includes(satu.description));
  assert.ok(lama.text.includes(dua.description));
});

/* ------------------------------------------------------------------ Halaman Penilaian Umum */

test('Halaman Penilaian menampilkan acuan TP tanpa input angka per TP',()=>{
  const sumber=read('src/pages/assessment.js');
  const tanpaKomentar=sumber.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.match(tanpaKomentar,/listActiveObjectives/,'halaman membaca TP aktif dari menu Tujuan Pembelajaran');
  assert.equal(/setSelectedAssessmentObjectives|setActiveObjective/.test(tanpaKomentar),false,
    'Penilaian tidak lagi menjadi tempat memilih TP');
  assert.equal(/data-objective[^>]*type="number"/.test(tanpaKomentar),false,'tidak ada input angka per TP');
  assert.equal(/data-tp-score/.test(tanpaKomentar),false,'tidak ada nilai per TP');
  const jenis=tanpaKomentar.match(/ASSESSMENT_TYPES/g)||[];
  assert.ok(jenis.length>0,'lima jenis penilaian lama tetap dipakai');
});

test('Layanan penilaian tidak menyimpan nilai per TP',()=>{
  const sumber=read('src/services/assessment.js');
  assert.equal(/objectiveId/i.test(sumber),false,'pipeline nilai tidak mengenal TP');
  const laporan=read('src/services/report.js');
  assert.equal(/objectiveScore|scorePerObjective/i.test(laporan),false);
});
