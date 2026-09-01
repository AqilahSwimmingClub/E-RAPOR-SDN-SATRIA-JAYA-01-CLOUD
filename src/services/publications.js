import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';

/* Registri publikasi rapor. Berkas PDF hasil cetak adalah keluaran, sedangkan catatan di sini
   yang menjadi sumber kebenaran tentang dokumen mana yang sudah ditampilkan kepada siswa.
   Mencetak tidak pernah mensyaratkan publikasi. */

const DOCUMENT_TYPES=['supplement','report','transcript'];

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(session?.role!=='teacher'||!session?.classId)throw new Error('Hanya Guru wali kelas yang dapat mengatur publikasi rapor.');}
function requireStudent(session,studentId){
  assertTeacher(session);
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  return student;
}

export function publicationKey(session,studentId,documentType){
  assertTeacher(session);
  if(!DOCUMENT_TYPES.includes(documentType))throw new Error('Jenis dokumen publikasi tidak valid.');
  return `${scopeKey(session)}|${studentId}|${documentType}`;
}

export function publishReport(session,studentId,documentType){
  requireStudent(session,studentId);
  const key=publicationKey(session,studentId,documentType);
  const record={studentId,documentType,classId:session.classId,semester:session.semester,academicYear:session.academicYear,
    publishedBy:session.username||session.classId,publishedAt:new Date().toISOString()};
  updateDb(db=>{if(!db.publishedReports)db.publishedReports={};db.publishedReports[key]=record;return db;});
  return clone(record);
}

export function unpublishReport(session,studentId,documentType){
  const key=publicationKey(session,studentId,documentType);
  let removed=false;
  updateDb(db=>{if(db.publishedReports?.[key]){delete db.publishedReports[key];removed=true;}return db;});
  return removed;
}

export function isReportPublished(session,studentId,documentType){
  return Boolean(loadDb().publishedReports?.[publicationKey(session,studentId,documentType)]);
}

export function listPublishedReports(session){
  assertTeacher(session);
  const prefix=`${scopeKey(session)}|`;
  return Object.entries(loadDb().publishedReports||{}).filter(([key])=>key.startsWith(prefix)).map(([,record])=>clone(record))
    .sort((a,b)=>a.studentId.localeCompare(b.studentId,'id')||a.documentType.localeCompare(b.documentType,'id'));
}

export function publicationDocumentTypes(){return [...DOCUMENT_TYPES];}
