import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ACADEMIC_YEAR, ASSESSMENT_DEFAULT, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { saveAttendance } from '../src/services/attendance.js';
import { buildBackup } from '../src/services/backup.js';
import { saveCocurricularBulk, saveExtracurricularBulk, saveHomeroomNote, savePromotionStatus } from '../src/services/completeness.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { savePrintSettings } from '../src/services/print-settings.js';
import { saveAutomaticReportScores } from '../src/services/report.js';
import { saveSubjectMapping } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { ATTITUDE_DIMENSIONS, saveStudentAttitude } from '../src/services/attitudes.js';

function memoryStorage(){const values=new Map();return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
globalThis.localStorage=memoryStorage();globalThis.sessionStorage=memoryStorage();

const academicYear=ACADEMIC_YEAR;
if(academicYear!=='2026/2027')throw new Error(`Fixture Stage 14 wajib menggunakan 2026/2027, bukan ${academicYear}.`);
const session={role:'teacher',classId:'5B',accountId:'teacher:5B',academicYear,semester:`Ganjil ${academicYear}`};
const fixtureId='STAGE14-UPDATE-5B-20260810';

saveSubjectMapping(session,SUBJECTS_DEFAULT.map(subject=>({...subject,active:subject.id==='agama'})));
saveAssessmentSettings(session,'agama',{...ASSESSMENT_DEFAULT,kktp:78});
const best=createLearningObjective(session,'agama',{code:'TP-14A',description:'memahami nilai keteladanan dalam kehidupan sehari-hari.'});
const improve=createLearningObjective(session,'agama',{code:'TP-14B',description:'menerapkan nilai keteladanan secara konsisten.'});

const students=[
  createStudent(session,{id:'stage14-5b-01',classId:'5B',nis:'514001',nisn:'005140001',name:'Alya Satria Update',gender:'P',birthPlace:'Bekasi',birthDate:'2015-01-14',parentName:'Orang Tua Alya',phone:'081200000001',address:'Satria Jaya, Tambun Utara',photo:''}),
  createStudent(session,{id:'stage14-5b-02',classId:'5B',nis:'514002',nisn:'005140002',name:'Bima Jaya Update',gender:'L',birthPlace:'Bekasi',birthDate:'2015-02-15',parentName:'Orang Tua Bima',phone:'081200000002',address:'Satria Jaya, Tambun Utara',photo:''}),
];

saveAttendance(session,'2026-08-10',{[students[0].id]:'Hadir',[students[1].id]:'Izin'});
const values=[{formative:88,daily:86,practice:90,scopeSummative:84,semesterSummative:87},{formative:79,daily:81,practice:83,scopeSummative:78,semesterSummative:80}];
students.forEach((student,index)=>Object.entries(values[index]).forEach(([type,score])=>saveAssessmentScores(session,'agama',type,{[student.id]:score})));
saveAutomaticReportScores(session,'agama');
students.forEach(student=>{
  const generated=generateReportDescription(session,'agama',student.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id});
  saveReportDescription(session,'agama',student.id,generated);
  saveStudentAttitude(session,student.id,ATTITUDE_DIMENSIONS[0].id,{level:'Berkembang Sesuai Harapan'});
  saveHomeroomNote(session,student.id,`Catatan ${fixtureId}: pertahankan semangat belajar.`);
  savePromotionStatus(session,student.id,'PROMOTED');
});
saveExtracurricularBulk(session,{predicate:'Sangat Baik',description:`Pramuka Penggalang ${fixtureId}: aktif dan disiplin.`});
saveCocurricularBulk(session,{activity:`Projek Literasi ${fixtureId}`,predicate:'Baik',description:'Mampu bekerja sama dan menyelesaikan projek literasi dengan baik.'});
savePrintSettings(session,{principalName:'Drs. Kepala Sekolah Uji Update',principalNip:'197001011995121001',teacherName:'Guru Wali Kelas 5B Uji',teacherNip:'198501012010011001',city:'Bekasi',printDate:'2026-08-10'});

const backup=buildBackup(session);
const output=resolve('release','STAGE14-GURU-5B-V1-TEST.backup.json');
const recordOutput=resolve('release','STAGE14-TEST-RECORD.json');
const record={fixtureId,createdAt:new Date().toISOString(),scope:backup.scope,expected:{students:students.map(student=>({id:student.id,nis:student.nis,nisn:student.nisn,name:student.name})),attendanceDate:'2026-08-10',attendance:{[students[0].id]:'Hadir',[students[1].id]:'Izin'},activeSubject:'agama',kktp:78,objectives:['TP-14A','TP-14B'],assessmentValues:values,principalName:'Drs. Kepala Sekolah Uji Update',principalNip:'197001011995121001',attitudeDimension:ATTITUDE_DIMENSIONS[0].id,extracurricular:'Pramuka Penggalang',cocurricular:`Projek Literasi ${fixtureId}`}};
await writeFile(output,JSON.stringify(backup,null,2),'utf8');
await writeFile(recordOutput,JSON.stringify(record,null,2),'utf8');
console.log(JSON.stringify({fixtureId,backup:output,record:recordOutput,students:students.length,attendance:Object.keys(backup.data.attendance).length,assessmentScores:Object.keys(backup.data.assessmentScores).length,reportScores:Object.keys(backup.data.reportScores).length,descriptions:Object.keys(backup.data.reportDescriptions).length}));
