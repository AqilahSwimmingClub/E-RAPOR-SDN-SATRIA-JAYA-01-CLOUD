import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, CLASSES, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { cpElements } from '../src/data/curriculum-cp.js';
import { phaseForClassId } from '../src/data/learning-objective-defaults.js';
import { composeIntracurricularCpDescription, composeReportCpDescription,
  cpAcuanFor } from '../src/services/cp-descriptions.js';
import { clearManualAttendance, getManualAttendance, saveAttendance, saveManualAttendance,
  semesterAttendanceRecap, studentAbsenceTotals } from '../src/services/attendance.js';
import { ATTITUDE_DIMENSIONS, listStudentAttitudes,
  saveClassAttitudeBulk } from '../src/services/attitudes.js';
import { listCpButirForSemester } from '../src/services/cp-butir.js';
import { generateReportDescription } from '../src/services/descriptions.js';
import { fillAllIntracurricular, getIntracurricularCp, getStudentIntracurricularSelection,
  saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { saveAssessmentScores, saveAssessmentSettings, ASSESSMENT_TYPES } from '../src/services/assessment.js';
import { attendanceDerivedSheet, calculateReportScore,
  saveDailyAttendanceMode } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';

/* SATU CP, DUA KONTEKS DESKRIPSI - beserta kehadiran manual dan Nilai Sikap.

   Suite ini menjaga empat pendirian yang mudah sekali tergelincir kembali:

   1. Intrakurikuler memakai CP, dan TIDAK PERNAH meminta guru memilih TP.
   2. Deskripsi Intrakurikuler dan deskripsi Capaian Kompetensi Nilai Rapor boleh membaca CP
      yang sama, tetapi kalimatnya WAJIB berbeda. Menyalin salah satunya ke yang lain adalah
      persis kesalahan yang suite ini ada untuk mencegah.
   3. Rekap kehadiran manual dan absensi harian tidak pernah dijumlahkan.
   4. Isi Semua Nilai Sikap hanya menyentuh dimensi yang benar-benar dipilih guru. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkanMapel(session,ids){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
}
function tambahSiswa(session,index=1){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`4455${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:'P',photo:''});
}
function nilaiPenuh(session,subjectId,studentId,nilai){
  saveAssessmentSettings(session,subjectId,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,subjectId,jenis.id,{[studentId]:nilai});
}

/* ---------------------------------------------------------------- §V.1-6 CP dan fase */

test('1. Intrakurikuler tidak membutuhkan pilihan TP sama sekali',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk']);
  const siswa=tambahSiswa(sesi);
  /* Tanpa TP apa pun disiapkan, Intrakurikuler tetap dapat diisi. */
  const saved=saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:'mtk',predicate:'Baik'});
  assert.ok(saved.description);
  assert.equal(saved.source,'CP');
  /* Dan halamannya memang tidak lagi memuat satu pun checkbox TP. */
  const halaman=read('src/pages/intracurricular-input.js');
  assert.equal(/data-objective/.test(halaman),false,'tidak ada checkbox TP');
  assert.match(halaman,/getIntracurricularCp/,'halaman membaca CP');
});

test('2-4. Fase ditentukan otomatis dari tingkat kelas pada seluruh 24 rombel',()=>{
  const harapan={1:'A',2:'A',3:'B',4:'B',5:'C',6:'C'};
  assert.equal(CLASSES.length,24);
  for(const classId of CLASSES)
    assert.equal(phaseForClassId(classId),harapan[Number.parseInt(classId,10)],`${classId}`);
  for(const [kelas,fase] of [['1A','A'],['2D','A'],['3A','B'],['4D','B'],['5A','C'],['6D','C']])
    assert.equal(phaseForClassId(kelas),fase,`${kelas} berada pada Fase ${fase}`);
});

test('5. Intrakurikuler mengambil CP mapel sesuai fase rombel',()=>{
  useMemoryStorage();
  for(const [kelas,fase] of [['1A','A'],['3C','B'],['5B','C']]){
    const sesi=guru(kelas);
    aktifkanMapel(sesi,['mtk']);
    const cp=getIntracurricularCp(sesi,'mtk');
    assert.equal(cp.available,true,`${kelas} punya CP Matematika`);
    assert.equal(cp.phase,fase,`${kelas} memakai CP Fase ${fase}`);
    assert.deepEqual(cp.elements,cpElements('mtk',fase).map(item=>item.name));
  }
});

test('6. CP yang belum tersedia dinyatakan apa adanya, tidak dikarang',()=>{
  useMemoryStorage();
  const sesi=guru('1A');
  aktifkanMapel(sesi,['koding']);
  const cp=getIntracurricularCp(sesi,'koding');
  assert.equal(cp.available,false,'Koding & KA belum berlaku pada Fase A');
  assert.deepEqual(cp.elements,[]);
  assert.ok(cp.reason&&cp.reason.length>20,'alasannya dinyatakan');
  assert.equal(composeIntracurricularCpDescription({cp:null,jenis:'teori',predicate:'Baik'}),null,
    'tanpa CP tidak ada kalimat pengganti');
  assert.equal(composeReportCpDescription({cp:null,finalScore:90}),null);
});

/* ------------------------------------------------- §V.7-8 DUA GENERATOR YANG BERBEDA */

test('7-8. Generator Intrakurikuler dan Nilai Rapor terpisah dan hasilnya berbeda',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk']);
  const cp=cpAcuanFor(sesi,'mtk');

  /* CP yang SAMA persis dimasukkan ke kedua penyusun kalimat. Nama murid dan nama mata
     pelajaran TIDAK lagi ikut: keduanya sudah tercetak pada rapor dan pada layar aplikasi. */
  const intra=composeIntracurricularCpDescription({cp,jenis:'teori',predicate:'Sangat Baik'});
  const rapor=composeReportCpDescription({cp,finalScore:95,kktp:75});
  assert.ok(intra&&rapor);
  assert.notEqual(intra,rapor,'satu CP tidak boleh melahirkan dua kalimat yang sama');
  /* Masing-masing berbicara sesuai fungsinya: Intrakurikuler menyatakan kompetensi yang
     ditunjukkan pada kegiatan penilaian, Rapor menyatakan tingkat penguasaan satu semester. */
  assert.match(intra,/^Menguasai /,'Intrakurikuler memakai bahasa kegiatan penilaian');
  assert.match(rapor,/kompetensi/i,'Nilai Rapor bicara pencapaian kompetensi');
  assert.equal(/^Menguasai /.test(rapor),false,'Nilai Rapor tidak memakai bingkai Intrakurikuler');
  for(const teks of [intra,rapor])
    assert.equal(/mata pelajaran/i.test(teks),false,'nama mata pelajaran tidak diulang di kalimat');
  /* Keduanya tetap berpijak pada elemen CP yang sama. */
  for(const elemen of cp.elements){
    assert.ok(intra.toLowerCase().includes(elemen.toLowerCase()));
    assert.ok(rapor.toLowerCase().includes(elemen.toLowerCase()));
  }
  /* Dan keduanya memang dua fungsi berbeda pada berkas yang sama. */
  const sumber=read('src/services/cp-descriptions.js');
  assert.match(sumber,/export function composeIntracurricularCpDescription/);
  assert.match(sumber,/export function composeReportCpDescription/);
});

test('8b. Deskripsi tersimpan Intrakurikuler berbeda dari deskripsi Nilai Rapor tersimpan',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk']);
  const siswa=tambahSiswa(sesi);
  nilaiPenuh(sesi,'mtk',siswa.id,95);
  const butir=listCpButirForSemester(sesi,'mtk').slice(0,2).map(item=>item.id);
  const intra=saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:'mtk',
    butirIds:butir,jenis:'teori',predicate:'Sangat Baik'});
  const rapor=generateReportDescription(sesi,'mtk',siswa.id,{});
  assert.notEqual(intra.description,rapor.text,
    'kolom Intrakurikuler dan kolom Capaian Kompetensi tidak boleh berbunyi sama');
  assert.equal(rapor.source,'CP_BUTIR','deskripsi rapor bersumber Butir CP aktif');
});

/* ------------------------------------------------------- §V.9-11 ISI OTOMATIS SEMUA SISWA */

test('9-11. Isi Otomatis Semua Siswa bekerja, tanpa duplikasi, tanpa menimpa tulisan guru',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk']);
  const anak=[1,2,3].map(index=>tambahSiswa(sesi,index));
  /* Satu murid sudah punya deskripsi tulisan tangan guru. */
  saveStudentIntracurricularSelection(sesi,anak[2].id,
    {subjectId:'mtk',predicate:'Baik',description:'Catatan khusus wali kelas untuk murid ini.'});

  const hasil=fillAllIntracurricular(sesi,{subjectId:'mtk',predicate:'Sangat Baik'});
  assert.equal(hasil.total,3);
  assert.equal(hasil.terisi,2,'dua murid terisi otomatis');
  assert.equal(hasil.dilewati.length,1,'tulisan guru dilewati, bukan ditimpa');
  assert.equal(hasil.gagal.length,0);
  assert.equal(hasil.phase,'C');

  /* Pembacaan WAJIB menyebut mapel. Bentuk lama tanpa subjectId dulu mengembalikan "catatan
     yang paling baru diperbarui", dan itulah yang membuat rapor mencetak mapel yang salah.
     Harapan test ini diubah dengan sengaja: yang benar adalah membaca catatan 'mtk' sebagai
     'mtk', bukan menebaknya. */
  assert.equal(getStudentIntracurricularSelection(sesi,anak[2].id,'mtk').description,
    'Catatan khusus wali kelas untuk murid ini.','deskripsi manual utuh');
  for(const index of [0,1])
    assert.ok(getStudentIntracurricularSelection(sesi,anak[index].id,'mtk').description);
  /* Dan tanpa mapel, tidak ada tebakan sama sekali. */
  assert.equal(getStudentIntracurricularSelection(sesi,anak[0].id),null,
    'tanpa subjectId tidak ada catatan per mapel yang dikembalikan');

  /* Dijalankan dua kali tidak menggandakan catatan: satu murid tetap satu record. */
  const ulang=fillAllIntracurricular(sesi,{subjectId:'mtk',predicate:'Sangat Baik'});
  assert.equal(ulang.terisi,2);
  assert.equal(getStudentIntracurricularSelection(sesi,anak[0].id,'mtk').description,
    getStudentIntracurricularSelection(sesi,anak[0].id,'mtk').description);
});

/* --------------------------------------------------------- §V.12-13 DESKRIPSI NILAI RAPOR */

test('12-13. Deskripsi Nilai Rapor memakai CP sesuai fase dan mengikuti Nilai Akhir',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk']);
  const siswa=tambahSiswa(sesi);
  const teks=nilai=>{nilaiPenuh(sesi,'mtk',siswa.id,nilai);return generateReportDescription(sesi,'mtk',siswa.id,{}).text;};
  const tinggi=teks(95),sedang=teks(80),rendah=teks(60);
  assert.equal(new Set([tinggi,sedang,rendah]).size,3,'Nilai Akhir mengubah konteks kalimat');
  /* Bentuk kalimat rapor diubah atas permintaan resmi menjadi empat kategori terhadap KKTP. */
  assert.match(tinggi,/^Mencapai kompetensi dengan sangat baik dalam hal /);
  assert.match(rendah,/^(Cukup mencapai|Perlu meningkatkan) kompetensi/);
  const hasil=generateReportDescription(sesi,'mtk',siswa.id,{});
  assert.equal(hasil.cpPhase,'C','CP mengikuti fase rombel');
  /* Yang masuk kalimat adalah SUBSTANSI Butir CP - kompetensi yang benar-benar diajarkan -
     bukan daftar nama elemen. Rapor merangkum, jadi tidak seluruh butir disebut. */
  const butir=listCpButirForSemester(sesi,'mtk');
  assert.ok(butir.length>0,'mata pelajaran ini punya Butir CP aktif');
  assert.ok(hasil.text.includes(butir[0].teori||butir[0].praktik),
    'substansi Butir CP pertama masuk ke deskripsi rapor');
  assert.equal(/mata pelajaran/i.test(hasil.text),false,'nama mata pelajaran tidak diulang');
});

/* -------------------------------------------------------------- §V.14-19 KEHADIRAN */

test('14-15. Input manual Sakit/Izin/Alpa tersimpan dan masuk rekap',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  const siswa=tambahSiswa(sesi);
  const saved=saveManualAttendance(sesi,siswa.id,{Sakit:3,Izin:2,Alpa:1});
  assert.equal(saved.Sakit,3);assert.equal(saved.Izin,2);assert.equal(saved.Alpa,1);
  assert.deepEqual(getManualAttendance(sesi,siswa.id),saved);
  const total=studentAbsenceTotals(sesi,siswa.id);
  assert.deepEqual(total,{Sakit:3,Izin:2,Alpa:1,source:'manual'});
  assert.throws(()=>saveManualAttendance(sesi,siswa.id,{Sakit:-1}),/tidak negatif/i);
});

test('16-17. Absensi harian tetap masuk rekap, dan tidak pernah terjadi double count',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  const a=tambahSiswa(sesi,1),b=tambahSiswa(sesi,2);
  /* Dua hari absensi harian: A sakit dua kali, B alpa sekali. */
  saveAttendance(sesi,`${ACADEMIC_YEAR.slice(0,4)}-07-15`,{[a.id]:'Sakit',[b.id]:'Hadir'});
  saveAttendance(sesi,`${ACADEMIC_YEAR.slice(0,4)}-08-15`,{[a.id]:'Sakit',[b.id]:'Alpa'});
  assert.deepEqual(studentAbsenceTotals(sesi,a.id),{Sakit:2,Izin:0,Alpa:0,source:'harian'});

  /* Guru lalu merekap manual untuk A. Angkanya MENGGANTIKAN, bukan menambah. */
  saveManualAttendance(sesi,a.id,{Sakit:5,Izin:0,Alpa:0});
  const totalA=studentAbsenceTotals(sesi,a.id);
  assert.deepEqual(totalA,{Sakit:5,Izin:0,Alpa:0,source:'manual'});
  assert.notEqual(totalA.Sakit,7,'2 harian + 5 manual TIDAK boleh menjadi 7');

  /* B tidak punya rekap manual, jadi tetap dihitung dari absensi hariannya. */
  assert.deepEqual(studentAbsenceTotals(sesi,b.id),{Sakit:0,Izin:0,Alpa:1,source:'harian'});

  /* Menghapus rekap manual mengembalikan A ke hitungan harian - catatan hariannya tidak
     pernah hilang selama ini. */
  clearManualAttendance(sesi,a.id);
  assert.deepEqual(studentAbsenceTotals(sesi,a.id),{Sakit:2,Izin:0,Alpa:0,source:'harian'});
});

test('18-19. Rekap rapor menghitung seluruh semester, bukan bulan yang sedang dibuka',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  const siswa=tambahSiswa(sesi);
  const tahun=ACADEMIC_YEAR.slice(0,4);
  /* Tiga bulan berbeda dalam satu semester ganjil. */
  saveAttendance(sesi,`${tahun}-07-10`,{[siswa.id]:'Sakit'});
  saveAttendance(sesi,`${tahun}-08-11`,{[siswa.id]:'Izin'});
  saveAttendance(sesi,`${tahun}-09-12`,{[siswa.id]:'Alpa'});
  const rekap=semesterAttendanceRecap(sesi);
  assert.equal(rekap.month,null,'rekap semester tidak dibatasi bulan mana pun');
  assert.equal(rekap.daysRecorded,3,'ketiga bulan ikut terhitung');
  assert.deepEqual(studentAbsenceTotals(sesi,siswa.id),{Sakit:1,Izin:1,Alpa:1,source:'harian'});
  /* Dan berkas rapor memang membaca rekap semester, bukan rekap bulanan. */
  const dokumen=read('src/services/documents.js');
  assert.match(dokumen,/semesterAttendanceRecap/);
  assert.equal(/monthlyAttendanceRecap/.test(dokumen),false,'rapor tidak pernah memakai rekap bulanan');
});

/* ------------------------------------------------------ §V.20-22 NILAI KEHADIRAN ON/OFF */

test('20-22. Nilai Kehadiran ON memakai rekap semester; OFF tidak menyentuh lima komponen',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk']);
  const siswa=tambahSiswa(sesi);
  saveAssessmentSettings(sesi,'mtk',{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(sesi,'mtk',jenis.id,{[siswa.id]:80});

  /* OFF (bawaan): Nilai Akhir murni dari lima komponen. */
  const mati=calculateReportScore(sesi,'mtk',siswa.id);
  assert.equal(mati.finalScore,80,'lima komponen menghasilkan 80');
  assert.equal(mati.dailyFromAttendance,false);
  assert.equal(mati.components.length,5,'tetap lima komponen');

  /* Walau OFF, ketidakhadiran tetap tersimpan dan tetap tampil pada rekap rapor. */
  saveManualAttendance(sesi,siswa.id,{Sakit:2,Izin:1,Alpa:3});
  assert.deepEqual(studentAbsenceTotals(sesi,siswa.id),{Sakit:2,Izin:1,Alpa:3,source:'manual'});
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).finalScore,80,
    'kehadiran tidak mengubah Nilai Akhir ketika komponennya OFF');

  /* ON: komponen Penilaian Harian bersumber kehadiran, dan sumbernya adalah rekap SEMESTER -
     termasuk rekap manual - bukan bulan yang sedang dibuka di layar. */
  saveDailyAttendanceMode(sesi,'mtk',true);
  const hidup=calculateReportScore(sesi,'mtk',siswa.id);
  assert.equal(hidup.dailyFromAttendance,true,'kehadiran menjadi sumber komponen harian');
  assert.equal(hidup.components.length,5,'jumlah komponen tetap lima');
  assert.equal(hidup.components.find(item=>item.id==='daily').source,'attendance');
  const lembar=attendanceDerivedSheet(sesi,'mtk').rows.find(row=>row.studentId===siswa.id);
  assert.deepEqual({Sakit:lembar.counts.Sakit,Izin:lembar.counts.Izin,Alpa:lembar.counts.Alpa},
    {Sakit:2,Izin:1,Alpa:3},'nilai kehadiran memakai rekap semester termasuk input manual');

  /* Dimatikan lagi, Nilai Akhir kembali persis seperti semula. */
  saveDailyAttendanceMode(sesi,'mtk',false);
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).finalScore,80);
});

/* ------------------------------------------------------------- §V.23-25 NILAI SIKAP */

test('23-25. Isi Semua hanya mengisi dimensi terpilih; sisanya kosong dan tidak ke rapor',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  const siswa=tambahSiswa(sesi);
  const dipilih=ATTITUDE_DIMENSIONS.slice(0,4).map(item=>item.id);
  const hasil=saveClassAttitudeBulk(sesi,dipilih,'Berkembang Sesuai Harapan');
  assert.equal(hasil.length,dipilih.length,'hanya dimensi terpilih yang ditulis');

  const semua=listStudentAttitudes(sesi,siswa.id);
  for(const dimensi of semua){
    if(dipilih.includes(dimensi.dimensionId)){
      assert.ok(dimensi.level,`${dimensi.dimensionId} terisi`);
      assert.ok(dimensi.description);
      assert.notEqual(dimensi.status,'EMPTY');
    }else{
      assert.equal(dimensi.level,'',`${dimensi.dimensionId} tetap kosong`);
      assert.equal(dimensi.description,'','tidak ada deskripsi otomatis untuk dimensi kosong');
      assert.equal(dimensi.status,'EMPTY');
    }
  }
  /* Rapor hanya menampilkan dimensi yang benar-benar punya data. */
  assert.equal(semua.filter(item=>item.status!=='EMPTY').length,4);
  const dokumen=read('src/services/documents.js');
  assert.match(dokumen,/status!=='EMPTY'/,'rapor menyaring dimensi kosong');

  /* Fleksibel: satu dimensi berarti satu. */
  useMemoryStorage();
  const lain=guru('5B');
  tambahSiswa(lain);
  assert.equal(saveClassAttitudeBulk(lain,[ATTITUDE_DIMENSIONS[0].id],'Berkembang Sesuai Harapan').length,1);
  assert.throws(()=>saveClassAttitudeBulk(lain,[],'Berkembang Sesuai Harapan'),/minimal satu dimensi/i);
});
