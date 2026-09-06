import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentScores,
  saveAssessmentSettings } from '../src/services/assessment.js';
import { saveAttendance } from '../src/services/attendance.js';
import { calculateReportScore, dailyEffectiveSheet, getDailyAttendanceMode,
  saveAttendanceConversion, saveDailyAttendanceMode } from '../src/services/report.js';
import { buktiButirSiswa } from '../src/services/cp-attainment.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* NILAI HARIAN YANG SEDANG BERLAKU.

   Perhitungan Nilai Akhir sudah lama memilih sumber slot Harian dengan benar. Yang menjadi
   masalah adalah LAYAR: angka manual berdiri di kolom utama walaupun yang dipakai aplikasi
   adalah angka kehadiran, sehingga guru membaca 90 padahal Nilai Akhir memakai 78 dan
   menyimpulkan togglenya tidak bekerja.

   Berkas ini menguji nilai yang BERLAKU sebagai satu hal yang dapat dinyatakan aplikasi -
   bukan sesuatu yang hanya ada di dalam HTML - sekaligus menjaga dua batas lama: nilai manual
   tidak pernah hilang, dan komponen Nilai Akhir tidak pernah menjadi enam.

   Angka contoh mengikuti brief: manual 90, kehadiran 78. */

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),
    clear:()=>values.clear()};
  globalThis.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{}};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,
  semester:`Ganjil ${ACADEMIC_YEAR}`});

/* Kehadiran dibuat dari absensi harian sungguhan supaya angkanya lahir dari data, bukan
   ditanam: dari 50 hari, 39 hadir dan 11 alpa dengan konversi Hadir 100 menghasilkan 78. */
function aturKehadiran(sesi,siswa,{hadir=39,total=50}={}){
  saveAttendanceConversion(sesi,{Hadir:100,Sakit:0,Izin:0,Alpa:0});
  const tahun=ACADEMIC_YEAR.slice(0,4);
  for(let hari=0;hari<total;hari+=1){
    const tanggal=new Date(Date.UTC(Number(tahun),7,1+hari)).toISOString().slice(0,10);
    saveAttendance(sesi,tanggal,{[siswa.id]:hari<hadir?'Hadir':'Alpa'});
  }
}
function siapkan(){
  useMemoryStorage();
  const sesi=guru('5B');
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:item.id==='mtk',order:index+1})));
  const siswa=createStudent(sesi,{classId:'5B',nis:'5B-E1',nisn:'8899000001',
    name:'Siswa Efektif',gender:'P',photo:''});
  saveAssessmentSettings(sesi,'mtk',{formative:20,daily:20,practice:20,
    scopeSummative:20,semesterSummative:20,kktp:75});
  const nilai={formative:80,daily:90,practice:85,scopeSummative:82,semesterSummative:88};
  for(const jenis of ASSESSMENT_TYPES)
    saveAssessmentScores(sesi,'mtk',jenis.id,{[siswa.id]:nilai[jenis.id]});
  aturKehadiran(sesi,siswa);
  return {sesi,siswa};
}
const berlaku=(sesi,siswa)=>dailyEffectiveSheet(sesi,'mtk').rows
  .find(row=>row.studentId===siswa.id);
const harianTersimpan=(sesi,siswa)=>getAssessmentSheet(sesi,'mtk','daily').rows
  .find(row=>row.studentId===siswa.id).score;
const slotHarian=(sesi,siswa)=>calculateReportScore(sesi,'mtk',siswa.id)
  .components.find(item=>item.id==='daily');

test('0. Persiapan menghasilkan manual 90 dan Nilai Kehadiran 78',()=>{
  const {sesi,siswa}=siapkan();
  assert.equal(harianTersimpan(sesi,siswa),90);
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(berlaku(sesi,siswa).attendanceScore,78,'39 hadir dari 50 hari menghasilkan 78');
});

test('1. Toggle OFF memakai Nilai Harian manual',()=>{
  const {sesi,siswa}=siapkan();
  assert.equal(slotHarian(sesi,siswa).score,90);
  assert.equal(slotHarian(sesi,siswa).source,'manual');
});

test('2. Toggle ON memakai nilai Kehadiran',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(slotHarian(sesi,siswa).score,78);
  assert.equal(slotHarian(sesi,siswa).source,'attendance');
});

test('3. Angka yang dinyatakan berlaku saat ON adalah nilai Kehadiran, bukan manual',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  const baris=berlaku(sesi,siswa);
  assert.equal(baris.score,78,'inilah angka yang ditonjolkan halaman Penilaian');
  assert.equal(baris.source,'attendance');
  assert.notEqual(baris.score,90,'angka manual tidak boleh tampil sebagai nilai berlaku');
  assert.equal(dailyEffectiveSheet(sesi,'mtk').fromAttendance,true);
});

test('4. Angka yang dinyatakan berlaku saat OFF adalah nilai manual',()=>{
  const {sesi,siswa}=siapkan();
  const baris=berlaku(sesi,siswa);
  assert.equal(baris.score,90);
  assert.equal(baris.source,'manual');
  assert.equal(dailyEffectiveSheet(sesi,'mtk').fromAttendance,false);
});

test('5. Nilai manual tidak terhapus ketika toggle ON',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(harianTersimpan(sesi,siswa),90,'masih ada di penyimpanan nilai');
  assert.equal(berlaku(sesi,siswa).manualScore,90,'dan tetap dibawa sebagai keterangan');
});

test('6. ON lalu OFF mengembalikan nilai manual tanpa input ulang',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(berlaku(sesi,siswa).score,78);
  saveDailyAttendanceMode(sesi,'mtk',false);
  assert.equal(berlaku(sesi,siswa).score,90);
  assert.equal(slotHarian(sesi,siswa).score,90);
});

test('7. OFF lalu ON kembali memakai nilai Kehadiran',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',false);
  assert.equal(berlaku(sesi,siswa).score,90);
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(berlaku(sesi,siswa).score,78);
});

test('8. Perubahan Absensi mengubah nilai Harian yang berlaku',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(berlaku(sesi,siswa).score,78);
  /* Satu hari alpa diperbaiki menjadi hadir: 40 dari 50 hari menjadi 80. */
  const tahun=ACADEMIC_YEAR.slice(0,4);
  const tanggal=new Date(Date.UTC(Number(tahun),7,1+39)).toISOString().slice(0,10);
  saveAttendance(sesi,tanggal,{[siswa.id]:'Hadir'});
  assert.equal(berlaku(sesi,siswa).score,80,'nilai berlaku mengikuti Absensi terbaru');
  assert.equal(slotHarian(sesi,siswa).score,80,'dan Nilai Akhir ikut memakainya');
});

test('9. Perubahan Absensi tidak mengubah nilai manual tersimpan',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  const tahun=ACADEMIC_YEAR.slice(0,4);
  const tanggal=new Date(Date.UTC(Number(tahun),7,1+39)).toISOString().slice(0,10);
  saveAttendance(sesi,tanggal,{[siswa.id]:'Hadir'});
  assert.equal(harianTersimpan(sesi,siswa),90,'angka kehadiran tidak pernah disalin ke sini');
  assert.equal(berlaku(sesi,siswa).manualScore,90);
  saveDailyAttendanceMode(sesi,'mtk',false);
  assert.equal(berlaku(sesi,siswa).score,90,'sehingga OFF tetap mengembalikan 90, bukan 80');
});

test('10. Tetap lima komponen pada kedua keadaan toggle',()=>{
  const {sesi,siswa}=siapkan();
  for(const keadaan of [false,true,false,true]){
    saveDailyAttendanceMode(sesi,'mtk',keadaan);
    const hasil=calculateReportScore(sesi,'mtk',siswa.id);
    assert.equal(hasil.componentCount,5);
    assert.equal(hasil.components.length,5);
    assert.deepEqual(hasil.components.map(item=>item.id),
      ['formative','daily','practice','scopeSummative','semesterSummative']);
    assert.equal(hasil.components.filter(item=>item.source==='attendance').length,keadaan?1:0,
      'kehadiran tidak pernah menjadi komponen keenam');
  }
});

test('11. Bobot tidak dihitung dua kali ketika sumbernya kehadiran',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  const hasil=calculateReportScore(sesi,'mtk',siswa.id);
  assert.equal(hasil.weightTotal,100,'penyebutnya tetap jumlah bobot lima komponen');
  const bobot=hasil.components.map(item=>item.weight);
  assert.deepEqual(bobot,[20,20,20,20,20]);
  assert.equal(bobot.reduce((sum,value)=>sum+value,0),hasil.weightTotal);
});

test('12. Nilai Akhir mengikuti sumber yang sedang berlaku',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',false);
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).finalScore,85,
    '(80+90+85+82+88)/5 = 85');
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).finalScore,83,
    '(80+78+85+82+88)/5 = 82,6 dibulatkan 83');
});

test('13. Data existing tanpa penanda toggle dianggap OFF',()=>{
  const {sesi,siswa}=siapkan();
  assert.equal(getDailyAttendanceMode(sesi,'mtk'),false);
  assert.equal(berlaku(sesi,siswa).source,'manual');
  assert.equal(berlaku(sesi,siswa).score,90);
});

test('14. Nilai legacy tetap aman: toggle tidak menyentuh satu pun catatan nilai',()=>{
  const {sesi,siswa}=siapkan();
  const sebelum=JSON.stringify(loadDb().assessmentScores);
  for(const keadaan of [true,false,true,false])saveDailyAttendanceMode(sesi,'mtk',keadaan);
  assert.equal(JSON.stringify(loadDb().assessmentScores),sebelum,
    'menyalakan dan mematikan toggle tidak menulis apa pun ke nilai');
});

test('15. Kehadiran tidak pernah menjadi bukti Butir CP',()=>{
  const {sesi,siswa}=siapkan();
  const butir=listCpButir(sesi,'mtk',{activeOnly:true})[0];
  saveAssessmentScores(sesi,'mtk','daily',{[siswa.id]:90},{cpButirId:butir.id});
  const sebelum=JSON.stringify(loadDb().cpEvidenceScores);
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(JSON.stringify(loadDb().cpEvidenceScores),sebelum,
    'menyalakan toggle tidak membuat, mengubah, maupun menghapus bukti kompetensi');
  const bukti=buktiButirSiswa(sesi,'mtk',siswa.id).get(butir.id);
  assert.deepEqual(bukti.map(item=>item.score),[90],
    'bukti kompetensi tetap angka yang memang dinilai guru, bukan angka kehadiran');
});
