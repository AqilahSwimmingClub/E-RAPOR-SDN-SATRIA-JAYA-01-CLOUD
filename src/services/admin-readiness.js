import { CLASSES } from '../data/constants.js';
import { getSchoolMaster, getTeacherProfile } from './master.js';
import { getSubjectMapping, loadDb, scopeKey, updateDb } from './storage.js';

/* Kesiapan penggunaan e-Rapor oleh Guru, dikendalikan Admin lokal per tahun pelajaran dan
   semester pada perangkat ini.

   Statusnya murni urusan operasional sekolah: tersimpan di database sekolah, ikut backup
   akademik seperti data lain, dan sama sekali tidak bersinggungan dengan lisensi perangkat.
   Menonaktifkan penggunaan tidak pernah menghapus satu pun data. */

export const READINESS_ITEMS=Object.freeze([
  'school-identity','principal','period','class-teachers','subject-mapping','assessment-settings',
]);

const COLLECTION='teacherUsageActivation';

export function teacherUsageScopeKey(session){
  return `${String(session?.academicYear||'').trim()}|${String(session?.semester||'').trim()}`;
}


/* Koleksi yang isinya hanya lahir dari pemakaian nyata oleh Guru. Daftar siswa sengaja TIDAK
   masuk: mengisi Data Siswa adalah langkah persiapan Admin, bukan tanda sekolah sudah menilai. */
const JEJAK_PEMAKAIAN=Object.freeze([
  'assessmentScores','reportScores','reportDescriptions','attendance',
  'extracurricularScores','cocurricularScores','intracurricularScores','attitudeProfiles',
  'homeroomNotes','transcriptScores',
]);

/* Perangkat yang sudah dipakai menilai pada periode ini berarti sekolahnya memang sudah
   memakai e-Rapor sebelum kendali Admin ada. Pembaruan aplikasi tidak boleh mengunci mereka,
   jadi penggunaan Guru dianggap sudah terbuka sampai Admin memutuskan sebaliknya. Begitu Admin
   menekan Aktifkan atau Nonaktifkan, keputusannya yang berlaku. */
function adaJejakPemakaian(session){
  const db=loadDb();
  const prefix=`${String(session?.academicYear||'').trim()}|${String(session?.semester||'').trim()}|`;
  return JEJAK_PEMAKAIAN.some(collection=>
    Object.keys(db[collection]||{}).some(key=>key.startsWith(prefix)));
}

function assertAdmin(session){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengatur kesiapan penggunaan e-Rapor.');
}
function isi(value){return Boolean(String(value??'').trim());}

/* Rombel yang benar-benar dipakai: yang wali kelasnya sudah diisi Admin. Sekolah kecil tidak
   dipaksa mengisi seluruh 24 rombel. */
function assignedClasses(){
  return CLASSES.filter(classId=>{
    const profile=getTeacherProfile(classId);
    return isi(profile?.name)&&!/^Guru \/ Wali Kelas /.test(String(profile.name).trim());
  });
}

/* Checklist disusun dari data yang memang sudah ada di aplikasi; tidak ada koleksi baru yang
   perlu diisi Admin dua kali. */
export function getAdminReadiness(session){
  const school=getSchoolMaster();
  const rombel=assignedClasses();
  const scope={academicYear:session?.academicYear,semester:session?.semester};

  const cekMapping=rombel.filter(classId=>{
    const mapping=getSubjectMapping({...scope,role:'teacher',classId});
    return Array.isArray(mapping)&&mapping.some(item=>item.active);
  });
  /* Bobot dan KKTP tersimpan per mata pelajaran. Sebuah rombel dianggap siap bila setiap
     mapel aktifnya sudah punya pengaturan tersimpan, bukan sekadar memakai nilai bawaan. */
  const tersimpan=loadDb().assessmentSettings||{};
  const cekPenilaian=rombel.filter(classId=>{
    const prefix=`${scopeKey({...scope,role:'teacher',classId})}|`;
    const mapping=getSubjectMapping({...scope,role:'teacher',classId});
    const aktif=(Array.isArray(mapping)?mapping:[]).filter(item=>item.active);
    if(!aktif.length)return false;
    return aktif.every(item=>{
      const setting=tersimpan[`${prefix}${item.id}`];
      const bobot=['formative','daily','practice','scopeSummative','semesterSummative']
        .reduce((total,field)=>total+(Number(setting?.[field])||0),0);
      return bobot>0&&Number(setting?.kktp)>0;
    });
  });

  const items=[
    {id:'school-identity',label:'Identitas sekolah',done:isi(school.name)&&isi(school.npsn),
      reason:'Nama sekolah dan NPSN diisi melalui Data Referensi → Data Sekolah.'},
    {id:'principal',label:'Kepala sekolah',done:isi(school.principalName)&&isi(school.principalNip),
      reason:'Nama dan NIP Kepala Sekolah dipakai pada seluruh dokumen dan tanda tangan.'},
    {id:'period',label:'Tahun pelajaran dan semester aktif',done:isi(session?.academicYear)&&isi(session?.semester),
      reason:'Tahun pelajaran dan semester ditentukan saat masuk aplikasi.'},
    {id:'class-teachers',label:'Rombel dan wali kelas',done:rombel.length>0,
      reason:'Isi identitas wali kelas pada Data Referensi → Data Guru untuk rombel yang dipakai.'},
    {id:'subject-mapping',label:'Mapping mata pelajaran',done:rombel.length>0&&cekMapping.length===rombel.length,
      reason:'Setiap rombel yang dipakai harus punya mata pelajaran aktif pada Mapping Mata Pelajaran.'},
    {id:'assessment-settings',label:'Bobot penilaian dan KKTP',done:rombel.length>0&&cekPenilaian.length===rombel.length,
      reason:'Setiap rombel yang dipakai harus punya bobot penilaian dan KKTP pada Bobot Penilaian.'},
  ];

  const missing=items.filter(item=>!item.done).map(item=>item.label);
  const record=loadDb()[COLLECTION]?.[teacherUsageScopeKey(session)]||null;
  const grandfathered=!record&&adaJejakPemakaian(session);
  return {
    items,missing,ready:missing.length===0,
    active:record?Boolean(record.active):grandfathered,
    grandfathered,
    activatedAt:record?.activatedAt||null,
    scope:teacherUsageScopeKey(session),
    classes:rombel,
    lockMessage:'Menu penilaian belum dibuka. Admin sekolah perlu melengkapi konfigurasi lalu menekan Aktifkan e-Rapor untuk Guru pada halaman Status Penilaian. Seluruh data yang sudah ada tetap tersimpan.',
  };
}

function tulisStatus(session,active,{reason=''}={}){
  assertAdmin(session);
  const key=teacherUsageScopeKey(session);
  let saved;
  updateDb(db=>{
    if(!db[COLLECTION])db[COLLECTION]={};
    const sebelum=db[COLLECTION][key]||{history:[]};
    const now=new Date().toISOString();
    saved={
      scope:key,
      academicYear:session.academicYear,
      semester:session.semester,
      active,
      activatedAt:active?now:(sebelum.activatedAt||null),
      updatedAt:now,
      /* Riwayat hanya bertambah; catatan lama tidak pernah dihapus. */
      history:[...(Array.isArray(sebelum.history)?sebelum.history:[]),
        {at:now,actor:session.userName||'Admin',active,reason:String(reason||'').trim().slice(0,300)}],
    };
    db[COLLECTION][key]=saved;
    return db;
  });
  return saved;
}

export function activateTeacherUsage(session,options={}){
  assertAdmin(session);
  const kesiapan=getAdminReadiness(session);
  if(!kesiapan.ready)
    throw new Error(`Konfigurasi belum lengkap: ${kesiapan.missing.join(', ')}.`);
  return tulisStatus(session,true,options);
}

export function deactivateTeacherUsage(session,options={}){
  return tulisStatus(session,false,options);
}

export function isTeacherUsageActive(session){
  const record=loadDb()[COLLECTION]?.[teacherUsageScopeKey(session)];
  if(record)return Boolean(record.active);
  return adaJejakPemakaian(session);
}
