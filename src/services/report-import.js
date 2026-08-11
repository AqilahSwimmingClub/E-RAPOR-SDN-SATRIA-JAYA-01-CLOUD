import { parseCsv } from './students.js';
import { listStudents } from './students.js';
import { saveManualReportScore } from './report.js';
import { requireActiveSubject } from './subjects.js';

export const REPORT_CSV_HEADERS=['Rombel','NIS','NISN','Mapel ID','Nilai Manual'];
function header(value){return String(value||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[_.-]+/g,' ').replace(/\s+/g,' ');}
const FIELDS={rombel:'classId',kelas:'classId',nis:'nis',nisn:'nisn','mapel id':'subjectId',mapel:'subjectId','nilai manual':'score',nilai:'score'};

function csvCell(value){const text=String(value??'');return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
export function reportTemplateCsv(session,subjectId){
  requireActiveSubject(session,subjectId);const rows=listStudents(session,{classId:session.classId}).map(student=>[session.classId,student.nis,student.nisn,subjectId,''].map(csvCell).join(','));
  return `\uFEFF${REPORT_CSV_HEADERS.join(',')}\r\n${rows.length?`${rows.join('\r\n')}\r\n`:''}`;
}

export function previewReportImport(session,subjectId,text){
  requireActiveSubject(session,subjectId);const csvRows=parseCsv(text);if(!csvRows.length)throw new Error('File CSV kosong.');
  const mapped=csvRows[0].map(value=>FIELDS[header(value)]||null);for(const required of ['classId','nis','nisn','subjectId','score'])if(!mapped.includes(required))throw new Error(`Kolom wajib ${required} tidak ditemukan.`);
  const students=listStudents(session,{classId:session.classId});const seen=new Set();
  const rows=csvRows.slice(1).map((cells,index)=>{
    const raw={};mapped.forEach((field,column)=>{if(field)raw[field]=String(cells[column]??'').trim();});const errors=[];
    if(raw.classId.toUpperCase()!==session.classId)errors.push(`Rombel harus ${session.classId}.`);if(raw.subjectId!==subjectId)errors.push(`Mapel ID harus ${subjectId}.`);
    const student=students.find(item=>item.nis===raw.nis&&item.nisn===raw.nisn);if(!student)errors.push('Pasangan NIS dan NISN tidak ditemukan pada rombel aktif.');
    const score=raw.score===''?null:Number(raw.score);if(score===null||!Number.isFinite(score)||score<0||score>100)errors.push('Nilai Manual harus 0 sampai 100.');
    if(student&&seen.has(student.id))errors.push('Siswa muncul lebih dari satu kali.');if(student)seen.add(student.id);
    return {rowNumber:index+2,studentId:student?.id||null,studentName:student?.name||'—',nis:raw.nis,nisn:raw.nisn,score,valid:errors.length===0,errors};
  });
  const invalidCount=rows.filter(row=>!row.valid).length;return {sourceText:String(text),subjectId,rows,validCount:rows.length-invalidCount,invalidCount,canCommit:rows.length>0&&invalidCount===0};
}

export function commitReportImport(session,preview){
  if(!preview||typeof preview.sourceText!=='string')throw new Error('Preview import tidak valid.');const checked=previewReportImport(session,preview.subjectId,preview.sourceText);if(!checked.canCommit)throw new Error(checked.rows.flatMap(row=>row.errors).join(' '));
  return checked.rows.map(row=>saveManualReportScore(session,checked.subjectId,row.studentId,row.score,{source:'IMPORT_MANUAL'}));
}
