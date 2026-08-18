import { ASSESSMENT_DEFAULT } from '../data/constants.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';

export const ASSESSMENT_TYPES=[
  {id:'formative',label:'Formatif'},
  {id:'daily',label:'Penilaian Harian'},
  {id:'practice',label:'Penilaian Praktik'},
  {id:'scopeSummative',label:'Sumatif Lingkup Materi'},
  {id:'semesterSummative',label:'Sumatif Akhir Semester'},
];

/* Sumatif Lingkup Materi diisi per bab seperti Daftar Nilai kertas: LM1 sampai LM5. Nilai tiap
   lingkup materi disimpan apa adanya, lalu RATA-RATA lingkup yang terisi menjadi nilai komponen
   Sumatif Lingkup Materi. Nilai komponen itulah yang digabung dengan empat komponen lain
   memakai Bobot Penilaian sehingga menjadi nilai rapor. Lingkup yang kosong tidak dihitung dan
   tidak pernah dianggap nol. Berlaku untuk seluruh mata pelajaran, Semester 1 dan Semester 2,
   karena kunci penyimpanan sudah memuat tahun pelajaran, semester, dan rombel. */
export const SCOPE_SUMMATIVE_TYPE='scopeSummative';
export const SCOPE_SUMMATIVE_PARTS=Object.freeze([
  {id:'lm1',label:'LM1'},{id:'lm2',label:'LM2'},{id:'lm3',label:'LM3'},{id:'lm4',label:'LM4'},{id:'lm5',label:'LM5'},
]);

const DEFAULT_KKTP=75;
const EPSILON=0.000001;

function clone(value){return JSON.parse(JSON.stringify(value));}
function settingsKey(session,subjectId){return `${scopeKey(session)}|${subjectId}`;}
function scorePrefix(session,subjectId,assessmentType){return `${scopeKey(session)}|${subjectId}|${assessmentType}|`;}
function scoreKey(session,subjectId,assessmentType,studentId){return `${scorePrefix(session,subjectId,assessmentType)}${studentId}`;}

function assertAssessmentType(assessmentType){
  if(!ASSESSMENT_TYPES.some(type=>type.id===assessmentType)) throw new Error('Jenis penilaian tidak valid.');
}
function numberInRange(value,label){
  if(value==='' || value===null || value===undefined) throw new Error(`${label} wajib diisi.`);
  const number=Number(value);
  if(!Number.isFinite(number) || number<0 || number>100) throw new Error(`${label} harus berupa angka 0 sampai 100.`);
  return number;
}
function normalizeWeights(input){
  const weights={};
  ASSESSMENT_TYPES.forEach(type=>{weights[type.id]=numberInRange(input?.[type.id],`Bobot ${type.label}`);});
  const total=Object.values(weights).reduce((sum,value)=>sum+value,0);
  if(Math.abs(total-100)>EPSILON) throw new Error(`Total bobot wajib 100%. Total saat ini ${total}%.`);
  return weights;
}
function parseScore(value){
  if(value===null || value===undefined || (typeof value==='string' && value.trim()==='')) return null;
  return numberInRange(value,'Nilai');
}

/* Nilai boleh dikirim sebagai satu angka, atau sebagai daftar nilai lingkup materi
   {parts:{lm1:80,lm3:90}}. Bentuk kedua menghitung rata-rata lingkup yang terisi. */
export function normalizeScopeSummativeParts(input){
  const sumber=input&&typeof input==='object'&&!Array.isArray(input)?(input.parts??input):null;
  if(!sumber||typeof sumber!=='object')return null;
  const parts={};
  SCOPE_SUMMATIVE_PARTS.forEach(part=>{
    if(!Object.hasOwn(sumber,part.id))return;
    const nilai=parseScore(sumber[part.id]);
    if(nilai!==null)parts[part.id]=nilai;
  });
  return parts;
}
export function scopeSummativeAverage(parts){
  const nilai=SCOPE_SUMMATIVE_PARTS.map(part=>parts?.[part.id]).filter(item=>item!==null&&item!==undefined);
  if(!nilai.length)return null;
  return Number((nilai.reduce((sum,item)=>sum+item,0)/nilai.length).toFixed(2));
}

export function defaultAssessmentSettings(){return {...ASSESSMENT_DEFAULT,kktp:DEFAULT_KKTP};}

export function getAssessmentSettings(session,subjectId){
  requireActiveSubject(session,subjectId);
  return clone(loadDb().assessmentSettings[settingsKey(session,subjectId)] || defaultAssessmentSettings());
}

export function saveAssessmentSettings(session,subjectId,input){
  requireActiveSubject(session,subjectId);
  const weights=normalizeWeights(input);
  const kktp=numberInRange(input?.kktp,'KKTP');
  const saved={...weights,kktp,subjectId,classId:session.classId,semester:session.semester,academicYear:session.academicYear,updatedAt:new Date().toISOString()};
  updateDb(db=>{db.assessmentSettings[settingsKey(session,subjectId)]=saved;return db;});
  return clone(saved);
}

/* Simpan bobot dan KKTP seluruh mapel sekaligus. Divalidasi lebih dulu untuk semua mapel,
   baru ditulis, sehingga satu mapel yang salah tidak menyisakan penyimpanan separuh jalan.
   Bobot tiap mapel tetap tersimpan independen pada kuncinya masing-masing. */
export function saveAllAssessmentSettings(session,entries){
  const list=Array.isArray(entries)?entries:Object.entries(entries||{}).map(([subjectId,value])=>({subjectId,...value}));
  if(!list.length)throw new Error('Tidak ada bobot yang disimpan.');
  const prepared=list.map(entry=>{
    const subject=requireActiveSubject(session,entry.subjectId);
    try{
      return {subjectId:subject.id,weights:normalizeWeights(entry),kktp:numberInRange(entry?.kktp,'KKTP')};
    }catch(error){throw new Error(`${subject.name}: ${error.message}`);}
  });
  const now=new Date().toISOString();const saved=[];
  updateDb(db=>{
    prepared.forEach(item=>{
      const record={...item.weights,kktp:item.kktp,subjectId:item.subjectId,classId:session.classId,semester:session.semester,academicYear:session.academicYear,updatedAt:now};
      db.assessmentSettings[settingsKey(session,item.subjectId)]=record;saved.push(record);
    });
    return db;
  });
  return clone(saved);
}

export function resetAssessmentSettings(session,subjectId){
  requireActiveSubject(session,subjectId);
  updateDb(db=>{delete db.assessmentSettings[settingsKey(session,subjectId)];return db;});
  return defaultAssessmentSettings();
}

export function getAssessmentSheet(session,subjectId,assessmentType){
  requireActiveSubject(session,subjectId);assertAssessmentType(assessmentType);
  const students=listStudents(session,{classId:session.classId});
  const prefix=scorePrefix(session,subjectId,assessmentType);
  const records=Object.entries(loadDb().assessmentScores||{})
    .filter(([key])=>key.startsWith(prefix))
    .map(([,record])=>record);
  const byStudent=new Map(records.map(record=>[record.studentId,record]));
  const rows=students.map(student=>{
    const record=byStudent.get(student.id);
    const parts=assessmentType===SCOPE_SUMMATIVE_TYPE?clone(record?.parts||{}):null;
    return {studentId:student.id,nis:student.nis,nisn:student.nisn,name:student.name,score:record?.score??null,parts,saved:Boolean(record)};
  });
  const filled=rows.filter(row=>row.score!==null);
  return {
    subjectId,assessmentType,classId:session.classId,semester:session.semester,academicYear:session.academicYear,
    rows,filledCount:filled.length,pendingCount:rows.length-filled.length,
    average:filled.length?filled.reduce((sum,row)=>sum+row.score,0)/filled.length:null,
  };
}

export function saveAssessmentScores(session,subjectId,assessmentType,values){
  requireActiveSubject(session,subjectId);assertAssessmentType(assessmentType);
  if(!values || typeof values!=='object' || Array.isArray(values)) throw new Error('Data nilai tidak valid.');
  const students=listStudents(session,{classId:session.classId});
  const studentById=new Map(students.map(student=>[student.id,student]));
  const unknown=Object.keys(values).filter(studentId=>!studentById.has(studentId));
  if(unknown.length) throw new Error('Data nilai memuat siswa di luar scope rombel aktif.');
  /* Khusus Sumatif Lingkup Materi, nilai boleh berupa daftar nilai per lingkup materi.
     Angka tunggal tetap diterima dan menggantikan rincian lingkup materi sebelumnya. */
  const normalized=Object.entries(values).map(([studentId,value])=>{
    if(assessmentType!==SCOPE_SUMMATIVE_TYPE)return [studentId,parseScore(value),null];
    const parts=normalizeScopeSummativeParts(value);
    if(parts)return [studentId,scopeSummativeAverage(parts),parts];
    return [studentId,parseScore(value),null];
  });
  const now=new Date().toISOString();
  updateDb(db=>{
    normalized.forEach(([studentId,score,parts])=>{
      const key=scoreKey(session,subjectId,assessmentType,studentId);
      if(score===null){delete db.assessmentScores[key];return;}
      const previous=db.assessmentScores[key];
      db.assessmentScores[key]={
        studentId,classId:session.classId,subjectId,semester:session.semester,academicYear:session.academicYear,
        assessmentType,score,createdAt:previous?.createdAt||now,updatedAt:now,
        ...(parts&&Object.keys(parts).length?{parts}:{}),
      };
    });
    return db;
  });
  return getAssessmentSheet(session,subjectId,assessmentType);
}
