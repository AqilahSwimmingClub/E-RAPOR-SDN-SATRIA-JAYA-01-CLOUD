import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { getAssessmentSettings, getAssessmentSheet, resetAssessmentSettings, saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { createStudent } from '../src/services/students.js';
import { saveSubjectMapping } from '../src/services/storage.js';
import { listActiveSubjects } from '../src/services/subjects.js';

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
}
const base={role:'teacher',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
const teacher5b={...base,classId:'5B'};const teacher5c={...base,classId:'5C'};
const teacher5bGenap={...teacher5b,semester:`Genap ${ACADEMIC_YEAR}`};
function addStudent(session,index,id){
  return createStudent(session,{id,classId:session.classId,nis:`${session.classId}-${index}`,nisn:`99${[...session.classId].map(character=>character.charCodeAt(0)).join('')}${String(index).padStart(7,'0')}`,name:`Siswa ${session.classId}-${index}`,gender:index%2?'L':'P',photo:''});
}

test('Assessment weights must total exactly 100 percent',()=>{
  useMemoryStorage();
  assert.throws(()=>saveAssessmentSettings(teacher5b,'agama',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:14,kktp:75}),/Total bobot wajib 100%/);
  const saved=saveAssessmentSettings(teacher5b,'agama',{formative:25,daily:25,practice:20,scopeSummative:15,semesterSummative:15,kktp:78});
  assert.equal(saved.formative+saved.daily+saved.practice+saved.scopeSummative+saved.semesterSummative,100);
});

test('Weights and KKTP remain different between subjects and can reset independently',()=>{
  useMemoryStorage();
  saveAssessmentSettings(teacher5b,'agama',{formative:40,daily:15,practice:15,scopeSummative:15,semesterSummative:15,kktp:72});
  saveAssessmentSettings(teacher5b,'mtk',{formative:20,daily:20,practice:20,scopeSummative:20,semesterSummative:20,kktp:80});
  assert.equal(getAssessmentSettings(teacher5b,'agama').formative,40);
  assert.equal(getAssessmentSettings(teacher5b,'mtk').formative,20);
  assert.equal(getAssessmentSettings(teacher5b,'agama').kktp,72);
  assert.equal(getAssessmentSettings(teacher5b,'mtk').kktp,80);
  resetAssessmentSettings(teacher5b,'agama');
  assert.deepEqual(getAssessmentSettings(teacher5b,'agama'),{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  assert.equal(getAssessmentSettings(teacher5b,'mtk').kktp,80);
});

test('Only active mapped subjects are available for assessment modules',()=>{
  useMemoryStorage();
  saveSubjectMapping(teacher5b,SUBJECTS_DEFAULT.map(subject=>subject.id==='koding'?{...subject,active:false}:{...subject}));
  assert.equal(listActiveSubjects(teacher5b).some(subject=>subject.id==='koding'),false);
  assert.throws(()=>getAssessmentSettings(teacher5b,'koding'),/tidak aktif/);
});

test('Assessment scores are isolated between classes',()=>{
  useMemoryStorage();const student5b=addStudent(teacher5b,1);const student5c=addStudent(teacher5c,1);
  saveAssessmentScores(teacher5b,'agama','formative',{[student5b.id]:81});
  saveAssessmentScores(teacher5c,'agama','formative',{[student5c.id]:93});
  assert.equal(getAssessmentSheet(teacher5b,'agama','formative').rows[0].score,81);
  assert.equal(getAssessmentSheet(teacher5c,'agama','formative').rows[0].score,93);
});

test('Assessment scores are isolated between subjects',()=>{
  useMemoryStorage();const student=addStudent(teacher5b,1);
  saveAssessmentScores(teacher5b,'agama','daily',{[student.id]:74});
  saveAssessmentScores(teacher5b,'mtk','daily',{[student.id]:92});
  assert.equal(getAssessmentSheet(teacher5b,'agama','daily').rows[0].score,74);
  assert.equal(getAssessmentSheet(teacher5b,'mtk','daily').rows[0].score,92);
});

test('Assessment scores are isolated between assessment types',()=>{
  useMemoryStorage();const student=addStudent(teacher5b,1);
  saveAssessmentScores(teacher5b,'agama','formative',{[student.id]:68});
  saveAssessmentScores(teacher5b,'agama','semesterSummative',{[student.id]:91});
  assert.equal(getAssessmentSheet(teacher5b,'agama','formative').rows[0].score,68);
  assert.equal(getAssessmentSheet(teacher5b,'agama','semesterSummative').rows[0].score,91);
});

test('Assessment scores are isolated between semesters',()=>{
  useMemoryStorage();const id='student-semester-scope';const ganjil=addStudent(teacher5b,1,id);const genap=addStudent(teacher5bGenap,1,id);
  saveAssessmentScores(teacher5b,'agama','practice',{[ganjil.id]:70});
  saveAssessmentScores(teacher5bGenap,'agama','practice',{[genap.id]:88});
  assert.equal(getAssessmentSheet(teacher5b,'agama','practice').rows[0].score,70);
  assert.equal(getAssessmentSheet(teacher5bGenap,'agama','practice').rows[0].score,88);
});

test('Scores must be between 0 and 100',()=>{
  useMemoryStorage();const student=addStudent(teacher5b,1);
  assert.throws(()=>saveAssessmentScores(teacher5b,'agama','formative',{[student.id]:101}),/0 sampai 100/);
  assert.throws(()=>saveAssessmentScores(teacher5b,'agama','formative',{[student.id]:-1}),/0 sampai 100/);
  assert.doesNotThrow(()=>saveAssessmentScores(teacher5b,'agama','formative',{[student.id]:0}));
  assert.doesNotThrow(()=>saveAssessmentScores(teacher5b,'agama','formative',{[student.id]:100}));
});

test('Blank assessment score remains unfilled and is not converted to zero',()=>{
  useMemoryStorage();const first=addStudent(teacher5b,1),second=addStudent(teacher5b,2);
  const sheet=saveAssessmentScores(teacher5b,'agama','semesterSummative',{[first.id]:0,[second.id]:''});
  assert.equal(sheet.rows.find(row=>row.studentId===first.id).score,0);
  assert.equal(sheet.rows.find(row=>row.studentId===second.id).score,null);
  assert.equal(sheet.average,0);assert.equal(sheet.filledCount,1);assert.equal(sheet.pendingCount,1);
});
