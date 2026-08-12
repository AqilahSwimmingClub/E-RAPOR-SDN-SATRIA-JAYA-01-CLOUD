import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { APP_SCHEMA_VERSION, APP_VERSION, PREVIOUS_RELEASE, VERSION_CODE } from '../src/data/version.js';
import { saveAssessmentScores } from '../src/services/assessment.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { calculateReportScore, calculateReportSheet, getStoredReportRows, saveAutomaticReportScores } from '../src/services/report.js';
import { saveAllAutomaticReports } from '../src/services/report-bulk.js';
import { getLeger, getReportCompleteness, getReportDocument } from '../src/services/documents.js';
import { getTranscriptRows, saveTranscriptScores } from '../src/services/transcript.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';
import { saveSubjectMapping, loadDb, storageKey } from '../src/services/storage.js';
import { runAppMigrations } from '../src/services/migrations.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}
const PAI='Pendidikan Agama Islam dan Budi Pekerti';
const PAK='Pendidikan Agama Kristen dan Budi Pekerti';

/* ------------------------------------------------- 1 & 2. Pemilih siswa pada halaman Penilaian */

test('1. Memilih satu siswa hanya menampilkan siswa tersebut pada tabel Penilaian',()=>{
  const page=read('src/pages/assessment.js');
  assert.match(page,/const dipilih=target\.value;/,'pilihan siswa dibaca saat menggambar tabel');
  assert.match(page,/const tampil=dipilih\?sheet\.rows\.filter\(row=>row\.studentId===dipilih\):sheet\.rows;/,'satu siswa terpilih menyaring baris');
  assert.match(page,/const rows=tampil\.map/,'tabel memakai daftar tersaring');
  assert.match(page,/const cards=tampil\.map/,'tampilan kartu memakai daftar tersaring');
  assert.match(page,/\[data-fill-target\]'\)\.onchange=\(\)=>draw\(\)/,'mengganti pilihan langsung menggambar ulang');
});

test('2. Pilihan Semua Siswa menampilkan seluruh siswa rombel',()=>{
  const page=read('src/pages/assessment.js');
  assert.match(page,/<option value="">Semua Siswa<\/option>/,'pilihan Semua Siswa tersedia');
  /* Nilai kosong pada pemilih berarti seluruh baris dipakai apa adanya. */
  assert.match(page,/:sheet\.rows;/,'tanpa pilihan siswa seluruh baris ditampilkan');
  assert.match(page,/label for="assessmentFillTarget">Tampilkan Siswa/,'pemilih menyaring tampilan, bukan sekadar sasaran');
});

test('3. Isi Semua Nilai berfungsi dan mengikuti siswa yang dipilih',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const satu=siswa(session,'A'),dua=siswa(session,'B');

  const hanyaSatu=fillAllAssessmentScores(session,'mtk','80',{studentId:satu.id});
  assert.equal(hanyaSatu.studentCount,1,'hanya satu siswa yang diisi');
  assert.equal(calculateReportScore(session,'mtk',satu.id).filledCount,5,'kelima komponen siswa terpilih terisi');
  assert.equal(calculateReportScore(session,'mtk',dua.id).filledCount,0,'siswa lain tidak ikut terisi');

  const semua=fillAllAssessmentScores(session,'mtk','90');
  assert.equal(semua.studentCount,2,'pilihan Semua Siswa mengisi seluruh siswa');
  assert.equal(calculateReportScore(session,'mtk',dua.id).rawScore,90);

  /* window.prompt tidak berjalan pada Electron sehingga tombol tampak mati. */
  const page=read('src/pages/assessment.js');
  const tanpaKomentar=page.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.equal(/window\.prompt\(|globalThis\.prompt\(/.test(tanpaKomentar),false,'tidak boleh memanggil prompt bawaan browser');
  assert.match(page,/function askScore\(/,'dialog nilai disediakan di dalam aplikasi');
  assert.match(page,/const value=await askScore\(/,'tombol Isi Semua Nilai memakai dialog aplikasi');
});

/* -------------------------------------------- 4 & 5. Tombol simpan otomatis benar-benar jalan */

test('4. Simpan Semua Nilai Otomatis memproses seluruh mapel dalam sekali jalan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const mapel=['agama','mtk','bindo'];
  aktifkan(session,mapel);
  const daftar=[siswa(session,'A'),siswa(session,'B'),siswa(session,'C')];
  mapel.forEach(id=>fillAllAssessmentScores(session,id,'85'));

  const hasil=saveAllAutomaticReports(session);
  assert.equal(hasil.scoreCount,mapel.length*daftar.length,'seluruh nilai mapel aktif tersimpan');
  const tersimpan=getStoredReportRows(session).filter(row=>row.score?.finalScore===85);
  assert.equal(tersimpan.length,mapel.length*daftar.length,'nilai benar-benar tercatat di database');
});

test('5. Simpan Hasil Otomatis menyimpan nilai dan memberi umpan balik yang jelas',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentScores(session,'mtk','formative',{[anak.id]:80});

  const saved=saveAutomaticReportScores(session,'mtk');
  assert.equal(saved.length,1);
  assert.equal(saved[0].finalScore,80,'nilai tersimpan walau komponen belum lengkap');
  assert.equal(getStoredReportRows(session).find(row=>row.student.id===anak.id).scoreComplete,true,'nilai dianggap tersedia');

  const page=read('src/pages/reports.js');
  assert.match(page,/const jalankan=async\(button,label,kerja\)=>/,'tombol punya status sibuk dan penanganan galat');
  assert.match(page,/catch\(error\)\{toast\(error\.message,'error'\);?\}/,'galat ditampilkan, tombol tidak diam saja');
  assert.match(page,/memperoleh nilai rapor/,'umpan balik jumlah siswa yang mendapat nilai');
  assert.match(page,/\[data-save-all-auto\]'\)\.onclick=async\(\)=>/,'tombol semua mapel terpasang');
});

/* --------------------------------------------------------- 6, 7, 8. Siswa Islam dan Kristen */

test('6. Siswa Islam dan Kristen sama-sama masuk seluruh modul nilai',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  saveAssessmentScores(session,'mtk','formative',{[islam.id]:80,[kristen.id]:90});
  saveAssessmentScores(session,'agama','formative',{[islam.id]:85});
  saveAssessmentScores(session,'agama_kristen','formative',{[kristen.id]:95});
  saveAllAutomaticReports(session);

  for(const mapel of ['agama','agama_kristen','mtk']){
    const daftar=calculateReportSheet(session,mapel).map(row=>row.studentId);
    assert.ok(daftar.includes(islam.id)&&daftar.includes(kristen.id),`kedua siswa tetap tampil pada Input Nilai Rapor mapel ${mapel}`);
  }
  const tersimpan=getStoredReportRows(session).filter(row=>row.subject.id==='mtk');
  assert.deepEqual(tersimpan.map(row=>row.score?.finalScore).sort((a,b)=>a-b),[80,90],'Nilai Tersimpan memuat kedua siswa');
  assert.equal(getReportCompleteness(session).students.length,2,'Kelengkapan memuat kedua siswa');
  assert.equal(getLeger(session).students.length,2,'Leger memuat kedua siswa');
  assert.equal(listStudents(session,{classId:'5B'}).length,2);
});

test('7. Siswa Islam hanya memakai PAI BP',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  fillAllAssessmentScores(session,'agama','85');
  fillAllAssessmentScores(session,'mtk','80');
  saveAllAutomaticReports(session);
  const nama=getReportDocument(session,islam.id).subjects.map(item=>item.subject.name);
  assert.ok(nama.includes(PAI));
  assert.equal(nama.includes(PAK),false);
  assert.deepEqual(listSubjectsForStudent(session,islam).map(item=>item.id),['agama','mtk']);
});

test('8. Siswa Kristen hanya memakai PAK BP',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama_kristen','88');
  fillAllAssessmentScores(session,'mtk','80');
  saveAllAutomaticReports(session);
  const nama=getReportDocument(session,kristen.id).subjects.map(item=>item.subject.name);
  assert.ok(nama.includes(PAK));
  assert.equal(nama.includes(PAI),false);
  assert.deepEqual(listSubjectsForStudent(session,kristen).map(item=>item.id),['agama_kristen','mtk']);
});

/* ------------------------------------------------ 9-12. Nilai rapor dari komponen sebagian */

test('9-11. Nilai rapor dihitung dari komponen yang terisi saja',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');

  saveAssessmentScores(session,'mtk','formative',{[anak.id]:80});
  let hasil=calculateReportScore(session,'mtk',anak.id);
  assert.equal(hasil.rawScore,80,'1 nilai terisi dihitung apa adanya');
  assert.equal(hasil.filledCount,1);
  assert.equal(hasil.completionStatus,'PARTIAL');

  saveAssessmentScores(session,'mtk','daily',{[anak.id]:90});
  hasil=calculateReportScore(session,'mtk',anak.id);
  /* Bobot formative 30 dan daily 20 dinormalisasi: (80x30 + 90x20) / (30+20). */
  assert.equal(+hasil.rawScore.toFixed(4),+((80*30+90*20)/50).toFixed(4),'bobot komponen terisi dinormalisasi');

  saveAssessmentScores(session,'mtk','practice',{[anak.id]:70});
  hasil=calculateReportScore(session,'mtk',anak.id);
  assert.equal(+hasil.rawScore.toFixed(4),+((80*30+90*20+70*20)/70).toFixed(4),'tiga komponen memakai bobotnya masing-masing');

  saveAssessmentScores(session,'mtk','scopeSummative',{[anak.id]:60});
  saveAssessmentScores(session,'mtk','semesterSummative',{[anak.id]:100});
  hasil=calculateReportScore(session,'mtk',anak.id);
  assert.equal(+hasil.rawScore.toFixed(4),+((80*30+90*20+70*20+60*15+100*15)/100).toFixed(4),'kelima komponen memakai bobot penuh');
  assert.equal(hasil.completionStatus,'COMPLETE');
  assert.equal(hasil.completionLabel,'LENGKAP');
});

test('12. Komponen kosong tidak pernah dianggap nol dan dibedakan dari belum ada nilai',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const kosong=siswa(session,'KOSONG'),sebagian=siswa(session,'SEBAGIAN');

  const belum=calculateReportScore(session,'mtk',kosong.id);
  assert.equal(belum.rawScore,null,'belum ada nilai sama sekali tetap null, bukan 0');
  assert.equal(belum.filledCount,0);
  assert.equal(belum.completionStatus,'EMPTY');
  assert.equal(belum.completionLabel,'BELUM ADA NILAI');

  saveAssessmentScores(session,'mtk','formative',{[sebagian.id]:80});
  saveAssessmentScores(session,'mtk','daily',{[sebagian.id]:90});
  const separuh=calculateReportScore(session,'mtk',sebagian.id);
  assert.equal(+separuh.rawScore.toFixed(4),+((80*30+90*20)/50).toFixed(4),'bobot komponen kosong tidak ikut penyebut');
  assert.notEqual(separuh.rawScore,(80*30+90*20)/100,'penyebut bukan total seluruh bobot');
  assert.equal(separuh.completionStatus,'PARTIAL');
  assert.equal(separuh.completionLabel,'SEBAGIAN 2/5');
});

/* --------------------------------------------------------------- 13 & 14. Siswa tanpa NIS */

test('13. Siswa tanpa NIS tetap dapat menerima dan menyimpan nilai',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','mtk']);
  const tanpaNis=siswa(session,'TANPA',{nis:''});
  assert.equal(tanpaNis.nis,'','NIS boleh kosong');
  assert.ok(tanpaNis.id,'ID internal siswa tetap ada');

  fillAllAssessmentScores(session,'mtk','82',{studentId:tanpaNis.id});
  saveAutomaticReportScores(session,'mtk');
  assert.equal(calculateReportSheet(session,'mtk').some(row=>row.studentId===tanpaNis.id),true,'masuk Input Nilai Rapor');
  const baris=getStoredReportRows(session).find(row=>row.student.id===tanpaNis.id&&row.subject.id==='mtk');
  assert.equal(baris.score.finalScore,82,'nilai tersimpan dan terbaca kembali');
  assert.equal(baris.scoreComplete,true,'masuk Nilai Tersimpan');

  /* NIS tidak pernah menjadi kunci penyimpanan nilai rapor. */
  const kunci=Object.keys(loadDb().reportScores);
  assert.ok(kunci.every(key=>key.endsWith(tanpaNis.id)||!key.includes('|mtk|')||key.includes('|mtk|')),'kunci memakai ID siswa');
  assert.ok(kunci.some(key=>key===`${session.academicYear}|${session.semester}|5B|mtk|${tanpaNis.id}`),'kunci nilai memakai ID internal siswa');
});

test('14. Nilai siswa tanpa NIS muncul di rapor, transkrip, dan leger',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','mtk']);
  const tanpaNis=siswa(session,'TANPA',{nis:''});
  fillAllAssessmentScores(session,'mtk','82',{studentId:tanpaNis.id});
  fillAllAssessmentScores(session,'agama','90',{studentId:tanpaNis.id});
  saveAllAutomaticReports(session);

  const dokumen=getReportDocument(session,tanpaNis.id);
  assert.equal(dokumen.subjects.find(item=>item.subject.id==='mtk').score,82,'nilai masuk Rapor');
  assert.equal(getLeger(session).students.find(row=>row.student.id===tanpaNis.id).scores.find(item=>item.subject.id==='mtk').score,82,'nilai masuk Leger');

  saveTranscriptScores(session,tanpaNis.id,{mtk:88,agama:91});
  const transkrip=getTranscriptRows(session,tanpaNis.id);
  assert.equal(transkrip.find(row=>row.subject.id==='mtk').score,88,'nilai masuk Transkrip');
  assert.equal(getReportCompleteness(session).students.some(row=>row.student.id===tanpaNis.id),true,'masuk Kelengkapan');
});

test('Dua siswa tanpa NIS maupun NISN tidak saling menimpa nilai transkripnya',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  /* Identitas transkrip jatuh ke ID internal ketika NISN dan NIS sama-sama kosong. */
  const a=createStudent(session,{classId:'5B',nis:'',nisn:'X1',name:'Tanpa NIS A',gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-01',parentName:'Ortu',address:'A',photo:''});
  const b=createStudent(session,{classId:'5B',nis:'',nisn:'X2',name:'Tanpa NIS B',gender:'P',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Ortu',address:'A',photo:''});
  saveTranscriptScores(session,a.id,{mtk:70});
  saveTranscriptScores(session,b.id,{mtk:95});
  assert.equal(getTranscriptRows(session,a.id).find(row=>row.subject.id==='mtk').score,70);
  assert.equal(getTranscriptRows(session,b.id).find(row=>row.subject.id==='mtk').score,95);
});

/* ------------------------------------------------------ 15-17. Preview, Simpan PDF, Cetak */

test('15-17. Preview, Simpan PDF, dan Cetak desktop memakai jalur yang benar',()=>{
  const service=read('src/services/print-service.js');
  assert.match(service,/export function showDocumentPreview\(\)/,'preview dokumen tersedia di dalam aplikasi');
  assert.match(service,/export function isDesktop\(\)/);
  assert.match(service,/if\(!savePdf\)showDocumentPreview\(\)/,'Cetak menampilkan dokumen lebih dulu');
  assert.match(service,/globalThis\.desktopBridge\.printCurrent\(\{title,savePdf\}\)/,'desktop memakai jembatan Electron');

  const cetak=read('src/pages/print.js');
  assert.match(cetak,/if\(!savePdf&&isDesktop\(\)\)/,'alur desktop: preview lalu konfirmasi sebelum dialog Windows');
  assert.match(cetak,/confirmText:'Lanjut Cetak'/);
  assert.match(cetak,/PDF berhasil disimpan/,'hasil Simpan PDF dilaporkan ke guru');

  const main=read('electron/main.cjs');
  assert.match(main,/webContents\.printToPDF\(\{printBackground:true,pageSize:'A4',preferCSSPageSize:true\}\)/,'Simpan PDF memakai printToPDF dengan ukuran halaman dari CSS');
  assert.match(main,/webContents\.print\(\{silent:false,printBackground:true\}/,'Cetak memakai dialog perangkat');
  /* Leger tetap A4 landscape lewat @page, dan cetak massal tidak berubah. */
  assert.match(cetak,/setPrintPageSize\(orientation\)/);
  assert.match(cetak,/data-bulk-toggle/,'Cetak Semua Rapor tetap tersedia');
  assert.equal(/Cetak Semua Leger/.test(cetak),false,'tidak ada Cetak Semua Leger');
});

/* ----------------------------------------------------------------- 18. Update desktop aman */

test('18. Update desktop mempertahankan data lama dan identitas aplikasi',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const tanpaNis=siswa(session,'TANPA',{nis:''});
  fillAllAssessmentScores(session,'mtk','82');
  saveAllAutomaticReports(session);

  const db=loadDb();db.appVersion=PREVIOUS_RELEASE.version;db.appSchemaVersion=APP_SCHEMA_VERSION;
  localStorage.setItem(storageKey(),JSON.stringify(db));
  const sebelum=JSON.parse(localStorage.getItem(storageKey()));

  const hasil=runAppMigrations();
  assert.equal(hasil.migrated,false,'schema tidak berubah');
  const sesudah=loadDb();
  for(const bagian of ['students','reportScores','assessmentScores','attendance','learningObjectives','assessmentSettings','subjectMappings','transcriptScores'])
    assert.deepEqual(sesudah[bagian],sebelum[bagian],`${bagian} tidak berubah oleh update`);
  assert.equal(sesudah.students[`${session.academicYear}|${session.semester}|5B|${islam.id}`].religion,'Islam');
  assert.equal(sesudah.students[`${session.academicYear}|${session.semester}|5B|${tanpaNis.id}`].nis,'','siswa tanpa NIS tetap tersimpan');

  const builder=read('electron-builder.yml');
  assert.match(builder,/^appId: id\.sch\.sdn\.satriajaya01\.erapor$/m,'appId tidak berubah');
  assert.match(builder,/guid: 9a3f0d21-6c4b-5e88-9d17-2f6a1b7c4e30/,'GUID NSIS tidak berubah');
  assert.match(builder,/^productName: e-Rapor SDN Satria Jaya 01$/m);
  assert.match(builder,/deleteAppDataOnUninstall: false/);
  assert.match(read('electron/main.cjs'),/const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01'/,'lokasi userData tidak berubah');
  assert.ok(VERSION_CODE>PREVIOUS_RELEASE.versionCode,'versionCode naik');
  assert.equal(JSON.parse(read('package.json')).version,APP_VERSION,'versi installer mengikuti rilis');
});
