import { listActiveObjectives, listObjectivesForAssessment } from './learning-objectives.js';
import { ringkasObjectives } from './objective-summary.js';
import { calculateReportScore, getReportScore } from './report.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';

export { ringkasObjectives };

function clone(value){return JSON.parse(JSON.stringify(value));}
function key(session,subjectId,studentId){return `${scopeKey(session)}|${subjectId}|${studentId}`;}
function phrase(value){return String(value||'').trim().replace(/[.!?]+$/,'');}
function context(session,subjectId,studentId,bestObjectiveId,improvementObjectiveId){
  requireActiveSubject(session,subjectId);const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);if(!student)throw new Error('Siswa tidak ditemukan pada scope aktif.');
  const objectives=listObjectivesForAssessment(session,subjectId,{activeOnly:true});if(!objectives.length)throw new Error('Belum ada TP aktif untuk membuat deskripsi.');
  const best=objectives.find(item=>item.id===bestObjectiveId);const improvement=objectives.find(item=>item.id===improvementObjectiveId);
  if(!best||!improvement)throw new Error('Pilih TP aktif untuk capaian terbaik dan yang perlu ditingkatkan.');return {student,best,improvement};
}

/* --------------------------------------------------- Deskripsi bersumber dari TP acuan penilaian

   TP hanya menjadi ACUAN. Nilai Akhir tetap satu angka dari pipeline penilaian lama, dan angka
   itulah yang menentukan tingkat capaian pada kalimat deskripsi. Tidak ada nilai per TP, dan
   tidak ada kompetensi yang ditambahkan di luar TP yang dipilih guru. */

function studentOf(session,studentId){
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope aktif.');
  return student;
}
function finalScoreOf(session,subjectId,studentId){
  const tersimpan=getReportScore(session,subjectId,studentId);
  if(tersimpan&&tersimpan.finalScore!==null&&tersimpan.finalScore!==undefined)
    return {finalScore:tersimpan.finalScore,kktp:tersimpan.kktp??75};
  const dihitung=calculateReportScore(session,subjectId,studentId);
  return {finalScore:dihitung.finalScore,kktp:dihitung.kktp};
}
function levelCapaian(finalScore,kktp){
  if(finalScore===null||finalScore===undefined)return null;
  if(finalScore>=90)return 'sangat baik';
  if(finalScore>=kktp)return 'baik';
  return 'cukup';
}
function objectiveDescription(session,subjectId,studentId,objectiveIds){
  requireActiveSubject(session,subjectId);
  const student=studentOf(session,studentId);
  const tersedia=listObjectivesForAssessment(session,subjectId);
  const dipilih=[...new Set(objectiveIds.map(id=>String(id)))]
    .map(id=>tersedia.find(item=>item.id===id)||null);
  if(dipilih.some(item=>!item))throw new Error('Tujuan Pembelajaran acuan tidak ditemukan pada mata pelajaran ini.');
  const {finalScore,kktp}=finalScoreOf(session,subjectId,studentId);
  const level=levelCapaian(finalScore,kktp);
  const isi=ringkasObjectives(dipilih);
  /* Tingkat capaian tetap berasal dari Nilai Akhir dan KKTP yang sudah ada; tidak ada standar
     interval baru yang diperkenalkan di sini. */
  const text=level===null
    ? `Ananda ${student.name} mampu ${isi}.`
    : finalScore>=kktp
      ? `Ananda ${student.name} mampu ${isi} dengan ${level}.`
      : `Ananda ${student.name} mampu ${isi} dengan bimbingan, dan perlu penguatan agar tercapai secara utuh.`;
  return {text,objectiveIds:dipilih.map(item=>item.id),bestObjectiveId:null,improvementObjectiveId:null,finalScore,kktp};
}

export function generateReportDescription(session,subjectId,studentId,input){
  /* Sumber utama adalah TP AKTIF pada menu Tujuan Pembelajaran. Pemanggil boleh menyebut
     objectiveIds secara eksplisit, tetapi tidak wajib: bila tidak disebut, TP aktif dipakai
     apa adanya sehingga guru tidak pernah diminta memilih TP untuk kedua kalinya. */
  const objectiveIds=Array.isArray(input?.objectiveIds)&&input.objectiveIds.length
    ? input.objectiveIds
    : (input?.bestObjectiveId||input?.improvementObjectiveId
        ? null
        : listActiveObjectives(session,subjectId).map(item=>item.id));
  if(objectiveIds&&objectiveIds.length)return objectiveDescription(session,subjectId,studentId,objectiveIds);
  const {bestObjectiveId,improvementObjectiveId}=input||{};
  const {student,best,improvement}=context(session,subjectId,studentId,bestObjectiveId,improvementObjectiveId);
  const text=best.id===improvement.id
    ? `Ananda ${student.name} menunjukkan capaian pada ${phrase(best.description)}.`
    : `Ananda ${student.name} sangat baik dalam ${phrase(best.description)}, serta perlu meningkatkan kemampuan dalam ${phrase(improvement.description)}.`;
  return {text,bestObjectiveId:best.id,improvementObjectiveId:improvement.id};
}

export function getReportDescription(session,subjectId,studentId){
  requireActiveSubject(session,subjectId);const record=loadDb().reportDescriptions[key(session,subjectId,studentId)];return record?clone(record):null;
}

export function saveReportDescription(session,subjectId,studentId,input){
  const current=getReportDescription(session,subjectId,studentId);if(current?.locked)throw new Error('Deskripsi sudah terkunci dan tidak dapat diubah.');
  const generated=generateReportDescription(session,subjectId,studentId,input);const text=String(input?.text||'').trim().slice(0,1500);if(!text)throw new Error('Deskripsi rapor wajib diisi.');let saved;
  updateDb(db=>{const now=new Date().toISOString();saved={studentId,classId:session.classId,subjectId,semester:session.semester,academicYear:session.academicYear,text,bestObjectiveId:generated.bestObjectiveId,improvementObjectiveId:generated.improvementObjectiveId,...(generated.objectiveIds?{objectiveIds:generated.objectiveIds}:{}),status:text===generated.text?'AUTO':'EDITED',locked:false,createdAt:current?.createdAt||now,updatedAt:now};db.reportDescriptions[key(session,subjectId,studentId)]=saved;return db;});return clone(saved);
}

export function lockReportDescription(session,subjectId,studentId){
  const current=getReportDescription(session,subjectId,studentId);if(!current?.text)throw new Error('Simpan deskripsi sebelum menguncinya.');if(current.locked)return current;let locked;
  updateDb(db=>{locked={...current,locked:true,status:'LOCKED',updatedAt:new Date().toISOString()};db.reportDescriptions[key(session,subjectId,studentId)]=locked;return db;});return clone(locked);
}
