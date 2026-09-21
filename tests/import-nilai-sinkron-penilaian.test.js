import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { ASSESSMENT_TYPES, SCOPE_SUMMATIVE_TYPE, getAssessmentSettings, getAssessmentSheet,
  saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { ASSESSMENT_HEADERS, commitAssessmentImport, previewAssessmentImport } from '../src/services/assessment-import.js';
import { calculateReportScore, getReportScore, saveAutomaticReportScores } from '../src/services/report.js';

/* IMPORT NILAI HARUS TERBACA DI MENU PENILAIAN.

   Nilai komponen dapat masuk TANPA keterangan Butir CP - Import Nilai adalah jalurnya yang
   paling nyata, sebab templatenya memang tidak punya kolom Butir CP. Sebelum perbaikan,
   tampilan per Butir CP pada halaman Penilaian menyaring habis catatan semacam itu karena
   butirnya tidak sama dengan butir yang sedang dibuka - padahal ia bukan milik butir lain,
   melainkan belum menjadi milik butir mana pun.

   Akibatnya guru melihat grid Penilaian KOSONG sesudah import sementara Nilai Akhir justru
   sudah terisi: dua tampilan yang saling bertentangan atas satu angka yang sama.

   Berkas ini mengunci perilaku yang benar sekaligus memastikan perbaikannya tidak menggeser
   satu pun perhitungan: rumus, rubrik, bobot, KKTP, dan alur Nilai Rapor tetap seperti semula. */

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();return values;}

const MAPEL='mtk';
const guru=(classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`)=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
const SISWA=Object.freeze([
  {nis:'501',nisn:'0051',name:'Ayu Lestari'},
  {nis:'502',nisn:'0052',name:'Budi Santoso'},
  {nis:'503',nisn:'0053',name:'Citra Dewi'},
]);
function siapkan({classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`,aktif=[MAPEL,'bindo']}={}){
  const scope=guru(classId,semester);
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:aktif.includes(item.id),order:index+1})));
  /* NIS dan NISN wajib unik pada satu periode, jadi tiap rombel memakai awalan sendiri. */
  const awalan=classId.replace(/\W/g,'');
  for(const item of SISWA)createStudent(scope,{classId,nis:`${awalan}-${item.nis}`,nisn:`${awalan}-${item.nisn}`,name:item.name,
    gender:'P',birthPlace:'Bekasi',birthDate:'2014-01-05',parentName:'Wali',religion:'Islam'});
  return {scope,siswa:listStudents(scope,{classId})};
}
function awal(){useMemoryStorage();return siapkan();}
const kolom=label=>ASSESSMENT_HEADERS.indexOf(label);
/* Membangun tabel import persis bentuk Template Nilai yang diunduh guru. */
function tabelImport(siswa,isian){
  const baris=siswa.map(student=>{
    const row=new Array(ASSESSMENT_HEADERS.length).fill('');
    row[kolom('NIS')]=student.nis;row[kolom('NISN')]=student.nisn;row[kolom('Nama')]=student.name;
    row[ASSESSMENT_HEADERS.length-1]=student.id;
    const nilai=isian[student.id]||{};
    for(const [label,value] of Object.entries(nilai))row[kolom(label)]=value;
    return row;
  });
  return [[...ASSESSMENT_HEADERS],...baris];
}
function importkan(scope,siswa,isian){
  const preview=previewAssessmentImport(scope,MAPEL,tabelImport(siswa,isian));
  assert.equal(preview.invalidCount,0,JSON.stringify(preview.rows.flatMap(row=>row.errors)));
  return commitAssessmentImport(scope,preview);
}
const butirAktif=scope=>listCpButir(scope,MAPEL,{activeOnly:true});

/* ============================================================ TEST 1-5: IMPORT -> PENILAIAN */

test('TEST 1. Import mengisi Menu Penilaian pada Butir CP yang sedang dibuka',()=>{
  const {scope,siswa}=awal();
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:80}])));
  const butir=butirAktif(scope);
  assert.ok(butir.length,'mapel uji memang punya Butir CP aktif');
  const sheet=getAssessmentSheet(scope,MAPEL,'formative',{cpButirId:butir[0].id});
  assert.equal(sheet.filledCount,3,'grid Penilaian tidak boleh kosong sesudah import');
  assert.deepEqual(sheet.rows.map(row=>row.score),[80,80,80]);
});

test('TEST 2. Import mengisi SELURUH siswa yang valid',()=>{
  const {scope,siswa}=awal();
  const isian=Object.fromEntries(siswa.map((s,i)=>[s.id,{Formatif:70+i*5}]));
  importkan(scope,siswa,isian);
  const butir=butirAktif(scope)[0].id;
  const sheet=getAssessmentSheet(scope,MAPEL,'formative',{cpButirId:butir});
  assert.equal(sheet.rows.length,siswa.length);
  assert.equal(sheet.filledCount,siswa.length,'tidak ada siswa yang terlewat');
  for(const student of siswa)
    assert.equal(sheet.rows.find(row=>row.studentId===student.id).score,isian[student.id].Formatif);
});

test('TEST 3. Import mengisi SELURUH komponen yang ada kolomnya',()=>{
  const {scope,siswa}=awal();
  const isian=Object.fromEntries(siswa.map(s=>[s.id,
    {Formatif:70,'Penilaian Harian':75,'Penilaian Praktik':80,'Sumatif Akhir Semester':85,'Sumatif LM1':90,'Sumatif LM2':60}]));
  importkan(scope,siswa,isian);
  const butir=butirAktif(scope)[0].id;
  const harap={formative:70,daily:75,practice:80,semesterSummative:85,[SCOPE_SUMMATIVE_TYPE]:75};
  for(const [type,nilai] of Object.entries(harap)){
    const sheet=getAssessmentSheet(scope,MAPEL,type,{cpButirId:butir});
    assert.equal(sheet.filledCount,3,`komponen ${type} terisi di Menu Penilaian`);
    assert.equal(sheet.rows[0].score,nilai,`komponen ${type} bernilai benar`);
  }
});

test('TEST 4. Import menimpa nilai manual pada nilai komponen yang dipakai Nilai Akhir',()=>{
  const {scope,siswa}=awal();
  saveAssessmentSettings(scope,MAPEL,{formative:100,daily:0,practice:0,scopeSummative:0,semesterSummative:0,kktp:70});
  const butir=butirAktif(scope)[0].id;
  /* Guru menilai manual lebih dulu pada satu Butir CP. */
  saveAssessmentScores(scope,MAPEL,'formative',Object.fromEntries(siswa.map(s=>[s.id,50])),{cpButirId:butir});
  assert.equal(calculateReportScore(scope,MAPEL,siswa[0].id).finalScore,50);
  /* Lalu import membawa nilai yang berbeda. */
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:88}])));

  /* YANG DITIMPA ADALAH NILAI KOMPONEN - sumber tunggal Nilai Akhir. Inilah arti "import
     dapat menimpa nilai manual" yang berdampak pada rapor. */
  const komponen=getAssessmentSheet(scope,MAPEL,'formative');
  assert.deepEqual(komponen.rows.map(row=>row.score),[88,88,88],'nilai komponen tertimpa import');
  assert.equal(calculateReportScore(scope,MAPEL,siswa[0].id).finalScore,88,'Nilai Akhir mengikuti import');

  /* HARAPAN DIPERBARUI - DAN DIPERKETAT.

     Versi sebelumnya berkas ini mengunci angka 50 tetap bertahan sebagai bukti butir sesudah
     import. Harapan itu keliru dan justru menyembunyikan cacat yang nyata: guru melihat 50 di
     halaman Penilaian sementara Nilai Akhir sudah memakai 88 - satu pengukuran, dua angka yang
     saling bertentangan. Itulah gejala yang dilaporkan pemakai.

     Sebabnya ada pada bentuk Template Nilai itu sendiri: template dibangkitkan DARI angka yang
     tersimpan sekarang, diunduh, disunting, lalu diunggah kembali. Angka yang masuk karena itu
     merupakan KOREKSI atas pengukuran yang sama, bukan kegiatan penilaian baru yang berdiri
     sendiri, sehingga bukti yang selama ini menopangnya ikut terkoreksi.

     Yang dikunci sekarang LEBIH BANYAK daripada sebelumnya: keterangan butir tetap tersambung,
     seluruh siswa ikut terkoreksi, dan angka yang dilihat guru wajib sama dengan angka yang
     dipakai rapor. Batasnya tetap dijaga berkas lain: bukti butir LAIN tidak pernah disentuh
     (TEST 21 pada tests/import-overwrite-semua-mapel.test.js) dan penyimpanan biasa tanpa
     menyebut butir tetap membiarkan bukti apa adanya (tests/penilaian-butir-cp.test.js butir
     13, tetap PASS tanpa diubah). */
  const db=loadDb();
  const catatan=Object.values(db.assessmentScores).find(item=>item.subjectId===MAPEL&&item.assessmentType==='formative');
  assert.equal(catatan.cpButirId,butir,'keterangan Butir CP yang sudah benar tidak diputus oleh import');
  const padaButir=()=>getAssessmentSheet(scope,MAPEL,'formative',{cpButirId:butir});
  for(const orang of siswa)
    assert.equal(padaButir().rows.find(row=>row.studentId===orang.id).score,88,
      'angka yang dilihat guru pada butir itu ikut terkoreksi - untuk seluruh siswa');
  assert.equal(padaButir().rows[0].score,calculateReportScore(scope,MAPEL,siswa[0].id).finalScore,
    'yang dilihat guru dan yang dipakai rapor adalah satu angka yang sama');
});

test('TEST 5. Nilai milik Butir CP lain tetap tidak bocor ke butir yang sedang dibuka',()=>{
  const {scope,siswa}=awal();
  const [butirA,butirB]=butirAktif(scope);
  saveAssessmentScores(scope,MAPEL,'formative',{[siswa[0].id]:95},{cpButirId:butirA.id});
  const lihatB=getAssessmentSheet(scope,MAPEL,'formative',{cpButirId:butirB.id});
  assert.equal(lihatB.rows.find(row=>row.studentId===siswa[0].id).score,null,
    'nilai yang sudah menjadi bukti butir A tidak boleh muncul pada butir B');
  const lihatA=getAssessmentSheet(scope,MAPEL,'formative',{cpButirId:butirA.id});
  assert.equal(lihatA.rows.find(row=>row.studentId===siswa[0].id).score,95);
});

/* ================================================ TEST 6-10: LIMA KOMPONEN TETAP BERFUNGSI */

for(const [nomor,type,label] of [[6,'formative','Formatif'],[7,'daily','Penilaian Harian'],
  [8,'practice','Penilaian Praktik'],[9,SCOPE_SUMMATIVE_TYPE,'Sumatif Lingkup Materi'],
  [10,'semesterSummative','Sumatif Akhir Semester']]){
  test(`TEST ${nomor}. Komponen ${label} tetap berfungsi: simpan manual, baca, dan ubah`,()=>{
    const {scope,siswa}=awal();
    const butir=butirAktif(scope)[0].id;
    const nilai=type===SCOPE_SUMMATIVE_TYPE?{parts:{lm1:80,lm2:90}}:77;
    saveAssessmentScores(scope,MAPEL,type,{[siswa[0].id]:nilai},{cpButirId:butir});
    const sheet=getAssessmentSheet(scope,MAPEL,type,{cpButirId:butir});
    const baris=sheet.rows.find(row=>row.studentId===siswa[0].id);
    assert.equal(baris.score,type===SCOPE_SUMMATIVE_TYPE?85:77,`${label} tersimpan dan terbaca`);
    if(type===SCOPE_SUMMATIVE_TYPE)assert.deepEqual(baris.parts,{lm1:80,lm2:90},'rincian lingkup materi utuh');
    /* Diubah lagi - komponen tetap dapat disunting sesudah perbaikan. */
    saveAssessmentScores(scope,MAPEL,type,{[siswa[0].id]:type===SCOPE_SUMMATIVE_TYPE?{parts:{lm1:60,lm2:60}}:60},{cpButirId:butir});
    assert.equal(getAssessmentSheet(scope,MAPEL,type,{cpButirId:butir}).rows.find(r=>r.studentId===siswa[0].id).score,60);
  });
}

/* ==================================================== TEST 11-14: RUMUS, BOBOT, KKTP, RUBRIK */

test('TEST 11. Rumus Nilai Akhir tidak berubah - tetap rata-rata berbobot komponen',()=>{
  const {scope,siswa}=awal();
  saveAssessmentSettings(scope,MAPEL,{formative:25,daily:25,practice:20,scopeSummative:15,semesterSummative:15,kktp:70});
  const isian={Formatif:80,'Penilaian Harian':60,'Penilaian Praktik':90,'Sumatif Akhir Semester':70,'Sumatif LM1':50};
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,isian])));
  const hitung=calculateReportScore(scope,MAPEL,siswa[0].id);
  const harap=80*0.25+60*0.25+90*0.20+50*0.15+70*0.15;
  assert.equal(Math.round(hitung.rawScore*100)/100,Math.round(harap*100)/100,'nilai akhir = rata-rata berbobot');
  assert.equal(hitung.finalScore,Math.round(harap));
  assert.equal(hitung.weightValid,true);
});

test('TEST 12. Bobot per komponen tetap dipatuhi - mengubah bobot mengubah Nilai Akhir',()=>{
  const {scope,siswa}=awal();
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:100,'Penilaian Harian':0}])));
  saveAssessmentSettings(scope,MAPEL,{formative:90,daily:10,practice:0,scopeSummative:0,semesterSummative:0,kktp:70});
  const beratFormatif=calculateReportScore(scope,MAPEL,siswa[0].id).rawScore;
  saveAssessmentSettings(scope,MAPEL,{formative:10,daily:90,practice:0,scopeSummative:0,semesterSummative:0,kktp:70});
  const beratHarian=calculateReportScore(scope,MAPEL,siswa[0].id).rawScore;
  assert.ok(beratFormatif>beratHarian,'bobot benar-benar menentukan hasil');
  assert.equal(Math.round(beratFormatif),90);
  assert.equal(Math.round(beratHarian),10);
});

test('TEST 13. KKTP tidak berubah oleh import dan tetap menentukan status tuntas',()=>{
  const {scope,siswa}=awal();
  saveAssessmentSettings(scope,MAPEL,{formative:100,daily:0,practice:0,scopeSummative:0,semesterSummative:0,kktp:75});
  const sebelum=getAssessmentSettings(scope,MAPEL);
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:80}])));
  const sesudah=getAssessmentSettings(scope,MAPEL);
  assert.equal(sesudah.kktp,75,'KKTP tidak tersentuh import');
  assert.deepEqual(sesudah.rubric,sebelum.rubric,'rubrik tidak tersentuh import');
  assert.equal(calculateReportScore(scope,MAPEL,siswa[0].id).masteryStatus,'TUNTAS');
});

test('TEST 14. Komponen yang belum dinilai tidak menyeret Nilai Akhir turun',()=>{
  const {scope,siswa}=awal();
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:80}])));
  saveAssessmentSettings(scope,MAPEL,{formative:20,daily:20,practice:20,scopeSummative:20,semesterSummative:20,kktp:70});
  const hitung=calculateReportScore(scope,MAPEL,siswa[0].id);
  /* KONTRAK EXISTING YANG DIPERTAHANKAN: bobot dihitung ulang atas komponen yang TERISI saja,
     jadi satu komponen terisi bernilai 80 menghasilkan 80 - bukan 16 - dan bobot dianggap sah
     selama jumlah bobot terisi lebih dari nol. Perbaikan import tidak menggesernya. */
  assert.equal(hitung.weightTotal,20,'hanya bobot komponen terisi yang dijumlahkan');
  assert.equal(hitung.weightValid,true);
  assert.equal(hitung.rawScore,80,'nilai tidak diencerkan komponen yang belum dinilai');
  assert.equal(hitung.completionStatus,'PARTIAL');
  assert.equal(hitung.completionLabel,'SEBAGIAN 1/5');
});

/* ================================================ TEST 15-17: IMPORT vs NILAI RAPOR */

test('TEST 15. Import TIDAK langsung mengubah Nilai Rapor tersimpan',()=>{
  const {scope,siswa}=awal();
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:80}])));
  for(const student of siswa)
    assert.equal(getReportScore(scope,MAPEL,student.id),null,
      'Nilai Rapor baru ada setelah disimpan, bukan karena import');
});

test('TEST 16. Simpan Otomatis mengambil Nilai Akhir TERBARU dari Menu Penilaian',()=>{
  const {scope,siswa}=awal();
  saveAssessmentSettings(scope,MAPEL,{formative:100,daily:0,practice:0,scopeSummative:0,semesterSummative:0,kktp:70});
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:70}])));
  saveAutomaticReportScores(scope,MAPEL);
  assert.equal(getReportScore(scope,MAPEL,siswa[0].id).finalScore,70);
  /* Import kedua membawa nilai baru; rapor lama belum berubah sampai disimpan ulang. */
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:95}])));
  assert.equal(getReportScore(scope,MAPEL,siswa[0].id).finalScore,70,'rapor belum berubah sebelum disimpan');
  saveAutomaticReportScores(scope,MAPEL);
  assert.equal(getReportScore(scope,MAPEL,siswa[0].id).finalScore,95,'Simpan Otomatis mengambil nilai terbaru');
});

test('TEST 17. Nilai rapor yang ditimpa manual tetap dihormati Simpan Otomatis',async()=>{
  const {scope,siswa}=awal();
  saveAssessmentSettings(scope,MAPEL,{formative:100,daily:0,practice:0,scopeSummative:0,semesterSummative:0,kktp:70});
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:70}])));
  const { saveManualReportScore }=await import('../src/services/report.js');
  saveManualReportScore(scope,MAPEL,siswa[0].id,88);
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:95}])));
  saveAutomaticReportScores(scope,MAPEL);
  assert.equal(getReportScore(scope,MAPEL,siswa[0].id).finalScore,88,'override manual tidak ditimpa otomatis');
  assert.equal(getReportScore(scope,MAPEL,siswa[1].id).finalScore,95,'siswa lain tetap mengikuti nilai terbaru');
});

/* ====================================================== TEST 18-21: ISOLASI SCOPE */

test('TEST 18. Import satu mapel tidak menyentuh mapel lain',()=>{
  const {scope,siswa}=awal();
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:80}])));
  const butir=listCpButir(scope,'bindo',{activeOnly:true})[0];
  const lain=getAssessmentSheet(scope,'bindo','formative',butir?{cpButirId:butir.id}:{});
  assert.equal(lain.filledCount,0,'mapel lain tetap kosong');
});

test('TEST 19. Import satu rombel tidak menyentuh rombel lain',()=>{
  useMemoryStorage();
  const a=siapkan({classId:'5A'});
  const b=siapkan({classId:'5B'});
  importkan(a.scope,a.siswa,Object.fromEntries(a.siswa.map(s=>[s.id,{Formatif:80}])));
  const butirB=listCpButir(b.scope,MAPEL,{activeOnly:true})[0].id;
  assert.equal(getAssessmentSheet(b.scope,MAPEL,'formative',{cpButirId:butirB}).filledCount,0,'rombel lain tetap kosong');
  const butirA=listCpButir(a.scope,MAPEL,{activeOnly:true})[0].id;
  assert.equal(getAssessmentSheet(a.scope,MAPEL,'formative',{cpButirId:butirA}).filledCount,3);
});

test('TEST 20. Import satu semester tidak menyentuh semester lain',()=>{
  useMemoryStorage();
  const ganjil=siapkan({semester:`Ganjil ${ACADEMIC_YEAR}`});
  const genap=guru('5A',`Genap ${ACADEMIC_YEAR}`);
  saveSubjectMapping(genap,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:[MAPEL,'bindo'].includes(item.id),order:index+1})));
  importkan(ganjil.scope,ganjil.siswa,Object.fromEntries(ganjil.siswa.map(s=>[s.id,{Formatif:80}])));
  const butir=listCpButir(genap,MAPEL,{activeOnly:true})[0].id;
  assert.equal(getAssessmentSheet(genap,MAPEL,'formative',{cpButirId:butir}).filledCount,0,'semester lain tetap kosong');
});

test('TEST 21. Import satu tahun pelajaran tidak menyentuh tahun lain',()=>{
  useMemoryStorage();
  const sekarang=siapkan();
  const tahunLain={role:'teacher',classId:'5A',academicYear:'2019/2020',semester:'Ganjil 2019/2020'};
  saveSubjectMapping(tahunLain,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:[MAPEL].includes(item.id),order:index+1})));
  importkan(sekarang.scope,sekarang.siswa,Object.fromEntries(sekarang.siswa.map(s=>[s.id,{Formatif:80}])));
  const butir=listCpButir(tahunLain,MAPEL,{activeOnly:true})[0].id;
  assert.equal(getAssessmentSheet(tahunLain,MAPEL,'formative',{cpButirId:butir}).filledCount,0,'tahun lain tetap kosong');
});

/* ====================================================== TEST 22-23: KETAHANAN DATA */

test('TEST 22. Data hasil import tetap ada sesudah reload database',()=>{
  const {scope,siswa}=awal();
  importkan(scope,siswa,Object.fromEntries(siswa.map(s=>[s.id,{Formatif:80,'Penilaian Harian':70}])));
  const tersimpan=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');
  /* Reload sungguhan: cache dibuang dan database dibaca ulang dari penyimpanan. */
  invalidateDbCache();
  const values=new Map([['erapor_satria_jaya_01_v1',tersimpan]]);
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
  const butir=butirAktif(scope)[0].id;
  assert.equal(getAssessmentSheet(scope,MAPEL,'formative',{cpButirId:butir}).filledCount,3,'nilai bertahan sesudah reload');
  assert.equal(getAssessmentSheet(scope,MAPEL,'daily',{cpButirId:butir}).filledCount,3);
});

test('TEST 23. Sel kosong pada berkas berarti belum dinilai, bukan nol',()=>{
  const {scope,siswa}=awal();
  importkan(scope,siswa,{[siswa[0].id]:{Formatif:80}});
  const butir=butirAktif(scope)[0].id;
  const sheet=getAssessmentSheet(scope,MAPEL,'formative',{cpButirId:butir});
  assert.equal(sheet.rows.find(row=>row.studentId===siswa[0].id).score,80);
  for(const student of siswa.slice(1))
    assert.equal(sheet.rows.find(row=>row.studentId===student.id).score,null,'siswa tanpa isian tetap belum dinilai');
  /* Komponen yang kolomnya dikosongkan seluruhnya juga tidak menjadi nol. */
  assert.equal(getAssessmentSheet(scope,MAPEL,'practice',{cpButirId:butir}).filledCount,0);
});
