import test from 'node:test';
import { tugaskan } from './helpers/penugasan.js';
import { SUBJECTS_DEFAULT } from '../src/data/constants.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { APP_SCHEMA_VERSION, APP_VERSION, VERSION_CODE } from '../src/data/version.js';
import { createWorkbookBytes, readWorkbookRows } from '../src/services/excel.js';
import { runtimePlatform, saveFile } from '../src/services/file-io.js';
import { printCurrentDocument } from '../src/services/print-service.js';
import { createStudent, STUDENT_CSV_HEADERS, commitStudentImport, listStudents, previewStudentWorkbookImport, studentTemplateWorkbook } from '../src/services/students.js';
import { transcriptTemplateWorkbook } from '../src/services/transcript.js';
import { digitalGauge } from '../src/ui/digital-gauge.js';
import { loadDb, storageKey } from '../src/services/storage.js';
import { runAppMigrations } from '../src/services/migrations.js';
import { verifyOwnerActivationKey } from '../src/services/owner-activation.js';
import { getReportCompleteness } from '../src/services/documents.js';

const root=new URL('../',import.meta.url);const read=path=>readFileSync(new URL(path,root),'utf8');
function memoryStorage(){const values=new Map();return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
/* Sekolah ditempatkan pada keadaan yang sudah dikonfigurasi Admin: seluruh mapel ditugaskan
   kepada wali kelasnya. Tanpa penugasan, akun Guru memang tidak boleh bekerja. */
const teacher={role:'teacher',classId:'5B',accountId:'teacher:5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
function setup(){globalThis.localStorage=memoryStorage();globalThis.sessionStorage=memoryStorage();delete globalThis.desktopBridge;delete globalThis.NativeFileIO;delete globalThis.NativePrint;}
/* Penugasan hanya disiapkan pada test yang memang menjalankan fungsi akademik Guru, sebab
   menuliskannya berarti menyentuh penyimpanan lokal - dan ada test yang justru memastikan
   penyimpanan lokal tidak tersentuh. */
function setupGuru(){setup();tugaskan(teacher,SUBJECTS_DEFAULT.map(subject=>subject.id));}
function studentInput(overrides={}){return {classId:'5B',nis:'1401',nisn:'001401',name:'Siswa Tahap 14',gender:'P',birthPlace:'Bekasi',birthDate:'2015-03-04',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...overrides};}

test('identitas Tahap 14 konsisten pada web dan Android',()=>{assert.equal(APP_SCHEMA_VERSION,5);const gradle=read('android/app/build.gradle');assert.match(gradle,/applicationId "id\.sch\.sdn\.satriajaya01\.erapor"/);assert.match(gradle,new RegExp(`\\?: '${VERSION_CODE}'`));assert.match(gradle,new RegExp(`\\?: '${APP_VERSION.replace(/\./g,'\\.')}'`));});

test('template siswa adalah XLSX biner nyata dan import tetap Preview sebelum Commit',()=>{setupGuru();const template=studentTemplateWorkbook();assert.equal(String.fromCharCode(...new Uint8Array(template).slice(0,2)),'PK');assert.deepEqual(readWorkbookRows(template)[0],STUDENT_CSV_HEADERS);const bytes=createWorkbookBytes('Data Siswa',[STUDENT_CSV_HEADERS,['1401','001401','Siswa XLSX','P','Islam','Bekasi, 4 Maret 2015','Orang Tua','','Alamat']]);const preview=previewStudentWorkbookImport(teacher,bytes,{classId:'5B'});assert.equal(preview.canCommit,true);assert.equal(listStudents(teacher).length,0);assert.equal(commitStudentImport(teacher,preview).length,1);assert.equal(listStudents(teacher)[0].name,'Siswa XLSX');});

test('template transkrip adalah XLSX nyata dan mengikuti data scope',()=>{setupGuru();createStudent(teacher,studentInput());const bytes=transcriptTemplateWorkbook(teacher);assert.equal(String.fromCharCode(...new Uint8Array(bytes).slice(0,2)),'PK');const rows=readWorkbookRows(bytes);assert.deepEqual(rows[0],['NISN','NIS','Nama','Kode Mapel','Mata Pelajaran','Nilai']);assert.ok(rows.length>1);});

test('FileIOService memilih bridge Windows dan Android tanpa mengubah data lokal',async()=>{setup();let windowsPayload=null;globalThis.desktopBridge={saveFile:async payload=>{windowsPayload=payload;return {saved:true};}};assert.equal(runtimePlatform(),'windows');await saveFile({name:'uji.xlsx',data:new Uint8Array([1,2,3])});assert.equal(windowsPayload.name,'uji.xlsx');delete globalThis.desktopBridge;let androidPayload=null;globalThis.NativeFileIO={saveBase64(...values){androidPayload=values;}};assert.equal(runtimePlatform(),'android');await saveFile({name:'backup.json',mime:'application/json',data:'{}'});assert.equal(androidPayload[0],'backup.json');assert.equal(localStorage.getItem(storageKey()),null);});

test('PrintService memakai bridge platform dan membawa mode Simpan PDF',async()=>{let payload=null;globalThis.desktopBridge={printCurrent:async value=>{payload=value;return {saved:true};}};await printCurrentDocument({title:'Rapor 5B',savePdf:true});assert.deepEqual(payload,{title:'Rapor 5B',savePdf:true});delete globalThis.desktopBridge;});

test('DigitalGauge reusable mengikat nilai 0 sampai 100 dan aksesibilitas meter',()=>{const html=digitalGauge(137,{label:'Kelengkapan',tone:'green'});assert.match(html,/role="meter"/);assert.match(html,/aria-valuenow="100"/);assert.match(html,/--gauge-value:100/);});

test('migration schema 2 ke 3 menambah mapel Kristen, mengganti label Islam, dan mempertahankan semua data',()=>{setup();const db=loadDb();db.appSchemaVersion=2;db.appVersion='1.0.1';db.masterData.references.subjects=db.masterData.references.subjects.filter(item=>item.id!=='agama_kristen').map(item=>item.id==='agama'?{...item,name:'Pendidikan Agama dan Budi Pekerti'}:item);const scope=`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B`;db.subjectMappings[scope]=db.masterData.references.subjects.map(item=>({...item}));db.students[`${scope}|lama`]={id:'lama',classId:'5B',nis:'1',nisn:'1',name:'Data Lama'};db.attendance[`${scope}|2026-08-10`]={statuses:{lama:'Hadir'}};db.assessmentScores[`${scope}|agama|formative|lama`]={score:88};db.reportScores[`${scope}|agama|lama`]={finalScore:88};db.learningObjectives[`${scope}|agama|legacy`]={id:'legacy',description:'TP legacy',order:1};db.security.ownerActivated=true;localStorage.setItem(storageKey(),JSON.stringify(db));runAppMigrations();const next=JSON.parse(localStorage.getItem(storageKey()));assert.equal(next.appSchemaVersion,APP_SCHEMA_VERSION);assert.ok(next.masterData.references.subjects.some(item=>item.id==='seni_rupa'),'Seni Rupa masuk lewat migration');assert.ok(next.subjectMappings[scope].some(item=>item.id==='seni_rupa'),'Seni Rupa masuk ke Mapping rombel yang sudah tersimpan');assert.equal(next.masterData.references.subjects.find(item=>item.id==='agama').name,'Pendidikan Agama Islam dan Budi Pekerti');assert.ok(next.masterData.references.subjects.some(item=>item.id==='agama_kristen'));assert.equal(next.students[`${scope}|lama`].name,'Data Lama');assert.equal(next.attendance[`${scope}|2026-08-10`].statuses.lama,'Hadir');assert.equal(next.assessmentScores[`${scope}|agama|formative|lama`].score,88);assert.equal(next.reportScores[`${scope}|agama|lama`].finalScore,88);assert.equal(next.learningObjectives[`${scope}|agama|legacy`].code,'TP-1');assert.equal(next.security.ownerActivated,true);});

test('status kenaikan dan kelulusan tidak pernah menahan kelengkapan rapor',()=>{setupGuru();createStudent(teacher,studentInput());const ganjil=getReportCompleteness(teacher).students[0];assert.equal(Object.hasOwn(ganjil.categories,'finalStatus'),false);const genap={...teacher,semester:`Genap ${ACADEMIC_YEAR}`};tugaskan(genap,SUBJECTS_DEFAULT.map(subject=>subject.id));createStudent(genap,studentInput({id:'genap',nis:'1402',nisn:'001402'}));assert.equal(Object.hasOwn(getReportCompleteness(genap).students[0].categories,'finalStatus'),false,'guru menentukan sendiri kapan mengisinya');});

test('gauge, Android bridge, dan Electron Forge tersedia dalam satu frontend tanpa intro lama',()=>{const html=read('index.html'),main=read('electron/main.cjs'),java=read('android/app/src/main/java/id/sch/sdn/satriajaya01/erapor/MainActivity.java'),pkg=JSON.parse(read('package.json'));assert.equal(html.includes('intro-logo.mp4'),false,'opening lama sudah dibuang');assert.equal(html.includes('data-intro-screen'),false,'layar intro sudah dibuang');assert.equal(existsSync(new URL('../assets/intro-logo.mp4',import.meta.url)),true);assert.match(main,/const distPath=path\.join\(__dirname,'\.\.','dist'\)/);assert.match(java,/NativeFileIO/);assert.match(java,/NativePrint/);assert.match(pkg.scripts['desktop:make'],/electron-forge make/);});

/* Key aktivasi Owner memang disimpan di luar repository dan hanya ada pada mesin pemilik, jadi
   pemeriksaan yang membutuhkan key dilewati bila berkasnya tidak tersedia (misalnya di GitHub
   Actions). Pemeriksaan terpenting tetap dijalankan di mana pun: PIN tidak boleh pernah muncul
   sebagai teks biasa di source maupun di hasil build. */
const ownerKeyPath=new URL('../../owner-credentials/owner-key.json',import.meta.url);
test('PIN Owner awal baru valid hanya bersama key eksternal dan tidak plaintext di source',async()=>{
  const pin=String.fromCharCode(50,51,48,49,49,57,57,49);
  assert.equal(read('src/data/owner-verifier.js').includes(pin),false,'PIN tidak boleh ada di source');
  assert.equal(read('dist/src/data/owner-verifier.js').includes(pin),false,'PIN tidak boleh ada di hasil build');
  if(!existsSync(ownerKeyPath)){console.log('  (key eksternal tidak tersedia di lingkungan ini, pemeriksaan PIN terhadap key dilewati)');return;}
  const key=JSON.parse(readFileSync(ownerKeyPath,'utf8'));
  assert.equal(await verifyOwnerActivationKey(key,pin),true,'PIN benar hanya valid bersama key eksternal');
  assert.equal(await verifyOwnerActivationKey(key,'00000000'),false,'PIN salah tetap ditolak');
});
