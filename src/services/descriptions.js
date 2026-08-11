import { listLearningObjectives } from './objectives.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function key(session,subjectId,studentId){return `${scopeKey(session)}|${subjectId}|${studentId}`;}
function phrase(value){return String(value||'').trim().replace(/[.!?]+$/,'');}
function context(session,subjectId,studentId,bestObjectiveId,improvementObjectiveId){
  requireActiveSubject(session,subjectId);const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);if(!student)throw new Error('Siswa tidak ditemukan pada scope aktif.');
  const objectives=listLearningObjectives(session,subjectId,{activeOnly:true});if(!objectives.length)throw new Error('Belum ada TP aktif untuk membuat deskripsi.');
  const best=objectives.find(item=>item.id===bestObjectiveId);const improvement=objectives.find(item=>item.id===improvementObjectiveId);
  if(!best||!improvement)throw new Error('Pilih TP aktif untuk capaian terbaik dan yang perlu ditingkatkan.');return {student,best,improvement};
}

export function generateReportDescription(session,subjectId,studentId,{bestObjectiveId,improvementObjectiveId}){
  const {student,best,improvement}=context(session,subjectId,studentId,bestObjectiveId,improvementObjectiveId);
  const text=best.id===improvement.id
    ? `Ananda ${student.name} menunjukkan capaian pada ${phrase(best.description)} dan perlu terus mengembangkan kemampuan tersebut.`
    : `Ananda ${student.name} sangat baik dalam ${phrase(best.description)}, serta perlu meningkatkan kemampuan dalam ${phrase(improvement.description)}.`;
  return {text,bestObjectiveId:best.id,improvementObjectiveId:improvement.id};
}

export function getReportDescription(session,subjectId,studentId){
  requireActiveSubject(session,subjectId);const record=loadDb().reportDescriptions[key(session,subjectId,studentId)];return record?clone(record):null;
}

export function saveReportDescription(session,subjectId,studentId,input){
  const current=getReportDescription(session,subjectId,studentId);if(current?.locked)throw new Error('Deskripsi sudah terkunci dan tidak dapat diubah.');
  const generated=generateReportDescription(session,subjectId,studentId,input);const text=String(input?.text||'').trim().slice(0,1500);if(!text)throw new Error('Deskripsi rapor wajib diisi.');let saved;
  updateDb(db=>{const now=new Date().toISOString();saved={studentId,classId:session.classId,subjectId,semester:session.semester,academicYear:session.academicYear,text,bestObjectiveId:generated.bestObjectiveId,improvementObjectiveId:generated.improvementObjectiveId,status:text===generated.text?'AUTO':'EDITED',locked:false,createdAt:current?.createdAt||now,updatedAt:now};db.reportDescriptions[key(session,subjectId,studentId)]=saved;return db;});return clone(saved);
}

export function lockReportDescription(session,subjectId,studentId){
  const current=getReportDescription(session,subjectId,studentId);if(!current?.text)throw new Error('Simpan deskripsi sebelum menguncinya.');if(current.locked)return current;let locked;
  updateDb(db=>{locked={...current,locked:true,status:'LOCKED',updatedAt:new Date().toISOString()};db.reportDescriptions[key(session,subjectId,studentId)]=locked;return db;});return clone(locked);
}
