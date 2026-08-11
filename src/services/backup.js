import { CLASSES, SUBJECTS_DEFAULT } from '../data/constants.js';
import { exportDb, replaceDb, scopeKey, updateDb } from './storage.js';

const APP_NAME='e-Rapor SDN Satria Jaya 01';
const SCHEMA_VERSION=1;
const BACKUP_VERSION='1.0';
const SCOPED_COLLECTIONS=[
  'settings','subjectMappings','assessmentSettings','students','attendance',
  'learningObjectives','assessmentScores','reportScores','reportDescriptions',
  'extracurricularScores','cocurricularActivities','cocurricularScores','attitudeProfiles','printSettings','homeroomNotes','promotionStatus','graduationStatus','transcriptScores'
];
const GLOBAL_COLLECTIONS=['masterData','userAccounts','security'];
const DATA_KEYS=new Set(['schemaVersion','appSchemaVersion','appVersion','createdAt','updatedAt',...GLOBAL_COLLECTIONS,...SCOPED_COLLECTIONS,'backupHistory','migrationHistory']);
const DANGEROUS_KEYS=new Set(['__proto__','prototype','constructor']);

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function isPlainObject(value){ return value!==null && typeof value==='object' && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype; }
function assert(condition,message){ if(!condition) throw new Error(message); }
function isIsoDate(value){
  if(typeof value!=='string') return false;
  try{return new Date(value).toISOString()===value}catch{return false}
}
function belongsToScope(key,scope){ return key===scope || key.startsWith(`${scope}|`); }
function transcriptScopeFrom(scope){const [academicYear,,classId]=String(scope||'').split('|');return `${academicYear}|${classId}`;}
function belongsToCollectionScope(collection,key,scope){return collection==='transcriptScores'?belongsToScope(key,transcriptScopeFrom(scope)):belongsToScope(key,scope);}
function safeSegment(value){ return String(value||'').trim().replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase(); }
function validAcademicYear(value){const match=String(value||'').match(/^(\d{4})\/(\d{4})$/);return Boolean(match&&Number(match[2])===Number(match[1])+1);}
function semesterMatchesYear(semester,academicYear){return validAcademicYear(academicYear)&&['Ganjil','Genap'].some(name=>semester===`${name} ${academicYear}`);}

function validateJsonValue(value,path,depth=0){
  assert(depth<=20,`Struktur ${path} terlalu dalam.`);
  if(value===null || typeof value==='string' || typeof value==='boolean') return;
  if(typeof value==='number'){
    assert(Number.isFinite(value),`Nilai angka pada ${path} tidak valid.`);
    return;
  }
  if(Array.isArray(value)){
    value.forEach((item,index)=>validateJsonValue(item,`${path}[${index}]`,depth+1));
    return;
  }
  assert(isPlainObject(value),`Struktur ${path} harus berupa data JSON biasa.`);
  Object.entries(value).forEach(([key,item])=>{
    assert(!DANGEROUS_KEYS.has(key),`Kunci ${path}.${key} tidak diizinkan.`);
    validateJsonValue(item,`${path}.${key}`,depth+1);
  });
}

function validateSubjectMapping(mapping,path){
  assert(Array.isArray(mapping),`${path} harus berupa daftar mata pelajaran.`);
  assert(mapping.length===SUBJECTS_DEFAULT.length,`${path} harus memuat ${SUBJECTS_DEFAULT.length} mata pelajaran.`);
  const expectedById=new Map(SUBJECTS_DEFAULT.map(item=>[item.id,item]));
  const ids=new Set();
  const orders={A:new Set(),B:new Set()};
  mapping.forEach((item,index)=>{
    assert(isPlainObject(item),`${path}[${index}] tidak valid.`);
    const expected=expectedById.get(item.id);
    assert(expected && !ids.has(item.id),`${path} memiliki ID mata pelajaran yang tidak valid atau duplikat.`);
    assert(['A','B'].includes(item.group),`${path}.${item.id} memiliki kelompok yang tidak valid.`);
    assert(typeof item.name==='string' && item.name.trim(),`${path}.${item.id} tidak memiliki nama yang valid.`);
    assert(typeof item.active==='boolean',`${path}.${item.id} harus memiliki status aktif boolean.`);
    assert(Number.isInteger(item.order) && item.order>=1 && !orders[item.group].has(item.order),`${path}.${item.id} memiliki urutan yang tidak valid pada Kelompok ${item.group}.`);
    ids.add(item.id);orders[item.group].add(item.order);
  });
  assert(ids.size===expectedById.size,`${path} tidak memuat seluruh mata pelajaran wajib.`);
  ['A','B'].forEach(group=>[...orders[group]].sort((a,b)=>a-b).forEach((order,index)=>assert(order===index+1,`${path} memiliki nomor tidak berurutan pada Kelompok ${group}.`)));
}

function validateBackupData(data,teacherScope=null){
  assert(isPlainObject(data),'Bagian data backup harus berupa object.');
  if(!Object.hasOwn(data,'appSchemaVersion'))data.appSchemaVersion=1;
  if(!Object.hasOwn(data,'appVersion'))data.appVersion='legacy';
  if(!Object.hasOwn(data,'migrationHistory'))data.migrationHistory=[];
  GLOBAL_COLLECTIONS.forEach(collection=>{if(!Object.hasOwn(data,collection))data[collection]={};});
  ['cocurricularActivities','cocurricularScores','attitudeProfiles','printSettings'].forEach(collection=>{if(!Object.hasOwn(data,collection))data[collection]={};});
  Object.keys(data).forEach(key=>assert(DATA_KEYS.has(key),`Bagian data.${key} tidak dikenal.`));
  DATA_KEYS.forEach(key=>assert(Object.hasOwn(data,key),`Bagian data.${key} tidak tersedia.`));
  assert(data.schemaVersion===SCHEMA_VERSION,'Versi database pada backup tidak kompatibel.');
  assert(Number.isInteger(data.appSchemaVersion)&&data.appSchemaVersion>=1,'appSchemaVersion pada backup tidak valid.');
  assert(typeof data.appVersion==='string'&&data.appVersion.trim(),'Versi aplikasi pada backup tidak valid.');
  assert(isIsoDate(data.createdAt) && isIsoDate(data.updatedAt),'Timestamp database pada backup tidak valid.');
  SCOPED_COLLECTIONS.forEach(collection=>{
    const records=data[collection];
    assert(isPlainObject(records),`Bagian data.${collection} harus berupa object.`);
    Object.entries(records).forEach(([key,value])=>{
      assert(key.length>0 && !DANGEROUS_KEYS.has(key),`Kunci data.${collection} tidak valid.`);
      if(teacherScope) assert(belongsToCollectionScope(collection,key,teacherScope),`Backup Guru memuat data di luar scope ${teacherScope}.`);
      validateJsonValue(value,`data.${collection}.${key}`);
      if(collection==='subjectMappings') validateSubjectMapping(value,`data.${collection}.${key}`);
    });
  });
  GLOBAL_COLLECTIONS.forEach(collection=>{assert(isPlainObject(data[collection]),`Bagian data.${collection} harus berupa object.`);validateJsonValue(data[collection],`data.${collection}`);if(teacherScope)assert(Object.keys(data[collection]).length===0,`Backup Guru tidak boleh memuat data global ${collection}.`);});
  assert(Array.isArray(data.backupHistory),'Bagian data.backupHistory harus berupa array.');
  validateJsonValue(data.backupHistory,'data.backupHistory');
  assert(Array.isArray(data.migrationHistory),'Bagian data.migrationHistory harus berupa array.');
  validateJsonValue(data.migrationHistory,'data.migrationHistory');
}

function teacherDb(db,session){
  const teacherScope=scopeKey(session);
  const data={
    schemaVersion:SCHEMA_VERSION,
    appSchemaVersion:db.appSchemaVersion,
    appVersion:db.appVersion,
    createdAt:db.createdAt,
    updatedAt:db.updatedAt,
    backupHistory:[],migrationHistory:clone(db.migrationHistory||[]),
  };
  SCOPED_COLLECTIONS.forEach(collection=>{
    data[collection]=Object.fromEntries(Object.entries(db[collection]||{}).filter(([key])=>belongsToCollectionScope(collection,key,teacherScope)));
  });
  GLOBAL_COLLECTIONS.forEach(collection=>{data[collection]={};});
  return data;
}

export function buildBackup(session){
  assert(session?.role==='admin' || session?.role==='teacher','Session backup tidak valid.');
  const db=exportDb();
  const data=session.role==='teacher'?teacherDb(db,session):db;
  const payload={
    app:APP_NAME,
    schemaVersion:SCHEMA_VERSION,
    backupVersion:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    scope:{ role:session.role, classId:session.classId, semester:session.semester, academicYear:session.academicYear },
    data,
  };
  validateBackupPayload(payload);
  return payload;
}

export function backupFilename(session){
  const klass=session.role==='admin'?'ADMIN':`KELAS-${safeSegment(session.classId)}`;
  const semester=safeSegment(String(session.semester||'').split(/\s+/)[0]);
  const academicYear=safeSegment(session.academicYear);
  return `ERAPOR-SDN-SATRIA-JAYA-01-${klass}-${semester}-${academicYear}.backup.json`;
}

export function downloadBackup(session){
  const payload=buildBackup(session);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=backupFilename(session);a.hidden=true;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return payload;
}

export function validateBackupPayload(payload){
  assert(isPlainObject(payload),'Struktur utama backup harus berupa object.');
  const envelopeKeys=new Set(['app','schemaVersion','backupVersion','exportedAt','scope','data']);
  Object.keys(payload).forEach(key=>assert(envelopeKeys.has(key),`Bagian backup.${key} tidak dikenal.`));
  envelopeKeys.forEach(key=>assert(Object.hasOwn(payload,key),`Bagian backup.${key} tidak tersedia.`));
  assert(payload.app===APP_NAME,'File bukan backup e-Rapor SDN Satria Jaya 01.');
  assert(payload.schemaVersion===SCHEMA_VERSION && payload.backupVersion===BACKUP_VERSION,'Versi backup tidak kompatibel.');
  assert(isIsoDate(payload.exportedAt),'Waktu ekspor backup tidak valid.');
  assert(isPlainObject(payload.scope),'Scope backup tidak valid.');
  const scopeKeys=new Set(['role','classId','semester','academicYear']);
  Object.keys(payload.scope).forEach(key=>assert(scopeKeys.has(key),`Bagian scope.${key} tidak dikenal.`));
  scopeKeys.forEach(key=>assert(Object.hasOwn(payload.scope,key),`Bagian scope.${key} tidak tersedia.`));
  assert(['admin','teacher'].includes(payload.scope.role),'Peran pada scope backup tidak valid.');
  assert(semesterMatchesYear(payload.scope.semester,payload.scope.academicYear),'Semester atau tahun pelajaran backup tidak kompatibel.');
  if(payload.scope.role==='teacher') assert(CLASSES.includes(payload.scope.classId),'Rombel pada scope backup tidak valid.');
  if(payload.scope.role==='admin') assert(payload.scope.classId===null,'Backup Admin tidak boleh memiliki scope rombel.');
  const expectedScope=payload.scope.role==='teacher'
    ? `${payload.scope.academicYear}|${payload.scope.semester}|${payload.scope.classId}`
    : null;
  validateBackupData(payload.data,expectedScope);
  return payload;
}

export function parseBackupText(text){
  let parsed;
  try{parsed=JSON.parse(text)}catch{throw new Error('File backup bukan JSON yang valid.');}
  return validateBackupPayload(parsed);
}

export function validateBackupForSession(payload,session){
  validateBackupPayload(payload);
  assert(session?.role==='admin' || session?.role==='teacher','Session restore tidak valid.');
  if(session.role==='teacher'){
    const matches=payload.scope.role==='teacher'
      && payload.scope.classId===session.classId
      && payload.scope.semester===session.semester
      && payload.scope.academicYear===session.academicYear;
    assert(matches,'Scope backup tidak cocok dengan kelas, semester, dan tahun pelajaran Guru yang sedang login.');
  }
  return payload;
}

export function summarizeBackup(payload){
  const d=payload.data||{};
  const count=(obj)=>Object.keys(obj||{}).length;
  return {
    classId:payload.scope?.classId || 'Semua Rombel',
    semester:payload.scope?.semester || '-',
    academicYear:payload.scope?.academicYear || '-',
    students:count(d.students), attendance:count(d.attendance),
    scores:count(d.assessmentScores)+count(d.reportScores),
    objectives:count(d.learningObjectives), mappings:count(d.subjectMappings),
    exportedAt:payload.exportedAt
  };
}

export function restoreBackup(payload,session){
  validateBackupForSession(payload,session);
  if(payload.scope.role==='admin') return replaceDb(clone(payload.data));
  const restoredScope=`${payload.scope.academicYear}|${payload.scope.semester}|${payload.scope.classId}`;
  return updateDb(db=>{
    SCOPED_COLLECTIONS.forEach(collection=>{
      const preserved=Object.fromEntries(Object.entries(db[collection]||{}).filter(([key])=>!belongsToCollectionScope(collection,key,restoredScope)));
      db[collection]={...preserved,...clone(payload.data[collection])};
    });
    return db;
  });
}
