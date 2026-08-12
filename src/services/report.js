import { religionMatches, religionOfSubject, SUBJECTS_DEFAULT } from '../data/constants.js';
import { ASSESSMENT_TYPES, getAssessmentSettings, getAssessmentSheet } from './assessment.js';
import { semesterAttendanceRecap } from './attendance.js';
import { listStudents } from './students.js';
import { getSubjectMapping, loadDb, scopeKey, updateDb } from './storage.js';
import { listActiveSubjects, listSubjectsForStudent, requireActiveSubject } from './subjects.js';

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

/* Konteks perhitungan satu mapel disiapkan SEKALI lalu dipakai ulang untuk seluruh siswa.
   Sebelumnya setiap siswa memuat lima lembar penilaian sendiri-sendiri, sehingga satu rombel
   penuh membaca database ratusan kali dan tombol Simpan Otomatis terasa tidak bisa diklik
   karena UI membeku belasan detik. */
function reportContext(session,subjectId){
  const subject=requireActiveSubject(session,subjectId);
  const settings=getAssessmentSettings(session,subjectId);
  const attendanceMode=getDailyAttendanceMode(session,subjectId);
  const attendanceById=new Map(attendanceMode?attendanceDerivedSheet(session,subjectId).rows.map(row=>[row.studentId,row]):[]);
  const sheetByType=new Map(ASSESSMENT_TYPES.map(type=>[type.id,new Map(getAssessmentSheet(session,subjectId,type.id).rows.map(row=>[row.studentId,row]))]));
  const studentById=new Map(listStudents(session,{classId:session.classId}).map(student=>[student.id,student]));
  return {subject,settings,attendanceMode,attendanceById,sheetByType,studentById};
}

/* Nilai rapor memakai Bobot Penilaian, dinormalisasi terhadap komponen yang TERISI saja.
   Komponen kosong tidak dianggap nol, tidak ikut pembilang, dan bobotnya tidak ikut penyebut:
   bobot 40 dan 20 dengan nilai 80 dan 90 menghasilkan (80x40 + 90x20) / (40+20), bukan dibagi
   100. Satu komponen terisi menghasilkan nilai komponen itu sendiri, dan kelima komponen
   terisi menghasilkan nilai berbobot penuh seperti biasa. Bila seluruh bobot komponen terisi
   bernilai 0 atau tidak valid, dipakai rata-rata polos sebagai pengaman agar tidak NaN. */
function composeScore(components){
  const filled=components.filter(component=>component.score!==null);
  if(!filled.length)return {rawScore:null,filledCount:0,weightTotal:0,weightValid:true};
  const bobot=filled.map(component=>{const value=Number(component.weight);return Number.isFinite(value)&&value>0?value:0;});
  const weightTotal=bobot.reduce((sum,value)=>sum+value,0);
  if(weightTotal<=0)return {rawScore:filled.reduce((sum,component)=>sum+component.score,0)/filled.length,filledCount:filled.length,weightTotal:0,weightValid:false};
  const rawScore=filled.reduce((sum,component,index)=>sum+component.score*bobot[index],0)/weightTotal;
  return {rawScore,filledCount:filled.length,weightTotal,weightValid:true};
}

export function calculateReportScore(session,subjectId,studentId,context=null){
  const ctx=context||reportContext(session,subjectId);
  const student=ctx.studentById.get(studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  const components=ASSESSMENT_TYPES.map(type=>{
    const fromAttendance=type.id==='daily'&&ctx.attendanceMode;
    const score=fromAttendance?(ctx.attendanceById.get(studentId)?.score??null):(ctx.sheetByType.get(type.id).get(studentId)?.score??null);
    const weight=ctx.settings[type.id];
    return {id:type.id,label:type.label,score,weight,source:fromAttendance?'attendance':'manual',weightedValue:score===null?null:score*weight/100};
  });
  const total=components.length;
  const {rawScore,filledCount,weightTotal,weightValid}=composeScore(components);
  const roundedScore=rawScore===null?null:Math.round(rawScore);
  const complete=filledCount===total;
  return {
    studentId,studentName:student.name,nis:student.nis,nisn:student.nisn,classId:session.classId,subjectId,subjectName:ctx.subject.name,
    semester:session.semester,academicYear:session.academicYear,components,kktp:ctx.settings.kktp,
    rawScore,roundedScore,finalScore:roundedScore,
    filledCount,componentCount:total,weightTotal,weightValid,
    weightWarning:weightValid?'':'Total bobot komponen terisi tidak valid. Nilai memakai rata-rata polos; perbaiki Bobot Penilaian mapel ini.',
    completionStatus:complete?'COMPLETE':filledCount?'PARTIAL':'EMPTY',
    completionLabel:complete?'LENGKAP':filledCount?`SEBAGIAN ${filledCount}/${total}`:'BELUM ADA NILAI',
    masteryStatus:roundedScore===null?null:(roundedScore>=ctx.settings.kktp?'TUNTAS':'BELUM TUNTAS'),
    dailyFromAttendance:ctx.attendanceMode,
  };
}

/* Seluruh siswa rombel selalu ikut, tanpa memandang agama maupun kelengkapan identitasnya.
   Penyaringan agama hanya menentukan MAPEL milik siswa, bukan keberadaan siswanya. */
export function calculateReportSheet(session,subjectId){
  const ctx=reportContext(session,subjectId);
  return [...ctx.studentById.values()].map(student=>calculateReportScore(session,subjectId,student.id,ctx));
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

/* Simpan banyak nilai rapor dalam SATU commit. Sebelumnya tiap sel memanggil updateDb
   sendiri sehingga seluruh database dibaca, disalin, dan ditulis ulang ratusan kali untuk
   satu rombel penuh dan membuat UI membeku. Di sini perhitungan dikerjakan lebih dulu,
   baru seluruh hasil ditulis sekali.

   Kunci penyimpanan tetap memakai scope yang sama persis, sehingga nilai tidak mungkin
   tertukar antar siswa, mapel, semester, tahun pelajaran, maupun rombel. */
export function saveManualReportScoresBulk(session,entries,{source='MANUAL'}={}){
  assertTeacher(session);
  const list=(Array.isArray(entries)?entries:[]).filter(item=>item&&item.subjectId&&item.studentId);
  if(!list.length)return {saved:0,rows:[]};
  const contextBySubject=new Map();
  const prepared=list.map(entry=>{
    const subject=requireActiveSubject(session,entry.subjectId);
    const manualScore=scoreValue(entry.value,`Nilai rapor manual ${subject.name}`);
    if(!contextBySubject.has(subject.id))contextBySubject.set(subject.id,reportContext(session,subject.id));
    return {subjectId:subject.id,studentId:entry.studentId,manualScore,automatic:calculateReportScore(session,subject.id,entry.studentId,contextBySubject.get(subject.id))};
  });
  const rows=[];
  updateDb(db=>{
    const now=new Date().toISOString();
    prepared.forEach(({subjectId,studentId,manualScore,automatic})=>{
      const key=reportKey(session,subjectId,studentId);
      const previous=db.reportScores[key];
      const roundedScore=Math.round(manualScore);
      const saved={...automatic,rawScore:manualScore,roundedScore,finalScore:roundedScore,completionStatus:'COMPLETE',completionLabel:'LENGKAP',
        masteryStatus:roundedScore>=automatic.kktp?'TUNTAS':'BELUM TUNTAS',isManualOverride:true,
        previousScoreReference:referenceFrom(previous)||referenceFrom(automatic),
        automaticReference:{rawScore:automatic.rawScore,roundedScore:automatic.roundedScore,completionStatus:automatic.completionStatus,components:automatic.components},
        calculationMethod:source,createdAt:previous?.createdAt||now,updatedAt:now};
      db.reportScores[key]=saved;
      rows.push(saved);
    });
    return db;
  });
  return {saved:rows.length,rows:clone(rows)};
}

/* Baris memakai mapel milik masing-masing siswa, DITAMBAH setiap mapel yang benar-benar sudah
   punya nilai atau deskripsi tersimpan untuk siswa itu.

   Tanpa tambahan tersebut, nilai yang terlanjur disimpan menjadi tidak terlihat sama sekali di
   Nilai Tersimpan begitu mapelnya bukan mapel siswa itu, misalnya nilai Pendidikan Agama pada
   siswa yang kolom agamanya masih kosong. Nilainya tetap ada di database, hanya barisnya yang
   tidak pernah dibuat. Penyaringan agama tetap berlaku pada dokumen rapor dan kelengkapan,
   yang memang menyaring ulang memakai mapel milik siswa. */
function subjectLookup(session){
  const mapping=getSubjectMapping(session);
  const byId=new Map();
  for(const subject of [...mapping,...SUBJECTS_DEFAULT])if(!byId.has(subject.id))byId.set(subject.id,subject);
  return byId;
}

export function getStoredReportRows(session){
  assertTeacher(session);const db=loadDb();const students=listStudents(session,{classId:session.classId});
  const subjectsByStudent=new Map(students.map(student=>[student.id,listSubjectsForStudent(session,student)]));
  const katalog=subjectLookup(session);
  const prefix=`${scopeKey(session)}|`;
  /* Mapel yang punya data tersimpan, dikelompokkan per siswa, dibaca dari kunci penyimpanan. */
  const tersimpan=new Map(students.map(student=>[student.id,new Set()]));
  for(const kunci of [...Object.keys(db.reportScores||{}),...Object.keys(db.reportDescriptions||{})]){
    if(!kunci.startsWith(prefix))continue;
    const sisa=kunci.slice(prefix.length);
    const pemisah=sisa.indexOf('|');
    if(pemisah<0)continue;
    const subjectId=sisa.slice(0,pemisah),studentId=sisa.slice(pemisah+1);
    if(tersimpan.has(studentId))tersimpan.get(studentId).add(subjectId);
  }
  const urutan=listActiveSubjects(session).map(subject=>subject.id);
  const semuaMapel=[...new Set([...urutan,...[...subjectsByStudent.values()].flat().map(subject=>subject.id),...[...tersimpan.values()].flatMap(set=>[...set])])];
  return semuaMapel.flatMap(subjectId=>students.flatMap(student=>{
    const milikSiswa=subjectsByStudent.get(student.id).find(item=>item.id===subjectId);
    const subject=milikSiswa||(tersimpan.get(student.id).has(subjectId)?katalog.get(subjectId):null);
    if(!subject)return [];
    return [buildStoredRow(db,session,student,subject)];
  }));
}

/* Penyaringan TAMPILAN untuk halaman Nilai Tersimpan. Simpan Semua Nilai Otomatis menulis
   record untuk seluruh mapel aktif x seluruh siswa, sehingga siswa Islam ikut mendapat baris PAK
   kosong dan sebaliknya. Baris mapel agama hanya ditampilkan bila berisi nilai atau deskripsi dan
   sesuai agama siswa. Bila agama siswa masih kosong, agama tidak ditebak: baris yang sudah berisi
   nilai tetap ditampilkan agar hasil kerja guru tidak hilang dari layar. Tidak ada record yang
   dihapus dari database; mengisi/memperbaiki kolom Agama siswa memunculkannya kembali. */
export function visibleStoredReportRows(rows){
  return rows.filter(row=>{
    const agamaMapel=religionOfSubject(row.subject);
    if(!agamaMapel)return true;
    if(!row.scoreComplete&&!row.descriptionComplete)return false;
    const agamaSiswa=row.student?.religion||'';
    return agamaSiswa?religionMatches(agamaMapel,agamaSiswa):true;
  });
}

function buildStoredRow(db,session,student,subject){
    const score=db.reportScores[reportKey(session,subject.id,student.id)]||null;
    const description=db.reportDescriptions[reportKey(session,subject.id,student.id)]||null;
    /* Nilai dianggap tersedia begitu ada nilai akhir, termasuk hasil dari komponen yang baru
       terisi sebagian. Yang belum punya nilai sama sekali tetap dibedakan. */
    const scoreComplete=Boolean(score&&score.finalScore!==null);const descriptionComplete=Boolean(description?.text);
  return {student,subject,score:score?clone(score):null,description:description?clone(description):null,scoreComplete,descriptionComplete,complete:scoreComplete&&descriptionComplete};
}

export function getCompletionSummary(session){
  const rows=getStoredReportRows(session);const students=listStudents(session,{classId:session.classId});const subjects=listActiveSubjects(session);
  return subjects.map(subject=>{
    const subjectRows=rows.filter(row=>row.subject.id===subject.id);const scoreComplete=subjectRows.filter(row=>row.scoreComplete).length;const descriptionComplete=subjectRows.filter(row=>row.descriptionComplete).length;const denominator=students.length*2;const percentage=denominator?Math.round((scoreComplete+descriptionComplete)/denominator*100):0;
    return {subject,studentCount:students.length,scoreComplete,descriptionComplete,percentage,status:students.length&&scoreComplete===students.length&&descriptionComplete===students.length?'COMPLETE':'INCOMPLETE',missing:subjectRows.filter(row=>!row.complete).map(row=>({student:row.student,missingScore:!row.scoreComplete,missingDescription:!row.descriptionComplete}))};
  });
}
