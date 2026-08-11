import { CLASSES } from '../data/constants.js';
import { listReferenceAcademicYears, listReferenceSemesters } from './references.js';
import { loadDb, updateDb } from './storage.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=1500){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function newId(){return globalThis.crypto?.randomUUID?.()||`cocurricular-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengelola Data Kokurikuler.');}
function keyOf(record){return `${record.academicYear}|${record.semester}|${record.classId}|${record.id}`;}
function sameScope(a,b){return a.classId===b.classId&&a.semester===b.semester&&a.academicYear===b.academicYear;}

function normalize(session,input){
  assertAdmin(session);const name=clean(input?.name,150),classId=clean(input?.classId,4).toUpperCase(),semester=clean(input?.semester,40),academicYear=clean(input?.academicYear,20),description=clean(input?.description,1500);
  if(!name)throw new Error('Nama kegiatan wajib diisi.');
  if(!CLASSES.includes(classId))throw new Error('Rombel kokurikuler tidak valid.');
  if(!listReferenceAcademicYears().some(item=>item.id===academicYear))throw new Error('Tahun pelajaran kokurikuler tidak tersedia pada Data Referensi.');
  if(!listReferenceSemesters({academicYear}).some(item=>item.label===semester))throw new Error('Semester kokurikuler tidak cocok dengan tahun pelajaran.');
  if(!description)throw new Error('Deskripsi kegiatan wajib diisi.');
  return {name,classId,semester,academicYear,description,active:input?.active!==false};
}

export function listCocurricularActivities(session,{classId='ALL',semester='ALL',academicYear='ALL'}={}){
  assertAdmin(session);if(classId!=='ALL'&&!CLASSES.includes(classId))throw new Error('Filter rombel kokurikuler tidak valid.');
  return Object.values(loadDb().cocurricularActivities||{}).filter(item=>(classId==='ALL'||item.classId===classId)&&(semester==='ALL'||item.semester===semester)&&(academicYear==='ALL'||item.academicYear===academicYear)).map(clone).sort((a,b)=>a.classId.localeCompare(b.classId,'id')||a.name.localeCompare(b.name,'id'));
}

export function createCocurricularActivity(session,input){
  const value=normalize(session,input);let saved;
  updateDb(db=>{const records=Object.values(db.cocurricularActivities||{});if(records.some(item=>sameScope(item,value)&&item.name.toLowerCase()===value.name.toLowerCase()))throw new Error(`Kegiatan ${value.name} sudah tersedia pada scope yang sama.`);const now=new Date().toISOString();saved={...value,id:newId(),createdAt:now,updatedAt:now};db.cocurricularActivities[keyOf(saved)]=saved;return db;});return clone(saved);
}

export function updateCocurricularActivity(session,id,input){
  const value=normalize(session,input);let saved;
  updateDb(db=>{const entry=Object.entries(db.cocurricularActivities||{}).find(([,item])=>item.id===id);if(!entry)throw new Error('Kegiatan kokurikuler tidak ditemukan.');const records=Object.values(db.cocurricularActivities);if(records.some(item=>item.id!==id&&sameScope(item,value)&&item.name.toLowerCase()===value.name.toLowerCase()))throw new Error(`Kegiatan ${value.name} sudah tersedia pada scope yang sama.`);saved={...entry[1],...value,id,updatedAt:new Date().toISOString()};delete db.cocurricularActivities[entry[0]];db.cocurricularActivities[keyOf(saved)]=saved;return db;});return clone(saved);
}

export function deleteCocurricularActivity(session,id){
  assertAdmin(session);let removed=false;updateDb(db=>{const entry=Object.entries(db.cocurricularActivities||{}).find(([,item])=>item.id===id);if(!entry)throw new Error('Kegiatan kokurikuler tidak ditemukan.');delete db.cocurricularActivities[entry[0]];removed=true;return db;});return removed;
}
