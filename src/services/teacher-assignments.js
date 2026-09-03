import { CLASSES } from '../data/constants.js';
import { getTeacherProfile } from './master.js';
import { getSubjectMapping, loadDb, updateDb } from './storage.js';

/* Penugasan Guru oleh Admin.

   Admin adalah sumber otorisasi: Guru tidak menentukan sendiri rombel maupun mata pelajaran
   yang menjadi hak kerjanya. Satu penugasan mengikat GURU → TAHUN PELAJARAN → SEMESTER →
   ROMBEL → MATA PELAJARAN.

   Dua sifat yang disengaja:

   1. Penugasan disimpan PER tahun pelajaran dan semester. Mengubah penugasan tahun berikutnya
      tidak pernah menyentuh catatan tahun sebelumnya, sehingga arsip 5B 2026/2027 tetap utuh
      ketika guru yang sama dipindah ke 6B pada 2027/2028.

   2. Rombel yang BELUM PERNAH ditugaskan Admin tidak dibatasi. Pemasangan lama sudah berisi
      nilai jauh sebelum fitur ini ada; memperlakukan "belum ada penugasan" sebagai "tidak
      boleh apa-apa" akan mengunci mereka dari datanya sendiri. Pembatasan baru berlaku setelah
      Admin benar-benar membuat penugasan untuk rombel itu. */

const COLLECTION='teacherAssignments';

export function assignmentScopeKey(session,classId){
  return `${String(session?.academicYear||'').trim()}|${String(session?.semester||'').trim()}|${String(classId||'').trim()}`;
}

function assertAdmin(session){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengatur penugasan Guru.');
}
function assertClass(classId){
  if(!CLASSES.includes(classId))throw new Error('Rombel tidak valid.');
  return classId;
}
function assertPeriod(session){
  if(!String(session?.academicYear||'').trim()||!String(session?.semester||'').trim())
    throw new Error('Tahun pelajaran dan semester belum ditentukan.');
}

/* Mata pelajaran yang tersedia untuk ditugaskan pada satu rombel: seluruh mapel aktif pada
   Mapping Mata Pelajaran rombel tersebut. */
export function assignableSubjects(session,classId){
  assertClass(classId);
  const mapping=getSubjectMapping({role:'teacher',classId,
    academicYear:session?.academicYear,semester:session?.semester});
  return (Array.isArray(mapping)?mapping:[]).filter(item=>item.active)
    .map(item=>({id:item.id,name:item.name,group:item.group,order:item.order}));
}

export function getTeacherAssignment(session,classId){
  assertClass(classId);
  const record=loadDb()[COLLECTION]?.[assignmentScopeKey(session,classId)]||null;
  if(!record)return null;
  return {...record,subjectIds:Array.isArray(record.subjectIds)?[...record.subjectIds]:[]};
}

/* Daftar penugasan seluruh rombel pada periode aktif, lengkap dengan identitas gurunya.
   Rombel tanpa penugasan tetap muncul agar Admin tahu mana yang belum diatur. */
export function listTeacherAssignments(session){
  assertAdmin(session);
  return CLASSES.map(classId=>{
    const record=getTeacherAssignment(session,classId);
    const tersedia=assignableSubjects(session,classId);
    const subjectIds=(record?.subjectIds||[]).filter(id=>tersedia.some(item=>item.id===id));
    return {
      classId,
      teacher:getTeacherProfile(classId),
      assigned:Boolean(record),
      active:record?Boolean(record.active):false,
      subjectIds,
      subjects:tersedia.filter(item=>subjectIds.includes(item.id)),
      availableSubjects:tersedia,
      academicYear:session.academicYear,
      semester:session.semester,
      updatedAt:record?.updatedAt||null,
    };
  });
}

export function setTeacherAssignment(session,classId,{subjectIds=[],active=true,reason=''}={}){
  assertAdmin(session);
  assertPeriod(session);
  assertClass(classId);
  const tersedia=assignableSubjects(session,classId);
  const bersih=[...new Set((Array.isArray(subjectIds)?subjectIds:[]).map(id=>String(id)))]
    .filter(id=>tersedia.some(item=>item.id===id));
  let saved;
  updateDb(db=>{
    if(!db[COLLECTION])db[COLLECTION]={};
    const key=assignmentScopeKey(session,classId);
    const sebelum=db[COLLECTION][key]||{};
    const now=new Date().toISOString();
    saved={
      scope:key,classId,
      academicYear:session.academicYear,semester:session.semester,
      subjectIds:bersih,active:Boolean(active),
      createdAt:sebelum.createdAt||now,updatedAt:now,
      /* Riwayat hanya bertambah; catatan penugasan lama tidak pernah dihapus. */
      history:[...(Array.isArray(sebelum.history)?sebelum.history:[]),
        {at:now,actor:session.userName||'Admin',subjectIds:bersih,active:Boolean(active),
          reason:String(reason||'').trim().slice(0,300)}],
    };
    db[COLLECTION][key]=saved;
    return db;
  });
  return {...saved,subjects:tersedia.filter(item=>bersih.includes(item.id))};
}

export function clearTeacherAssignment(session,classId,{reason=''}={}){
  return setTeacherAssignment(session,classId,{subjectIds:[],active:false,reason});
}

/* ------------------------------------------------------------------ Penegakan hak akses */

/* null berarti rombel ini belum pernah ditugaskan Admin sehingga tidak dibatasi.
   Array berarti Admin sudah menentukan, dan hanya mapel di dalamnya yang boleh dikerjakan. */
export function assignedSubjectIds(session){
  if(session?.role!=='teacher'||!session.classId)return null;
  /* Halaman Admin (Kesiapan Guru, Monitoring) menyusun sesi guru sintetis hanya untuk MEMBACA
     konfigurasi satu rombel. Pandangan Admin tidak boleh ikut dipersempit oleh penugasan guru
     tertentu — kalau ikut, Kesiapan Guru akan melaporkan mapel yang sebenarnya sudah lengkap
     sebagai "belum tersedia", dan Monitoring akan melihat sebagian sekolah saja. */
  if(session.adminContext===true)return null;
  const record=getTeacherAssignment(session,session.classId);
  if(!record)return null;
  if(!record.active)return [];
  return Array.isArray(record.subjectIds)?[...record.subjectIds]:[];
}

export function isSubjectAssigned(session,subjectId){
  const izin=assignedSubjectIds(session);
  return izin===null||izin.includes(String(subjectId));
}

export function assertSubjectAssigned(session,subjectId){
  if(isSubjectAssigned(session,subjectId))return true;
  throw new Error('Mata pelajaran ini tidak termasuk penugasan Anda. Hubungi Admin sekolah.');
}

/* Ringkasan penugasan untuk sesi Guru yang sedang berjalan; dipakai halaman Guru agar tahu
   batas kerjanya tanpa harus menebak. */
export function currentTeacherScope(session){
  const izin=assignedSubjectIds(session);
  return {
    classId:session?.classId||null,
    academicYear:session?.academicYear||null,
    semester:session?.semester||null,
    restricted:izin!==null,
    subjectIds:izin,
  };
}
