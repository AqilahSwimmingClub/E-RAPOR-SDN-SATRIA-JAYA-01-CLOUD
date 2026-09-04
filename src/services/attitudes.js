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
/* Isi Semua hanya menyentuh dimensi yang BENAR-BENAR dipilih guru.

   Dimensi yang tidak dipilih tidak diberi nilai bawaan dan tidak dibuatkan deskripsi otomatis:
   ia tetap kosong, dan karena rapor hanya menampilkan dimensi yang berisi, ia juga tidak muncul
   di rapor. Menilai enam dimensi hanya karena satu tombol ditekan berarti mengarang penilaian
   sikap yang tidak pernah dilakukan guru.

   Menerima satu id (bentuk lama) maupun daftar id, sehingga pemanggil lama tetap berjalan. */
export function saveClassAttitudeBulk(session,dimensionIds,level){
  assertTeacher(session);
  const daftar=[...new Set((Array.isArray(dimensionIds)?dimensionIds:[dimensionIds])
    .map(id=>String(id||'').trim()).filter(Boolean))];
  if(!daftar.length)throw new Error('Pilih minimal satu dimensi sikap yang akan diisi.');
  const tidakDikenal=daftar.filter(id=>!ATTITUDE_DIMENSIONS.some(item=>item.id===id));
  if(tidakDikenal.length)throw new Error('Dimensi sikap tidak valid.');
  const students=listStudents(session,{classId:session.classId});
  const hasil=[];
  for(const student of students)
    for(const dimensionId of daftar)
      hasil.push(saveStudentAttitude(session,student.id,dimensionId,{level}));
  return hasil;
}
