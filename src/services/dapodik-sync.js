import { CLASSES } from '../data/constants.js';
import { validateSchoolContext } from './dapodik-adapter.js';
import { exportDb, loadDb, replaceDb, updateDb } from './storage.js';
import { validateMigratedDatabase } from './migrations.js';
import { APP_SCHEMA_VERSION } from '../data/version.js';

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

let actionCounter=0;
function row(value){return Object.freeze({id:`aksi-${++actionCounter}-${Math.random().toString(36).slice(2,8)}`,...value});}

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

/* ------------------------------------------------------------ Penerapan transaksional */

const LOG_LIMIT=50;
function emptyCounts(){return {created:{students:0},updated:{students:0},archived:{students:0},skipped:{students:0}};}

/* Log sinkronisasi hanya menyimpan angka dan pesan aman. Tidak ada token, NISN, nama, alamat,
   atau potongan payload mentah yang boleh masuk ke sini karena log ikut tercadangkan. */
function appendSafeLog(operation,status,counts,session,startedAt){
  const record={
    id:newPreviewId(),
    operation:clean(operation,20),
    status:clean(status,20),
    counts,
    startedAt,
    finishedAt:new Date().toISOString(),
    actor:clean(session.username||session.accountId||session.role,60)
  };
  updateDb(db=>{
    if(!db.dapodikSyncLogs)db.dapodikSyncLogs={};
    db.dapodikSyncLogs[record.id]=record;
    const semua=Object.entries(db.dapodikSyncLogs).sort((a,b)=>String(a[1].finishedAt).localeCompare(String(b[1].finishedAt)));
    for(const [key] of semua.slice(0,Math.max(0,semua.length-LOG_LIMIT)))delete db.dapodikSyncLogs[key];
    return db;
  });
  return record;
}

export function listDapodikSyncLogs(session){
  assertAdmin(session);
  return Object.values(loadDb().dapodikSyncLogs||{})
    .map(item=>JSON.parse(JSON.stringify(item)))
    .sort((a,b)=>String(a.finishedAt).localeCompare(String(b.finishedAt)));
}

function validatePreviewContext(session,preview){
  if(!preview?.previewId||!Array.isArray(preview.students))throw new Error('Preview Dapodik tidak valid.');
  if(preview.context?.academicYear!==session.academicYear||preview.context?.semester!==session.semester){
    throw new Error('Preview Dapodik dibuat untuk periode lain. Ulangi Ambil Data pada periode aktif.');
  }
}

function studentKey(session,classId,id){return `${session.academicYear}|${session.semester}|${classId}|${id}`;}
function newStudentId(){return globalThis.crypto?.randomUUID?.()||`student-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}

function applyAcceptedActions(database,session,preview,accepted){
  const counts=emptyCounts();
  const now=new Date().toISOString();
  const actor=clean(session.username||session.accountId||session.role,60);
  const entries=Object.entries(database.students||{});
  for(const action of preview.students){
    if(!accepted.has(action.id)||action.action==='unchanged'){
      if(action.action!=='unchanged')counts.skipped.students+=1;
      continue;
    }
    if(!CLASSES.includes(action.classId))throw new Error(`Rombel ${action.classId||'(kosong)'} tidak dikenal pada preview.`);
    if(action.action==='create'){
      const id=newStudentId();
      database.students[studentKey(session,action.classId,id)]={
        id,classId:action.classId,academicYear:session.academicYear,semester:session.semester,
        dapodikId:action.dapodikId,nisn:action.nisn,nis:action.nis,name:action.name,gender:action.gender,
        religion:'',birthPlace:'',birthDate:'',parentName:'',phone:'',address:'',photo:'',
        origin:'dapodik',createdBy:actor,createdAt:now,updatedAt:now,syncState:'synced',isActive:true
      };
      counts.created.students+=1;
      continue;
    }
    const found=entries.find(([,student])=>student.id===action.localId);
    if(!found)throw new Error('Record siswa pada preview sudah tidak ada. Ulangi Ambil Data.');
    const [oldKey,existing]=found;
    if(action.action==='archive'){
      database.students[oldKey]={...existing,isActive:false,syncState:'archived',updatedAt:now};
      counts.archived.students+=1;
      continue;
    }
    const updated={...existing,dapodikId:action.dapodikId||existing.dapodikId,nisn:action.nisn,nis:action.nis,
      name:action.name,gender:action.gender,classId:action.classId,origin:existing.origin||'dapodik',
      syncState:'synced',isActive:true,updatedAt:now};
    delete database.students[oldKey];
    database.students[studentKey(session,action.classId,updated.id)]=updated;
    counts.updated.students+=1;
  }
  return {database,counts};
}

/* Pola clone-validate-save: seluruh perubahan disusun pada salinan, divalidasi, lalu disimpan
   sekali. Kegagalan apa pun memulihkan basis data apa adanya sebelum sinkronisasi dimulai. */
export function applyDapodikPreview(session,preview,{acceptedActionIds=[]}={}){
  assertAdmin(session);
  validatePreviewContext(session,preview);
  const accepted=new Set(acceptedActionIds);
  if(preview.students.some(item=>accepted.has(item.id)&&item.action==='conflict')){
    throw new Error('Konflik Dapodik harus diselesaikan sebelum penerapan.');
  }
  const startedAt=new Date().toISOString();
  const before=exportDb();
  try{
    const result=applyAcceptedActions(JSON.parse(JSON.stringify(before)),session,preview,accepted);
    validateMigratedDatabase(result.database,{expectedSchemaVersion:APP_SCHEMA_VERSION,before});
    replaceDb(result.database);
    appendSafeLog('pull','SUCCESS',result.counts,session,startedAt);
    return {previewId:preview.previewId,...result.counts};
  }catch(error){
    replaceDb(before);
    appendSafeLog('pull','ROLLED_BACK',emptyCounts(),session,startedAt);
    if(/Konflik Dapodik|periode lain|tidak valid/.test(error.message))throw error;
    throw new Error('Sinkronisasi dibatalkan dan data lama dipulihkan.');
  }
}

/* ------------------------------------------------- Antrean kirim Nilai Rapor ke Dapodik */

/* ID antrean menyertakan cap perubahan nilai, sehingga nilai yang direvisi setelah terkirim
   otomatis mendapat ID baru dan wajib dikirim ulang, sedangkan nilai yang tidak berubah tidak
   pernah dikirim dua kali. */
function scoreQueueId(localKey,record){return `${localKey}|${record.updatedAt||record.finalScore}`;}

function pushState(){
  const state=loadDb().dapodikSyncState?.scorePush;
  return state&&typeof state==='object'?state:{items:{}};
}

function mappedDapodikId(mappings,kind,localId){
  const record=mappings[`${kind}|${localId}`];
  return clean(record?.dapodikId,120);
}

export function buildDapodikScoreQueue(session){
  assertAdmin(session);
  const db=loadDb();
  const mappings=db.dapodikMappings&&typeof db.dapodikMappings==='object'?db.dapodikMappings:{};
  const students=new Map(periodStudents(session).map(student=>[student.id,student]));
  const state=pushState();
  const prefix=`${session.academicYear}|${session.semester}|`;
  const items=[],blocked=[];
  let success=0,failed=0;

  for(const [localKey,record] of Object.entries(db.reportScores||{})){
    if(!localKey.startsWith(prefix))continue;
    const student=students.get(record?.studentId);
    const queueId=scoreQueueId(localKey,record||{});
    const tersimpan=state.items?.[queueId];
    if(tersimpan?.status==='success'){success+=1;continue;}
    /* Alasan blokir hanya memuat kode dan ID internal; tidak ada NISN, nama, atau alamat. */
    if(!student||!clean(student.dapodikId,120)){
      blocked.push(Object.freeze({queueId,localKey,reasonCode:'STUDENT_NOT_MAPPED'}));
      continue;
    }
    const dapodikSubjectId=mappedDapodikId(mappings,'subject',record?.subjectId);
    if(!dapodikSubjectId){
      blocked.push(Object.freeze({queueId,localKey,reasonCode:'SUBJECT_NOT_MAPPED'}));
      continue;
    }
    if(tersimpan?.status==='failed')failed+=1;
    items.push(Object.freeze({
      queueId,localKey,
      dapodikStudentId:clean(student.dapodikId,120),
      dapodikSubjectId,
      finalScore:Number(record?.finalScore??0),
      kktp:Number(record?.kktp??0),
      masteryStatus:clean(record?.masteryStatus,30),
      status:tersimpan?.status||'ready',
      reasonCode:clean(tersimpan?.reasonCode,40)
    }));
  }

  const ready=items.filter(item=>item.status!=='failed').length;
  return Object.freeze({
    items:Object.freeze(items),
    blocked:Object.freeze(blocked),
    summary:Object.freeze({ready,success,failed,blocked:blocked.length})
  });
}

export function retryableDapodikScores(session){
  assertAdmin(session);
  const state=pushState();
  return Object.values(state.items||{})
    .filter(item=>item.status==='failed'&&item.payload)
    .map(item=>JSON.parse(JSON.stringify(item.payload)));
}

/* Hanya kode alasan yang disimpan. Pesan mentah dari Dapodik dapat memuat token maupun
   identitas siswa, sehingga tidak pernah ikut tersimpan atau tercatat di log. */
export function recordDapodikPushResult(session,result){
  assertAdmin(session);
  const startedAt=new Date().toISOString();
  const daftar=Array.isArray(result?.items)?result.items:[];
  const queue=buildDapodikScoreQueue(session);
  const byId=new Map(queue.items.map(item=>[item.queueId,item]));
  let sent=0,gagal=0;
  updateDb(db=>{
    if(!db.dapodikSyncState||typeof db.dapodikSyncState!=='object')db.dapodikSyncState={};
    const state=db.dapodikSyncState.scorePush&&typeof db.dapodikSyncState.scorePush==='object'?db.dapodikSyncState.scorePush:{items:{}};
    if(!state.items)state.items={};
    for(const entry of daftar){
      const queueId=clean(entry?.queueId,300);
      if(!queueId)continue;
      const status=entry?.status==='success'?'success':'failed';
      if(status==='success')sent+=1;else gagal+=1;
      state.items[queueId]={
        queueId,status,
        reasonCode:status==='failed'?clean(entry?.reasonCode,40)||'UNKNOWN':'',
        updatedAt:new Date().toISOString(),
        payload:status==='failed'?(byId.get(queueId)||{queueId}):undefined
      };
    }
    state.lastPushAt=new Date().toISOString();
    db.dapodikSyncState.scorePush=state;
    return db;
  });
  const counts={sent:{scores:sent},failed:{scores:gagal}};
  appendSafeLog('push',gagal?'PARTIAL':'SUCCESS',counts,session,startedAt);
  return {sent,failed:gagal};
}
