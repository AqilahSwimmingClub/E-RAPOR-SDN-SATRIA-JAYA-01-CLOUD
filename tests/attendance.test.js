import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { dailyAttendanceRecap, getAttendance, monthlyAttendanceRecap, saveAttendance, semesterAttendanceRecap, studentAbsenceTotals } from '../src/services/attendance.js';
import { createStudent } from '../src/services/students.js';
import { loadDb, scopeKey } from '../src/services/storage.js';

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),clear:()=>values.clear(),
  };
}
const base={role:'teacher',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
const teacher5b={...base,classId:'5B'};
const teacher5c={...base,classId:'5C'};
function addStudent(session,index){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}${index}`,nisn:`00${[...session.classId].map(character=>character.charCodeAt(0)).join('')}${String(index).padStart(7,'0')}`,name:`Siswa ${session.classId}-${index}`,gender:index%2?'L':'P',photo:''});
}

test('One attendance status per student per date is saved and editable',()=>{
  useMemoryStorage();
  const first=addStudent(teacher5b,1),second=addStudent(teacher5b,2);
  saveAttendance(teacher5b,'2026-08-10',{[first.id]:'Hadir',[second.id]:'Sakit'});
  saveAttendance(teacher5b,'2026-08-10',{[first.id]:'Izin',[second.id]:'Hadir'});
  const record=getAttendance(teacher5b,'2026-08-10');
  assert.deepEqual(record.statuses,{[first.id]:'Izin',[second.id]:'Hadir'});
  const attendanceKeys=Object.keys(loadDb().attendance).filter(key=>key.startsWith(`${scopeKey(teacher5b)}|2026-08-10`));
  assert.equal(attendanceKeys.length,1);
  assert.deepEqual(dailyAttendanceRecap(teacher5b,'2026-08-10').totals,{Hadir:1,Sakit:0,Izin:1,Alpa:0});
});

test('Invalid or incomplete attendance status is rejected',()=>{
  useMemoryStorage();
  const first=addStudent(teacher5b,1),second=addStudent(teacher5b,2);
  assert.throws(()=>saveAttendance(teacher5b,'2026-08-11',{[first.id]:'Hadir'}),/Pilih status absensi/);
  assert.throws(()=>saveAttendance(teacher5b,'2026-08-11',{[first.id]:'Terlambat',[second.id]:'Hadir'}),/Pilih status absensi/);
});

test('Monthly and semester attendance recaps count H S I A correctly',()=>{
  useMemoryStorage();
  const first=addStudent(teacher5b,1),second=addStudent(teacher5b,2);
  saveAttendance(teacher5b,'2026-08-01',{[first.id]:'Hadir',[second.id]:'Sakit'});
  saveAttendance(teacher5b,'2026-08-02',{[first.id]:'Izin',[second.id]:'Alpa'});
  saveAttendance(teacher5b,'2026-09-01',{[first.id]:'Sakit',[second.id]:'Hadir'});
  const august=monthlyAttendanceRecap(teacher5b,'2026-08');
  assert.equal(august.daysRecorded,2);
  assert.deepEqual(august.totals,{Hadir:1,Sakit:1,Izin:1,Alpa:1});
  const semester=semesterAttendanceRecap(teacher5b);
  assert.equal(semester.daysRecorded,3);
  assert.deepEqual(semester.totals,{Hadir:2,Sakit:2,Izin:1,Alpa:1});
  assert.deepEqual(studentAbsenceTotals(teacher5b,first.id),{Sakit:1,Izin:1,Alpa:0});
});

test('Attendance remains isolated between classes',()=>{
  useMemoryStorage();
  const student5b=addStudent(teacher5b,1),student5c=addStudent(teacher5c,1);
  saveAttendance(teacher5b,'2026-08-15',{[student5b.id]:'Alpa'});
  saveAttendance(teacher5c,'2026-08-15',{[student5c.id]:'Hadir'});
  assert.deepEqual(dailyAttendanceRecap(teacher5b,'2026-08-15').totals,{Hadir:0,Sakit:0,Izin:0,Alpa:1});
  assert.deepEqual(dailyAttendanceRecap(teacher5c,'2026-08-15').totals,{Hadir:1,Sakit:0,Izin:0,Alpa:0});
  assert.equal(monthlyAttendanceRecap(teacher5b,'2026-08').daysRecorded,1);
  assert.equal(monthlyAttendanceRecap(teacher5c,'2026-08').daysRecorded,1);
});
