import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { saveAttendance } from '../src/services/attendance.js';
import { generateReportDescription, getReportDescription, lockReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { commitReportImport, previewReportImport, reportTemplateCsv } from '../src/services/report-import.js';
import { calculateReportScore, getCompletionSummary, getDailyAttendanceMode, getReportScore, getStoredReportRows, saveAttendanceConversion, saveAutomaticReportScores, saveDailyAttendanceMode, saveManualReportScore } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { loadDb } from '../src/services/storage.js';

function useMemoryStorage(){
  const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
}
const base={role:'teacher',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
const teacher5b={...base,classId:'5B'};const teacher5c={...base,classId:'5C'};const teacher5bGenap={...teacher5b,semester:`Genap ${ACADEMIC_YEAR}`};
function addStudent(session,index=1,id){return createStudent(session,{id,classId:session.classId,nis:`${session.classId}-R-${index}`,nisn:`88${[...session.classId].map(character=>character.charCodeAt(0)).join('')}${String(index).padStart(7,'0')}`,name:`Siswa Rapor ${session.classId}-${index}`,gender:index%2?'L':'P',religion:'Islam',photo:''});}
function scores(session,subjectId,student,values){for(const [type,value] of Object.entries(values))saveAssessmentScores(session,subjectId,type,{[student.id]:value});}
const completeValues={formative:80,daily:70,practice:90,scopeSummative:60,semesterSummative:100};
function addTwoObjectives(session,subjectId){const best=createLearningObjective(session,subjectId,{code:'TP-B',description:'memahami konsep utama dengan sangat baik.'});const improve=createLearningObjective(session,subjectId,{code:'TP-I',description:'menerapkan konsep pada situasi baru.'});return {best,improve};}

test('Weighted report formula returns raw and rounded values',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);scores(teacher5b,'agama',student,completeValues);
  const result=calculateReportScore(teacher5b,'agama',student.id);
  assert.equal(result.rawScore,80);assert.equal(result.roundedScore,80);assert.equal(result.completionStatus,'COMPLETE');assert.equal(result.masteryStatus,'TUNTAS');
});

test('A blank component is never zero and never divides the report score',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);scores(teacher5b,'agama',student,{formative:80,daily:'',practice:90,scopeSummative:60,semesterSummative:100});
  const result=calculateReportScore(teacher5b,'agama',student.id);const daily=result.components.find(component=>component.id==='daily');
  assert.equal(daily.score,null,'komponen kosong tetap null, bukan 0');
  /* Rata-rata hanya dari empat komponen yang terisi: (80+90+60+100)/4 = 82,5. */
  /* Empat komponen terisi, bobot daily dikeluarkan dari penyebut. */
  assert.equal(+result.rawScore.toFixed(4),+((80*30+90*20+60*15+100*15)/80).toFixed(4));
  assert.equal(result.filledCount,4);assert.equal(result.completionStatus,'PARTIAL');assert.equal(result.completionLabel,'SEBAGIAN 4/5');
});

test('Report score uses weights normalized over filled components only',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);
  scores(teacher5b,'agama',student,{formative:80,daily:'',practice:'',scopeSummative:'',semesterSummative:''});
  assert.equal(calculateReportScore(teacher5b,'agama',student.id).rawScore,80,'satu nilai terisi dihitung apa adanya');
  scores(teacher5b,'agama',student,{formative:80,daily:90,practice:'',scopeSummative:'',semesterSummative:''});
  /* Bobot bawaan formative 40 dan daily 15: (80x40 + 90x15) / (40+15). */
  assert.equal(+calculateReportScore(teacher5b,'agama',student.id).rawScore.toFixed(4),+((80*30+90*20)/50).toFixed(4),'bobot dinormalisasi terhadap komponen terisi');
  scores(teacher5b,'agama',student,{formative:80,daily:90,practice:70,scopeSummative:'',semesterSummative:''});
  assert.equal(+calculateReportScore(teacher5b,'agama',student.id).rawScore.toFixed(4),+((80*30+90*20+70*20)/70).toFixed(4),'tiga komponen memakai bobotnya masing-masing');
});

test('Bobot mengubah nilai rapor dan KKTP tetap menentukan ketuntasan',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);const values={formative:100,daily:0,practice:0,scopeSummative:0,semesterSummative:0};scores(teacher5b,'agama',student,values);scores(teacher5b,'mtk',student,values);
  saveAssessmentSettings(teacher5b,'mtk',{formative:50,daily:10,practice:10,scopeSummative:15,semesterSummative:15,kktp:75});
  /* Kelima komponen terisi sehingga bobot penuh dipakai: bobot formative berbeda antar mapel. */
  assert.equal(calculateReportScore(teacher5b,'agama',student.id).rawScore,30);
  assert.equal(calculateReportScore(teacher5b,'mtk',student.id).rawScore,50);
  assert.equal(calculateReportScore(teacher5b,'mtk',student.id).kktp,75,'KKTP mapel tetap dipakai');
  assert.equal(calculateReportScore(teacher5b,'mtk',student.id).masteryStatus,'BELUM TUNTAS');
});

test('Daily score switches between manual assessment and attendance conversion without changing attendance',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);saveAssessmentScores(teacher5b,'agama','daily',{[student.id]:40});saveAttendance(teacher5b,'2026-08-01',{[student.id]:'Hadir'});saveAttendance(teacher5b,'2026-08-02',{[student.id]:'Sakit'});const attendanceBefore=JSON.parse(JSON.stringify(loadDb().attendance));
  assert.equal(getDailyAttendanceMode(teacher5b,'agama'),false);assert.equal(calculateReportScore(teacher5b,'agama',student.id).components.find(item=>item.id==='daily').score,40);
  saveDailyAttendanceMode(teacher5b,'agama',true);let daily=calculateReportScore(teacher5b,'agama',student.id).components.find(item=>item.id==='daily');assert.equal(daily.score,90);assert.equal(daily.source,'attendance');
  saveAttendanceConversion(teacher5b,{Hadir:100,Sakit:60,Izin:70,Alpa:0});daily=calculateReportScore(teacher5b,'agama',student.id).components.find(item=>item.id==='daily');assert.equal(daily.score,80);assert.deepEqual(loadDb().attendance,attendanceBefore);
});

test('Manual override stores the previous automatic score as reference',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);scores(teacher5b,'agama',student,completeValues);saveAutomaticReportScores(teacher5b,'agama');const overridden=saveManualReportScore(teacher5b,'agama',student.id,95);
  assert.equal(overridden.isManualOverride,true);assert.equal(overridden.finalScore,95);assert.equal(overridden.previousScoreReference.finalScore,80);assert.equal(overridden.automaticReference.roundedScore,80);
});

test('Report scores remain isolated by class, subject, and semester',()=>{
  useMemoryStorage();const sharedId='report-shared-student';const student5b=addStudent(teacher5b,1,sharedId);const student5c=addStudent(teacher5c,1,sharedId);const studentGenap=addStudent(teacher5bGenap,1,sharedId);
  saveManualReportScore(teacher5b,'agama',student5b.id,81);saveManualReportScore(teacher5c,'agama',student5c.id,82);saveManualReportScore(teacher5b,'mtk',student5b.id,83);saveManualReportScore(teacher5bGenap,'agama',studentGenap.id,84);
  assert.equal(getReportScore(teacher5b,'agama',sharedId).finalScore,81);assert.equal(getReportScore(teacher5c,'agama',sharedId).finalScore,82);assert.equal(getReportScore(teacher5b,'mtk',sharedId).finalScore,83);assert.equal(getReportScore(teacher5bGenap,'agama',sharedId).finalScore,84);
});

test('Description generation now uses Butir CP, not Learning Objectives',()=>{
  /* TP tidak lagi menjadi basis generator deskripsi rapor. Mengirim bestObjectiveId dan
     improvementObjectiveId TIDAK LAGI menyetir hasilnya: mata pelajaran yang punya CP selalu
     memakai Butir CP-nya. Yang tetap dijaga adalah penyimpanannya - deskripsi yang tidak
     diedit guru berstatus AUTO. */
  useMemoryStorage();const student=addStudent(teacher5b);const {best,improve}=addTwoObjectives(teacher5b,'bindo');
  const generated=generateReportDescription(teacher5b,'bindo',student.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id});
  assert.equal(generated.source,'CP_BUTIR','deskripsi bersumber Butir CP');
  assert.equal(generated.text.includes('memahami konsep utama'),false,'isi TP tidak masuk deskripsi');
  assert.equal(generated.text.includes('menerapkan konsep'),false);
  assert.doesNotMatch(generated.text,/\.\s*(,|dan|serta)/);
  const saved=saveReportDescription(teacher5b,'bindo',student.id,{...generated});assert.equal(saved.status,'AUTO');
});

test('Locked report description cannot be edited',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);const {best,improve}=addTwoObjectives(teacher5b,'bindo');const generated=generateReportDescription(teacher5b,'bindo',student.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id});saveReportDescription(teacher5b,'bindo',student.id,generated);const locked=lockReportDescription(teacher5b,'bindo',student.id);
  assert.equal(locked.status,'LOCKED');assert.equal(locked.locked,true);assert.throws(()=>saveReportDescription(teacher5b,'bindo',student.id,{...generated,text:'Diubah setelah dikunci'}),/terkunci/);assert.equal(getReportDescription(teacher5b,'bindo',student.id).text,generated.text);
});

test('Completion status counts saved report scores and descriptions',()=>{
  useMemoryStorage();const first=addStudent(teacher5b,1),second=addStudent(teacher5b,2);const {best,improve}=addTwoObjectives(teacher5b,'agama');saveManualReportScore(teacher5b,'agama',first.id,88);saveManualReportScore(teacher5b,'agama',second.id,76);const generated=generateReportDescription(teacher5b,'agama',first.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id});saveReportDescription(teacher5b,'agama',first.id,generated);
  let summary=getCompletionSummary(teacher5b).find(item=>item.subject.id==='agama');assert.equal(summary.scoreComplete,2);assert.equal(summary.descriptionComplete,1);assert.equal(summary.percentage,75);assert.equal(summary.status,'INCOMPLETE');assert.equal(summary.missing[0].missingDescription,true);
  const generatedSecond=generateReportDescription(teacher5b,'agama',second.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id});saveReportDescription(teacher5b,'agama',second.id,generatedSecond);summary=getCompletionSummary(teacher5b).find(item=>item.subject.id==='agama');assert.equal(summary.percentage,100);assert.equal(summary.status,'COMPLETE');assert.equal(getStoredReportRows(teacher5b).filter(row=>row.subject.id==='agama'&&row.complete).length,2);
});

test('Report import previews without committing and saves only after commit',()=>{
  useMemoryStorage();const student=addStudent(teacher5b);const template=reportTemplateCsv(teacher5b,'agama');const csv=template.replace(`${student.nisn},agama,`,`${student.nisn},agama,89`);const preview=previewReportImport(teacher5b,'agama',csv);
  assert.equal(preview.canCommit,true);assert.equal(getReportScore(teacher5b,'agama',student.id),null);commitReportImport(teacher5b,preview);assert.equal(getReportScore(teacher5b,'agama',student.id).finalScore,89);
});
