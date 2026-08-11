import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { buildBackup } from '../src/services/backup.js';
import { createStudent } from '../src/services/students.js';
import { commitTranscriptImport, getTranscriptRows, previewTranscriptImport, saveTranscriptScores, transcriptTemplateCsv } from '../src/services/transcript.js';
import { saveSubjectMapping } from '../src/services/storage.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const ganjil={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};const genap={...ganjil,semester:`Genap ${ACADEMIC_YEAR}`};const otherClass={...ganjil,classId:'5C'};const otherYear={...ganjil,academicYear:'2027/2028',semester:'Ganjil 2027/2028'};
function addStudent(session,id,nisn='5500000001'){return createStudent(session,{id,classId:session.classId,nis:`${session.classId}-${id}`,nisn,name:'Siswa Transkrip',gender:'L',birthPlace:'Bekasi',birthDate:'2015-01-01',fatherName:'Ayah',motherName:'Ibu',address:'Bekasi',photo:''});}
function mapped(session){const first=['mtk','agama'];const ordered=[...first.map(id=>SUBJECTS_DEFAULT.find(item=>item.id===id)),...SUBJECTS_DEFAULT.filter(item=>!first.includes(item.id))].map((item,index)=>({...item,active:first.includes(item.id),order:index+1}));saveSubjectMapping(session,ordered);}

test('Transcript is isolated by class and academic year but shared across semesters of the same year',()=>{
  useMemoryStorage();mapped(ganjil);mapped(genap);mapped(otherClass);mapped(otherYear);const studentGanjil=addStudent(ganjil,'ganjil');const studentGenap=addStudent(genap,'genap');const studentOtherClass=addStudent(otherClass,'other-class');const studentOtherYear=addStudent(otherYear,'other-year');saveTranscriptScores(ganjil,studentGanjil.id,{mtk:91,agama:87});
  assert.deepEqual(getTranscriptRows(genap,studentGenap.id).map(row=>row.score),[91,87]);assert.deepEqual(getTranscriptRows(otherClass,studentOtherClass.id).map(row=>row.score),[null,null]);assert.deepEqual(getTranscriptRows(otherYear,studentOtherYear.id).map(row=>row.score),[null,null]);const backup=buildBackup(genap);assert.equal(Object.keys(backup.data.transcriptScores).length,2);
});

test('Transcript follows active Mapping order and stores blank scores as unfilled',()=>{
  useMemoryStorage();mapped(ganjil);const student=addStudent(ganjil,'order');saveTranscriptScores(ganjil,student.id,{mtk:88,agama:''});const rows=getTranscriptRows(ganjil,student.id);assert.deepEqual(rows.map(row=>row.subject.id),['mtk','agama']);assert.deepEqual(rows.map(row=>row.score),[88,null]);
});

test('Transcript import requires Preview and Validation before commit',()=>{
  useMemoryStorage();mapped(ganjil);const student=addStudent(ganjil,'import');const csv=`NISN,NIS,Nama,Kode Mapel,Mata Pelajaran,Nilai\r\n${student.nisn},${student.nis},${student.name},mtk,Matematika,94\r\n`;
  saveTranscriptScores(ganjil,student.id,{mtk:'',agama:89});const preview=previewTranscriptImport(ganjil,csv);assert.equal(preview.canCommit,true);assert.equal(getTranscriptRows(ganjil,student.id)[0].score,null);assert.equal(commitTranscriptImport(ganjil,preview),1);assert.deepEqual(getTranscriptRows(ganjil,student.id).map(row=>row.score),[94,89]);const invalid=previewTranscriptImport(ganjil,csv.replace(',94',',104'));assert.equal(invalid.canCommit,false);assert.match(invalid.rows[0].errors.join(' '),/0 sampai 100/);assert.match(transcriptTemplateCsv(ganjil),/Kode Mapel/);
});
