import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { adoptCatalogueObjectives, listActiveObjectives, listObjectivesForAssessment,
  setActiveObjective } from '../src/services/learning-objectives.js';

/* TP yang dipakai ditentukan lewat status aktif pada menu Tujuan Pembelajaran. */
function aktifkanHanya(session,subjectId,ids){
  const semua=adoptCatalogueObjectives(session,subjectId);
  for(const item of semua)setActiveObjective(session,subjectId,item.id,ids.includes(item.id));
  return listActiveObjectives(session,subjectId);
}
import { createLearningObjective } from '../src/services/objectives.js';
import { calculateReportScore, calculateReportSheet } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

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

test('Satu TP terpilih menghasilkan deskripsi yang memuat TP itu saja',()=>{
  const siswa=siapkanKelas();
  const daftar=tpLokal(3);
  aktifkanHanya(guru,'mtk',[daftar[0].id]);
  const hasil=generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:[daftar[0].id]});
  assert.match(hasil.text,/Siswa 1/);
  assert.ok(hasil.text.includes(daftar[0].description));
  assert.equal(hasil.text.includes(daftar[1].description),false,'TP tak terpilih tidak ikut');
  assert.equal(hasil.text.includes(daftar[2].description),false);
  assert.deepEqual(hasil.objectiveIds,[daftar[0].id]);
});

test('Dua dan tiga TP terpilih memuat seluruh TP tepat satu kali tanpa repetisi',()=>{
  const siswa=siapkanKelas();
  const daftar=tpLokal(4);
  for(const jumlah of [2,3,4]){
    const dipakai=daftar.slice(0,jumlah);
    const hasil=generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:dipakai.map(item=>item.id)});
    for(const tp of dipakai){
      const kemunculan=hasil.text.split(tp.description).length-1;
      assert.equal(kemunculan,1,`${jumlah} TP: "${tp.description}" muncul tepat sekali`);
    }
    for(const tp of daftar.slice(jumlah)){
      assert.equal(hasil.text.includes(tp.description),false,'TP di luar pilihan tidak muncul');
    }
    assert.equal(hasil.text.split('Ananda').length-1,1,'kata Ananda tidak diulang');
    assert.equal(hasil.text.split('mampu').length-1,1,'kalimat pembuka tidak diulang');
    assert.equal(/TP-\d/.test(hasil.text),false,'kode TP tidak ikut tercetak');
    assert.match(hasil.text,/\.$/);
  }
});

test('Deskripsi TP memakai Nilai Akhir existing untuk menentukan tingkat capaian',()=>{
  const siswa=siapkanKelas();
  const daftar=tpLokal(2);
  const ids=daftar.map(item=>item.id);
  const tinggi=generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:ids});
  assert.equal(tinggi.finalScore,calculateReportScore(guru,'mtk',siswa.id).finalScore);
  assert.match(tinggi.text,/baik/);
  isiLimaKomponen(guru,'mtk',siswa.id,{formative:50,daily:55,practice:60,scopeSummative:50,semesterSummative:45});
  const rendah=generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:ids});
  assert.ok(rendah.finalScore<75);
  assert.match(rendah.text,/perlu/);
  for(const tp of daftar)assert.ok(rendah.text.includes(tp.description),'TP tetap lengkap meski nilai rendah');
});

test('Deskripsi menolak TP di luar daftar TP mapel tersebut',()=>{
  const siswa=siapkanKelas();
  tpLokal(2);
  assert.throws(()=>generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:['tp-palsu']}),/Tujuan Pembelajaran/i);
});

test('Deskripsi berbasis TP dapat disimpan dan berstatus AUTO bila tidak diedit',()=>{
  const siswa=siapkanKelas();
  const daftar=tpLokal(2);
  const ids=daftar.map(item=>item.id);
  const dibuat=generateReportDescription(guru,'mtk',siswa.id,{objectiveIds:ids});
  const disimpan=saveReportDescription(guru,'mtk',siswa.id,{objectiveIds:ids,text:dibuat.text});
  assert.equal(disimpan.status,'AUTO');
  assert.deepEqual(disimpan.objectiveIds,ids);
  const diedit=saveReportDescription(guru,'mtk',siswa.id,{objectiveIds:ids,text:`${dibuat.text} Tetap semangat.`});
  assert.equal(diedit.status,'EDITED');
  assert.ok(diedit.text.includes(daftar[0].description));
});

test('Cara lama TP terbaik dan TP perlu ditingkatkan tetap berjalan',()=>{
  const siswa=siapkanKelas();
  const daftar=tpLokal(2);
  const lama=generateReportDescription(guru,'mtk',siswa.id,
    {bestObjectiveId:daftar[0].id,improvementObjectiveId:daftar[1].id});
  assert.match(lama.text,/sangat baik dalam/);
  assert.match(lama.text,/perlu meningkatkan kemampuan dalam/);
  assert.equal(lama.bestObjectiveId,daftar[0].id);
  assert.equal(lama.improvementObjectiveId,daftar[1].id);
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
