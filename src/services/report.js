import { ASSESSMENT_TYPES, getAssessmentSettings, getAssessmentSheet } from './assessment.js';
import { semesterAttendanceRecap } from './attendance.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { listActiveSubjects, requireActiveSubject } from './subjects.js';

export const ATTENDANCE_CONVERSION_DEFAULT={Hadir:100,Sakit:80,Izin:80,Alpa:0};

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(!session || session.role!=='teacher' || !session.classId)throw new Error('Session Guru tidak valid.');}
function reportKey(session,subjectId,studentId){return `${scopeKey(session)}|${subjectId}|${studentId}`;}
function conversionKey(session){return `${scopeKey(session)}|report-attendance-conversion`;}
function dailyModeKey(session,subjectId){return `${scopeKey(session)}|report-daily-attendance|${subjectId}`;}
function scoreValue(value,label='Nilai'){
  if(value==='' || value===null || value===undefined)throw new Error(`${label} wajib diisi.`);
  const number=Number(value);if(!Number.isFinite(number)||number<0||number>100)throw new Error(`${label} harus berupa angka 0 sampai 100.`);return number;
}

export function getAttendanceConversion(session){
  assertTeacher(session);const saved=loadDb().settings[conversionKey(session)]?.values;
  return clone(saved||ATTENDANCE_CONVERSION_DEFAULT);
}

export function saveAttendanceConversion(session,input){
  assertTeacher(session);const values={};
  Object.keys(ATTENDANCE_CONVERSION_DEFAULT).forEach(status=>{values[status]=scoreValue(input?.[status],`Konversi ${status}`);});
  updateDb(db=>{db.settings[conversionKey(session)]={values,classId:session.classId,semester:session.semester,academicYear:session.academicYear,updatedAt:new Date().toISOString()};return db;});
  return clone(values);
}

export function resetAttendanceConversion(session){
  assertTeacher(session);updateDb(db=>{delete db.settings[conversionKey(session)];return db;});return clone(ATTENDANCE_CONVERSION_DEFAULT);
}

export function getDailyAttendanceMode(session,subjectId){
  requireActiveSubject(session,subjectId);return Boolean(loadDb().settings[dailyModeKey(session,subjectId)]?.enabled);
}

export function saveDailyAttendanceMode(session,subjectId,enabled){
  requireActiveSubject(session,subjectId);
  const record={enabled:Boolean(enabled),subjectId,classId:session.classId,semester:session.semester,academicYear:session.academicYear,updatedAt:new Date().toISOString()};
  updateDb(db=>{db.settings[dailyModeKey(session,subjectId)]=record;return db;});return clone(record);
}

export function attendanceDerivedSheet(session,subjectId){
  requireActiveSubject(session,subjectId);const conversion=getAttendanceConversion(session);
  const recap=semesterAttendanceRecap(session,{classId:session.classId});const students=listStudents(session,{classId:session.classId});const studentById=new Map(students.map(student=>[student.id,student]));
  const rows=recap.students.map(student=>{
    const detail=studentById.get(student.id);
    const counts={Hadir:student.Hadir,Sakit:student.Sakit,Izin:student.Izin,Alpa:student.Alpa};
    const days=Object.values(counts).reduce((sum,value)=>sum+value,0);
    const weighted=Object.entries(counts).reduce((sum,[status,count])=>sum+count*conversion[status],0);
    return {studentId:student.id,nis:student.nis,nisn:detail?.nisn||'',name:student.name,score:days?Number((weighted/days).toFixed(2)):null,days,counts,saved:days>0,source:'attendance'};
  });
  const filled=rows.filter(row=>row.score!==null);
  return {subjectId,rows,conversion,daysRecorded:recap.daysRecorded,filledCount:filled.length,pendingCount:rows.length-filled.length,average:filled.length?filled.reduce((sum,row)=>sum+row.score,0)/filled.length:null};
}

export function calculateReportScore(session,subjectId,studentId){
  const subject=requireActiveSubject(session,subjectId);const settings=getAssessmentSettings(session,subjectId);
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  const attendanceMode=getDailyAttendanceMode(session,subjectId);
  const attendanceRow=attendanceMode?attendanceDerivedSheet(session,subjectId).rows.find(row=>row.studentId===studentId):null;
  const components=ASSESSMENT_TYPES.map(type=>{
    const manualRow=getAssessmentSheet(session,subjectId,type.id).rows.find(row=>row.studentId===studentId);
    const fromAttendance=type.id==='daily'&&attendanceMode;
    const score=fromAttendance?(attendanceRow?.score??null):(manualRow?.score??null);
    return {id:type.id,label:type.label,score,weight:settings[type.id],source:fromAttendance?'attendance':'manual',weightedValue:score===null?null:score*settings[type.id]/100};
  });
  const complete=components.every(component=>component.score!==null);
  const rawScore=complete?components.reduce((sum,component)=>sum+component.weightedValue,0):null;
  const roundedScore=rawScore===null?null:Math.round(rawScore);
  return {
    studentId,studentName:student.name,nis:student.nis,nisn:student.nisn,classId:session.classId,subjectId,subjectName:subject.name,
    semester:session.semester,academicYear:session.academicYear,components,kktp:settings.kktp,
    rawScore,roundedScore,finalScore:roundedScore,completionStatus:complete?'COMPLETE':'INCOMPLETE',
    completionLabel:complete?'LENGKAP':'BELUM LENGKAP',masteryStatus:complete?(roundedScore>=settings.kktp?'TUNTAS':'BELUM TUNTAS'):null,
    dailyFromAttendance:attendanceMode,
  };
}

export function calculateReportSheet(session,subjectId){
  requireActiveSubject(session,subjectId);
  return listStudents(session,{classId:session.classId}).map(student=>calculateReportScore(session,subjectId,student.id));
}

function automaticRecord(calculation,previous=null){
  const now=new Date().toISOString();
  return {...calculation,isManualOverride:false,previousScoreReference:null,calculationMethod:'WEIGHTED_AUTOMATIC',createdAt:previous?.createdAt||now,updatedAt:now};
}
function referenceFrom(record){
  if(!record)return null;
  return {rawScore:record.rawScore,roundedScore:record.roundedScore,finalScore:record.finalScore,completionStatus:record.completionStatus,masteryStatus:record.masteryStatus,isManualOverride:Boolean(record.isManualOverride),updatedAt:record.updatedAt||null};
}

export function getReportScore(session,subjectId,studentId){
  requireActiveSubject(session,subjectId);const record=loadDb().reportScores[reportKey(session,subjectId,studentId)];return record?clone(record):null;
}

export function saveAutomaticReportScores(session,subjectId){
  requireActiveSubject(session,subjectId);const calculations=calculateReportSheet(session,subjectId);const saved=[];
  updateDb(db=>{
    calculations.forEach(calculation=>{
      const key=reportKey(session,subjectId,calculation.studentId);const previous=db.reportScores[key];
      if(previous?.isManualOverride){saved.push(previous);return;}
      const record=automaticRecord(calculation,previous);db.reportScores[key]=record;saved.push(record);
    });return db;
  });
  return clone(saved);
}

export function saveManualReportScore(session,subjectId,studentId,value,{source='MANUAL'}={}){
  requireActiveSubject(session,subjectId);const manualScore=scoreValue(value,'Nilai rapor manual');const automatic=calculateReportScore(session,subjectId,studentId);let saved;
  updateDb(db=>{
    const key=reportKey(session,subjectId,studentId);const previous=db.reportScores[key];const now=new Date().toISOString();const roundedScore=Math.round(manualScore);
    saved={...automatic,rawScore:manualScore,roundedScore,finalScore:roundedScore,completionStatus:'COMPLETE',completionLabel:'LENGKAP',masteryStatus:roundedScore>=automatic.kktp?'TUNTAS':'BELUM TUNTAS',isManualOverride:true,previousScoreReference:referenceFrom(previous)||referenceFrom(automatic),automaticReference:{rawScore:automatic.rawScore,roundedScore:automatic.roundedScore,completionStatus:automatic.completionStatus,components:automatic.components},calculationMethod:source,createdAt:previous?.createdAt||now,updatedAt:now};
    db.reportScores[key]=saved;return db;
  });return clone(saved);
}

export function getStoredReportRows(session){
  assertTeacher(session);const db=loadDb();const students=listStudents(session,{classId:session.classId});const subjects=listActiveSubjects(session);
  return subjects.flatMap(subject=>students.map(student=>{
    const score=db.reportScores[reportKey(session,subject.id,student.id)]||null;
    const description=db.reportDescriptions[reportKey(session,subject.id,student.id)]||null;
    const scoreComplete=Boolean(score&&score.finalScore!==null&&score.completionStatus==='COMPLETE');const descriptionComplete=Boolean(description?.text);
    return {student,subject,score:score?clone(score):null,description:description?clone(description):null,scoreComplete,descriptionComplete,complete:scoreComplete&&descriptionComplete};
  }));
}

export function getCompletionSummary(session){
  const rows=getStoredReportRows(session);const students=listStudents(session,{classId:session.classId});const subjects=listActiveSubjects(session);
  return subjects.map(subject=>{
    const subjectRows=rows.filter(row=>row.subject.id===subject.id);const scoreComplete=subjectRows.filter(row=>row.scoreComplete).length;const descriptionComplete=subjectRows.filter(row=>row.descriptionComplete).length;const denominator=students.length*2;const percentage=denominator?Math.round((scoreComplete+descriptionComplete)/denominator*100):0;
    return {subject,studentCount:students.length,scoreComplete,descriptionComplete,percentage,status:students.length&&scoreComplete===students.length&&descriptionComplete===students.length?'COMPLETE':'INCOMPLETE',missing:subjectRows.filter(row=>!row.complete).map(row=>({student:row.student,missingScore:!row.scoreComplete,missingDescription:!row.descriptionComplete}))};
  });
}
