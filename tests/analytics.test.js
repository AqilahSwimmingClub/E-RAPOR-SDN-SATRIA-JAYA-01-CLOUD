import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { getClassCompletion, getDescriptionHistory, getReportStatistics, getScoreHistory, listStudentIdentities } from '../src/services/analytics.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { saveManualReportScore } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { saveSubjectMapping } from '../src/services/storage.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const base={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};const genap={...base,semester:`Genap ${ACADEMIC_YEAR}`};
function addStudent(session,index=1,overrides={}){return createStudent(session,{classId:session.classId,nis:`5B-A-${index}`,nisn:`660000000${index}`,name:`Siswa Analitik ${index}`,gender:index%2?'L':'P',photo:'',...overrides});}
function onlyAgama(session){saveSubjectMapping(session,SUBJECTS_DEFAULT.map(subject=>({...subject,active:subject.id==='agama'})));}
function description(session,student){const suffix=student.id.slice(-8);const best=createLearningObjective(session,'agama',{code:`TP-B-${suffix}`,description:'memahami konsep pembelajaran.'});const improve=createLearningObjective(session,'agama',{code:`TP-I-${suffix}`,description:'menerapkan konsep secara mandiri.'});const generated=generateReportDescription(session,'agama',student.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id});return saveReportDescription(session,'agama',student.id,generated);}

test('Overall class completion uses active subjects and actual saved reports',()=>{
  useMemoryStorage();onlyAgama(base);const first=addStudent(base,1);const second=addStudent(base,2);saveManualReportScore(base,'agama',first.id,88);saveManualReportScore(base,'agama',second.id,76);description(base,first);
  let completion=getClassCompletion(base);assert.equal(completion.subjectCount,1);assert.equal(completion.completeSubjectCount,0);assert.equal(completion.incompleteSubjectCount,1);assert.equal(completion.overallPercentage,75);assert.equal(completion.subjects[0].missing[0].student.id,second.id);
  description(base,second);completion=getClassCompletion(base);assert.equal(completion.completeSubjectCount,1);assert.equal(completion.overallPercentage,100);assert.equal(completion.status,'COMPLETE');
});

test('Report statistics calculate average, extrema, distribution, and per-subject graph values',()=>{
  useMemoryStorage();const first=addStudent(base,1);const second=addStudent(base,2);const third=addStudent(base,3);saveManualReportScore(base,'agama',first.id,60);saveManualReportScore(base,'agama',second.id,80);saveManualReportScore(base,'agama',third.id,100);saveManualReportScore(base,'mtk',first.id,90);
  const stats=getReportStatistics(base);const agama=stats.subjects.find(item=>item.subject.id==='agama');assert.equal(agama.average,80);assert.equal(agama.highest,100);assert.equal(agama.lowest,60);assert.equal(agama.distribution.find(item=>item.id==='60-69').count,1);assert.equal(stats.overall.count,4);assert.equal(stats.overall.average,82.5);
});

test('Score and description history follow a student identity across semesters with semester isolation',()=>{
  useMemoryStorage();onlyAgama(base);onlyAgama(genap);const sharedNisn='6699999999';const ganjilStudent=addStudent(base,1,{id:'analytics-ganjil',nisn:sharedNisn,name:'Raka Sejarah'});const genapStudent=addStudent(genap,1,{id:'analytics-genap',nisn:sharedNisn,name:'Raka Sejarah'});saveManualReportScore(base,'agama',ganjilStudent.id,72);saveManualReportScore(genap,'agama',genapStudent.id,86);description(base,ganjilStudent);description(genap,genapStudent);
  const identity=listStudentIdentities(base).find(item=>item.nisn===sharedNisn);const scores=getScoreHistory(base,{studentIdentity:identity.id,subjectId:'agama',semester:'ALL'});assert.deepEqual(scores.map(row=>row.finalScore),[72,86]);assert.deepEqual(scores.map(row=>row.semester),[`Ganjil ${ACADEMIC_YEAR}`,`Genap ${ACADEMIC_YEAR}`]);
  const filtered=getScoreHistory(base,{studentIdentity:identity.id,subjectId:'agama',semester:`Genap ${ACADEMIC_YEAR}`});assert.equal(filtered.length,1);assert.equal(filtered[0].finalScore,86);const descriptions=getDescriptionHistory(base,{studentIdentity:identity.id,subjectId:'agama',semester:'ALL'});assert.equal(descriptions.length,2);assert.notEqual(descriptions[0].student.id,descriptions[1].student.id);
});
