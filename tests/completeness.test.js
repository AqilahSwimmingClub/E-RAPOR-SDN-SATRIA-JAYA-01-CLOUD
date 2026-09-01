import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { createExtracurricular, getGraduationStatus, getHomeroomNote, getPromotionStatus, listExtracurriculars, prepareGraduationStatus, saveHomeroomNote, savePromotionStatus, updateExtracurricular } from '../src/services/completeness.js';
import { createStudent } from '../src/services/students.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const base={role:'teacher',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
const teacher5b={...base,classId:'5B'};const teacher5c={...base,classId:'5C'};const teacher6a={...base,classId:'6A'};const teacher5bGenap={...teacher5b,semester:`Genap ${ACADEMIC_YEAR}`};
function addStudent(session,index=1,overrides={}){return createStudent(session,{classId:session.classId,nis:`${session.classId}-K-${index}`,nisn:`77${[...session.classId].map(character=>character.charCodeAt(0)).join('')}${String(index).padStart(7,'0')}`,name:`Siswa Kelengkapan ${session.classId}-${index}`,gender:index%2?'L':'P',religion:'Islam',photo:'',...overrides});}

test('Extracurricular records are isolated between students and classes and support multiple activities',()=>{
  useMemoryStorage();const first=addStudent(teacher5b,1);const second=addStudent(teacher5b,2);const otherClass=addStudent(teacher5c,1);
  const scout=createExtracurricular(teacher5b,first.id,{name:'Pramuka',predicate:'Sangat Baik',description:'Aktif dan disiplin.'});
  createExtracurricular(teacher5b,first.id,{name:'Pencak Silat',predicate:'Baik',description:'Menguasai gerakan dasar.'});
  updateExtracurricular(teacher5b,first.id,scout.id,{name:'Pramuka',predicate:'Baik',description:'Aktif mengikuti latihan rutin.'});
  createExtracurricular(teacher5c,otherClass.id,{name:'Futsal',predicate:'Baik',description:'Kerja sama baik.'});
  assert.equal(listExtracurriculars(teacher5b,first.id).length,2);assert.equal(listExtracurriculars(teacher5b,first.id)[0].predicate,'Baik');assert.equal(listExtracurriculars(teacher5b,second.id).length,0);assert.equal(listExtracurriculars(teacher5c,otherClass.id)[0].name,'Futsal');assert.throws(()=>listExtracurriculars(teacher5c,first.id),/tidak ditemukan/);
});

test('Homeroom notes save and edit per student without leaking across scopes',()=>{
  useMemoryStorage();const first=addStudent(teacher5b,1);const second=addStudent(teacher5b,2);
  saveHomeroomNote(teacher5b,first.id,'Terus tingkatkan kebiasaan membaca.');saveHomeroomNote(teacher5b,first.id,'Pertahankan semangat belajar dan membaca.');
  assert.equal(getHomeroomNote(teacher5b,first.id).text,'Pertahankan semangat belajar dan membaca.');assert.equal(getHomeroomNote(teacher5b,second.id),null);assert.throws(()=>saveHomeroomNote(teacher5b,second.id,'   '),/wajib diisi/);
});

test('Promotion status is scoped and Grade 6 uses a separate graduation structure',()=>{
  useMemoryStorage();const student=addStudent(teacher5b,1);const gradeSix=addStudent(teacher6a,1);
  const promoted=savePromotionStatus(teacher5b,student.id,'PROMOTED');assert.equal(promoted.targetClass,'6B');assert.equal(getPromotionStatus(teacher5b,student.id).status,'PROMOTED');
  assert.throws(()=>savePromotionStatus(teacher6a,gradeSix.id,'PROMOTED'),/kelulusan terpisah/);const graduation=prepareGraduationStatus(teacher6a,gradeSix.id);assert.equal(graduation.prepared,true);assert.equal(graduation.status,null);assert.equal(getGraduationStatus(teacher6a,gradeSix.id).resultType,'GRADUATION');assert.equal(getPromotionStatus(teacher6a,gradeSix.id),null);
});

test('Completeness data remains isolated between semesters',()=>{
  useMemoryStorage();const sharedNisn='7700000001';const ganjil=addStudent(teacher5b,1,{id:'student-ganjil',nisn:sharedNisn});const genap=addStudent(teacher5bGenap,1,{id:'student-genap',nisn:sharedNisn});
  createExtracurricular(teacher5b,ganjil.id,{name:'Pramuka',predicate:'Baik',description:'Semester ganjil.'});saveHomeroomNote(teacher5b,ganjil.id,'Catatan semester ganjil.');savePromotionStatus(teacher5b,ganjil.id,'RETAINED');
  assert.equal(listExtracurriculars(teacher5bGenap,genap.id).length,0);assert.equal(getHomeroomNote(teacher5bGenap,genap.id),null);assert.equal(getPromotionStatus(teacher5bGenap,genap.id),null);
});
