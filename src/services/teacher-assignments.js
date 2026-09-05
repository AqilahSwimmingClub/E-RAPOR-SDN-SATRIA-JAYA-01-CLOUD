import { CLASSES } from '../data/constants.js';
import { getTeacherProfile } from './master.js';
import { getSubjectMapping, loadDb, updateDb } from './storage.js';
import { cpBerlaku } from '../data/curriculum-cp.js';
import { phaseForClassId } from '../data/learning-objective-defaults.js';

/* Penugasan Guru oleh Admin.

   Admin adalah sumber otorisasi: Guru tidak menentukan sendiri rombel maupun mata pelajaran
   yang menjadi hak kerjanya. Satu penugasan mengikat GURU → TAHUN PELAJARAN → SEMESTER →
   ROMBEL → MATA PELAJARAN.

   Dua sifat yang disengaja:

   1. Penugasan disimpan PER tahun pelajaran dan semester. Mengubah penugasan tahun berikutnya
      tidak pernah menyentuh catatan tahun sebelumnya, sehingga arsip 5B 2026/2027 tetap utuh
      ketika guru yang sama dipindah ke 6B pada 2027/2028.

   2. BELUM DITUGASKAN BERARTI BELUM BOLEH BEKERJA. Tidak ada hak akses bawaan yang diberikan
      diam-diam kepada rombel yang belum diatur Admin.

      Sebelumnya rombel tanpa penugasan dibiarkan tanpa batas, dengan alasan pemasangan lama
      sudah berisi nilai sebelum fitur ini ada. Akibatnya akun Guru yang berstatus AKTIF tetapi
      BELUM DITUGASKAN tetap dapat menjalankan seluruh fungsi akademik - status akun dan status
      penugasan menjadi satu hal yang sama, padahal keduanya berbeda. Sekarang keduanya
      dipisah: akun menentukan boleh tidaknya MASUK, penugasan menentukan boleh tidaknya
      BEKERJA.

      DATANYA TIDAK KE MANA-MANA. Mencabut atau belum memberi penugasan hanya menutup hak
      akses; nilai, absensi, dan seluruh catatan rombel itu tetap tersimpan utuh dan kembali
      terbuka begitu Admin menugaskannya. */

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

/* Mata pelajaran yang tersedia untuk ditugaskan pada satu rombel.

   Dasarnya adalah MAPPING MATA PELAJARAN rombel itu sendiri - bukan daftar tetap "sekian mapel
   untuk semua rombel". Karena Mapping disimpan per rombel, kelas rendah (1A-3D) dan kelas
   tinggi (4A-6D) memang boleh berbeda isi, dan perbedaan itulah yang diikuti di sini.

   Di atas Mapping masih ada satu saringan yang tidak boleh dilanggar: mata pelajaran yang
   secara resmi BELUM BERLAKU pada fase rombel tersebut tidak dapat ditugaskan. Contohnya
   Koding dan Kecerdasan Artifisial yang pada jenjang SD baru dimulai Fase C. Saringan ini
   tidak menyebut nama mapel satu per satu: ia membaca katalog fase CP, sehingga bertambahnya
   mapel baru tidak menuntut perubahan kode di sini. */
export function assignableSubjects(session,classId){
  assertClass(classId);
  const mapping=getSubjectMapping({role:'teacher',classId,
    academicYear:session?.academicYear,semester:session?.semester});
  const phase=phaseForClassId(classId);
  return (Array.isArray(mapping)?mapping:[]).filter(item=>item.active)
    .filter(item=>!phase||cpBerlaku(item.id,phase))
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

export const PESAN_BELUM_DITUGASKAN='Anda belum mendapatkan penugasan mengajar. Hubungi Admin untuk menentukan rombel dan mata pelajaran.';
export const PESAN_DI_LUAR_PENUGASAN='Mata pelajaran ini tidak termasuk penugasan Anda. Hubungi Admin sekolah.';

/* null HANYA untuk pandangan Admin. Untuk sesi Guru yang sesungguhnya nilainya selalu berupa
   daftar - kosong bila Admin belum menugaskan apa pun. */
export function assignedSubjectIds(session){
  if(session?.role!=='teacher'||!session.classId)return null;
  /* Halaman Admin (Kesiapan Guru, Monitoring) menyusun sesi guru sintetis hanya untuk MEMBACA
     konfigurasi satu rombel. Pandangan Admin tidak boleh ikut dipersempit oleh penugasan guru
     tertentu — kalau ikut, Kesiapan Guru akan melaporkan mapel yang sebenarnya sudah lengkap
     sebagai "belum tersedia", dan Monitoring akan melihat sebagian sekolah saja. */
  if(session.adminContext===true)return null;
  const record=getTeacherAssignment(session,session.classId);
  /* Belum ditugaskan, atau penugasannya dinonaktifkan: tidak ada satu mapel pun yang boleh
     dikerjakan. Tidak ada hak akses bawaan. */
  if(!record||!record.active)return [];
  return Array.isArray(record.subjectIds)?[...record.subjectIds]:[];
}

/* Keadaan penugasan sesi Guru yang sedang berjalan, lengkap dengan alasannya. Halaman memakai
   ini agar pesan yang dilihat guru sama persis dengan alasan penolakan di layanan. */
export function teacherAssignmentState(session){
  if(session?.role!=='teacher'||!session.classId)
    return {applies:false,assigned:true,active:true,subjectIds:null,message:''};
  if(session.adminContext===true)
    return {applies:false,assigned:true,active:true,subjectIds:null,message:''};
  const record=getTeacherAssignment(session,session.classId);
  const subjectIds=record?.active&&Array.isArray(record.subjectIds)?[...record.subjectIds]:[];
  return {
    applies:true,
    assigned:Boolean(record),
    active:Boolean(record?.active),
    subjectIds,
    /* Satu-satunya keadaan yang boleh bekerja: penugasan ada, aktif, dan berisi mapel. */
    allowed:subjectIds.length>0,
    message:subjectIds.length?'':PESAN_BELUM_DITUGASKAN,
  };
}
export function hasTeacherAssignment(session){return teacherAssignmentState(session).allowed;}

export function isSubjectAssigned(session,subjectId){
  const izin=assignedSubjectIds(session);
  return izin===null||izin.includes(String(subjectId));
}

export function assertSubjectAssigned(session,subjectId){
  if(isSubjectAssigned(session,subjectId))return true;
  const keadaan=teacherAssignmentState(session);
  throw new Error(keadaan.applies&&!keadaan.allowed?PESAN_BELUM_DITUGASKAN:PESAN_DI_LUAR_PENUGASAN);
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
