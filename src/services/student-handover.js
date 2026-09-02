import { CLASSES } from '../data/constants.js';
import { createStudent, listStudents } from './students.js';
import { getSchoolMaster } from './master.js';

/* Serah terima biodata siswa antar kelas, tahun pelajaran, dan perangkat.

   Berkasnya disusun dari DAFTAR PUTIH field biodata. Pendekatan ini dipilih dengan sengaja:
   membuang field terlarang satu per satu akan bocor begitu model siswa bertambah field baru,
   sedangkan daftar putih tidak pernah meloloskan apa pun yang tidak disebut di sini.

   Yang tidak pernah ikut, karena memang tidak pernah dibaca: nilai, absensi, deskripsi rapor,
   KKTP, bobot, akun dan password Guru, lisensi, Activation Token, Installation ID, dan ikatan
   perangkat. */

export const HANDOVER_SCHEMA='erapor-student-handover-v1';

export const HANDOVER_BIODATA_FIELDS=Object.freeze([
  'nis','nisn','name','gender','birthPlace','birthDate','religion','parentName','phone','address','photo',
]);

function bersih(value,max=500){return String(value??'').trim().slice(0,max);}

function assertBerwenang(session){
  if(session?.role!=='admin'&&session?.role!=='teacher')
    throw new Error('Hanya Admin atau Guru yang dapat melakukan serah terima data siswa.');
}

/* Saran kenaikan: 1A→2A, 5B→6B. Kelas 6 lulus sehingga tidak punya saran. Saran hanya saran;
   rombel tujuan selalu ditentukan pengguna. */
export function suggestPromotionClass(classId){
  const cocok=String(classId||'').match(/^([1-6])([A-Z])$/i);
  if(!cocok)return null;
  const tingkat=Number(cocok[1]);
  if(tingkat>=6)return null;
  const usulan=`${tingkat+1}${cocok[2].toUpperCase()}`;
  return CLASSES.includes(usulan)?usulan:null;
}

function toBiodata(student){
  const row={};
  for(const field of HANDOVER_BIODATA_FIELDS)row[field]=bersih(student?.[field],field==='photo'?1500000:500);
  return row;
}

export function exportStudentHandover(session,{studentIds=null,classId=session?.classId}={}){
  assertBerwenang(session);
  const target=classId||session?.classId;
  if(!target)throw new Error('Rombel sumber wajib ditentukan.');
  const semua=listStudents(session,{classId:target});
  const pilihan=Array.isArray(studentIds)&&studentIds.length
    ? semua.filter(item=>studentIds.includes(item.id))
    : semua;
  if(!pilihan.length)throw new Error('Tidak ada siswa yang dipilih untuk diserahterimakan.');
  return {
    schema:HANDOVER_SCHEMA,
    source:{
      schoolName:bersih(getSchoolMaster().name,150),
      npsn:bersih(getSchoolMaster().npsn,40),
      classId:target,
      academicYear:bersih(session.academicYear,20),
      semester:bersih(session.semester,40),
      suggestedClassId:suggestPromotionClass(target),
      exportedAt:new Date().toISOString(),
    },
    students:pilihan.map(toBiodata),
  };
}

export function handoverFilename(payload){
  const aman=value=>String(value||'').trim().replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase();
  const sumber=payload?.source||{};
  return `SISWA-${aman(sumber.classId)||'ROMBEL'}-${aman(sumber.academicYear)||'TAHUN'}.handover.json`;
}

function validasiBerkas(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    throw new Error('Berkas serah terima tidak dikenali.');
  if(payload.schema!==HANDOVER_SCHEMA)
    throw new Error('Berkas ini tidak dikenali sebagai serah terima data siswa e-Rapor.');
  if(!Array.isArray(payload.students)||!payload.students.length)
    throw new Error('Berkas serah terima tidak memuat data siswa.');
  const rows=payload.students.map(toBiodata);
  rows.forEach((row,index)=>{
    if(!row.name)throw new Error(`Nama siswa pada baris ${index+1} wajib ada.`);
    if(!row.nis&&!row.nisn)throw new Error(`Siswa "${row.name}" wajib punya NIS atau NISN.`);
  });
  return rows;
}

function sudahAda(existing,row){
  return existing.some(item=>
    (row.nisn&&bersih(item.nisn)===row.nisn)||
    (row.nis&&bersih(item.nis)===row.nis)||
    (bersih(item.name).toLowerCase()===row.name.toLowerCase()&&bersih(item.birthDate)===row.birthDate));
}

/* Duplikat diperiksa terhadap SELURUH periode tujuan, bukan hanya rombel tujuan, karena
   aplikasi memang melarang satu NIS/NISN muncul dua kali pada periode yang sama. Dengan begitu
   siswa yang sudah terdaftar di rombel lain dilewati dengan tenang, bukan menimbulkan galat. */
function daftarPeriode(session){
  try{return listStudents({...session,role:'admin',classId:null});}
  catch{return listStudents(session,{classId:session.classId});}
}

function sesiTujuan(session,{targetClassId,targetAcademicYear,targetSemester}){
  const classId=targetClassId||session?.classId;
  if(!classId||!CLASSES.includes(classId))throw new Error('Rombel tujuan wajib dipilih.');
  return {role:session.role,classId,
    academicYear:targetAcademicYear||session.academicYear,
    semester:targetSemester||session.semester};
}

/* Pratinjau tidak menulis apa pun. Pengguna melihat dulu berapa siswa yang akan masuk dan
   berapa yang dilewati karena sudah ada di rombel tujuan. */
export function previewStudentHandover(session,payload,options={}){
  assertBerwenang(session);
  const rows=validasiBerkas(payload);
  const tujuan=sesiTujuan(session,options);
  const existing=daftarPeriode(tujuan);
  const duplikat=rows.filter(row=>sudahAda(existing,row));
  return {
    total:rows.length,
    newStudents:rows.length-duplikat.length,
    duplicates:duplikat.length,
    duplicateNames:duplikat.map(row=>row.name),
    targetClassId:tujuan.classId,
    targetAcademicYear:tujuan.academicYear,
    targetSemester:tujuan.semester,
    source:payload.source||{},
    students:rows,
  };
}

/* Impor hanya menambah. Data pada scope sumber tidak pernah disentuh, sehingga tahun
   pelajaran sebelumnya tetap utuh sebagai arsip. */
export function importStudentHandover(session,payload,options={}){
  const pratinjau=previewStudentHandover(session,payload,options);
  const tujuan=sesiTujuan(session,options);
  const existing=daftarPeriode(tujuan);
  const dilewati=[];
  const masuk=[];
  for(const row of pratinjau.students){
    if(sudahAda(existing,row)||sudahAda(masuk,row)){dilewati.push(row.name);continue;}
    createStudent(tujuan,{...row,classId:tujuan.classId});
    masuk.push(row);
  }
  return {
    imported:masuk.length,
    skipped:dilewati.length,
    skippedNames:dilewati,
    targetClassId:tujuan.classId,
    targetAcademicYear:tujuan.academicYear,
    targetSemester:tujuan.semester,
  };
}
