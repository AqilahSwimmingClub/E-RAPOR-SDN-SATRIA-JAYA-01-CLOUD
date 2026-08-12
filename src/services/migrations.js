import { APP_SCHEMA_VERSION, APP_VERSION, VERSION_CODE } from '../data/version.js';
import { SUBJECTS_DEFAULT } from '../data/constants.js';
import { storageKey } from './storage.js';
import { normalizeMappingGroups } from './mapping.js';

const MIGRATION_SNAPSHOT_KEY='erapor_migration_safety_snapshots_v1';
const REQUIRED_OBJECT_COLLECTIONS=['settings','masterData','userAccounts','security','subjectMappings','assessmentSettings','students','attendance','learningObjectives','assessmentScores','reportScores','reportDescriptions','extracurricularScores','cocurricularActivities','cocurricularScores','attitudeProfiles','printSettings','homeroomNotes','promotionStatus','graduationStatus','transcriptScores'];
const PRESERVED_COLLECTIONS=['students','attendance','learningObjectives','assessmentScores','reportScores','subjectMappings','userAccounts'];
function clone(value){return JSON.parse(JSON.stringify(value));}
function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function snapshots(){try{const parsed=JSON.parse(localStorage.getItem(MIGRATION_SNAPSHOT_KEY)||'[]');return Array.isArray(parsed)?parsed:[];}catch{return [];}}
function saveSnapshots(items){localStorage.setItem(MIGRATION_SNAPSHOT_KEY,JSON.stringify(items.slice(0,5)));}
function id(){return globalThis.crypto?.randomUUID?.()||`migration-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;}
function recordCounts(db){return Object.fromEntries(PRESERVED_COLLECTIONS.map(collection=>[collection,Object.keys(db?.[collection]||{}).length]));}
function assertPreserved(before,after){const counts=recordCounts(before);Object.entries(counts).forEach(([collection,count])=>{if(Object.keys(after?.[collection]||{}).length<count)throw new Error(`Migration mengurangi data ${collection}.`);});const oldYears=before?.masterData?.references?.academicYears||[],newYears=after?.masterData?.references?.academicYears||[];if(newYears.length<oldYears.length)throw new Error('Migration mengurangi arsip tahun pelajaran.');}
export function validateMigratedDatabase(db,{expectedSchemaVersion=APP_SCHEMA_VERSION,before=null}={}){if(!isObject(db))throw new Error('Database hasil migration tidak valid.');if(db.appSchemaVersion!==expectedSchemaVersion)throw new Error('appSchemaVersion hasil migration tidak sesuai.');REQUIRED_OBJECT_COLLECTIONS.forEach(collection=>{if(!isObject(db[collection]))throw new Error(`Koleksi ${collection} hasil migration tidak valid.`);});if(!Array.isArray(db.migrationHistory))throw new Error('Riwayat migration tidak valid.');const refs=db.masterData?.references;if(!isObject(refs)||!Array.isArray(refs.academicYears)||!Array.isArray(refs.semesters))throw new Error('Data Referensi hasil migration tidak valid.');for(const records of [refs.academicYears,refs.semesters]){const ids=records.map(item=>item?.id);if(new Set(ids).size!==ids.length)throw new Error('Migration membuat Data Referensi duplikat.');}const studentIds=Object.values(db.students).map(item=>item?.id).filter(Boolean);if(new Set(studentIds).size!==studentIds.length)throw new Error('Migration membuat siswa duplikat.');if(before)assertPreserved(before,db);return true;}
function migrate1To2(db){const next=clone(db);REQUIRED_OBJECT_COLLECTIONS.filter(collection=>collection!=='masterData').forEach(collection=>{if(!Object.hasOwn(next,collection))next[collection]={};});Object.values(next.students||{}).forEach(student=>{if(!Object.hasOwn(student,'parentName'))student.parentName=String(student.fatherName||student.motherName||'');});if(!Object.hasOwn(next,'migrationHistory'))next.migrationHistory=[];next.appSchemaVersion=2;return next;}
/* Mapel yang belum ada pada daftar tersimpan diperlakukan sama seperti pada schema 4:
   masuk nonaktif untuk Mapping rombel, dan memakai status bawaan untuk master referensi. */
function mergeSchema3Subjects(subjects,{activateNew=false}={}){const saved=new Map((Array.isArray(subjects)?subjects:[]).map(item=>[item?.id,item]));return normalizeMappingGroups(SUBJECTS_DEFAULT.map(subject=>{const lama=saved.get(subject.id);return {...subject,...(lama||{}),id:subject.id,name:subject.id==='agama'?subject.name:String(lama?.name||subject.name),active:lama?lama.active!==false:(activateNew?subject.active!==false:false)};}));}
function migrate2To3(db){
  const next=clone(db);next.masterData=next.masterData||{};next.masterData.references=next.masterData.references||{};
  next.masterData.references.subjects=mergeSchema3Subjects(next.masterData.references.subjects,{activateNew:true});
  next.subjectMappings=Object.fromEntries(Object.entries(next.subjectMappings||{}).map(([key,mapping])=>[key,mergeSchema3Subjects(mapping)]));
  const grouped=new Map();Object.entries(next.learningObjectives||{}).forEach(([key,record])=>{const scope=key.split('|').slice(0,-1).join('|');if(!grouped.has(scope))grouped.set(scope,[]);grouped.get(scope).push([key,record]);});
  grouped.forEach(records=>records.sort((a,b)=>(Number(a[1].order)||0)-(Number(b[1].order)||0)).forEach(([key,record],index)=>{next.learningObjectives[key]={...record,code:String(record?.code||'').trim()||`TP-${index+1}`,order:index+1};}));
  next.appSchemaVersion=3;return next;
}
/* Schema 4: mapel baru pada SUBJECTS_DEFAULT (mis. Seni Rupa) disisipkan ke master dan ke
   setiap Mapping rombel yang sudah tersimpan, tanpa mengubah nama, urutan, kelompok, atau
   status aktif mapel yang sudah diatur guru.

   Pada Mapping yang sudah ada, mapel baru masuk dalam keadaan NONAKTIF. Bila langsung aktif,
   Leger rombel berjalan akan bertambah kolom kosong dan kelengkapan rapor seluruh siswa
   berubah menjadi belum lengkap sehingga cetak final terblokir. Guru cukup mengaktifkannya
   lewat Mapping saat siap. Master referensi tetap memakai status bawaan. */
function mergeNewDefaultSubjects(subjects,{activateNew=false}={}){
  const saved=Array.isArray(subjects)?subjects.filter(item=>item&&item.id):[];
  const known=new Set(saved.map(item=>item.id));
  const tambahan=SUBJECTS_DEFAULT.filter(subject=>!known.has(subject.id))
    .map(subject=>({...subject,active:activateNew?subject.active:false}));
  return normalizeMappingGroups([...saved,...tambahan]);
}
function migrate3To4(db){
  const next=clone(db);next.masterData=next.masterData||{};next.masterData.references=next.masterData.references||{};
  next.masterData.references.subjects=mergeNewDefaultSubjects(next.masterData.references.subjects,{activateNew:true});
  next.subjectMappings=Object.fromEntries(Object.entries(next.subjectMappings||{}).map(([key,mapping])=>[key,Array.isArray(mapping)?mergeNewDefaultSubjects(mapping):mapping]));
  next.appSchemaVersion=4;return next;
}
export const APP_MIGRATIONS=Object.freeze({1:migrate1To2,2:migrate2To3,3:migrate3To4});
export function listMigrationSafetySnapshots(){return snapshots().map(item=>({...item,database:undefined}));}
export function migrationSnapshotStorageKey(){return MIGRATION_SNAPSHOT_KEY;}
export function getApplicationInfo(){let schemaVersion=APP_SCHEMA_VERSION,lastMigration=null;try{const raw=localStorage.getItem(storageKey());if(raw){const db=JSON.parse(raw);schemaVersion=Number(db.appSchemaVersion||1);lastMigration=Array.isArray(db.migrationHistory)?db.migrationHistory.at(-1)||null:null;}}catch{}return {name:'e-Rapor SDN Satria Jaya 01',versionName:APP_VERSION,versionCode:VERSION_CODE,schemaVersion,lastMigration};}
export function runAppMigrations({targetSchemaVersion=APP_SCHEMA_VERSION,targetAppVersion=APP_VERSION,migrations=APP_MIGRATIONS,now=()=>new Date()}={}){
  const raw=localStorage.getItem(storageKey());if(!raw)return {migrated:false,fromSchemaVersion:targetSchemaVersion,toSchemaVersion:targetSchemaVersion};let original;try{original=JSON.parse(raw);}catch{throw new Error('Database lokal tidak dapat dibaca. Data lama tidak diubah.');}if(!isObject(original))throw new Error('Database lokal tidak valid. Data lama tidak diubah.');const fromSchema=Number(original.appSchemaVersion||1);if(!Number.isInteger(fromSchema)||fromSchema<1)throw new Error('appSchemaVersion lama tidak valid.');if(fromSchema>targetSchemaVersion)throw new Error('Versi data lebih baru daripada aplikasi ini. Gunakan APK versi yang sesuai.');if(fromSchema===targetSchemaVersion)return {migrated:false,fromSchemaVersion:fromSchema,toSchemaVersion:fromSchema};
  const migratedAt=now().toISOString();const metadata={id:id(),fromAppVersion:String(original.appVersion||'legacy'),toAppVersion:targetAppVersion,fromSchemaVersion:fromSchema,toSchemaVersion:targetSchemaVersion,migratedAt,status:'PENDING'};const snapshot={...metadata,database:clone(original)};saveSnapshots([snapshot,...snapshots()]);let working=clone(original),current=fromSchema;
  try{while(current<targetSchemaVersion){const migrate=migrations[current];if(typeof migrate!=='function')throw new Error(`Migration schema ${current} ke ${current+1} tidak tersedia.`);const before=clone(working);working=migrate(working);current+=1;working.appSchemaVersion=current;validateMigratedDatabase(working,{expectedSchemaVersion:current,before});}const completed={...metadata,status:'SUCCESS'};working.appVersion=targetAppVersion;working.migrationHistory=[...(Array.isArray(working.migrationHistory)?working.migrationHistory:[]),completed];validateMigratedDatabase(working,{expectedSchemaVersion:targetSchemaVersion,before:original});localStorage.setItem(storageKey(),JSON.stringify(working));saveSnapshots(snapshots().map(item=>item.id===metadata.id?{...item,status:'SUCCESS'}:item));return {migrated:true,...completed};}
  catch(error){localStorage.setItem(storageKey(),raw);saveSnapshots(snapshots().map(item=>item.id===metadata.id?{...item,status:'ROLLED_BACK',error:String(error.message||error).slice(0,300)}:item));throw new Error(`Migration gagal dan data lama sudah dipulihkan: ${error.message}`);}
}
