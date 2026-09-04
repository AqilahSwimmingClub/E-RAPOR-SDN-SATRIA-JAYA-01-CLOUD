import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_SCHEMA_VERSION, APP_VERSION, BUILD_TAG, PREVIOUS_RELEASE, VERSION_CODE } from '../src/data/version.js';
import { listMigrationSafetySnapshots, runAppMigrations } from '../src/services/migrations.js';
import { loadDb, storageKey } from '../src/services/storage.js';

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    clear:()=>values.clear(),
  };
}

function legacyFixture(){
  useMemoryStorage();
  const db=loadDb();
  const scope='2025/2026|Ganjil 2025/2026|2A';
  db.appSchemaVersion=1;db.appVersion='0.9.0';delete db.migrationHistory;
  db.students[`${scope}|student-old`]={id:'student-old',nis:'1001',nisn:'001001',name:'Siswa Lama',fatherName:'Ayah Lama',classId:'2A'};
  db.attendance[`${scope}|2025-08-11`]={date:'2025-08-11',statuses:{'student-old':'Hadir'}};
  db.assessmentScores[`${scope}|agama|formative|student-old`]={studentId:'student-old',subjectId:'agama',assessmentType:'formative',score:84};
  db.reportScores[`${scope}|agama|student-old`]={studentId:'student-old',subjectId:'agama',finalScore:82};
  db.learningObjectives[`${scope}|agama|tp-old`]={id:'tp-old',subjectId:'agama',code:'TP-LAMA',description:'Data TP lama.',order:1,active:true};
  db.subjectMappings[scope]=db.masterData.references.subjects.map(item=>({...item}));
  db.userAccounts['teacher-2a']={id:'teacher-2a',username:'guru2a',role:'teacher',classId:'2A',salt:'salt-lama',passwordHash:'hash-lama',active:true};
  db.security.ownerActivation={activated:true,activatedAt:'2025-07-01T00:00:00.000Z'};
  db.masterData.references.academicYears.unshift({id:'2025/2026',label:'2025/2026',active:false});
  localStorage.setItem(storageKey(),JSON.stringify(db));
  return {before:db,scope};
}

function migrateFixture(){const fixture=legacyFixture();const result=runAppMigrations();return {...fixture,result,after:JSON.parse(localStorage.getItem(storageKey()))};}

test('release v1.2.2 uses versionCode 14 and schema 5',()=>{
  assert.equal(APP_VERSION,'1.2.2');
  assert.equal(VERSION_CODE,14);
  assert.equal(APP_SCHEMA_VERSION,5);
  assert.equal(BUILD_TAG,'1.2.2-INTRAKURIKULER-SIKAP-RUBRIK');
  /* Rilis sebelumnya bergeser ke 1.2.1 supaya APK baru tetap dapat dipasang menimpanya
     tanpa uninstall. Format data tidak berubah: schema tetap 5. */
  assert.deepEqual(PREVIOUS_RELEASE,{version:'1.2.1',versionCode:13});
});

test('migration 4 to 5 adds new collections without changing old records',()=>{
  useMemoryStorage();
  const before=loadDb();
  before.appSchemaVersion=4;
  before.students['2026/2027|Ganjil 2026/2027|5B|student-old']={id:'student-old',classId:'5B',nis:'5001',nisn:'0012345678',name:'Siswa Lama'};
  before.reportScores['old-score']={studentId:'student-old',finalScore:88};
  for(const key of ['intracurricularActivities','intracurricularScores','dapodikSyncState','dapodikSyncLogs','dapodikMappings','publishedReports'])delete before[key];
  localStorage.setItem(storageKey(),JSON.stringify(before));

  runAppMigrations();
  const after=JSON.parse(localStorage.getItem(storageKey()));
  assert.equal(after.appSchemaVersion,5);
  assert.equal(after.students['2026/2027|Ganjil 2026/2027|5B|student-old'].name,'Siswa Lama');
  assert.deepEqual(after.reportScores,before.reportScores);
  for(const key of ['intracurricularActivities','intracurricularScores','dapodikSyncState','dapodikSyncLogs','dapodikMappings','publishedReports'])assert.deepEqual(after[key],{});
});

test('data siswa bertahan setelah migration tanpa mengganti field lama',()=>{
  const {before,after,scope}=migrateFixture();assert.equal(after.students[`${scope}|student-old`].name,before.students[`${scope}|student-old`].name);assert.equal(after.students[`${scope}|student-old`].fatherName,'Ayah Lama');assert.equal(after.students[`${scope}|student-old`].parentName,'Ayah Lama');
});

test('absensi bertahan setelah migration',()=>{const {before,after}=migrateFixture();assert.deepEqual(after.attendance,before.attendance);});
test('nilai penilaian dan nilai rapor bertahan setelah migration',()=>{const {before,after}=migrateFixture();assert.deepEqual(after.assessmentScores,before.assessmentScores);assert.deepEqual(after.reportScores,before.reportScores);});
test('Tujuan Pembelajaran bertahan setelah migration',()=>{const {before,after}=migrateFixture();assert.deepEqual(after.learningObjectives,before.learningObjectives);});
test('Mapping Mata Pelajaran bertahan setelah migration',()=>{const {before,after}=migrateFixture();assert.deepEqual(after.subjectMappings,before.subjectMappings);});
test('akun dan status aktivasi bertahan setelah migration',()=>{const {before,after}=migrateFixture();assert.deepEqual(after.userAccounts,before.userAccounts);assert.deepEqual(after.security,before.security);});
test('arsip tahun pelajaran lama bertahan setelah migration',()=>{const {after}=migrateFixture();assert.ok(after.masterData.references.academicYears.some(item=>item.id==='2025/2026'&&item.active===false));});

test('migration tidak membuat duplikat siswa, akun, Mapping, atau Data Referensi',()=>{
  const {before,after}=migrateFixture();
  for(const collection of ['students','userAccounts','subjectMappings'])assert.equal(Object.keys(after[collection]).length,Object.keys(before[collection]).length);
  const yearIds=after.masterData.references.academicYears.map(item=>item.id);assert.equal(new Set(yearIds).size,yearIds.length);
});

test('field koleksi baru ditambahkan tanpa mengganti record database lama',()=>{
  const {before}=legacyFixture();delete before.cocurricularScores;delete before.attitudeProfiles;delete before.printSettings;localStorage.setItem(storageKey(),JSON.stringify(before));
  runAppMigrations();const after=JSON.parse(localStorage.getItem(storageKey()));
  assert.deepEqual(after.cocurricularScores,{});assert.deepEqual(after.attitudeProfiles,{});assert.deepEqual(after.printSettings,{});assert.equal(after.students[Object.keys(after.students)[0]].name,'Siswa Lama');
});

test('migration membuat safety snapshot lengkap beserta metadata versi',()=>{
  const {result,after}=migrateFixture();const snapshots=listMigrationSafetySnapshots();
  assert.equal(result.migrated,true);assert.equal(after.appSchemaVersion,APP_SCHEMA_VERSION);assert.equal(after.appVersion,APP_VERSION);
  assert.equal(snapshots[0].fromAppVersion,'0.9.0');assert.equal(snapshots[0].toAppVersion,APP_VERSION);assert.equal(snapshots[0].fromSchemaVersion,1);assert.equal(snapshots[0].toSchemaVersion,APP_SCHEMA_VERSION);assert.equal(snapshots[0].status,'SUCCESS');assert.ok(snapshots[0].migratedAt);
});

test('migration failure mengembalikan snapshot database lama persis tanpa reset data',()=>{
  legacyFixture();const originalRaw=localStorage.getItem(storageKey());
  assert.throws(()=>runAppMigrations({migrations:{1:()=>{throw new Error('simulasi gagal');}}}),/data lama sudah dipulihkan/);
  assert.equal(localStorage.getItem(storageKey()),originalRaw);
  const snapshot=listMigrationSafetySnapshots()[0];assert.equal(snapshot.status,'ROLLED_BACK');assert.match(snapshot.error,/simulasi gagal/);
});
