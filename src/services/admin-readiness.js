import { CLASSES, SUBJECTS_DEFAULT } from '../data/constants.js';
import { cpBerlaku } from '../data/curriculum-cp.js';
import { phaseForClassId } from '../data/learning-objective-defaults.js';
import { listObjectivesForAssessment } from './learning-objectives.js';
import { getSchoolMaster, getTeacherProfile } from './master.js';
import { listStudents } from './students.js';
import { getSubjectMapping, loadDb, scopeKey, updateDb } from './storage.js';
import { getTeacherAssignment } from './teacher-assignments.js';

/* Kesiapan penggunaan e-Rapor oleh Guru, dikendalikan Admin lokal per tahun pelajaran dan
   semester pada perangkat ini.

   Statusnya murni urusan operasional sekolah: tersimpan di database sekolah, ikut backup
   akademik seperti data lain, dan sama sekali tidak bersinggungan dengan lisensi perangkat.
   Menonaktifkan penggunaan tidak pernah menghapus satu pun data. */

export const READINESS_ITEMS=Object.freeze([
  'school-identity','principal','period','class-teachers','students','subject-mapping',
  'assessment-settings','learning-objectives','teacher-accounts','teacher-assignments',
]);

const COLLECTION='teacherUsageActivation';

/* Sebuah mata pelajaran hanya dapat dituntut mempunyai TP bila ia memang mempunyai CP pada
   fase rombel itu. Koding dan Kecerdasan Artifisial baru berlaku mulai Fase C, sehingga
   menuntut TP-nya di kelas 1-4 akan menjadi syarat yang mustahil dipenuhi: Admin tidak akan
   pernah bisa membuka menu Guru selama mapel itu aktif di Mapping rombel tersebut. */
function wajibPunyaTP(classId,subjectId){
  const phase=phaseForClassId(classId);
  return Boolean(phase)&&cpBerlaku(subjectId,phase);
}

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
    const mapping=getSubjectMapping({...scope,role:'teacher',classId,adminContext:true});
    return Array.isArray(mapping)&&mapping.some(item=>item.active);
  });
  /* Bobot dan KKTP tersimpan per mata pelajaran. Sebuah rombel dianggap siap bila setiap
     mapel aktifnya sudah punya pengaturan tersimpan, bukan sekadar memakai nilai bawaan. */
  const tersimpan=loadDb().assessmentSettings||{};
  const cekPenilaian=rombel.filter(classId=>{
    const prefix=`${scopeKey({...scope,role:'teacher',classId,adminContext:true})}|`;
    const mapping=getSubjectMapping({...scope,role:'teacher',classId,adminContext:true});
    const aktif=(Array.isArray(mapping)?mapping:[]).filter(item=>item.active);
    if(!aktif.length)return false;
    return aktif.every(item=>{
      const setting=tersimpan[`${prefix}${item.id}`];
      const bobot=['formative','daily','practice','scopeSummative','semesterSummative']
        .reduce((total,field)=>total+(Number(setting?.[field])||0),0);
      return bobot>0&&Number(setting?.kktp)>0;
    });
  });

  /* Data siswa, TP, akun, dan penugasan diperiksa hanya pada rombel yang benar-benar dipakai,
     supaya sekolah kecil tidak dipaksa melengkapi seluruh 24 rombel. */
  const akun=loadDb().userAccounts||{};
  const cekSiswa=rombel.filter(classId=>{
    try{return listStudents({...scope,role:'teacher',classId,adminContext:true},{classId}).length>0;}catch{return false;}
  });
  const cekTP=rombel.filter(classId=>{
    const mapping=getSubjectMapping({...scope,role:'teacher',classId,adminContext:true});
    const aktif=(Array.isArray(mapping)?mapping:[]).filter(item=>item.active);
    if(!aktif.length)return false;
    return aktif.filter(item=>wajibPunyaTP(classId,item.id)).every(item=>{
      try{return listObjectivesForAssessment({...scope,role:'teacher',classId,adminContext:true},item.id,{activeOnly:true}).length>0;}
      catch{return false;}
    });
  });
  const cekAkun=rombel.filter(classId=>akun[`teacher:${classId}`]?.active);
  const cekPenugasan=rombel.filter(classId=>{
    const record=getTeacherAssignment({...scope},classId);
    return Boolean(record?.active&&Array.isArray(record.subjectIds)&&record.subjectIds.length);
  });

  /* Penyebab "belum siap" disusun dari keadaan nyata, bukan kalimat tetap: mapel mana pada
     rombel mana yang belum punya TP, KKTP, atau bobot. Guru dan Admin butuh tahu persis apa
     yang harus dilengkapi, bukan sekadar bahwa ada yang kurang. */
  const namaMapel=id=>SUBJECTS_DEFAULT.find(item=>item.id===id)?.name||id;
  const rincianTP=[];const rincianKKTP=[];const rincianBobot=[];const rincianSiswa=[];
  for(const classId of rombel){
    const konteks={...scope,role:'teacher',classId,adminContext:true};
    const mapping=getSubjectMapping(konteks);
    const aktif=(Array.isArray(mapping)?mapping:[]).filter(item=>item.active);
    try{if(!listStudents(konteks,{classId}).length)rincianSiswa.push(`Data siswa ${classId}`);}
    catch{rincianSiswa.push(`Data siswa ${classId}`);}
    const prefix=`${scopeKey(konteks)}|`;
    for(const mapel of aktif){
      if(wajibPunyaTP(classId,mapel.id)){
        let tp=[];
        try{tp=listObjectivesForAssessment(konteks,mapel.id,{activeOnly:true});}catch{tp=[];}
        if(!tp.length)rincianTP.push(`TP ${namaMapel(mapel.id)} ${classId}`);
      }
      const setting=tersimpan[`${prefix}${mapel.id}`];
      const bobot=['formative','daily','practice','scopeSummative','semesterSummative']
        .reduce((total,field)=>total+(Number(setting?.[field])||0),0);
      if(!(Number(setting?.kktp)>0))rincianKKTP.push(`KKTP ${namaMapel(mapel.id)} ${classId}`);
      if(!(bobot>0))rincianBobot.push(`Bobot ${namaMapel(mapel.id)} ${classId}`);
    }
  }
  const sebab=(daftar,batas=4)=>daftar.length
    ? ` Belum siap: ${daftar.slice(0,batas).join(', ')}${daftar.length>batas?`, dan ${daftar.length-batas} lainnya`:''}.`
    : '';

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
      reason:`Setiap mata pelajaran aktif harus punya bobot penilaian dan KKTP.${sebab([...rincianKKTP,...rincianBobot])}`,
      detail:[...rincianKKTP,...rincianBobot]},
    {id:'students',label:'Data siswa',done:rombel.length>0&&cekSiswa.length===rombel.length,
      reason:`Setiap rombel yang dipakai harus sudah berisi siswa.${sebab(rincianSiswa)}`,
      detail:rincianSiswa},
    {id:'learning-objectives',label:'CP dan Tujuan Pembelajaran',done:rombel.length>0&&cekTP.length===rombel.length,
      reason:`Setiap mata pelajaran aktif harus punya TP aktif; CP-nya mengikuti fase rombel.${sebab(rincianTP)}`,
      detail:rincianTP},
    {id:'teacher-accounts',label:'Akun Guru',done:rombel.length>0&&cekAkun.length===rombel.length,
      reason:'Akun Guru untuk rombel yang dipakai harus dalam keadaan aktif pada Akun Guru & Penugasan.'},
    {id:'teacher-assignments',label:'Penugasan Guru',done:rombel.length>0&&cekPenugasan.length===rombel.length,
      reason:'Tentukan mata pelajaran yang ditugaskan untuk setiap rombel pada Akun Guru & Penugasan.'},
  ];

  const missing=items.filter(item=>!item.done).map(item=>item.label);
  /* Daftar penyebab konkret, dipakai layar Kesiapan Guru untuk menyebut apa yang kurang. */
  const blockers=items.filter(item=>!item.done).flatMap(item=>item.detail?.length?item.detail:[item.label]);
  const record=loadDb()[COLLECTION]?.[teacherUsageScopeKey(session)]||null;
  const grandfathered=!record&&adaJejakPemakaian(session);
  return {
    items,missing,blockers,ready:missing.length===0,
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
