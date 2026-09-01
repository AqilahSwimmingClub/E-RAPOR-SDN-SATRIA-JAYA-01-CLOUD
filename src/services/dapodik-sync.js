import { CLASSES } from '../data/constants.js';
import { validateSchoolContext } from './dapodik-adapter.js';
import { loadDb } from './storage.js';

/* Preview tarik data Dapodik. Modul ini hanya MEMBACA basis data lokal; perubahan baru terjadi
   pada langkah apply setelah Admin menyetujui preview. Setiap baris preview dibekukan supaya
   langkah apply tidak dapat diam-diam menghitung ulang keputusan yang berbeda. */

const MANUAL_ORIGINS=['manual-admin','manual-teacher'];

function clean(value,max=180){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function normalizeNisn(value){return String(value??'').replace(/\D/g,'');}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat menjalankan sinkronisasi Dapodik.');}
function newPreviewId(){return globalThis.crypto?.randomUUID?.()||`dapodik-preview-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}

function periodStudents(session){
  return Object.entries(loadDb().students||{})
    .filter(([key])=>key.startsWith(`${session.academicYear}|${session.semester}|`))
    .map(([key,student])=>({key,...student}));
}

/* Rombel Dapodik dipetakan ke rombel aplikasi lewat nama (1A sampai 6D). Nama yang tidak
   dikenal tidak pernah ditebak: barisnya menjadi conflict agar Admin memutuskan sendiri. */
function classMap(dataset){
  const map=new Map();
  for(const rombel of dataset.classes||[]){
    const nama=clean(rombel.name,10).toUpperCase().replace(/\s+/g,'');
    if(CLASSES.includes(nama))map.set(rombel.dapodikId,nama);
  }
  return map;
}

function matchStudent(remote,localStudents){
  const byId=remote.dapodikId&&localStudents.find(item=>clean(item.dapodikId,120)===remote.dapodikId);
  if(byId)return {kind:'dapodik-id',student:byId};
  const nisn=normalizeNisn(remote.nisn);
  if(!nisn)return {kind:'none'};
  const byNisn=localStudents.filter(item=>normalizeNisn(item.nisn)===nisn);
  if(byNisn.length===1)return {kind:'nisn',student:byNisn[0]};
  if(byNisn.length>1)return {kind:'conflict',candidates:byNisn};
  return {kind:'none'};
}

const COMPARED_FIELDS=['nisn','nis','name','gender','classId'];
function differs(local,remote,classId){
  if(remote.dapodikId&&clean(local.dapodikId,120)!==remote.dapodikId)return true;
  if(local.isActive===false&&remote.isActive!==false)return true;
  const target={nisn:normalizeNisn(remote.nisn),nis:clean(remote.nis,40),name:clean(remote.name,150),gender:clean(remote.gender,1).toUpperCase(),classId};
  return COMPARED_FIELDS.some(field=>{
    const lama=field==='nisn'?normalizeNisn(local[field]):clean(local[field],150);
    return lama!==target[field];
  });
}

function row(value){return Object.freeze(value);}

export function buildDapodikPreview(session,dataset,expectedContext){
  assertAdmin(session);
  validateSchoolContext(dataset?.school,expectedContext);
  const locals=periodStudents(session);
  const rombel=classMap(dataset);
  const students=[];
  const tersentuh=new Set();

  for(const remote of dataset.students||[]){
    const classId=rombel.get(remote.classDapodikId)||'';
    const cocok=matchStudent(remote,locals);
    const dasar={dapodikId:remote.dapodikId,nisn:normalizeNisn(remote.nisn),nis:clean(remote.nis,40),name:clean(remote.name,150),gender:clean(remote.gender,1).toUpperCase(),classId,remoteActive:remote.isActive!==false};
    if(cocok.kind==='conflict'){
      students.push(row({...dasar,action:'conflict',localId:'',matchedBy:'nisn',reason:`NISN ${dasar.nisn} dipakai ${cocok.candidates.length} siswa lokal. Rapikan data lokal terlebih dahulu.`}));
      continue;
    }
    if(!classId){
      students.push(row({...dasar,action:'conflict',localId:cocok.student?.id||'',matchedBy:cocok.kind,reason:`Rombel Dapodik ${remote.classDapodikId||'(kosong)'} tidak cocok dengan rombel 1A sampai 6D.`}));
      continue;
    }
    if(cocok.kind==='none'){
      students.push(row({...dasar,action:'create',localId:'',matchedBy:'none',reason:''}));
      continue;
    }
    tersentuh.add(cocok.student.id);
    const berubah=differs(cocok.student,remote,classId);
    students.push(row({...dasar,action:berubah?'update':'unchanged',localId:cocok.student.id,matchedBy:cocok.kind,reason:''}));
  }

  /* Hanya record asal Dapodik yang boleh diarsipkan. Siswa manual dan record lama tanpa origin
     tidak pernah hilang hanya karena tidak muncul pada respons Dapodik. */
  for(const local of locals){
    if(tersentuh.has(local.id))continue;
    if(local.origin!=='dapodik')continue;
    if(local.isActive===false)continue;
    students.push(row({dapodikId:clean(local.dapodikId,120),nisn:normalizeNisn(local.nisn),nis:clean(local.nis,40),name:clean(local.name,150),gender:clean(local.gender,1).toUpperCase(),classId:clean(local.classId,4),remoteActive:false,action:'archive',localId:local.id,matchedBy:'local',reason:'Tidak ditemukan pada respons Dapodik.'}));
  }

  const counts={create:0,update:0,unchanged:0,archive:0,conflict:0};
  for(const item of students)counts[item.action]+=1;

  return Object.freeze({
    previewId:newPreviewId(),
    createdAt:new Date().toISOString(),
    context:Object.freeze({npsn:clean(dataset.school.npsn,10),semesterId:clean(dataset.school.semesterId,20),academicYear:session.academicYear,semester:session.semester}),
    students:Object.freeze(students),
    teachers:Object.freeze([...(dataset.teachers||[])].map(row)),
    classes:Object.freeze([...(dataset.classes||[])].map(row)),
    subjects:Object.freeze([...(dataset.subjects||[])].map(row)),
    lessons:Object.freeze([...(dataset.lessons||[])].map(row)),
    counts:Object.freeze(counts)
  });
}
