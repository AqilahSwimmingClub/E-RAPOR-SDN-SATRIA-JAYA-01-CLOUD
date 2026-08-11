import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { createLearningObjective, deleteLearningObjective, listLearningObjectives, reorderLearningObjective, setLearningObjectiveActive, updateLearningObjective } from '../src/services/objectives.js';

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
}
const base={role:'teacher',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
const teacher5b={...base,classId:'5B'};const teacher5c={...base,classId:'5C'};
const teacher5bGenap={...teacher5b,semester:`Genap ${ACADEMIC_YEAR}`};

test('Learning Objective CRUD, active status, and order are persisted',()=>{
  useMemoryStorage();
  const first=createLearningObjective(teacher5b,'bindo',{code:'TP-1',description:'Memahami teks informatif',active:true});
  const second=createLearningObjective(teacher5b,'bindo',{code:'TP-2',description:'Menulis teks singkat',active:true});
  updateLearningObjective(teacher5b,'bindo',first.id,{code:'TP-1A',description:'Memahami dan menjelaskan teks informatif',active:true});
  setLearningObjectiveActive(teacher5b,'bindo',second.id,false);
  reorderLearningObjective(teacher5b,'bindo',second.id,-1);
  let objectives=listLearningObjectives(teacher5b,'bindo');
  assert.deepEqual(objectives.map(item=>item.code),['TP-2','TP-1']);
  assert.deepEqual(objectives.map(item=>item.order),[1,2]);
  assert.equal(objectives[0].active,false);
  deleteLearningObjective(teacher5b,'bindo',second.id);
  objectives=listLearningObjectives(teacher5b,'bindo');
  assert.equal(objectives.length,1);assert.equal(objectives[0].order,1);assert.equal(objectives[0].description,'Memahami dan menjelaskan teks informatif');
});

test('Learning Objectives stay isolated by class, subject, and semester',()=>{
  useMemoryStorage();
  createLearningObjective(teacher5b,'agama',{code:'TP-SCOPE',description:'TP Agama Kelas 5B'});
  createLearningObjective(teacher5c,'agama',{code:'TP-SCOPE',description:'TP Agama Kelas 5C'});
  createLearningObjective(teacher5b,'mtk',{code:'TP-SCOPE',description:'TP Matematika Kelas 5B'});
  createLearningObjective(teacher5bGenap,'agama',{code:'TP-SCOPE',description:'TP Agama Semester Genap'});
  assert.deepEqual(listLearningObjectives(teacher5b,'agama').map(item=>item.description),['TP Agama Kelas 5B']);
  assert.deepEqual(listLearningObjectives(teacher5c,'agama').map(item=>item.description),['TP Agama Kelas 5C']);
  assert.deepEqual(listLearningObjectives(teacher5b,'mtk').map(item=>item.description),['TP Matematika Kelas 5B']);
  assert.deepEqual(listLearningObjectives(teacher5bGenap,'agama').map(item=>item.description),['TP Agama Semester Genap']);
});
