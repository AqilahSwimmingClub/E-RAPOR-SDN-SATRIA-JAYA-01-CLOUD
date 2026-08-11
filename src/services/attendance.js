import { loadDb, updateDb } from './storage.js';
import { listStudents, resolveStudentClass, studentScope } from './students.js';

export const ATTENDANCE_STATUSES=['Hadir','Sakit','Izin','Alpa'];

function clone(value){return JSON.parse(JSON.stringify(value));}
function emptyCounts(){return {Hadir:0,Sakit:0,Izin:0,Alpa:0};}
function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return false;
  const parsed=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;
}
function validMonth(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||''));}

function attendanceEntries(db,session,classId){
  const scope=studentScope(session,classId);
  return Object.entries(db.attendance||{}).filter(([key])=>key.startsWith(`${scope}|`));
}

export function getAttendance(session,date,{classId}={}){
  if(!validDate(date)) throw new Error('Tanggal absensi tidak valid.');
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const key=`${studentScope(session,targetClass)}|${date}`;
  const record=loadDb().attendance[key];
  return record?clone(record):null;
}

export function saveAttendance(session,date,statuses,{classId}={}){
  if(!validDate(date)) throw new Error('Tanggal absensi tidak valid.');
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const students=listStudents(session,{classId:targetClass});
  if(!students.length) throw new Error('Belum ada siswa pada rombel ini.');
  const statusMap=statuses&&typeof statuses==='object'?statuses:{};
  const studentIds=new Set(students.map(student=>student.id));
  const unknownIds=Object.keys(statusMap).filter(id=>!studentIds.has(id));
  if(unknownIds.length) throw new Error('Absensi memuat siswa di luar scope rombel aktif.');
  const normalized={};
  students.forEach(student=>{
    const status=statusMap[student.id];
    if(!ATTENDANCE_STATUSES.includes(status)) throw new Error(`Pilih status absensi untuk ${student.name}.`);
    normalized[student.id]=status;
  });
  const key=`${studentScope(session,targetClass)}|${date}`;
  let saved;
  updateDb(db=>{
    const existing=db.attendance[key];
    const now=new Date().toISOString();
    saved={
      date,classId:targetClass,semester:session.semester,academicYear:session.academicYear,
      statuses:normalized,createdAt:existing?.createdAt||now,updatedAt:now
    };
    db.attendance[key]=saved;
    return db;
  });
  return clone(saved);
}

export function dailyAttendanceRecap(session,date,{classId}={}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  const record=getAttendance(session,date,{classId:targetClass});
  const totals=emptyCounts();
  Object.values(record?.statuses||{}).forEach(status=>{if(ATTENDANCE_STATUSES.includes(status))totals[status]+=1;});
  return {date,classId:targetClass,saved:Boolean(record),totals,total:Object.values(totals).reduce((sum,value)=>sum+value,0)};
}

function rangeRecap(session,{classId,month=null}){
  const targetClass=resolveStudentClass(session,classId||session.classId);
  if(month!==null && !validMonth(month)) throw new Error('Bulan rekap tidak valid.');
  const records=attendanceEntries(loadDb(),session,targetClass)
    .map(([,record])=>record)
    .filter(record=>!month || record.date.startsWith(`${month}-`))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const students=listStudents(session,{classId:targetClass});
  const studentTotals=new Map(students.map(student=>[student.id,emptyCounts()]));
  const totals=emptyCounts();
  records.forEach(record=>Object.entries(record.statuses||{}).forEach(([studentId,status])=>{
    if(!ATTENDANCE_STATUSES.includes(status)) return;
    totals[status]+=1;
    const counts=studentTotals.get(studentId);if(counts)counts[status]+=1;
  }));
  return {
    classId:targetClass,month,dates:records.map(record=>record.date),daysRecorded:records.length,totals,
    students:students.map(student=>({id:student.id,nis:student.nis,name:student.name,...studentTotals.get(student.id)}))
  };
}

export function monthlyAttendanceRecap(session,month,{classId}={}){return rangeRecap(session,{classId,month});}
export function semesterAttendanceRecap(session,{classId}={}){return rangeRecap(session,{classId,month:null});}

export function studentAbsenceTotals(session,studentId,{classId}={}){
  const recap=semesterAttendanceRecap(session,{classId});
  const student=recap.students.find(item=>item.id===studentId);
  return student?{Sakit:student.Sakit,Izin:student.Izin,Alpa:student.Alpa}:{Sakit:0,Izin:0,Alpa:0};
}
