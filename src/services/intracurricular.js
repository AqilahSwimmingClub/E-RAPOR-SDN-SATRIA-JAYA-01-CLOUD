import { CLASSES } from '../data/constants.js';
import { listReferenceAcademicYears, listReferenceSemesters } from './references.js';
import { loadDb, updateDb } from './storage.js';

/* Layanan ini sengaja memakai koleksi sendiri (intracurricularActivities) dan tidak berbagi
   penyimpanan dengan Kokurikuler, supaya kedua daftar kegiatan tidak pernah saling menimpa. */

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=1500){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function newId(){return globalThis.crypto?.randomUUID?.()||`intracurricular-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengelola Data Intrakurikuler.');}
function keyOf(record){return `${record.academicYear}|${record.semester}|${record.classId}|${record.id}`;}
function sameScope(a,b){return a.classId===b.classId&&a.semester===b.semester&&a.academicYear===b.academicYear;}

function normalize(session,input){
  assertAdmin(session);const name=clean(input?.name,150),classId=clean(input?.classId,4).toUpperCase(),semester=clean(input?.semester,40),academicYear=clean(input?.academicYear,20),description=clean(input?.description,1500);
  if(!name)throw new Error('Nama kegiatan wajib diisi.');
  if(!CLASSES.includes(classId))throw new Error('Rombel intrakurikuler tidak valid.');
  if(!listReferenceAcademicYears().some(item=>item.id===academicYear))throw new Error('Tahun pelajaran intrakurikuler tidak tersedia pada Data Referensi.');
  if(!listReferenceSemesters({academicYear}).some(item=>item.label===semester))throw new Error('Semester intrakurikuler tidak cocok dengan tahun pelajaran.');
  if(!description)throw new Error('Deskripsi kegiatan wajib diisi.');
  return {name,classId,semester,academicYear,description,active:input?.active!==false};
}

export function listIntracurricularActivities(session,{classId='ALL',semester='ALL',academicYear='ALL'}={}){
  assertAdmin(session);if(classId!=='ALL'&&!CLASSES.includes(classId))throw new Error('Filter rombel intrakurikuler tidak valid.');
  return Object.values(loadDb().intracurricularActivities||{}).filter(item=>(classId==='ALL'||item.classId===classId)&&(semester==='ALL'||item.semester===semester)&&(academicYear==='ALL'||item.academicYear===academicYear)).map(clone).sort((a,b)=>a.classId.localeCompare(b.classId,'id')||a.name.localeCompare(b.name,'id'));
}

/* Wali kelas tidak boleh mengubah master intrakurikuler, tetapi tetap perlu membacanya untuk
   mengisi nilai siswa. Fungsi ini membatasi bacaan pada rombel dan periode yang ditugaskan. */
export function listAssignedIntracurricularActivities(session){
  if(session?.role==='admin')return listIntracurricularActivities(session,{classId:'ALL',academicYear:session.academicYear,semester:session.semester}).filter(item=>item.active!==false);
  if(session?.role!=='teacher'||!session?.classId)throw new Error('Sesi tidak berwenang membaca Data Intrakurikuler.');
  return Object.values(loadDb().intracurricularActivities||{}).filter(item=>item.classId===session.classId&&item.academicYear===session.academicYear&&item.semester===session.semester&&item.active!==false).map(clone).sort((a,b)=>a.name.localeCompare(b.name,'id'));
}

export function createIntracurricularActivity(session,input){
  const value=normalize(session,input);let saved;
  updateDb(db=>{const records=Object.values(db.intracurricularActivities||{});if(records.some(item=>sameScope(item,value)&&item.name.toLowerCase()===value.name.toLowerCase()))throw new Error(`Kegiatan ${value.name} sudah tersedia pada scope yang sama.`);const now=new Date().toISOString();saved={...value,id:newId(),createdAt:now,updatedAt:now};db.intracurricularActivities[keyOf(saved)]=saved;return db;});return clone(saved);
}

export function updateIntracurricularActivity(session,id,input){
  const value=normalize(session,input);let saved;
  updateDb(db=>{const entry=Object.entries(db.intracurricularActivities||{}).find(([,item])=>item.id===id);if(!entry)throw new Error('Kegiatan intrakurikuler tidak ditemukan.');const records=Object.values(db.intracurricularActivities);if(records.some(item=>item.id!==id&&sameScope(item,value)&&item.name.toLowerCase()===value.name.toLowerCase()))throw new Error(`Kegiatan ${value.name} sudah tersedia pada scope yang sama.`);saved={...entry[1],...value,id,updatedAt:new Date().toISOString()};delete db.intracurricularActivities[entry[0]];db.intracurricularActivities[keyOf(saved)]=saved;return db;});return clone(saved);
}

export function deleteIntracurricularActivity(session,id){
  assertAdmin(session);let removed=false;updateDb(db=>{const entry=Object.entries(db.intracurricularActivities||{}).find(([,item])=>item.id===id);if(!entry)throw new Error('Kegiatan intrakurikuler tidak ditemukan.');delete db.intracurricularActivities[entry[0]];removed=true;return db;});return removed;
}
