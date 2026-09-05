import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { APP_SCHEMA_VERSION, APP_VERSION } from '../src/data/version.js';
import { buildBackup, parseBackupText, restoreBackup, summarizeBackup } from '../src/services/backup.js';
import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentSettings, saveAssessmentScores } from '../src/services/assessment.js';
import { ASSESSMENT_HEADERS, assessmentTemplateWorkbook, commitAssessmentImport, previewAssessmentImport } from '../src/services/assessment-import.js';
import { createWorkbookBytes, readWorkbookRows } from '../src/services/excel.js';
import { saveAttendance } from '../src/services/attendance.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { getLeger, getReportDocument } from '../src/services/documents.js';
import { getStoredReportRows, saveAutomaticReportScores, visibleStoredReportRows } from '../src/services/report.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { createExtracurricular } from '../src/services/completeness.js';
import { invalidateDbCache, loadDb, storageKey } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

let simpanan=new Map();
function pasangStorage(){globalThis.localStorage={getItem:key=>simpanan.has(key)?simpanan.get(key):null,setItem:(key,value)=>simpanan.set(key,String(value)),removeItem:key=>simpanan.delete(key),clear:()=>simpanan.clear()};invalidateDbCache();}
function useMemoryStorage(){simpanan=new Map();pasangStorage();}
/* Meniru aplikasi ditutup lalu dibuka lagi: cache dibuang, isi penyimpanan tetap. */
function bukaUlang(){const isi=simpanan.get(storageKey());simpanan=new Map([[storageKey(),isi]]);pasangStorage();}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Kp. Gebang',photo:'',...extra});}

/* Data lengkap satu rombel: siswa, mapping, TP, bobot, nilai, absensi, dan ekstrakurikuler. */
function siapkanData(){
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  saveAssessmentSettings(session,'mtk',{formative:40,daily:20,practice:15,scopeSummative:15,semesterSummative:10,kktp:70});
  saveAssessmentScores(session,'mtk','formative',{[islam.id]:80,[kristen.id]:70});
  saveAssessmentScores(session,'mtk','daily',{[islam.id]:90});
  saveAssessmentScores(session,'agama','formative',{[islam.id]:85});
  saveAssessmentScores(session,'agama_kristen','formative',{[kristen.id]:91});
  createLearningObjective(session,'mtk',{code:'TP-1',description:'memahami bilangan bulat.'});
  saveAttendance(session,new Date().toISOString().slice(0,10),{[islam.id]:'Hadir',[kristen.id]:'Sakit'});
  createExtracurricular(session,islam.id,{name:'Pramuka',predicate:'Sangat Baik',description:'Aktif mengikuti kegiatan Pramuka.'});
  saveAutomaticReportScores(session,'mtk');
  return {session,islam,kristen};
}
const potret=()=>JSON.parse(JSON.stringify(loadDb()));
const templateRows=(session,subjectId)=>readWorkbookRows(assessmentTemplateWorkbook(session,subjectId));
const importRows=(session,subjectId,rows)=>previewAssessmentImport(session,subjectId,createWorkbookBytes('Nilai',rows));
const nilaiKomponen=(session,subjectId,type,studentId)=>getAssessmentSheet(session,subjectId,type).rows.find(row=>row.studentId===studentId)?.score??null;
/* Kolom template nilai: NIS, NISN, Nama, Formatif, Harian, Praktik, LM1..LM5, Sumatif Akhir, ID. */
const KOL={formative:3,daily:4,practice:5,lm1:6,lm2:7,lm3:8,lm4:9,lm5:10,semesterSummative:11,id:12};
const barisSiswa=(rows,studentId)=>rows.find(row=>row[KOL.id]===studentId);

/* =============================================================== BACKUP DAN RESTORE */

test('1. Backup memuat seluruh koleksi data penting beserta identitas sekolah',()=>{
  const {session}=siapkanData();
  const payload=buildBackup(session);
  for(const koleksi of ['students','attendance','subjectMappings','assessmentSettings','learningObjectives','assessmentScores','reportScores','reportDescriptions','extracurricularScores','cocurricularScores','attitudeProfiles','homeroomNotes','promotionStatus','graduationStatus','transcriptScores','printSettings','settings']){
    assert.ok(Object.hasOwn(payload.data,koleksi),`koleksi ${koleksi} ikut backup`);
  }
  assert.ok(Object.keys(payload.data.students).length>=2,'data siswa ikut');
  assert.ok(Object.keys(payload.data.assessmentScores).length>=5,'nilai penilaian ikut');
  assert.ok(Object.keys(payload.data.attendance).length>=1,'absensi ikut');
  assert.ok(payload.data.masterData.school,'identitas sekolah dan kepala sekolah ikut');
  assert.ok(payload.data.masterData.teachers['5B'],'profil wali kelas ikut');
  assert.ok(payload.data.masterData.references,'data referensi ikut');
  /* Akun dan pengaturan keamanan tidak pernah ikut pada backup Guru. */
  assert.deepEqual(payload.data.userAccounts,{});
  assert.deepEqual(payload.data.security,{});
  assert.equal(JSON.stringify(payload).includes('passwordHash'),false,'tidak ada credential pada berkas backup');
});

test('2. Metadata backup lengkap dan jumlah data tercatat',()=>{
  const {session}=siapkanData();
  const payload=buildBackup(session);
  assert.equal(payload.app,'e-Rapor','penanda produk generic, bukan nama satu sekolah');
  assert.equal(payload.backupVersion,'1.0');
  assert.equal(payload.appVersion,APP_VERSION);
  assert.equal(payload.appSchemaVersion,APP_SCHEMA_VERSION);
  assert.equal(payload.scope.academicYear,ACADEMIC_YEAR);
  assert.equal(new Date(payload.exportedAt).toISOString(),payload.exportedAt,'createdAt/exportedAt berformat ISO');
  assert.equal(payload.counts.students,2);
  assert.ok(payload.counts.assessmentScores>=5);
});

test('3. Preview restore menampilkan ringkasan sebelum data diubah',()=>{
  const {session}=siapkanData();
  const teks=JSON.stringify(buildBackup(session));
  const sebelum=potret();
  const ringkas=summarizeBackup(parseBackupText(teks));
  assert.equal(ringkas.classId,'5B');
  assert.equal(ringkas.semester,`Ganjil ${ACADEMIC_YEAR}`);
  assert.equal(ringkas.students,2);
  assert.equal(ringkas.appVersion,APP_VERSION);
  assert.ok(ringkas.assessmentScores>=5);
  assert.ok(ringkas.attendance>=1);
  assert.ok(ringkas.objectives>=1);
  assert.ok(ringkas.extracurricular>=1);
  assert.ok(ringkas.exportedAt);
  /* Membaca dan meringkas berkas tidak boleh menyentuh database. */
  assert.deepEqual(potret(),sebelum,'database tidak berubah saat preview');
});

test('4. Restore mengembalikan seluruh data persis seperti saat backup',()=>{
  const {session,islam,kristen}=siapkanData();
  const payload=JSON.parse(JSON.stringify(buildBackup(session)));
  const sebelum=potret();

  /* Data diubah setelah backup: nilai, siswa, absensi, dan TP. */
  saveAssessmentScores(session,'mtk','formative',{[islam.id]:10});
  saveAssessmentScores(session,'mtk','daily',{[kristen.id]:20});
  siswa(session,'BARU');
  createLearningObjective(session,'mtk',{code:'TP-9',description:'tujuan tambahan setelah backup.'});
  assert.notDeepEqual(potret().assessmentScores,sebelum.assessmentScores);

  restoreBackup(parseBackupText(JSON.stringify(payload)),session);
  const sesudah=potret();
  for(const koleksi of ['students','assessmentScores','reportScores','reportDescriptions','attendance','learningObjectives','assessmentSettings','subjectMappings','extracurricularScores','homeroomNotes']){
    assert.deepEqual(sesudah[koleksi],sebelum[koleksi],`koleksi ${koleksi} kembali persis`);
  }
  const daftar=listStudents(session,{classId:'5B'});
  assert.equal(daftar.length,2,'siswa tambahan setelah backup ikut dikembalikan ke kondisi backup');
  assert.equal(daftar.find(item=>item.id===kristen.id).religion,'Kristen','agama siswa kembali');
  assert.equal(nilaiKomponen(session,'mtk','formative',islam.id),80,'nilai kembali seperti saat backup');
});

test('5. Hasil restore tetap ada setelah aplikasi ditutup dan dibuka kembali',()=>{
  const {session,islam}=siapkanData();
  const payload=JSON.parse(JSON.stringify(buildBackup(session)));
  saveAssessmentScores(session,'mtk','formative',{[islam.id]:15});
  restoreBackup(parseBackupText(JSON.stringify(payload)),session);
  bukaUlang();
  assert.equal(nilaiKomponen(session,'mtk','formative',islam.id),80);
  assert.equal(listStudents(session,{classId:'5B'}).length,2);
});

test('6. Berkas JSON rusak ditolak dan database lama tetap utuh',()=>{
  const {session}=siapkanData();
  const sebelum=potret();
  assert.throws(()=>parseBackupText('{"app":'),/JSON yang valid/);
  assert.throws(()=>parseBackupText('{"app":"Aplikasi Lain"}'),/tidak tersedia|tidak dikenal|bukan backup/);
  assert.deepEqual(potret(),sebelum,'database tidak berubah oleh berkas rusak');
});

test('7. Backup dengan versi tidak kompatibel ditolak tanpa merusak data',()=>{
  const {session}=siapkanData();
  const sebelum=potret();
  const payload=buildBackup(session);
  const versiLain={...JSON.parse(JSON.stringify(payload)),backupVersion:'9.9'};
  assert.throws(()=>parseBackupText(JSON.stringify(versiLain)),/Versi backup tidak kompatibel/);
  const schemaLain=JSON.parse(JSON.stringify(payload));schemaLain.data.schemaVersion=99;
  assert.throws(()=>parseBackupText(JSON.stringify(schemaLain)),/Versi database pada backup tidak kompatibel/);
  assert.deepEqual(potret(),sebelum);
});

test('8. Restore yang gagal tidak menulis sebagian data',()=>{
  const {session}=siapkanData();
  const sebelum=potret();
  const rusak=JSON.parse(JSON.stringify(buildBackup(session)));
  /* Berkas valid secara JSON tetapi satu koleksi inti hilang: seluruh restore harus batal. */
  delete rusak.data.attendance;
  assert.throws(()=>restoreBackup(rusak,session),/data.attendance tidak tersedia/);
  assert.deepEqual(potret(),sebelum,'tidak ada perubahan sebagian');

  const scopeLain=JSON.parse(JSON.stringify(buildBackup(session)));
  scopeLain.scope.classId='5C';
  assert.throws(()=>restoreBackup(scopeLain,session),/Scope backup tidak cocok|di luar scope/);
  assert.deepEqual(potret(),sebelum);
});

test('Backup rilis lama tanpa koleksi baru tetap dapat direstore',()=>{
  const {session,islam}=siapkanData();
  const payload=JSON.parse(JSON.stringify(buildBackup(session)));
  /* Berkas rilis lama belum mengenal koleksi yang baru ditambahkan. */
  for(const koleksi of ['cocurricularActivities','cocurricularScores','attitudeProfiles','printSettings','homeroomNotes','promotionStatus','graduationStatus','transcriptScores'])delete payload.data[koleksi];
  delete payload.appVersion;delete payload.appSchemaVersion;delete payload.counts;
  const dibaca=parseBackupText(JSON.stringify(payload));
  assert.deepEqual(dibaca.data.transcriptScores,{},'koleksi baru diisi kosong, bukan ditolak');
  saveAssessmentScores(session,'mtk','formative',{[islam.id]:12});
  restoreBackup(dibaca,session);
  assert.equal(nilaiKomponen(session,'mtk','formative',islam.id),80,'data lama kembali');
  assert.equal(loadDb().appSchemaVersion,APP_SCHEMA_VERSION,'schema aplikasi tidak diturunkan');
});

/* ========================================================== TEMPLATE DAN IMPORT NILAI */

test('9-10. Template nilai berisi seluruh siswa rombel aktif beserta nilai yang sudah ada',()=>{
  const {session,islam,kristen}=siapkanData();
  const rows=templateRows(session,'mtk');
  assert.deepEqual(rows[1],ASSESSMENT_HEADERS,'format kolom template nilai');
  assert.equal(rows.length,4,'baris info + header + 2 siswa');
  assert.match(rows[0].join(' | '),/Tahun Pelajaran: .*Semester: .*Rombel: 5B.*Mapel: Matematika.*Mapel ID: mtk/,'informasi scope tertulis di berkas');
  const barisIslam=barisSiswa(rows,islam.id);
  assert.equal(barisIslam[KOL.formative],80,'nilai Formatif yang sudah ada ikut terisi');
  assert.equal(barisIslam[KOL.daily],90,'nilai Harian yang sudah ada ikut terisi');
  assert.equal(barisIslam[KOL.practice],'','komponen yang belum dinilai tetap kosong');
  assert.deepEqual(rows[1].slice(6,11),['Sumatif LM1','Sumatif LM2','Sumatif LM3','Sumatif LM4','Sumatif LM5'],'Sumatif Lingkup Materi dipecah per bab');
  const barisKristen=barisSiswa(rows,kristen.id);
  assert.equal(barisKristen[KOL.formative],70);
});

test('11. Rombel tanpa siswa menghasilkan template nilai berisi header saja',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const rows=templateRows(session,'mtk');
  assert.equal(rows.length,2,'baris info + header');
  assert.deepEqual(rows[1],ASSESSMENT_HEADERS);
});

test('12. Round-trip template nilai tidak mengubah nilai dan tidak menggandakan record',()=>{
  const {session,islam}=siapkanData();
  const sebelum=potret().assessmentScores;
  const rows=templateRows(session,'mtk');
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.invalidCount,0,preview.rows.flatMap(row=>row.errors).join(' | '));
  assert.equal(preview.newScoreCount,0);
  assert.equal(preview.updatedScoreCount,0);
  commitAssessmentImport(session,preview);
  assert.deepEqual(Object.keys(potret().assessmentScores).sort(),Object.keys(sebelum).sort(),'jumlah record nilai tetap');
  assert.equal(nilaiKomponen(session,'mtk','formative',islam.id),80);
  assert.equal(nilaiKomponen(session,'mtk','daily',islam.id),90);
});

test('13-14. Menambah dan mengubah nilai lewat Excel tersimpan ke Penilaian',()=>{
  const {session,islam,kristen}=siapkanData();
  const rows=templateRows(session,'mtk');
  const barisIslam=barisSiswa(rows,islam.id);
  const barisKristen=barisSiswa(rows,kristen.id);
  barisIslam[KOL.formative]=95;   /* nilai lama diperbarui */
  barisKristen[KOL.practice]=88;  /* nilai baru pada komponen Praktik */
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.invalidCount,0);
  assert.equal(preview.newScoreCount,1,'satu nilai baru');
  assert.equal(preview.updatedScoreCount,1,'satu nilai diperbarui');
  commitAssessmentImport(session,preview);
  assert.equal(nilaiKomponen(session,'mtk','formative',islam.id),95);
  assert.equal(nilaiKomponen(session,'mtk','practice',kristen.id),88);
  assert.equal(nilaiKomponen(session,'mtk','daily',islam.id),90,'nilai lain tidak ikut berubah');
});

test('15. Import nilai seluruh siswa sekaligus berhasil',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const daftar=[];
  for(let index=1;index<=33;index+=1)daftar.push(siswa(session,String(index).padStart(2,'0')));
  const rows=templateRows(session,'mtk');
  rows.slice(2).forEach(row=>{row[KOL.formative]=80;row[KOL.daily]=81;row[KOL.practice]=82;row[KOL.lm1]=83;row[KOL.lm2]=85;row[KOL.semesterSummative]=84;});
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.rows.length,33);
  assert.equal(preview.newScoreCount,33*ASSESSMENT_TYPES.length,'kelima komponen terisi, Sumatif Lingkup Materi dari rata-rata LM');
  commitAssessmentImport(session,preview);
  const harapan={formative:80,daily:81,practice:82,scopeSummative:84,semesterSummative:84};
  ASSESSMENT_TYPES.forEach(type=>{
    const sheet=getAssessmentSheet(session,'mtk',type.id);
    assert.equal(sheet.filledCount,33,`seluruh siswa punya nilai ${type.label}`);
    assert.equal(sheet.rows[0].score,harapan[type.id],`${type.label} sesuai isian`);
  });
  /* Sumatif Lingkup Materi = rata-rata LM1 dan LM2 yang terisi: (83+85)/2 = 84. */
  assert.deepEqual(getAssessmentSheet(session,'mtk','scopeSummative').rows[0].parts,{lm1:83,lm2:85});
  assert.equal(listStudents(session,{classId:'5B'}).length,33,'import nilai tidak menambah atau menghapus siswa');
});

test('16. Siswa tanpa NIS tetap menerima nilai dari Excel',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const tanpaNis=siswa(session,'TANPA',{nis:''});
  const lain=siswa(session,'LAIN');
  const rows=templateRows(session,'mtk');
  barisSiswa(rows,tanpaNis.id)[KOL.formative]=77;
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.invalidCount,0,preview.rows.flatMap(row=>row.errors).join(' | '));
  commitAssessmentImport(session,preview);
  assert.equal(nilaiKomponen(session,'mtk','formative',tanpaNis.id),77,'nilai masuk ke siswa yang benar');
  assert.equal(nilaiKomponen(session,'mtk','formative',lain.id),null,'siswa lain tidak ikut terisi');
});

test('17-18. Nilai parsial diterima dan sel kosong bukan nol',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const anak=siswa(session,'PARSIAL');
  saveAssessmentSettings(session,'mtk',{formative:40,daily:20,practice:15,scopeSummative:15,semesterSummative:10,kktp:70});
  const rows=templateRows(session,'mtk');
  const baris=barisSiswa(rows,anak.id);
  baris[KOL.formative]=80;baris[KOL.daily]=90;
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.canCommit,true,preview.rows.flatMap(row=>row.errors).join(' | '));
  commitAssessmentImport(session,preview);
  assert.equal(nilaiKomponen(session,'mtk','formative',anak.id),80);
  assert.equal(nilaiKomponen(session,'mtk','daily',anak.id),90);
  for(const type of ['practice','scopeSummative','semesterSummative'])assert.equal(nilaiKomponen(session,'mtk',type,anak.id),null,`${type} tetap kosong, bukan 0`);
  /* Bobot ternormalisasi atas komponen terisi saja: (80x40 + 90x20) / (40+20) = 83,33 */
  saveAutomaticReportScores(session,'mtk');
  const baris2=visibleStoredReportRows(getStoredReportRows(session)).find(row=>row.subject.id==='mtk'&&row.student.id===anak.id);
  assert.equal(Number(baris2.score.rawScore.toFixed(2)),83.33,'komponen kosong tidak ikut sebagai nol');
  assert.equal(baris2.score.finalScore,83);
  assert.equal(baris2.score.completionStatus,'PARTIAL');
});

test('19. Berkas mapel, rombel, semester, atau tahun lain ditolak',()=>{
  const {session}=siapkanData();
  const rows=templateRows(session,'mtk');
  assert.throws(()=>importRows(session,'agama',rows),/milik mata pelajaran mtk/);
  const rombelLain=rows.map(row=>[...row]);rombelLain[0]=rombelLain[0].map(cell=>String(cell).replace('Rombel: 5B','Rombel: 5C'));
  assert.throws(()=>importRows(session,'mtk',rombelLain),/milik rombel 5C/);
  const tahunLain=rows.map(row=>[...row]);tahunLain[0]=tahunLain[0].map(cell=>String(cell).replace(`Tahun Pelajaran: ${ACADEMIC_YEAR}`,'Tahun Pelajaran: 2020/2021'));
  assert.throws(()=>importRows(session,'mtk',tahunLain),/tahun pelajaran 2020\/2021/);
  const semesterLain=rows.map(row=>[...row]);semesterLain[0]=semesterLain[0].map(cell=>String(cell).replace(`Semester: Ganjil ${ACADEMIC_YEAR}`,`Semester: Genap ${ACADEMIC_YEAR}`));
  assert.throws(()=>importRows(session,'mtk',semesterLain),/milik Genap/);
});

test('Nilai tidak wajar dan siswa asing ditolak dengan alasan yang jelas',()=>{
  const {session}=siapkanData();
  const rows=templateRows(session,'mtk');
  const rusak=rows.map(row=>[...row]);
  rusak[2][KOL.formative]='abc';
  rusak[3][KOL.daily]=150;
  rusak.push(['NIS-ASING','NISN-ASING','Siswa Asing','','','','','','','','','','']);
  const preview=importRows(session,'mtk',rusak);
  assert.equal(preview.canCommit,false);
  assert.match(preview.rows[0].errors.join(' '),/bukan angka/);
  assert.match(preview.rows[1].errors.join(' '),/di luar rentang/);
  assert.match(preview.rows[2].errors.join(' '),/tidak ditemukan pada rombel/);
});

test('20. Import nilai agama tetap mengikuti agama siswa',()=>{
  const {session,islam,kristen}=siapkanData();
  const barisPai=templateRows(session,'agama');
  barisSiswa(barisPai,islam.id)[KOL.formative]=95;
  commitAssessmentImport(session,importRows(session,'agama',barisPai));
  const barisPak=templateRows(session,'agama_kristen');
  barisSiswa(barisPak,kristen.id)[KOL.formative]=93;
  commitAssessmentImport(session,importRows(session,'agama_kristen',barisPak));
  saveAutomaticReportScores(session,'agama');
  saveAutomaticReportScores(session,'agama_kristen');

  const mapelIslam=getReportDocument(session,islam.id).subjects.map(item=>item.subject.id);
  assert.ok(mapelIslam.includes('agama')&&!mapelIslam.includes('agama_kristen'),'siswa Islam hanya PAI BP');
  const mapelKristen=getReportDocument(session,kristen.id).subjects.map(item=>item.subject.id);
  assert.ok(mapelKristen.includes('agama_kristen')&&!mapelKristen.includes('agama'),'siswa Kristen hanya PAK BP');
});

test('21-24. Hasil import terbaca Input Nilai Rapor, Nilai Tersimpan, Rapor, dan Leger',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const anak=siswa(session,'ALUR');
  const rows=templateRows(session,'mtk');
  const baris=barisSiswa(rows,anak.id);
  ASSESSMENT_TYPES.forEach((type,index)=>{baris[3+index]=80+index;});
  commitAssessmentImport(session,importRows(session,'mtk',rows));

  /* Penilaian membaca hasil import. */
  assert.equal(getAssessmentSheet(session,'mtk','formative').rows[0].score,80);
  /* Input Nilai Rapor menghitungnya, Nilai Tersimpan menampilkannya. */
  saveAutomaticReportScores(session,'mtk');
  const tersimpan=visibleStoredReportRows(getStoredReportRows(session)).find(row=>row.subject.id==='mtk'&&row.student.id===anak.id);
  assert.equal(tersimpan.scoreComplete,true);
  assert.ok(tersimpan.score.finalScore>=80&&tersimpan.score.finalScore<=84);
  /* Rapor dan Leger membaca nilai yang sama. */
  const rapor=getReportDocument(session,anak.id).subjects.find(item=>item.subject.id==='mtk');
  assert.equal(rapor.score,tersimpan.score.finalScore);
  const leger=getLeger(session).students.find(row=>row.student.id===anak.id).scores.find(item=>item.subject.id==='mtk');
  assert.equal(leger.score,tersimpan.score.finalScore);
});
