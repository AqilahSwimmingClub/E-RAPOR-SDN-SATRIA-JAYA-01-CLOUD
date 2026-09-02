import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { commitStudentImport, createStudent, deactivateStudent, deleteStudent, getStudent, listStudents, previewStudentImport, studentOriginLabel, studentTemplateCsv, updateStudent } from '../src/services/students.js';

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
const admin={role:'admin',classId:null,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
function studentInput(overrides={}){
  return {classId:'5B',nis:'5001',nisn:'0012345678',name:'Alya Satria',gender:'P',birthPlace:'Bekasi',birthDate:'2015-03-12',fatherName:'Budi',motherName:'Siti',phone:'08123456789',address:'Bekasi',photo:'',...overrides};
}

test('Student data is isolated between classes while Admin can see all classes',()=>{
  useMemoryStorage();
  createStudent(teacher5b,studentInput());
  createStudent(teacher5c,studentInput({classId:'5C',nis:'5002',nisn:'0012345679',name:'Bima Satria',gender:'L'}));
  assert.deepEqual(listStudents(teacher5b).map(student=>student.name),['Alya Satria']);
  assert.deepEqual(listStudents(teacher5c).map(student=>student.name),['Bima Satria']);
  assert.equal(listStudents(admin).length,2);
  assert.throws(()=>listStudents(teacher5b,{classId:'5C'}),/hanya dapat mengelola/);
});

test('Student CRUD creates, reads, updates, and deletes a scoped record',()=>{
  useMemoryStorage();
  const created=createStudent(teacher5b,studentInput());
  assert.equal(getStudent(teacher5b,created.id).nis,'5001');
  const updated=updateStudent(teacher5b,created.id,{...studentInput(),name:'Alya Satria Putri',phone:'089999'});
  assert.equal(updated.name,'Alya Satria Putri');
  assert.equal(getStudent(teacher5b,created.id).phone,'089999');
  assert.equal(deleteStudent(teacher5b,created.id),true);
  assert.equal(getStudent(teacher5b,created.id),null);
});

test('Duplicate NIS and NISN are rejected across classes in the active period',()=>{
  useMemoryStorage();
  createStudent(teacher5b,studentInput());
  assert.throws(()=>createStudent(teacher5b,studentInput({nis:'5009',name:'Duplikat NISN'})),/NISN .* sudah digunakan/);
  assert.throws(()=>createStudent(teacher5b,studentInput({nisn:'0099999999',name:'Duplikat NIS'})),/NIS .* sudah digunakan/);
  assert.throws(()=>createStudent(teacher5c,studentInput({classId:'5C',nis:'5999'})),/NISN .* sudah digunakan/);
});

test('teacher-created student is audited and remains in assigned class',()=>{
  useMemoryStorage();
  const created=createStudent({...teacher5b,username:'guru5b'},studentInput({classId:'5C'}));
  assert.equal(created.classId,'5B');
  assert.equal(created.origin,'manual-teacher');
  assert.equal(created.createdBy,'guru5b');
  assert.equal(created.syncState,'local');
  assert.equal(created.isActive,true);
  assert.match(created.createdAt,/^\d{4}-\d{2}-\d{2}T/);
  assert.equal(studentOriginLabel(created),'Input Manual Guru');
});

test('admin-created student uses manual-admin origin',()=>{
  useMemoryStorage();
  const created=createStudent({...admin,username:'admin'},studentInput());
  assert.equal(created.origin,'manual-admin');
  assert.equal(studentOriginLabel(created),'Input Manual Admin');
});

test('editing Dapodik students preserves their origin and dapodikId',()=>{
  useMemoryStorage();
  const created=createStudent({...admin,username:'admin'},studentInput());
  const raw=JSON.parse(localStorage.getItem('erapor_satria_jaya_01_v1'));
  const key=Object.keys(raw.students)[0];
  raw.students[key]={...raw.students[key],origin:'dapodik',dapodikId:'dapodik-5001'};
  localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(raw));
  const updated=updateStudent(admin,created.id,{...studentInput(),name:'Alya Dapodik'});
  assert.equal(updated.origin,'dapodik');
  assert.equal(updated.dapodikId,'dapodik-5001');
  assert.equal(studentOriginLabel(updated),'Dapodik');
  assert.equal(studentOriginLabel({name:'Siswa Lama'}),'Data Lama');
});

test('Dapodik students are deactivated without deleting their record',()=>{
  useMemoryStorage();
  const created=createStudent({...admin,username:'admin'},studentInput());
  const raw=JSON.parse(localStorage.getItem('erapor_satria_jaya_01_v1'));
  const key=Object.keys(raw.students)[0];
  raw.students[key]={...raw.students[key],origin:'dapodik',dapodikId:'dapodik-5001'};
  localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(raw));
  assert.equal(deactivateStudent(admin,created.id,{classId:'5B'}),true);
  assert.equal(listStudents(admin,{classId:'5B'}).length,0);
  const stored=JSON.parse(localStorage.getItem('erapor_satria_jaya_01_v1')).students[key];
  assert.equal(stored.isActive,false);
  assert.equal(stored.dapodikId,'dapodik-5001');
});

test('Student import previews and validates without committing, then commits after approval step',()=>{
  useMemoryStorage();
  const csv=`${studentTemplateCsv()}5101,0098765432,"Citra Lestari",P,Bekasi,2015-08-11,Agus,081111,"Jl. Melati, Bekasi"\r\n`;
  const preview=previewStudentImport(teacher5b,csv,{classId:'5B'});
  assert.equal(preview.canCommit,true);
  assert.equal(preview.validCount,1);
  assert.equal(listStudents(teacher5b).length,0);
  const imported=commitStudentImport(teacher5b,preview);
  assert.equal(imported.length,1);
  assert.equal(listStudents(teacher5b)[0].name,'Citra Lestari');
});

test('Student import blocks duplicate rows during preview',()=>{
  useMemoryStorage();
  const header=studentTemplateCsv();
  const csv=`${header}5201,0011111111,Siswa Satu,L,Bekasi,2015-01-01,,,\r\n5202,0011111111,Siswa Dua,P,Bekasi,2015-02-02,,,\r\n`;
  const preview=previewStudentImport(teacher5b,csv,{classId:'5B'});
  assert.equal(preview.canCommit,false);
  assert.equal(preview.invalidCount,1);
  assert.match(preview.rows[1].errors.join(' '),/NISN/);
  assert.throws(()=>commitStudentImport(teacher5b,preview),/NISN/);
  assert.equal(listStudents(teacher5b).length,0);
});
