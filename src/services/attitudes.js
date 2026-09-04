import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';

export const ATTITUDE_DIMENSIONS=[
  {id:'faith',label:'Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia'},
  {id:'global-diversity',label:'Berkebinekaan Global'},
  {id:'mutual-cooperation',label:'Gotong Royong'},
  {id:'independent',label:'Mandiri'},
  {id:'critical-reasoning',label:'Bernalar Kritis'},
  {id:'creative',label:'Kreatif'},
];
export const ATTITUDE_LEVELS=['Sangat Berkembang','Berkembang Sesuai Harapan','Mulai Berkembang'];
function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(session?.role!=='teacher'||!session.classId)throw new Error('Session Guru tidak valid.');}
function requireStudent(session,studentId){assertTeacher(session);const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);if(!student)throw new Error('Siswa tidak ditemukan pada scope aktif.');return student;}
function key(session,studentId,dimensionId){return `${scopeKey(session)}|${studentId}|${dimensionId}`;}
export function generateAttitudeDescription(studentName,dimensionId,level){const dimension=ATTITUDE_DIMENSIONS.find(item=>item.id===dimensionId);if(!dimension)throw new Error('Dimensi sikap tidak valid.');if(!ATTITUDE_LEVELS.includes(level))throw new Error('Capaian sikap tidak valid.');return `${studentName} ${level.toLowerCase()} dalam dimensi ${dimension.label}.`;}
export function listStudentAttitudes(session,studentId){const student=requireStudent(session,studentId);const db=loadDb();return ATTITUDE_DIMENSIONS.map(dimension=>{const record=db.attitudeProfiles?.[key(session,studentId,dimension.id)];return record?clone(record):{studentId,dimensionId:dimension.id,dimensionLabel:dimension.label,level:'',description:'',status:'EMPTY',classId:session.classId,semester:session.semester,academicYear:session.academicYear,studentName:student.name};});}
export function saveStudentAttitude(session,studentId,dimensionId,input){const student=requireStudent(session,studentId);const dimension=ATTITUDE_DIMENSIONS.find(item=>item.id===dimensionId);if(!dimension)throw new Error('Dimensi sikap tidak valid.');const level=String(input?.level||'').trim();if(!ATTITUDE_LEVELS.includes(level))throw new Error('Capaian sikap wajib dipilih.');const automatic=generateAttitudeDescription(student.name,dimensionId,level);const description=String(input?.description||automatic).trim().slice(0,1200);if(!description)throw new Error('Deskripsi sikap wajib diisi.');let saved;updateDb(db=>{const recordKey=key(session,studentId,dimensionId);const existing=db.attitudeProfiles[recordKey];const now=new Date().toISOString();saved={studentId,studentName:student.name,dimensionId,dimensionLabel:dimension.label,level,description,status:description===automatic?'AUTO':'EDITED',classId:session.classId,semester:session.semester,academicYear:session.academicYear,createdAt:existing?.createdAt||now,updatedAt:now};db.attitudeProfiles[recordKey]=saved;return db;});return clone(saved);}
export function getClassAttitudes(session){assertTeacher(session);return listStudents(session,{classId:session.classId}).map(student=>({student,dimensions:listStudentAttitudes(session,student.id)}));}
/* Mengosongkan satu dimensi sikap. Catatannya dihapus, bukan disimpan dengan capaian kosong,
   sehingga dimensi itu kembali berstatus EMPTY dan tidak muncul di rapor.

   Guru butuh jalan keluar. Tanpa ini, satu dimensi yang pernah terisi - termasuk oleh versi
   lama yang mengisi keenamnya sekaligus - tidak akan pernah bisa dikosongkan lagi. */
export function clearStudentAttitude(session,studentId,dimensionId){
  requireStudent(session,studentId);
  const dimension=ATTITUDE_DIMENSIONS.find(item=>item.id===dimensionId);
  if(!dimension)throw new Error('Dimensi sikap tidak valid.');
  let removed=false;
  updateDb(db=>{
    const recordKey=key(session,studentId,dimensionId);
    if(db.attitudeProfiles?.[recordKey]){delete db.attitudeProfiles[recordKey];removed=true;}
    return db;
  });
  return removed;
}

/* ISI SEMUA SISWA MENYALIN PILIHAN GURU PERSIS SEPERTI ADANYA.

   Yang dicentang diisi; yang TIDAK dicentang dikosongkan. Guru yang memilih tiga dimensi
   mendapat tiga dimensi - bukan tiga yang baru ditambah tiga sisa dari pengisian sebelumnya.

   Dulu fungsi ini hanya menulis dimensi terpilih dan membiarkan sisanya apa adanya. Akibatnya
   catatan lama - misalnya dari versi yang mengisi keenam dimensi sekaligus - tetap hidup, dan
   guru yang memilih tiga tetap melihat enam tersimpan tanpa ada cara membatalkannya. Menilai
   dimensi yang tidak pernah dipilih berarti mengarang penilaian sikap yang tidak pernah
   dilakukan guru, dan itulah yang diperbaiki di sini.

   Batasnya tetap sempit: hanya dimensi sikap, hanya murid rombel aktif, hanya pada tahun,
   semester, dan kelas yang sedang dibuka. Nilai, kehadiran, Intrakurikuler, dan data rombel
   maupun semester lain tidak tersentuh sama sekali.

   Menerima satu id (bentuk lama) maupun daftar id, sehingga pemanggil lama tetap berjalan. */
export function saveClassAttitudeBulk(session,dimensionIds,level){
  assertTeacher(session);
  const daftar=[...new Set((Array.isArray(dimensionIds)?dimensionIds:[dimensionIds])
    .map(id=>String(id||'').trim()).filter(Boolean))];
  if(!daftar.length)throw new Error('Pilih minimal satu dimensi sikap yang akan diisi.');
  const tidakDikenal=daftar.filter(id=>!ATTITUDE_DIMENSIONS.some(item=>item.id===id));
  if(tidakDikenal.length)throw new Error('Dimensi sikap tidak valid.');
  const terpilih=new Set(daftar);
  const dibersihkan=ATTITUDE_DIMENSIONS.map(item=>item.id).filter(id=>!terpilih.has(id));
  const students=listStudents(session,{classId:session.classId});
  const hasil=[];
  for(const student of students){
    for(const dimensionId of daftar)
      hasil.push(saveStudentAttitude(session,student.id,dimensionId,{level}));
    for(const dimensionId of dibersihkan)
      clearStudentAttitude(session,student.id,dimensionId);
  }
  return hasil;
}
