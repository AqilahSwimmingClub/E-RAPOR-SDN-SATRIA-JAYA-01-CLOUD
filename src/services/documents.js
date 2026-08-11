import { semesterAttendanceRecap } from './attendance.js';
import { getGraduationStatus, getHomeroomNote, getPromotionStatus, getStudentCocurricular, listExtracurriculars } from './completeness.js';
import { listStudentAttitudes } from './attitudes.js';
import { getPrintSettings } from './print-settings.js';
import { getStoredReportRows } from './report.js';
import { listStudents } from './students.js';
import { listActiveSubjects } from './subjects.js';
import { getSchoolMaster, getTeacherProfile } from './master.js';
import { createWorkbookBytes } from './excel.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(!session||session.role!=='teacher'||!session.classId)throw new Error('Session dokumen rapor tidak valid.');}
function semesterNumber(session){return String(session?.semester||'').startsWith('Genap ')?2:1;}
function average(values){const valid=values.filter(value=>Number.isFinite(value));return valid.length?Math.round((valid.reduce((sum,value)=>sum+value,0)/valid.length+Number.EPSILON)*100)/100:null;}
function gradeOf(classId){return Number.parseInt(String(classId||''),10);}
function identityComplete(student){return ['nis','nisn','name','gender','birthPlace','birthDate','address'].every(field=>String(student[field]||'').trim())&&Boolean(String(student.parentName||student.fatherName||student.motherName||'').trim());}
function requiresFinalStatus(session){return String(session.semester||'').startsWith('Genap ');}

export function getLeger(session){
  assertTeacher(session);const students=listStudents(session,{classId:session.classId});const subjects=listActiveSubjects(session);const reportRows=getStoredReportRows(session);const attendance=semesterAttendanceRecap(session,{classId:session.classId});
  const rows=students.map(student=>{
    const scores=subjects.map(subject=>{const row=reportRows.find(item=>item.student.id===student.id&&item.subject.id===subject.id);return {subject,score:row?.scoreComplete?Number(row.score.finalScore):null};});
    const values=scores.map(item=>item.score).filter(Number.isFinite);const absence=attendance.students.find(item=>item.id===student.id);
    return {student,scores,average:average(scores.map(item=>item.score)),total:values.length?values.reduce((sum,value)=>sum+value,0):null,
      attendance:{Sakit:absence?.Sakit||0,Izin:absence?.Izin||0,Alpa:absence?.Alpa||0},completeCount:values.length};
  });
  const ranked=rows.map(row=>row.total).filter(total=>total!==null).sort((a,b)=>b-a);
  rows.forEach(row=>{row.rank=row.total===null?null:ranked.indexOf(row.total)+1;});
  const subjectAverages=subjects.map(subject=>{const values=rows.map(row=>row.scores.find(item=>item.subject.id===subject.id)?.score??null).filter(Number.isFinite);
    return {subject,average:average(values),highest:values.length?Math.max(...values):null,lowest:values.length?Math.min(...values):null};});
  return {students:rows,subjects,subjectAverages,classAverage:average(rows.flatMap(row=>row.scores.map(item=>item.score))),
    school:getSchoolMaster(),classId:session.classId,semester:session.semester,semesterNumber:semesterNumber(session),academicYear:session.academicYear};
}

export function legerWorkbookRows(session){
  const data=getLeger(session);const subjectNames=data.subjects.map(subject=>subject.name);
  const header=['NO','NAMA SISWA','NISN','NIS',...subjectNames,'TOTAL','RATA-RATA','RANK','SAKIT','IZIN','ALPA'];
  const body=data.students.map((row,index)=>[index+1,row.student.name,row.student.nisn,row.student.nis,...row.scores.map(item=>item.score??''),row.total??'',row.average??'',row.rank??'',row.attendance.Sakit,row.attendance.Izin,row.attendance.Alpa]);
  const pad=['','',''];
  return [
    [`LEGER NILAI RAPOR SISWA TAHUN PELAJARAN ${data.academicYear} ${String(data.semester).split(' ')[0].toUpperCase()}`],
    ['SEKOLAH',':',data.school.name],['Kelas',':',`Kelas ${data.classId}`],[],header,...body,
    ['NILAI TERTINGGI','','','',...data.subjectAverages.map(item=>item.highest??''),...pad],
    ['NILAI TERENDAH','','','',...data.subjectAverages.map(item=>item.lowest??''),...pad],
    ['RATA-RATA MAPEL','','','',...data.subjectAverages.map(item=>item.average??''),...pad],
  ];
}

export function legerWorkbookBytes(session){
  const data=getLeger(session);
  return createWorkbookBytes(`Leger ${data.classId}`,legerWorkbookRows(session),{columnWidths:[5,30,16,16,...data.subjects.map(()=>11),9,11,7,7,7,7]});
}

export function getDocumentIdentity(session){
  assertTeacher(session);const printSettings=getPrintSettings(session);const schoolMaster=getSchoolMaster();const teacherMaster=getTeacherProfile(session.classId);
  return {
    school:{...schoolMaster,principalName:printSettings.principalName||schoolMaster.principalName,principalNip:printSettings.principalNip||schoolMaster.principalNip},
    teacher:{...teacherMaster,name:printSettings.teacherName||teacherMaster.name,nip:printSettings.teacherNip||teacherMaster.nip},
    printSettings,classId:session.classId,classLabel:`Kelas ${session.classId}`,
    semester:session.semester,semesterNumber:semesterNumber(session),academicYear:session.academicYear,
  };
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
  const identity=getDocumentIdentity(session);const {school,teacher,printSettings}=identity;
  return {session:clone(session),master:{school,teacher},printSettings,student:clone(summary.student),attitudes,
    classId:identity.classId,classLabel:identity.classLabel,semester:identity.semester,semesterNumber:identity.semesterNumber,academicYear:identity.academicYear,subjects:reportRows.map(row=>({subject:clone(row.subject),score:row.score?.finalScore??null,kktp:row.score?.kktp??null,masteryStatus:row.score?.masteryStatus??null,description:row.description?.text||''})),attendance:{Hadir:attendance.Hadir,Sakit:attendance.Sakit,Izin:attendance.Izin,Alpa:attendance.Alpa},extracurricular,cocurricular,homeroomNote:homeroomNote?.text||'',finalStatus:status?clone(status):null,finalStatusLabel:statusLabel,complete:summary.status==='COMPLETE',missing:clone(summary.missing),percentage:summary.percentage};
}

export function assertReportPrintable(session,studentId){const document=getReportDocument(session,studentId);if(!document.complete)throw new Error(`Rapor belum lengkap: ${document.missing.join(', ')}.`);return document;}
