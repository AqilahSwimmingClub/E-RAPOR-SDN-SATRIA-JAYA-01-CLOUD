import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveAttendance } from '../src/services/attendance.js';
import { createExtracurricular, saveHomeroomNote, savePromotionStatus } from '../src/services/completeness.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { assertReportPrintable, getLeger, getReportCompleteness, getReportDocument } from '../src/services/documents.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { saveManualReportScore } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { saveSubjectMapping } from '../src/services/storage.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const teacher={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
function mapping(){const first=['mtk','agama'];return [...first.map(id=>SUBJECTS_DEFAULT.find(item=>item.id===id)),...SUBJECTS_DEFAULT.filter(item=>!first.includes(item.id))].map((item,index)=>({...item,active:first.includes(item.id),order:index+1}));}
function addStudent(index){return createStudent(teacher,{id:`document-${index}`,classId:'5B',nis:`DOC-${index}`,nisn:`440000000${index}`,name:`Siswa Dokumen ${index}`,gender:index%2?'L':'P',birthPlace:'Bekasi',birthDate:'2015-02-03',fatherName:'Bapak Dokumen',motherName:'Ibu Dokumen',phone:'0812',address:'Satria Jaya',photo:''});}
function saveDescription(student,subjectId,index){const best=createLearningObjective(teacher,subjectId,{code:`TP-B-${subjectId}-${index}`,description:`memahami ${subjectId} dengan baik.`});const improve=createLearningObjective(teacher,subjectId,{code:`TP-I-${subjectId}-${index}`,description:`menerapkan ${subjectId} secara mandiri.`});const generated=generateReportDescription(teacher,subjectId,student.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id});return saveReportDescription(teacher,subjectId,student.id,generated);}
function completeStudent(student,index,scores={mtk:80,agama:90}){saveManualReportScore(teacher,'mtk',student.id,scores.mtk);saveManualReportScore(teacher,'agama',student.id,scores.agama);saveDescription(student,'mtk',index);saveDescription(student,'agama',index);saveAttendance(teacher,'2026-08-10',{[student.id]:'Sakit'});createExtracurricular(teacher,student.id,{name:'Pramuka',predicate:'Baik',description:'Aktif mengikuti kegiatan.'});saveHomeroomNote(teacher,student.id,'Pertahankan semangat belajar.');savePromotionStatus(teacher,student.id,'PROMOTED');}

test('Leger calculates student, subject, and class averages from stored report scores',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());const first=addStudent(1),second=addStudent(2);saveManualReportScore(teacher,'mtk',first.id,80);saveManualReportScore(teacher,'agama',first.id,90);saveManualReportScore(teacher,'mtk',second.id,60);saveManualReportScore(teacher,'agama',second.id,70);const leger=getLeger(teacher);assert.deepEqual(leger.subjects.map(item=>item.id),['mtk','agama']);assert.deepEqual(leger.students.map(row=>row.average),[85,65]);assert.deepEqual(leger.subjectAverages.map(row=>row.average),[70,80]);assert.equal(leger.classAverage,75);
});

test('Transcript-compatible Mapping order is preserved in leger and report documents',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());const student=addStudent(1);saveManualReportScore(teacher,'mtk',student.id,88);saveManualReportScore(teacher,'agama',student.id,84);const document=getReportDocument(teacher,student.id);assert.deepEqual(getLeger(teacher).subjects.map(item=>item.id),['mtk','agama']);assert.deepEqual(document.subjects.map(item=>item.subject.id),['mtk','agama']);
});

test('Report completeness checks all seven real student components',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());const student=addStudent(1);let completion=getReportCompleteness(teacher).students[0];assert.equal(completion.status,'INCOMPLETE');assert.ok(completion.missing.includes('Nilai seluruh mapel'));assert.ok(completion.missing.includes('Absensi semester'));completeStudent(student,1);completion=getReportCompleteness(teacher).students[0];assert.equal(completion.status,'COMPLETE');assert.equal(completion.percentage,100);assert.equal(getReportCompleteness(teacher).overallPercentage,100);
});

test('Final report printing is rejected while any required item is incomplete',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());const student=addStudent(1);saveManualReportScore(teacher,'mtk',student.id,88);assert.throws(()=>assertReportPrintable(teacher,student.id),/Rapor belum lengkap/);completeStudent(student,1);assert.doesNotThrow(()=>assertReportPrintable(teacher,student.id));
});

test('Stored attendance and descriptions are included in the report document',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());const student=addStudent(1);completeStudent(student,1);const document=getReportDocument(teacher,student.id);assert.equal(document.attendance.Sakit,1);assert.equal(document.attendance.Izin,0);assert.match(document.subjects[0].description,/memahami mtk/);assert.match(document.subjects[1].description,/memahami agama/);assert.equal(document.finalStatusLabel,'Naik ke Kelas 6B','status kenaikan tersedia tanpa menunggu semester Genap');
});

test('Attendance completeness is evaluated for each student, including students added later',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());const first=addStudent(1);saveAttendance(teacher,'2026-08-10',{[first.id]:'Hadir'});const second=addStudent(2);const rows=getReportCompleteness(teacher).students;assert.equal(rows.find(row=>row.student.id===first.id).categories.attendance,true);assert.equal(rows.find(row=>row.student.id===second.id).categories.attendance,false);
});
