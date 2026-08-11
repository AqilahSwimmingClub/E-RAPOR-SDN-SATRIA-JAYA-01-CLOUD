import { SEMESTERS } from '../data/constants.js';
import { getCompletionSummary, getStoredReportRows } from './report.js';
import { listStudents } from './students.js';
import { loadDb } from './storage.js';
import { listActiveSubjects } from './subjects.js';

const DISTRIBUTION=[
  {id:'0-59',label:'0–59',min:0,max:59},
  {id:'60-69',label:'60–69',min:60,max:69},
  {id:'70-79',label:'70–79',min:70,max:79},
  {id:'80-89',label:'80–89',min:80,max:89},
  {id:'90-100',label:'90–100',min:90,max:100},
];

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(!session||session.role!=='teacher'||!session.classId)throw new Error('Session Guru tidak valid.');}
function round(value,digits=2){if(value===null)return null;const factor=10**digits;return Math.round((value+Number.EPSILON)*factor)/factor;}
function summarizeValues(values){
  const valid=values.filter(value=>Number.isFinite(value));
  return {count:valid.length,average:valid.length?round(valid.reduce((sum,value)=>sum+value,0)/valid.length):null,highest:valid.length?Math.max(...valid):null,lowest:valid.length?Math.min(...valid):null,distribution:DISTRIBUTION.map(bucket=>({...bucket,count:valid.filter(value=>value>=bucket.min&&value<=bucket.max).length}))};
}

export function getClassCompletion(session){
  assertTeacher(session);const subjects=getCompletionSummary(session);const students=listStudents(session,{classId:session.classId});const completedItems=subjects.reduce((sum,item)=>sum+item.scoreComplete+item.descriptionComplete,0);const totalItems=subjects.length*students.length*2;const completeSubjectCount=subjects.filter(item=>item.status==='COMPLETE').length;
  return {subjects,studentCount:students.length,subjectCount:subjects.length,completeSubjectCount,incompleteSubjectCount:subjects.length-completeSubjectCount,completedItems,totalItems,overallPercentage:totalItems?Math.round(completedItems/totalItems*100):0,status:subjects.length>0&&completeSubjectCount===subjects.length?'COMPLETE':'INCOMPLETE'};
}

export function getReportStatistics(session){
  assertTeacher(session);const rows=getStoredReportRows(session);const subjects=listActiveSubjects(session).map(subject=>{const values=rows.filter(row=>row.subject.id===subject.id&&row.scoreComplete).map(row=>Number(row.score.finalScore));return {subject,...summarizeValues(values)};});const allValues=rows.filter(row=>row.scoreComplete).map(row=>Number(row.score.finalScore));return {subjects,overall:summarizeValues(allValues)};
}

function identityOf(student){return student.nisn?`nisn:${student.nisn}`:`nis:${student.nis}`;}
function rawStudents(session){return Object.values(loadDb().students||{}).filter(student=>student.classId===session.classId&&student.academicYear===session.academicYear);}
function semesterIndex(value){const index=SEMESTERS.indexOf(value);return index<0?Number.MAX_SAFE_INTEGER:index;}

export function listStudentIdentities(session){
  assertTeacher(session);const grouped=new Map();
  rawStudents(session).forEach(student=>{const id=identityOf(student);const current=grouped.get(id);if(!current||student.semester===session.semester)grouped.set(id,{id,nis:student.nis,nisn:student.nisn,name:student.name,classId:student.classId,semesters:[]});});
  rawStudents(session).forEach(student=>{const record=grouped.get(identityOf(student));if(record&&!record.semesters.includes(student.semester))record.semesters.push(student.semester);});
  return [...grouped.values()].map(item=>({...item,semesters:item.semesters.sort((a,b)=>semesterIndex(a)-semesterIndex(b))})).sort((a,b)=>a.name.localeCompare(b.name,'id'));
}

function checkedFilters(session,{studentIdentity,subjectId='ALL',semester='ALL'}){
  assertTeacher(session);if(!studentIdentity)throw new Error('Pilih siswa terlebih dahulu.');const students=rawStudents(session).filter(student=>identityOf(student)===studentIdentity);if(!students.length)throw new Error('Siswa tidak ditemukan pada riwayat rombel aktif.');const subjects=listActiveSubjects(session);if(subjectId!=='ALL'&&!subjects.some(subject=>subject.id===subjectId))throw new Error('Mata pelajaran tidak aktif pada Mapping scope ini.');if(semester!=='ALL'&&!SEMESTERS.includes(semester))throw new Error('Filter semester tidak valid.');return {students,subjects:subjects.filter(subject=>subjectId==='ALL'||subject.id===subjectId),semesters:SEMESTERS.filter(item=>semester==='ALL'||item===semester)};
}

export function getScoreHistory(session,filters){
  const {students,subjects,semesters}=checkedFilters(session,filters);const db=loadDb();const rows=[];
  semesters.forEach(semester=>{const student=students.find(item=>item.semester===semester);if(!student)return;subjects.forEach(subject=>{const key=`${session.academicYear}|${semester}|${session.classId}|${subject.id}|${student.id}`;const record=db.reportScores[key];if(record&&record.completionStatus==='COMPLETE'&&record.finalScore!==null)rows.push({student:clone(student),subject:clone(subject),semester,academicYear:session.academicYear,finalScore:record.finalScore,kktp:record.kktp,masteryStatus:record.masteryStatus,isManualOverride:Boolean(record.isManualOverride),updatedAt:record.updatedAt||null});});});return rows;
}

export function getDescriptionHistory(session,filters){
  const {students,subjects,semesters}=checkedFilters(session,filters);const db=loadDb();const rows=[];
  semesters.forEach(semester=>{const student=students.find(item=>item.semester===semester);if(!student)return;subjects.forEach(subject=>{const key=`${session.academicYear}|${semester}|${session.classId}|${subject.id}|${student.id}`;const record=db.reportDescriptions[key];if(record?.text)rows.push({student:clone(student),subject:clone(subject),semester,academicYear:session.academicYear,text:record.text,status:record.status,locked:Boolean(record.locked),updatedAt:record.updatedAt||null});});});return rows;
}
