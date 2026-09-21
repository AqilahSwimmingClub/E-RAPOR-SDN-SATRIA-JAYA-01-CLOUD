import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { ASSESSMENT_TYPES, SCOPE_SUMMATIVE_TYPE, getAssessmentSettings, getAssessmentSheet,
  saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { ASSESSMENT_HEADERS, commitAssessmentImport, previewAssessmentImport } from '../src/services/assessment-import.js';
import { saveAttendance } from '../src/services/attendance.js';
import { calculateReportScore, clearManualReportOverrides, getReportScore, getStoredReportRows,
  saveAttendanceConversion, saveAutomaticReportScores, saveDailyAttendanceMode,
  saveManualReportScore, saveManualReportScoresBulk, visibleStoredReportRows } from '../src/services/report.js';
import { cancelManualReportOverrides, saveAllAutomaticReports } from '../src/services/report-bulk.js';
import { commitReportImport, previewReportImport, REPORT_CSV_HEADERS } from '../src/services/report-import.js';
import { getLeger, getReportDocument } from '../src/services/documents.js';

/* BATALKAN OVERRIDE MANUAL PADA NILAI RAPOR.

   Nilai rapor yang ditulis guru - lewat Input Manual maupun Import Nilai Rapor - sengaja kebal
   terhadap Simpan Otomatis. Penjagaan itu benar dan tetap dipertahankan: angka yang diketik
   guru tidak boleh hilang hanya karena ia menekan tombol simpan.

   Yang tidak ada sebelumnya adalah pintu keluarnya. Sekali sebuah catatan menjadi override,
   tidak ada satu pun jalur yang dapat mengembalikannya ke otomatis, sehingga Nilai Akhir
   terbaru tidak pernah sampai ke rapor - persis kasus yang dilaporkan: perhitungan menunjukkan
   83 sementara Rapor tetap 80.

   Berkas ini mengunci kedua sisinya sekaligus: override tetap menang selama guru belum
   membatalkannya, DAN begitu dibatalkan nilainya wajib kembali ke hasil perhitungan terbaru -
   dihitung mesin yang sama, menghormati Bobot dan Absensi, untuk SELURUH mata pelajaran yang
   dikonfigurasi aplikasi. */

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),
    clear:()=>values.clear()};
  globalThis.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{}};
  invalidateDbCache();
  return values;
}
const guru=(classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});

const MAPEL=SUBJECTS_DEFAULT.map(item=>item.id);
const KOMPONEN=ASSESSMENT_TYPES.map(type=>type.id);
/* Bobot uji: Harian sengaja tidak seperlima supaya mode berbobot dan rata-rata tidak pernah
   kebetulan sama ketika sumber Harian berpindah. Totalnya tetap 100% sesuai kontrak. */
const BOBOT=Object.freeze({formative:40,daily:10,practice:20,scopeSummative:15,semesterSummative:15});
const NILAI=Object.freeze({formative:60,daily:70,practice:80,scopeSummative:90,semesterSummative:100});
/* Angka override sengaja jauh dari hasil hitung mana pun supaya tertukarnya langsung terlihat. */
const OVERRIDE=55;

const SISWA=Object.freeze([
  {nis:'701',nisn:'0071',name:'Ayu Islam',religion:'Islam'},
  {nis:'702',nisn:'0072',name:'Beni Kristen',religion:'Kristen'},
  {nis:'703',nisn:'0073',name:'Cinta Islam',religion:'Islam'},
]);

function siapkan({classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`}={}){
  const scope=guru(classId,semester);
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  const awalan=classId.replace(/\W/g,'');
  for(const item of SISWA)createStudent(scope,{classId,nis:`${awalan}-${item.nis}`,nisn:`${awalan}-${item.nisn}`,
    name:item.name,gender:'P',birthPlace:'Bekasi',birthDate:'2014-03-12',parentName:'Wali',religion:item.religion});
  return {scope,siswa:listStudents(scope,{classId})};
}
function awal(pilihan){useMemoryStorage();return siapkan(pilihan);}
/* Siswa dan mapping tersimpan PER SCOPE, jadi scope pembanding harus disiapkan sendiri -
   bukan dipinjam dari scope aktif. Inilah yang membuat uji isolasi benar-benar menguji dua
   kumpulan data yang nyata, bukan dua nama session atas data yang sama. */
function siapkanScopeLain(scope){
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  const awalan=`${scope.classId}${scope.semester.split(' ')[0]}${scope.academicYear.slice(2,4)}`.replace(/\W/g,'');
  for(const item of SISWA)createStudent(scope,{classId:scope.classId,
    nis:`${awalan}-${item.nis}`,nisn:`${awalan}-${item.nisn}`,name:item.name,gender:'P',
    birthPlace:'Bekasi',birthDate:'2014-03-12',parentName:'Wali',religion:item.religion});
  return listStudents(scope,{classId:scope.classId});
}

const pemilik=(scope,subjectId)=>getAssessmentSheet(scope,subjectId,'formative').rows.map(row=>row.studentId);
const butirPertama=(scope,subjectId)=>listCpButir(scope,subjectId,{activeOnly:true})[0]?.id||null;

function aturMapel(scope,subjectId,{useWeights=true,kktp=70}={}){
  return saveAssessmentSettings(scope,subjectId,{...BOBOT,kktp,useWeights});
}
function isiManual(scope,subjectId,ids,nilai=NILAI){
  for(const type of KOMPONEN)
    saveAssessmentScores(scope,subjectId,type,Object.fromEntries(ids.map(id=>[id,nilai[type]])));
}
const kolom=label=>ASSESSMENT_HEADERS.indexOf(label);
function isiImportPenilaian(scope,subjectId,ids,nilai=NILAI){
  const daftar=listStudents(scope,{classId:scope.classId}).filter(student=>ids.includes(student.id));
  const rows=daftar.map(student=>{
    const row=new Array(ASSESSMENT_HEADERS.length).fill('');
    row[kolom('NIS')]=student.nis;row[kolom('NISN')]=student.nisn;row[kolom('Nama')]=student.name;
    row[ASSESSMENT_HEADERS.length-1]=student.id;
    row[kolom('Formatif')]=nilai.formative;row[kolom('Penilaian Harian')]=nilai.daily;
    row[kolom('Penilaian Praktik')]=nilai.practice;row[kolom('Sumatif LM1')]=nilai.scopeSummative;
    row[kolom('Sumatif Akhir Semester')]=nilai.semesterSummative;
    return row;});
  const preview=previewAssessmentImport(scope,subjectId,[[...ASSESSMENT_HEADERS],...rows]);
  assert.equal(preview.invalidCount,0,`${subjectId}: ${JSON.stringify(preview.rows.flatMap(r=>r.errors))}`);
  commitAssessmentImport(scope,preview);
}
/* Import Nilai Rapor memakai CSV sungguhan lewat parser aslinya, bukan pintu belakang. */
function importNilaiRapor(scope,subjectId,ids,nilai=OVERRIDE){
  const daftar=listStudents(scope,{classId:scope.classId}).filter(student=>ids.includes(student.id));
  const baris=daftar.map(student=>[scope.classId,student.nis,student.nisn,subjectId,nilai].join(','));
  const csv=`${REPORT_CSV_HEADERS.join(',')}\r\n${baris.join('\r\n')}\r\n`;
  const preview=previewReportImport(scope,subjectId,csv);
  assert.equal(preview.invalidCount,0,`${subjectId}: ${JSON.stringify(preview.rows.flatMap(r=>r.errors))}`);
  return commitReportImport(scope,preview);
}

function aturKehadiran(scope,{hadir=41,total=50}={}){
  saveAttendanceConversion(scope,{Hadir:100,Sakit:0,Izin:0,Alpa:0});
  const daftar=listStudents(scope,{classId:scope.classId});
  const bulan=String(scope.semester).startsWith('Ganjil')?7:1;
  const tahun=Number(ACADEMIC_YEAR.slice(0,4))+(bulan===7?0:1);
  for(let hari=0;hari<total;hari+=1){
    const tanggal=new Date(Date.UTC(tahun,bulan,1+hari)).toISOString().slice(0,10);
    saveAttendance(scope,tanggal,Object.fromEntries(daftar.map(student=>[student.id,hari<hadir?'Hadir':'Alpa'])));
  }
}
const NILAI_KEHADIRAN=82;

/* Harapan disusun ulang di test, bukan disalin dari kode produksi. */
function harapanMentah(nilai,{useWeights}){
  const terisi=KOMPONEN.filter(type=>nilai[type]!==null&&nilai[type]!==undefined);
  if(!terisi.length)return null;
  if(!useWeights)return terisi.reduce((sum,type)=>sum+nilai[type],0)/terisi.length;
  const penyebut=terisi.reduce((sum,type)=>sum+BOBOT[type],0);
  return terisi.reduce((sum,type)=>sum+nilai[type]*BOBOT[type],0)/penyebut;
}
const bulatkan=value=>value===null?null:Math.round(value);

/* Keadaan awal yang dipakai hampir seluruh test: nilai penilaian lengkap, rapor otomatis
   tersimpan, lalu satu override manual menimpanya. */
function siapkanOverride({subjectId='mtk',useWeights=true,absensi=false,sumber='MANUAL'}={}){
  const {scope,siswa}=awal();
  for(const id of MAPEL)aturMapel(scope,id,{useWeights});
  if(absensi){aturKehadiran(scope);for(const id of MAPEL)saveDailyAttendanceMode(scope,id,true);}
  for(const id of MAPEL)isiManual(scope,id,pemilik(scope,id));
  for(const id of MAPEL)saveAutomaticReportScores(scope,id);
  const ids=pemilik(scope,subjectId);
  if(sumber==='IMPORT_MANUAL')importNilaiRapor(scope,subjectId,ids,OVERRIDE);
  else saveManualReportScore(scope,subjectId,ids[0],OVERRIDE);
  return {scope,siswa,ids,subjectId,
    otomatis:bulatkan(harapanMentah(absensi?{...NILAI,daily:NILAI_KEHADIRAN}:NILAI,{useWeights}))};
}

/* ================================================ TEST 1-4: KASUS UTAMA 80 -> 83 */

test('TEST 1. Override tetap menang selama belum dibatalkan',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride();
  assert.notEqual(otomatis,OVERRIDE,'contoh uji memang membedakan keduanya');
  assert.equal(calculateReportScore(scope,subjectId,ids[0]).finalScore,otomatis,'perhitungan terbaru');
  saveAutomaticReportScores(scope,subjectId);
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,OVERRIDE,'Simpan Otomatis tidak menimpanya');
  saveAllAutomaticReports(scope);
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,OVERRIDE,'Simpan Semua Mapel pun tidak');
});

test('TEST 2. Batalkan override siswa+mapel mengembalikan nilai otomatis terbaru',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride();
  const hasil=cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(hasil.clearedCount,1);
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,otomatis,'nilai otomatis terbaru dipakai');
});

test('TEST 3. Sesudah pembatalan isManualOverride bernilai false',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(getReportScore(scope,subjectId,ids[0]).isManualOverride,false);
});

test('TEST 4. Sesudah pembatalan calculationMethod mengikuti automaticRecord canonical',()=>{
  for(const [useWeights,cara] of [[true,'WEIGHTED_AUTOMATIC'],[false,'AVERAGE_AUTOMATIC']]){
    const {scope,ids,subjectId}=siapkanOverride({useWeights});
    cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
    const record=getReportScore(scope,subjectId,ids[0]);
    assert.equal(record.calculationMethod,cara,'mengikuti mode perhitungan yang berlaku');
    assert.equal(record.previousScoreReference,null,'bentuk catatan otomatis, bukan catatan override');
  }
});

/* ============================================= TEST 5-8: TIGA TINGKAT PEMBATALAN */

test('TEST 5. Batalkan satu mapel tidak mengubah mapel lain',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  const lain=MAPEL.filter(id=>id!==subjectId)[0];
  saveManualReportScore(scope,lain,ids[0],OVERRIDE);
  cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(getReportScore(scope,subjectId,ids[0]).isManualOverride,false,'mapel sasaran kembali otomatis');
  assert.equal(getReportScore(scope,lain,ids[0]).isManualOverride,true,'mapel lain tetap override');
  assert.equal(getReportScore(scope,lain,ids[0]).finalScore,OVERRIDE);
});

test('TEST 6. Batalkan satu siswa tidak mengubah siswa lain',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  saveManualReportScore(scope,subjectId,ids[1],OVERRIDE);
  cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(getReportScore(scope,subjectId,ids[0]).isManualOverride,false);
  assert.equal(getReportScore(scope,subjectId,ids[1]).finalScore,OVERRIDE,'siswa lain tetap override');
});

test('TEST 7. Batalkan seluruh mapel milik satu siswa',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride();
  /* Beberapa mapel di-override - termasuk satu dari penyiapan - dan satu mapel sengaja
     dibiarkan otomatis supaya terlihat bahwa yang otomatis memang tidak ikut diproses. */
  const lain=MAPEL.filter(id=>id!==subjectId);
  const diOverride=[subjectId,...lain.slice(0,3)];
  const tetapOtomatis=lain[3];
  for(const id of diOverride.slice(1))saveManualReportScore(scope,id,ids[0],OVERRIDE);
  const sebelumOtomatis=getReportScore(scope,tetapOtomatis,ids[0]);
  const hasil=cancelManualReportOverrides(scope,{studentId:ids[0]});
  assert.equal(hasil.clearedCount,diOverride.length,'hanya yang override yang diproses');
  for(const id of diOverride){
    assert.equal(getReportScore(scope,id,ids[0]).isManualOverride,false,`${id} kembali otomatis`);
    assert.equal(getReportScore(scope,id,ids[0]).finalScore,otomatis,`${id} memakai nilai terbaru`);
  }
  assert.equal(getReportScore(scope,tetapOtomatis,ids[0]).finalScore,sebelumOtomatis.finalScore,
    'yang sudah otomatis tidak terganggu');
  assert.equal(getReportScore(scope,tetapOtomatis,ids[0]).updatedAt,sebelumOtomatis.updatedAt,
    'yang sudah otomatis tidak ditulis ulang');
  for(const siswaLain of ids.slice(1))
    assert.equal(getReportScore(scope,diOverride[0],siswaLain).isManualOverride,false,
      'siswa lain tidak tersentuh');
});

test('TEST 8. Batalkan seluruh siswa dan seluruh mapel pada scope aktif',()=>{
  const {scope,ids,otomatis}=siapkanOverride();
  for(const id of MAPEL)for(const studentId of ids)saveManualReportScore(scope,id,studentId,OVERRIDE);
  const hasil=cancelManualReportOverrides(scope,{});
  assert.equal(hasil.clearedCount,MAPEL.length*ids.length,'seluruh kombinasi diproses');
  for(const id of MAPEL)for(const studentId of ids){
    const record=getReportScore(scope,id,studentId);
    assert.equal(record.isManualOverride,false,`${id}/${studentId} kembali otomatis`);
    assert.equal(record.finalScore,otomatis,`${id}/${studentId} memakai nilai terbaru`);
  }
});

/* ==================================================== TEST 9-11: ISOLASI SCOPE */

test('TEST 9. Rombel lain tidak berubah',()=>{
  useMemoryStorage();
  const a=siapkan({classId:'5A'});const b=siapkan({classId:'5B'});
  for(const scope of [a.scope,b.scope]){
    for(const id of MAPEL)aturMapel(scope,id,{});
    for(const id of MAPEL)isiManual(scope,id,pemilik(scope,id));
    for(const id of MAPEL)saveAutomaticReportScores(scope,id);
    for(const id of MAPEL)saveManualReportScore(scope,id,pemilik(scope,id)[0],OVERRIDE);
  }
  cancelManualReportOverrides(a.scope,{});
  assert.equal(getReportScore(a.scope,'mtk',pemilik(a.scope,'mtk')[0]).isManualOverride,false);
  assert.equal(getReportScore(b.scope,'mtk',pemilik(b.scope,'mtk')[0]).finalScore,OVERRIDE,
    'rombel lain tetap override');
});

test('TEST 10. Semester lain tidak berubah',()=>{
  useMemoryStorage();
  const ganjil=siapkan({classId:'5A',semester:`Ganjil ${ACADEMIC_YEAR}`});
  const genap=guru('5A',`Genap ${ACADEMIC_YEAR}`);
  siapkanScopeLain(genap);
  for(const scope of [ganjil.scope,genap]){
    for(const id of MAPEL)aturMapel(scope,id,{});
    isiManual(scope,'mtk',pemilik(scope,'mtk'));
    saveAutomaticReportScores(scope,'mtk');
    saveManualReportScore(scope,'mtk',pemilik(scope,'mtk')[0],OVERRIDE);
  }
  cancelManualReportOverrides(ganjil.scope,{});
  assert.equal(getReportScore(ganjil.scope,'mtk',pemilik(ganjil.scope,'mtk')[0]).isManualOverride,false);
  assert.equal(getReportScore(genap,'mtk',pemilik(genap,'mtk')[0]).finalScore,OVERRIDE,
    'semester lain tetap override');
});

test('TEST 11. Tahun pelajaran lain tidak berubah',()=>{
  useMemoryStorage();
  const sekarang=siapkan({classId:'5A'});
  const lama={role:'teacher',classId:'5A',academicYear:'2019/2020',semester:'Ganjil 2019/2020'};
  siapkanScopeLain(lama);
  for(const scope of [sekarang.scope,lama]){
    for(const id of MAPEL)aturMapel(scope,id,{});
    isiManual(scope,'mtk',pemilik(scope,'mtk'));
    saveAutomaticReportScores(scope,'mtk');
    saveManualReportScore(scope,'mtk',pemilik(scope,'mtk')[0],OVERRIDE);
  }
  cancelManualReportOverrides(sekarang.scope,{});
  assert.equal(getReportScore(sekarang.scope,'mtk',pemilik(sekarang.scope,'mtk')[0]).isManualOverride,false);
  assert.equal(getReportScore(lama,'mtk',pemilik(lama,'mtk')[0]).finalScore,OVERRIDE,
    'tahun pelajaran lain tetap override');
});

/* ======================================= TEST 12-14: KEDUA ASAL OVERRIDE DAPAT DIBATALKAN */

test('TEST 12. Override bersumber MANUAL dapat dibatalkan',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride({sumber:'MANUAL'});
  assert.equal(getReportScore(scope,subjectId,ids[0]).calculationMethod,'MANUAL');
  cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,otomatis);
});

test('TEST 13. Override bersumber IMPORT_MANUAL dapat dibatalkan',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride({sumber:'IMPORT_MANUAL'});
  for(const id of ids)assert.equal(getReportScore(scope,subjectId,id).calculationMethod,'IMPORT_MANUAL');
  const hasil=cancelManualReportOverrides(scope,{subjectId});
  assert.equal(hasil.clearedCount,ids.length);
  for(const id of ids){
    assert.equal(getReportScore(scope,subjectId,id).isManualOverride,false);
    assert.equal(getReportScore(scope,subjectId,id).finalScore,otomatis);
  }
});

test('TEST 14. Bulk reset tidak merusak catatan yang memang sudah otomatis',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  const mapelOtomatis=MAPEL.filter(id=>id!==subjectId);
  const sebelum=mapelOtomatis.map(id=>ids.map(studentId=>getReportScore(scope,id,studentId)));
  cancelManualReportOverrides(scope,{});
  mapelOtomatis.forEach((id,i)=>ids.forEach((studentId,j)=>{
    const sesudah=getReportScore(scope,id,studentId);
    assert.equal(sesudah.finalScore,sebelum[i][j].finalScore,`${id} nilai tetap`);
    assert.equal(sesudah.createdAt,sebelum[i][j].createdAt,`${id} tidak ditulis ulang`);
    assert.equal(sesudah.updatedAt,sebelum[i][j].updatedAt,`${id} tidak ditulis ulang`);
  }));
});

/* ============================ TEST 15-18: DATA LAIN TIDAK BOLEH IKUT BERUBAH */

test('TEST 15. Nilai penilaian tidak berubah',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  const sebelum=KOMPONEN.map(type=>getAssessmentSheet(scope,subjectId,type).rows.map(row=>row.score));
  cancelManualReportOverrides(scope,{});
  const sesudah=KOMPONEN.map(type=>getAssessmentSheet(scope,subjectId,type).rows.map(row=>row.score));
  assert.deepEqual(sesudah,sebelum,'assessmentScores utuh');
  assert.ok(ids.length);
});

test('TEST 16. Data absensi tidak berubah',()=>{
  const {scope}=siapkanOverride({absensi:true});
  const kunci=db=>Object.keys(db.attendance||{}).sort();
  const sebelum=kunci(loadDb());
  const isiSebelum=JSON.stringify(loadDb().attendance);
  cancelManualReportOverrides(scope,{});
  assert.deepEqual(kunci(loadDb()),sebelum);
  assert.equal(JSON.stringify(loadDb().attendance),isiSebelum,'absensi utuh');
});

test('TEST 17. Bobot penilaian tidak berubah',()=>{
  const {scope}=siapkanOverride();
  const sebelum=MAPEL.map(id=>KOMPONEN.map(type=>getAssessmentSettings(scope,id)[type]));
  cancelManualReportOverrides(scope,{});
  assert.deepEqual(MAPEL.map(id=>KOMPONEN.map(type=>getAssessmentSettings(scope,id)[type])),sebelum);
});

test('TEST 18. KKTP dan rubrik tidak berubah',()=>{
  const {scope}=siapkanOverride();
  const sebelum=MAPEL.map(id=>({kktp:getAssessmentSettings(scope,id).kktp,
    rubrik:JSON.stringify(getAssessmentSettings(scope,id).rubric)}));
  cancelManualReportOverrides(scope,{});
  assert.deepEqual(MAPEL.map(id=>({kktp:getAssessmentSettings(scope,id).kktp,
    rubrik:JSON.stringify(getAssessmentSettings(scope,id).rubric)})),sebelum);
});

/* ======================= TEST 19-22: EMPAT KOMBINASI MESIN NILAI SESUDAH PEMBATALAN */

for(const [nomor,useWeights,absensi] of [[19,true,false],[20,false,false],[21,true,true],[22,false,true]]){
  test(`TEST ${nomor}. Sesudah pembatalan, Bobot ${useWeights?'ON':'OFF'} + Absensi ${absensi?'ON':'OFF'} dihitung benar`,()=>{
    const {scope,ids,subjectId}=siapkanOverride({useWeights,absensi});
    const mentah=absensi?{...NILAI,daily:NILAI_KEHADIRAN}:NILAI;
    const harap=bulatkan(harapanMentah(mentah,{useWeights}));
    cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
    const record=getReportScore(scope,subjectId,ids[0]);
    assert.equal(record.finalScore,harap,'Nilai Akhir mengikuti kombinasi toggle yang berlaku');
    assert.equal(record.useWeights,useWeights,'mode bobot terbawa ke catatan rapor');
    assert.equal(record.dailyFromAttendance,absensi,'sumber Harian terbawa ke catatan rapor');
    const harian=record.components.find(item=>item.id==='daily');
    assert.equal(harian.score,absensi?NILAI_KEHADIRAN:NILAI.daily);
  });
}

/* ================== TEST 23-27: JALUR LAMA TETAP BEKERJA (REGRESI v1.3.13/v1.3.14) */

test('TEST 23. Pembelajaran > Import Nilai tetap menimpa nilai lama pada SELURUH mapel',()=>{
  const {scope}=awal();
  const gagal=[];
  for(const id of MAPEL){
    aturMapel(scope,id,{});
    const ids=pemilik(scope,id);
    fillAllAssessmentScores(scope,id,80,{cpButirId:butirPertama(scope,id)});
    isiImportPenilaian(scope,id,ids);
    const butir=butirPertama(scope,id);
    for(const studentId of ids){
      const terlihat=getAssessmentSheet(scope,id,'formative',butir?{cpButirId:butir}:{}).rows
        .find(row=>row.studentId===studentId)?.score;
      if(terlihat!==NILAI.formative)gagal.push(`${id}/${studentId}: ${terlihat}`);
    }
  }
  assert.deepEqual(gagal,[],gagal.join('\n'));
});

test('TEST 24. Isi Semua Nilai tetap bekerja',()=>{
  const {scope}=awal();
  aturMapel(scope,'mtk',{});
  fillAllAssessmentScores(scope,'mtk',77,{cpButirId:butirPertama(scope,'mtk')});
  for(const type of KOMPONEN)for(const row of getAssessmentSheet(scope,'mtk',type).rows)
    assert.equal(row.score,77,`komponen ${type}`);
});

test('TEST 25. Input Manual Penilaian tetap bekerja',()=>{
  const {scope}=awal();
  aturMapel(scope,'bindo',{});
  const ids=pemilik(scope,'bindo');
  isiManual(scope,'bindo',ids);
  for(const type of KOMPONEN)
    assert.equal(getAssessmentSheet(scope,'bindo',type).rows.find(row=>row.studentId===ids[0]).score,
      NILAI[type],`komponen ${type}`);
});

test('TEST 26. Rapor > Import Nilai Rapor tetap menghasilkan override',()=>{
  const {scope,ids,subjectId}=siapkanOverride({sumber:'IMPORT_MANUAL'});
  const record=getReportScore(scope,subjectId,ids[0]);
  assert.equal(record.isManualOverride,true);
  assert.equal(record.finalScore,OVERRIDE);
  assert.equal(record.calculationMethod,'IMPORT_MANUAL');
});

test('TEST 27. Input Manual Rapor tetap menghasilkan override',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  const hasil=saveManualReportScoresBulk(scope,[{subjectId,studentId:ids[1],value:64}]);
  assert.equal(hasil.saved,1);
  const record=getReportScore(scope,subjectId,ids[1]);
  assert.equal(record.isManualOverride,true);
  assert.equal(record.finalScore,64);
  assert.equal(record.calculationMethod,'MANUAL');
});

/* ================================ TEST 28-29: PENJAGAAN DAN LAPORAN YANG JUJUR */

test('TEST 28. Simpan Otomatis tetap mempertahankan override yang belum dibatalkan',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  for(let kali=0;kali<3;kali+=1){
    saveAutomaticReportScores(scope,subjectId);
    saveAllAutomaticReports(scope);
  }
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,OVERRIDE,'tetap dijaga');
  assert.equal(getReportScore(scope,subjectId,ids[0]).isManualOverride,true);
});

test('TEST 29. Hitungan tersimpan dan dilewati dilaporkan terpisah',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  const saved=saveAutomaticReportScores(scope,subjectId);
  const otomatis=saved.filter(item=>!item.isManualOverride).length;
  const dilewati=saved.filter(item=>item.isManualOverride).length;
  assert.equal(dilewati,1,'satu override dilewati');
  assert.equal(otomatis,ids.length-1,'sisanya benar-benar ditulis');
  /* Jalur Semua Mapel melaporkannya sebagai angka tersendiri, bukan diakui sebagai tersimpan. */
  const bulk=saveAllAutomaticReports(scope);
  assert.equal(bulk.manualKeptCount,1,'override dihitung sebagai dipertahankan');
  assert.equal(bulk.scoreCount,MAPEL.length*ids.length-1,'yang diakui tersimpan hanya yang otomatis');
});

/* ======================= TEST 30-32: PEMBACAAN RAPOR, CETAK, DAN KEUTUHAN CATATAN */

test('TEST 30. Nilai Rapor membaca nilai otomatis terbaru sesudah pembatalan',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride();
  const bacaLayar=()=>visibleStoredReportRows(getStoredReportRows(scope))
    .find(row=>row.subject.id===subjectId&&row.student.id===ids[0])?.score?.finalScore;
  assert.equal(bacaLayar(),OVERRIDE,'sebelum dibatalkan masih angka override');
  cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(bacaLayar(),otomatis,'sesudah dibatalkan memakai nilai otomatis terbaru');
});

test('TEST 31. Cetak Rapor dan Leger membaca nilai yang sama dengan layar',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride();
  const dariCetak=()=>getReportDocument(scope,ids[0]).subjects
    .find(item=>item.subject.id===subjectId)?.score;
  const dariLeger=()=>getLeger(scope).students.find(row=>row.student.id===ids[0])
    ?.scores.find(item=>item.subject.id===subjectId)?.score;
  assert.equal(dariCetak(),OVERRIDE,'sebelum dibatalkan');
  cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(dariCetak(),otomatis,'cetak mengikuti nilai otomatis terbaru');
  assert.equal(dariLeger(),otomatis,'leger pun sama');
});

test('TEST 32. Tidak ada catatan rapor ganda sesudah pembatalan berulang',()=>{
  const {scope,subjectId}=siapkanOverride();
  const hitung=()=>Object.keys(loadDb().reportScores).length;
  const awalJumlah=hitung();
  for(let kali=0;kali<3;kali+=1)cancelManualReportOverrides(scope,{});
  assert.equal(hitung(),awalJumlah,'jumlah catatan tetap - upsert, bukan duplikat');
  const prefix=`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5A|${subjectId}|`;
  const milikMapel=Object.keys(loadDb().reportScores).filter(key=>key.startsWith(prefix));
  assert.equal(new Set(milikMapel).size,milikMapel.length,'kunci unik');
});

/* ===================================== MATRIX: SELURUH MAPEL (§P) */

test('MATRIX. 80 override -> batalkan -> nilai otomatis terbaru, untuk SELURUH mapel',()=>{
  for(const [useWeights,absensi] of [[true,false],[false,false],[true,true],[false,true]]){
    const {scope}=awal();
    for(const id of MAPEL)aturMapel(scope,id,{useWeights});
    if(absensi){aturKehadiran(scope);for(const id of MAPEL)saveDailyAttendanceMode(scope,id,true);}
    for(const id of MAPEL)isiManual(scope,id,pemilik(scope,id));
    for(const id of MAPEL)saveAutomaticReportScores(scope,id);
    /* Separuh mapel di-override lewat Input Manual, separuh lewat Import Nilai Rapor, supaya
       kedua asal ikut teruji pada seluruh daftar mapel. */
    MAPEL.forEach((id,index)=>{
      const ids=pemilik(scope,id);
      if(index%2===0)for(const studentId of ids)saveManualReportScore(scope,id,studentId,OVERRIDE);
      else importNilaiRapor(scope,id,ids,OVERRIDE);
    });
    const harap=bulatkan(harapanMentah(absensi?{...NILAI,daily:NILAI_KEHADIRAN}:NILAI,{useWeights}));
    assert.notEqual(harap,OVERRIDE,'contoh uji memang membedakan override dan hasil hitung');
    const sebelum=[];
    for(const id of MAPEL)for(const studentId of pemilik(scope,id))
      if(getReportScore(scope,id,studentId).finalScore!==OVERRIDE)sebelum.push(`${id}/${studentId}`);
    assert.deepEqual(sebelum,[],'seluruh mapel memang ter-override lebih dulu');
    cancelManualReportOverrides(scope,{});
    const gagal=[];
    for(const id of MAPEL)for(const studentId of pemilik(scope,id)){
      const record=getReportScore(scope,id,studentId);
      if(record.finalScore!==harap)gagal.push(`${id}/${studentId}: ${record.finalScore} bukan ${harap}`);
      if(record.isManualOverride!==false)gagal.push(`${id}/${studentId}: masih override`);
    }
    assert.deepEqual(gagal,[],`bobot ${useWeights} absensi ${absensi}:\n${gagal.join('\n')}`);
  }
});

/* ========================================= PERSISTENCE SESUDAH RELOAD (§S) */

test('PERSISTENCE. Hasil pembatalan bertahan sesudah database dimuat ulang',()=>{
  const {scope,ids,subjectId,otomatis}=siapkanOverride();
  cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  const tersimpan=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');
  invalidateDbCache();
  const values=new Map([['erapor_satria_jaya_01_v1',tersimpan]]);
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
  const record=getReportScore(scope,subjectId,ids[0]);
  assert.equal(record.finalScore,otomatis,'nilai otomatis tetap tersimpan');
  assert.equal(record.isManualOverride,false,'statusnya tetap otomatis');
  assert.equal(visibleStoredReportRows(getStoredReportRows(scope))
    .find(row=>row.subject.id===subjectId&&row.student.id===ids[0]).score.finalScore,otomatis,
  'Nilai Rapor membacanya');
  assert.equal(getReportDocument(scope,ids[0]).subjects.find(item=>item.subject.id===subjectId).score,
    otomatis,'Cetak Rapor membacanya');
});

/* ================================================= KOMPATIBILITAS DATA LAMA (§W) */

test('KOMPATIBILITAS. Override lama tetap menjadi override sampai guru membatalkannya',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  /* Memuat ulang database tidak boleh diam-diam mereset override milik sekolah. */
  invalidateDbCache();
  assert.equal(getReportScore(scope,subjectId,ids[0]).isManualOverride,true);
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,OVERRIDE);
  /* Layanan tingkat bawah pun hanya bekerja ketika dipanggil. */
  const hasil=clearManualReportOverrides(scope,{subjectId,studentId:ids[0]});
  assert.equal(hasil.clearedCount,1);
  assert.deepEqual(hasil.scope,{academicYear:scope.academicYear,semester:scope.semester,classId:scope.classId});
});

test('KOMPATIBILITAS. Membatalkan ketika tidak ada override sama sekali tidak mengubah apa pun',()=>{
  const {scope}=awal();
  for(const id of MAPEL)aturMapel(scope,id,{});
  isiManual(scope,'mtk',pemilik(scope,'mtk'));
  saveAutomaticReportScores(scope,'mtk');
  const sebelum=JSON.stringify(loadDb().reportScores);
  const hasil=cancelManualReportOverrides(scope,{});
  assert.equal(hasil.clearedCount,0);
  assert.equal(JSON.stringify(loadDb().reportScores),sebelum,'tidak satu catatan pun ditulis ulang');
});

/* ============================================ DESKRIPSI RAPOR IKUT SELARAS (§I) */

test('DESKRIPSI. Deskripsi rapor diselaraskan memakai generator existing, tulisan guru dijaga',()=>{
  const {scope,ids,subjectId}=siapkanOverride();
  const hasil=cancelManualReportOverrides(scope,{subjectId});
  assert.ok(Array.isArray(hasil.descriptionErrors),'kegagalan deskripsi dilaporkan, bukan disembunyikan');
  const deskripsi=loadDb().reportDescriptions;
  const kunci=`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5A|${subjectId}|${ids[0]}`;
  if(hasil.descriptionCount)assert.ok(deskripsi[kunci]?.text,'deskripsi tersusun untuk siswa yang bernilai');
  /* Deskripsi yang dikunci guru tidak boleh tertimpa pembatalan berikutnya. */
  if(deskripsi[kunci]){
    const db=loadDb();
    db.reportDescriptions[kunci]={...db.reportDescriptions[kunci],text:'Kalimat guru sendiri.',locked:true,status:'LOCKED'};
    globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
    invalidateDbCache();
    saveManualReportScore(scope,subjectId,ids[0],OVERRIDE);
    cancelManualReportOverrides(scope,{subjectId,studentId:ids[0]});
    assert.equal(loadDb().reportDescriptions[kunci].text,'Kalimat guru sendiri.','tulisan guru dipertahankan');
  }
});
