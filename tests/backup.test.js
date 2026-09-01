import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { backupFilename, buildBackup, parseBackupText, restoreBackup, validateBackupForSession } from '../src/services/backup.js';
import { loadDb, saveDb, scopeKey, updateDb } from '../src/services/storage.js';

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    clear:()=>values.clear(),
  };
}
function clone(value){return JSON.parse(JSON.stringify(value));}

const teacher5b={role:'teacher',classId:'5B',semester:`Ganjil ${ACADEMIC_YEAR}`,academicYear:ACADEMIC_YEAR};
const teacher5c={role:'teacher',classId:'5C',semester:`Ganjil ${ACADEMIC_YEAR}`,academicYear:ACADEMIC_YEAR};

function seedTwoClasses(){
  useMemoryStorage();
  const db=loadDb();
  const scope5b=scopeKey(teacher5b),scope5c=scopeKey(teacher5c);
  db.subjectMappings[scope5b]=clone(SUBJECTS_DEFAULT);
  db.subjectMappings[scope5c]=clone(SUBJECTS_DEFAULT);
  db.students[`${scope5b}|student-1`]={id:'student-1',name:'Siswa 5B'};
  db.students[`${scope5c}|student-1`]={id:'student-1',name:'Siswa 5C'};
  db.attendance[`${scope5b}|2026-08-09`]={studentId:'student-1',status:'H'};
  db.attendance[`${scope5c}|2026-08-09`]={studentId:'student-1',status:'I'};
  saveDb(db);
  return {scope5b,scope5c};
}

test('Teacher backup only contains its class, semester, and academic-year scope',()=>{
  const {scope5b,scope5c}=seedTwoClasses();
  const payload=buildBackup(teacher5b);
  for(const collection of ['subjectMappings','students','attendance']){
    const keys=Object.keys(payload.data[collection]);
    assert.ok(keys.length>0);
    assert.ok(keys.every(key=>key===scope5b || key.startsWith(`${scope5b}|`)));
    assert.ok(keys.every(key=>!key.startsWith(scope5c)));
  }
  assert.deepEqual(payload.data.backupHistory,[]);
  assert.equal(backupFilename(teacher5b),'ERAPOR-SDN-SATRIA-JAYA-01-KELAS-5B-GANJIL-2026-2027.backup.json');
});

test('Teacher restore rejects a different scope and Admin backup',()=>{
  seedTwoClasses();
  const payload=buildBackup(teacher5b);
  assert.throws(()=>validateBackupForSession(payload,teacher5c),/Scope backup tidak cocok/);
  const adminPayload=buildBackup({role:'admin',classId:null,semester:teacher5b.semester,academicYear:ACADEMIC_YEAR});
  assert.throws(()=>validateBackupForSession(adminPayload,teacher5b),/Scope backup tidak cocok/);
});

test('Deep backup validation rejects missing collections and foreign Teacher data',()=>{
  const {scope5c}=seedTwoClasses();
  const payload=buildBackup(teacher5b);
  const missingCollection=clone(payload);delete missingCollection.data.attendance;
  assert.throws(()=>parseBackupText(JSON.stringify(missingCollection)),/data.attendance tidak tersedia/);
  const foreignScope=clone(payload);foreignScope.data.students[`${scope5c}|student-x`]={id:'student-x'};
  assert.throws(()=>parseBackupText(JSON.stringify(foreignScope)),/di luar scope/);
  const brokenMapping=clone(payload);brokenMapping.data.subjectMappings[scopeKey(teacher5b)][1].order=1;
  assert.throws(()=>parseBackupText(JSON.stringify(brokenMapping)),/urutan yang tidak valid/);
});

test('Teacher restore replaces only its scope and preserves another class',()=>{
  const {scope5b,scope5c}=seedTwoClasses();
  const payload=buildBackup(teacher5b);
  payload.data.students[`${scope5b}|student-1`].name='Hasil Restore 5B';
  restoreBackup(payload,teacher5b);
  const restored=loadDb();
  assert.equal(restored.students[`${scope5b}|student-1`].name,'Hasil Restore 5B');
  assert.equal(restored.students[`${scope5c}|student-1`].name,'Siswa 5C');
});

test('Backup Guru tidak pernah memuat konfigurasi maupun log Dapodik',()=>{
  useMemoryStorage();
  updateDb(db=>{
    db.dapodikSyncState={aktif:{npsn:'20218098',semesterId:'20262',lastPullAt:'2026-09-01T00:00:00.000Z'}};
    db.dapodikSyncLogs={'log-1':{id:'log-1',operation:'pull',status:'SUCCESS',counts:{created:{students:1}},actor:'admin'}};
    db.dapodikMappings={'rombel-5b':{classId:'5B'}};
    return db;
  });
  const guru=buildBackup({role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
  assert.deepEqual(guru.data.dapodikSyncState,{});
  assert.deepEqual(guru.data.dapodikSyncLogs,{});
  assert.deepEqual(guru.data.dapodikMappings,{});
  /* Token Dapodik hidup di luar basis data (safeStorage desktop), jadi tidak mungkin ikut. */
  assert.doesNotMatch(JSON.stringify(guru),/bearer|token/i);
  const adminBackup=buildBackup({role:'admin',classId:null,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
  assert.equal(Object.keys(adminBackup.data.dapodikSyncLogs).length,1,'Admin tetap membawa log untuk audit');
});
