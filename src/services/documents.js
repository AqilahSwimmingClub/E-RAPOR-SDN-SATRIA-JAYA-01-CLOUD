import { semesterAttendanceRecap } from './attendance.js';
import { getGraduationStatus, getHomeroomNote, getPromotionStatus, getStudentCocurricular, listExtracurriculars } from './completeness.js';
import { listStudentAttitudes } from './attitudes.js';
import { getPrintSettings } from './print-settings.js';
import { getStoredReportRows } from './report.js';
import { listStudents } from './students.js';
import { listActiveSubjects } from './subjects.js';
import { getSchoolMaster, getTeacherProfile } from './master.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(!session||session.role!=='teacher'||!session.classId)throw new Error('Session dokumen rapor tidak valid.');}
function average(values){const valid=values.filter(value=>Number.isFinite(value));return valid.length?Math.round((valid.reduce((sum,value)=>sum+value,0)/valid.length+Number.EPSILON)*100)/100:null;}
function gradeOf(classId){return Number.parseInt(String(classId||''),10);}
function identityComplete(student){return ['nis','nisn','name','gender','birthPlace','birthDate','address'].every(field=>String(student[field]||'').trim())&&Boolean(String(student.parentName||student.fatherName||student.motherName||'').trim());}
function requiresFinalStatus(session){return String(session.semester||'').startsWith('Genap ');}

export function getLeger(session){
  assertTeacher(session);const students=listStudents(session,{classId:session.classId});const subjects=listActiveSubjects(session);const reportRows=getStoredReportRows(session);
  const rows=students.map(student=>{const scores=subjects.map(subject=>{const row=reportRows.find(item=>item.student.id===student.id&&item.subject.id===subject.id);return {subject,score:row?.scoreComplete?Number(row.score.finalScore):null};});return {student,scores,average:average(scores.map(item=>item.score)),completeCount:scores.filter(item=>item.score!==null).length};});
  const subjectAverages=subjects.map(subject=>({subject,average:average(rows.map(row=>row.scores.find(item=>item.subject.id===subject.id)?.score??null))}));
  return {students:rows,subjects,subjectAverages,classAverage:average(rows.flatMap(row=>row.scores.map(item=>item.score)))};
}

function finalStatus(session,studentId){if(!requiresFinalStatus(session))return null;return gradeOf(session.classId)===6?getGraduationStatus(session,studentId):getPromotionStatus(session,studentId);}

export function getReportCompleteness(session){
  assertTeacher(session);const students=listStudents(session,{classId:session.classId});const subjects=listActiveSubjects(session);const reportRows=getStoredReportRows(session);const attendance=semesterAttendanceRecap(session,{classId:session.classId});const finalRequired=requiresFinalStatus(session);
  const rows=students.map(student=>{
    const studentReports=reportRows.filter(row=>row.student.id===student.id);const studentAttendance=attendance.students.find(item=>item.id===student.id);const attendanceCount=studentAttendance?studentAttendance.Hadir+studentAttendance.Sakit+studentAttendance.Izin+studentAttendance.Alpa:0;
    const categories={identity:identityComplete(student),scores:subjects.length>0&&studentReports.filter(row=>row.scoreComplete).length===subjects.length,descriptions:subjects.length>0&&studentReports.filter(row=>row.descriptionComplete).length===subjects.length,attendance:attendanceCount>0,extracurricular:listExtracurriculars(session,student.id).length>0,homeroomNote:Boolean(getHomeroomNote(session,student.id)?.text),...(finalRequired?{finalStatus:Boolean(finalStatus(session,student.id)?.status)}:{})};
    const labels={identity:'Identitas peserta didik',scores:'Nilai seluruh mapel',descriptions:'Deskripsi seluruh mapel',attendance:'Absensi semester',extracurricular:'Ekstrakurikuler',homeroomNote:'Catatan wali kelas',finalStatus:gradeOf(session.classId)===6?'Status kelulusan':'Kenaikan kelas'};
    const missing=Object.entries(categories).filter(([,complete])=>!complete).map(([key])=>labels[key]);const completed=Object.values(categories).filter(Boolean).length;const total=Object.keys(categories).length;
    return {student,categories,missing,completed,total,percentage:Math.round(completed/total*100),status:missing.length?'INCOMPLETE':'COMPLETE'};
  });
  const completedItems=rows.reduce((sum,row)=>sum+row.completed,0);const totalItems=rows.reduce((sum,row)=>sum+row.total,0);
  return {students:rows,studentCount:rows.length,completeStudents:rows.filter(row=>row.status==='COMPLETE').length,incompleteStudents:rows.filter(row=>row.status==='INCOMPLETE').length,overallPercentage:totalItems?Math.round(completedItems/totalItems*100):0,status:rows.length&&rows.every(row=>row.status==='COMPLETE')?'COMPLETE':'INCOMPLETE'};
}

export function getReportDocument(session,studentId){
  assertTeacher(session);const completeness=getReportCompleteness(session);const summary=completeness.students.find(item=>item.student.id===studentId);if(!summary)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  const reportRows=getStoredReportRows(session).filter(row=>row.student.id===studentId);const attendance=semesterAttendanceRecap(session,{classId:session.classId}).students.find(item=>item.id===studentId)||{Hadir:0,Sakit:0,Izin:0,Alpa:0};const extracurricular=listExtracurriculars(session,studentId);const cocurricular=getStudentCocurricular(session,studentId);const attitudes=listStudentAttitudes(session,studentId).filter(item=>item.status!=='EMPTY');const homeroomNote=getHomeroomNote(session,studentId);const status=finalStatus(session,studentId);
  const statusLabel=!requiresFinalStatus(session)?'Tidak diperlukan pada semester Ganjil':gradeOf(session.classId)===6?(status?.status==='GRADUATED'?'Lulus':status?.status==='NOT_GRADUATED'?'Tidak Lulus':'Belum ditentukan'):(status?.status==='PROMOTED'?`Naik ke Kelas ${status.targetClass}`:status?.status==='RETAINED'?'Tinggal di kelas':'Belum ditentukan');
  const printSettings=getPrintSettings(session);const schoolMaster=getSchoolMaster();const teacherMaster=getTeacherProfile(session.classId);const school={...schoolMaster,principalName:printSettings.principalName||schoolMaster.principalName,principalNip:printSettings.principalNip||schoolMaster.principalNip};const teacher={...teacherMaster,name:printSettings.teacherName||teacherMaster.name,nip:printSettings.teacherNip||teacherMaster.nip};
  return {session:clone(session),master:{school,teacher},printSettings,student:clone(summary.student),attitudes,subjects:reportRows.map(row=>({subject:clone(row.subject),score:row.score?.finalScore??null,kktp:row.score?.kktp??null,masteryStatus:row.score?.masteryStatus??null,description:row.description?.text||''})),attendance:{Hadir:attendance.Hadir,Sakit:attendance.Sakit,Izin:attendance.Izin,Alpa:attendance.Alpa},extracurricular,cocurricular,homeroomNote:homeroomNote?.text||'',finalStatus:status?clone(status):null,finalStatusLabel:statusLabel,complete:summary.status==='COMPLETE',missing:clone(summary.missing),percentage:summary.percentage};
}

export function assertReportPrintable(session,studentId){const document=getReportDocument(session,studentId);if(!document.complete)throw new Error(`Rapor belum lengkap: ${document.missing.join(', ')}.`);return document;}
