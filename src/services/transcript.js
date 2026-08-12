import { parseCsv } from './students.js';
import { listStudents } from './students.js';
import { loadDb, updateDb } from './storage.js';
import { listActiveSubjects, listSubjectsForStudent } from './subjects.js';
import { createWorkbookBytes, readWorkbookRows } from './excel.js';

export const TRANSCRIPT_CSV_HEADERS=['NISN','NIS','Nama','Kode Mapel','Mata Pelajaran','Nilai'];

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(!session||session.role!=='teacher'||!session.classId)throw new Error('Session Transkrip tidak valid.');}
function clean(value,max=200){return String(value??'').trim().slice(0,max);}
function scoreValue(value){if(value===''||value===null||value===undefined)return null;const number=Number(value);if(!Number.isFinite(number)||number<0||number>100)throw new Error('Nilai transkrip harus berupa angka 0 sampai 100.');return number;}
export function transcriptStudentIdentity(student){return student.nisn?`NISN-${student.nisn}`:`NIS-${student.nis}`;}
export function transcriptScope(session){assertTeacher(session);return `${session.academicYear}|${session.classId}`;}
function transcriptKey(session,student,subjectId){return `${transcriptScope(session)}|${transcriptStudentIdentity(student)}|${subjectId}`;}
function requireStudent(session,studentId){assertTeacher(session);const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);if(!student)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');return student;}

export function getTranscriptRows(session,studentId){
  const student=requireStudent(session,studentId);const db=loadDb();return listSubjectsForStudent(session,student).map(subject=>{const record=db.transcriptScores[transcriptKey(session,student,subject.id)]||null;return {student:clone(student),subject,score:record?.score??null,saved:Boolean(record),record:record?clone(record):null};});
}

export function getTranscriptScore(session,studentId,subjectId){return getTranscriptRows(session,studentId).find(row=>row.subject.id===subjectId)?.record||null;}

export function saveTranscriptScores(session,studentId,values,{partial=false}={}){
  const student=requireStudent(session,studentId);const subjects=listSubjectsForStudent(session,student);const input=values&&typeof values==='object'?values:{};const allowed=new Set(subjects.map(subject=>subject.id));const unknown=Object.keys(input).filter(id=>!allowed.has(id));if(unknown.length)throw new Error('Transkrip memuat mata pelajaran di luar Mapping aktif.');const targets=partial?subjects.filter(subject=>Object.hasOwn(input,subject.id)):subjects;const normalized={};targets.forEach(subject=>{normalized[subject.id]=scoreValue(input[subject.id]);});
  updateDb(db=>{const now=new Date().toISOString();targets.forEach(subject=>{const key=transcriptKey(session,student,subject.id);const value=normalized[subject.id];if(value===null){delete db.transcriptScores[key];return;}const existing=db.transcriptScores[key];db.transcriptScores[key]={academicYear:session.academicYear,classId:session.classId,studentIdentity:transcriptStudentIdentity(student),studentId:student.id,nis:student.nis,nisn:student.nisn,name:student.name,subjectId:subject.id,score:value,createdAt:existing?.createdAt||now,updatedAt:now};});return db;});return getTranscriptRows(session,studentId);
}

export function transcriptTemplateCsv(session){
  assertTeacher(session);const students=listStudents(session,{classId:session.classId});const escape=value=>{const text=String(value??'');return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};const rows=students.flatMap(student=>listSubjectsForStudent(session,student).map(subject=>[student.nisn,student.nis,student.name,subject.id,subject.name,''].map(escape).join(',')));return `\uFEFF${TRANSCRIPT_CSV_HEADERS.join(',')}\r\n${rows.join('\r\n')}${rows.length?'\r\n':''}`;
}

export function transcriptTemplateWorkbook(session){
  assertTeacher(session);const students=listStudents(session,{classId:session.classId});const rows=[TRANSCRIPT_CSV_HEADERS,...students.flatMap(student=>listSubjectsForStudent(session,student).map(subject=>[student.nisn,student.nis,student.name,subject.id,subject.name,'']))];return createWorkbookBytes('Nilai Transkrip',rows,{columnWidths:[18,14,28,18,36,12]});
}

function header(value){return String(value||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[_.-]+/g,' ').replace(/\s+/g,' ');}
const HEADER_FIELDS={'nisn':'nisn','nis':'nis','nama':'name','kode mapel':'subjectId','mata pelajaran':'subjectName','nilai':'score'};

export function previewTranscriptImport(session,text){
  assertTeacher(session);const csv=parseCsv(text);if(!csv.length)throw new Error('File CSV transkrip kosong.');const fields=csv[0].map(cell=>HEADER_FIELDS[header(cell)]||null);for(const required of ['nisn','nis','subjectId','score'])if(!fields.includes(required))throw new Error(`Kolom wajib ${required==='subjectId'?'KODE MAPEL':required.toUpperCase()} tidak ditemukan.`);const students=listStudents(session,{classId:session.classId});const seen=new Set();const rows=csv.slice(1).map((cells,index)=>{const raw={};fields.forEach((field,column)=>{if(field)raw[field]=cells[column]??'';});const errors=[];const nisn=clean(raw.nisn,30),nis=clean(raw.nis,30),subjectId=clean(raw.subjectId,80).toLowerCase();const student=students.find(item=>(nisn&&item.nisn===nisn)||(!nisn&&nis&&item.nis===nis));const subject=student?listSubjectsForStudent(session,student).find(item=>item.id===subjectId)||null:null;let score=null;try{score=scoreValue(raw.score);if(score===null)errors.push('Nilai wajib diisi.');}catch(error){errors.push(error.message);}if(!student)errors.push('Siswa tidak ditemukan pada rombel aktif.');if(!subject)errors.push('Mata pelajaran tidak aktif pada Mapping.');const unique=student&&subject?`${student.id}|${subject.id}`:`row-${index}`;if(seen.has(unique))errors.push('Siswa dan mata pelajaran duplikat pada file.');seen.add(unique);return {rowNumber:index+2,student:student?clone(student):null,subject:subject?clone(subject):null,score,raw:{nisn,nis,name:clean(raw.name,150),subjectId},valid:errors.length===0,errors};});const invalidCount=rows.filter(row=>!row.valid).length;return {sourceText:String(text),rows,validCount:rows.length-invalidCount,invalidCount,canCommit:rows.length>0&&invalidCount===0};
}

export function previewTranscriptWorkbookImport(session,data){
  const rows=readWorkbookRows(data);const escape=value=>{const text=String(value??'');return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};const csv=rows.map(row=>row.map(escape).join(',')).join('\r\n');return {...previewTranscriptImport(session,csv),format:'xlsx',sourceRows:rows};
}

export function commitTranscriptImport(session,preview){
  if(!preview||typeof preview.sourceText!=='string')throw new Error('Preview import transkrip tidak valid.');const checked=previewTranscriptImport(session,preview.sourceText);if(!checked.canCommit)throw new Error(checked.rows.flatMap(row=>row.errors)[0]||'Import transkrip tidak valid.');const grouped=new Map();checked.rows.forEach(row=>{if(!grouped.has(row.student.id))grouped.set(row.student.id,{});grouped.get(row.student.id)[row.subject.id]=row.score;});grouped.forEach((values,studentId)=>saveTranscriptScores(session,studentId,values,{partial:true}));return checked.rows.length;
}
