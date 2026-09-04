import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentScores,
  saveAssessmentSettings } from '../src/services/assessment.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { saveAttendance, saveManualAttendance } from '../src/services/attendance.js';
import { attendanceDerivedSheet, calculateReportScore, getAttendanceConversion,
  getDailyAttendanceMode, saveAttendanceConversion,
  saveDailyAttendanceMode } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';

/* NILAI HARIAN vs NILAI KEHADIRAN.

   Yang berpindah karena toggle bukanlah tempat penyimpanan nilainya, melainkan SUMBER yang
   dipakai ketika menghitung Nilai Akhir.

   Nilai Harian manual selalu ditulis dan selalu tersimpan - juga ketika toggle sedang ON.
   Selama ON, slot Harian pada perhitungan diisi Nilai Kehadiran; begitu OFF, nilai manual yang
   sudah ada langsung terpakai lagi tanpa guru diminta mengisinya ulang. Komponennya tetap LIMA
   pada kedua keadaan, tidak pernah menjadi enam.

   Angka contoh mengikuti brief: Formatif 80, Harian 90, Praktik 85, SLM 82, Sumatif Akhir 88,
   dan Nilai Kehadiran 70. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkanMapel(session,ids=['mtk']){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
}
function tambahSiswa(session,index=1){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-H${index}`,
    nisn:`7788${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:'P',photo:''});
}

/* Menyiapkan satu murid dengan kelima komponen terisi sesuai angka contoh brief, dan kehadiran
   yang dikonversi menjadi TEPAT 70.

   Kehadirannya dibuat dari absensi harian sungguhan - 10 hari, 7 hadir dan 3 sakit - dengan
   konversi Hadir 100 dan Sakit 0, sehingga rata-ratanya persis 70. Rekap manual sengaja tidak
   dipakai di sini karena ia hanya mencatat Sakit/Izin/Alpa dan tidak menyatakan berapa hari
   murid hadir; angkanya karena itu tidak dapat menghasilkan 70 tanpa hari hadir. */
function siapkan(){
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk']);
  const siswa=tambahSiswa(sesi);
  saveAssessmentSettings(sesi,'mtk',{formative:20,daily:20,practice:20,
    scopeSummative:20,semesterSummative:20,kktp:75});
  const nilai={formative:80,daily:90,practice:85,scopeSummative:82,semesterSummative:88};
  for(const jenis of ASSESSMENT_TYPES)
    saveAssessmentScores(sesi,'mtk',jenis.id,{[siswa.id]:nilai[jenis.id]});
  saveAttendanceConversion(sesi,{Hadir:100,Sakit:0,Izin:0,Alpa:0});
  const tahun=ACADEMIC_YEAR.slice(0,4);
  for(let hari=1;hari<=10;hari+=1)
    saveAttendance(sesi,`${tahun}-08-${String(hari).padStart(2,'0')}`,
      {[siswa.id]:hari<=7?'Hadir':'Sakit'});
  return {sesi,siswa,nilai};
}

const nilaiKehadiran=(sesi,siswa)=>
  attendanceDerivedSheet(sesi,'mtk').rows.find(row=>row.studentId===siswa.id).score;

test('0. Persiapan menghasilkan Nilai Kehadiran tepat 70 sesuai angka contoh brief',()=>{
  const {sesi,siswa}=siapkan();
  const konversi=getAttendanceConversion(sesi);
  assert.equal(konversi.Hadir,100);assert.equal(konversi.Sakit,0);
  assert.equal(nilaiKehadiran(sesi,siswa),70,'7 hadir dan 3 sakit dari 10 hari menghasilkan 70');
});

/* ------------------------------------------------------------------ §F.1, §F.2, §F.8, §F.9 */

test('1-2. Isi Semua tetap mengisi Nilai Harian ketika toggle ON, dan nilainya tersimpan',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  assert.equal(getDailyAttendanceMode(sesi,'mtk'),true);

  const hasil=fillAllAssessmentScores(sesi,'mtk',77);
  assert.equal(hasil.savedTypes.length,5,'kelima komponen diisi');
  assert.ok(hasil.savedTypes.includes('daily'),'Penilaian Harian termasuk yang diisi');
  assert.deepEqual(hasil.skippedTypes,[],'tidak ada komponen yang dilewati');
  assert.equal(hasil.dailyFromAttendance,true,'toggle memang sedang aktif');

  /* Datanya benar-benar ada di lembar Penilaian Harian, bukan sekadar dilaporkan tersimpan. */
  const harian=getAssessmentSheet(sesi,'mtk','daily').rows.find(row=>row.studentId===siswa.id);
  assert.equal(harian.score,77,'Nilai Harian tersimpan walau toggle ON');
  assert.equal(harian.saved,true);
});

test('9. Nilai Kehadiran tidak pernah menimpa Nilai Harian yang tersimpan',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  /* Kehadiran berubah drastis, tetapi lembar Penilaian Harian tidak ikut berubah. */
  saveManualAttendance(sesi,siswa.id,{Sakit:9,Izin:0,Alpa:0});
  assert.notEqual(nilaiKehadiran(sesi,siswa),70,'Nilai Kehadiran memang berubah');
  assert.equal(getAssessmentSheet(sesi,'mtk','daily').rows.find(row=>row.studentId===siswa.id).score,90,
    'Nilai Harian 90 tetap utuh');
});

/* ----------------------------------------------------------------- §F.3, §F.4 TOGGLE ON */

test('3-4. Toggle ON memakai Nilai Kehadiran pada slot Harian, tetap lima komponen',()=>{
  const {sesi,siswa}=siapkan();
  saveDailyAttendanceMode(sesi,'mtk',true);
  const hasil=calculateReportScore(sesi,'mtk',siswa.id);

  assert.equal(hasil.components.length,5,'LIMA komponen efektif, bukan enam');
  assert.deepEqual(hasil.components.map(item=>item.id),
    ['formative','daily','practice','scopeSummative','semesterSummative']);
  assert.equal(hasil.dailyFromAttendance,true);

  const harian=hasil.components.find(item=>item.id==='daily');
  assert.equal(harian.source,'attendance','slot Harian diisi dari kehadiran');
  assert.equal(harian.score,70,'angkanya persis Nilai Kehadiran, yaitu 70');
  assert.notEqual(harian.score,90,'Nilai Harian manual 90 TIDAK dipakai selama ON');

  /* Tidak ada komponen kehadiran tambahan di luar kelima slot itu. */
  assert.equal(hasil.components.filter(item=>item.source==='attendance').length,1);
});

/* ---------------------------------------------------------------- §F.5, §F.6 TOGGLE OFF */

test('5-6. Toggle OFF memakai Nilai Harian manual, tanpa guru mengisi ulang',()=>{
  const {sesi,siswa}=siapkan();
  /* Guru sempat memakai Isi Semua ketika toggle ON. */
  saveDailyAttendanceMode(sesi,'mtk',true);
  fillAllAssessmentScores(sesi,'mtk',90);
  const saatOn=calculateReportScore(sesi,'mtk',siswa.id);
  assert.equal(saatOn.components.find(item=>item.id==='daily').source,'attendance');

  /* Toggle dimatikan. Tanpa satu pun input baru, slot Harian langsung memakai nilai tersimpan. */
  saveDailyAttendanceMode(sesi,'mtk',false);
  const saatOff=calculateReportScore(sesi,'mtk',siswa.id);
  const harian=saatOff.components.find(item=>item.id==='daily');
  assert.equal(harian.source,'manual');
  assert.equal(harian.score,90,'nilai lama langsung terpakai, tanpa input ulang');
  assert.equal(saatOff.components.length,5);
  assert.equal(saatOff.dailyFromAttendance,false);
});

test('7. Toggle OFF lalu ON langsung memakai Nilai Kehadiran',()=>{
  const {sesi,siswa}=siapkan();
  const off=calculateReportScore(sesi,'mtk',siswa.id);
  assert.equal(off.components.find(item=>item.id==='daily').score,90);

  saveDailyAttendanceMode(sesi,'mtk',true);
  const on=calculateReportScore(sesi,'mtk',siswa.id);
  assert.equal(on.components.find(item=>item.id==='daily').score,70);
  assert.notEqual(on.finalScore,off.finalScore,'sumber berbeda menghasilkan Nilai Akhir berbeda');
});

test('8. Berganti-ganti toggle tidak pernah menghapus Nilai Harian',()=>{
  const {sesi,siswa}=siapkan();
  const bacaHarian=()=>getAssessmentSheet(sesi,'mtk','daily').rows.find(row=>row.studentId===siswa.id).score;
  assert.equal(bacaHarian(),90);
  for(const keadaan of [true,false,true,false,true]){
    saveDailyAttendanceMode(sesi,'mtk',keadaan);
    assert.equal(bacaHarian(),90,`Nilai Harian utuh setelah toggle ${keadaan?'ON':'OFF'}`);
  }
  saveDailyAttendanceMode(sesi,'mtk',false);
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).components.find(item=>item.id==='daily').score,90);
});

/* --------------------------------------------------------------- §C CONTOH WAJIB BRIEF */

test('C. Contoh brief: ON memakai 80/70/85/82/88, OFF memakai 80/90/85/82/88',()=>{
  const {sesi,siswa}=siapkan();

  const angkaKomponen=()=>calculateReportScore(sesi,'mtk',siswa.id)
    .components.map(item=>item.score);

  /* OFF - kelima nilai manual apa adanya. */
  saveDailyAttendanceMode(sesi,'mtk',false);
  assert.deepEqual(angkaKomponen(),[80,90,85,82,88],'OFF memakai Nilai Harian 90');
  const nilaiOff=calculateReportScore(sesi,'mtk',siswa.id).finalScore;
  assert.equal(nilaiOff,85,'(80+90+85+82+88)/5 = 85');

  /* ON - slot Harian ditempati Nilai Kehadiran; empat lainnya tidak berubah. */
  saveDailyAttendanceMode(sesi,'mtk',true);
  /* Persis seperti contoh brief: 80, 70, 85, 82, 88. */
  assert.deepEqual(angkaKomponen(),[80,70,85,82,88],'slot Harian ditempati Nilai Kehadiran 70');
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).finalScore,81,'(80+70+85+82+88)/5 = 81');

  /* Dan Nilai Harian 90 tetap tersimpan selama ON. */
  assert.equal(getAssessmentSheet(sesi,'mtk','daily').rows.find(row=>row.studentId===siswa.id).score,90);
});

/* ------------------------------------------------------------- §F.10 KOMPATIBILITAS DATA */

test('10. Data existing tanpa penanda toggle tetap terbaca sebagai OFF',()=>{
  const {sesi,siswa}=siapkan();
  /* Mapel yang belum pernah menyentuh toggle sama sekali. */
  assert.equal(getDailyAttendanceMode(sesi,'mtk'),false,'bawaan adalah OFF');
  const hasil=calculateReportScore(sesi,'mtk',siswa.id);
  assert.equal(hasil.components.find(item=>item.id==='daily').source,'manual');
  assert.equal(hasil.components.length,5);
  assert.equal(hasil.finalScore,85);
});

/* ------------------------------------------------------------------- §D, §G ANTARMUKA */

test('D-G. Halaman Penilaian tetap menampilkan dan menerima Nilai Harian saat toggle ON',()=>{
  const halaman=read('src/pages/assessment.js');
  /* Kolom nilai tidak lagi dinonaktifkan ketika kehadiran aktif. */
  assert.equal(/attendanceMode\?'disabled':''/.test(halaman),false,
    'input Nilai Harian tidak pernah dimatikan oleh toggle');
  assert.equal(/saveButton\.disabled=!sheet\.rows\.length\|\|attendanceMode/.test(halaman),false,
    'tombol Simpan Nilai tetap hidup');
  /* Nilai kehadiran yang sedang dipakai ditampilkan berdampingan sebagai keterangan. */
  assert.match(halaman,/Nilai Kehadiran \(dipakai\)/);
  assert.match(halaman,/tetap dapat diisi dan tersimpan/);

  const layanan=read('src/services/assessment-bulk.js');
  assert.equal(/skippedTypes\.push/.test(layanan),false,'tidak ada komponen yang dilewati lagi');
  assert.match(layanan,/SELALU mengisi kelima komponen/);
});
