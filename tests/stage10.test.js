import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT, availableAcademicYears } from '../src/data/constants.js';
import { getAdminAssessmentStatus } from '../src/services/admin-status.js';
import { createCocurricularActivity, deleteCocurricularActivity, listCocurricularActivities, updateCocurricularActivity } from '../src/services/cocurricular.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { createAcademicYear, getReferenceOverview, listReferenceSemesters, updateReferenceSubject } from '../src/services/references.js';
import { saveManualReportScore } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { getSubjectMapping } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* Tahun pelajaran untuk menguji isolasi antar tahun. Dipilih otomatis dari tahun yang BELUM
   disediakan aplikasi, karena aplikasi kini selalu menyediakan tahun dasar, tahun berjalan, dan
   tahun berikutnya. Dengan dihitung begini, test tidak akan bentrok lagi di tahun-tahun mendatang. */
const TAHUN_LAIN=(()=>{const tersedia=new Set(availableAcademicYears());let mulai=Number(ACADEMIC_YEAR.slice(0,4))+9;while(tersedia.has(`${mulai}/${mulai+1}`))mulai+=1;return `${mulai}/${mulai+1}`;})();

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};globalThis.sessionStorage=globalThis.localStorage;}
const ganjil=`Ganjil ${ACADEMIC_YEAR}`,genap=`Genap ${ACADEMIC_YEAR}`;
const admin={role:'admin',classId:null,accountId:'admin',academicYear:ACADEMIC_YEAR,semester:ganjil};
function teacher(classId='1A',semester=ganjil,academicYear=ACADEMIC_YEAR){return {role:'teacher',classId,accountId:`teacher:${classId}`,academicYear,semester};}
function addStudent(session,id='stage10-student'){return createStudent(session,{id,classId:session.classId,nis:`NIS-${id}`,nisn:`NISN-${id}`,name:`Siswa ${id}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2016-01-02',fatherName:'Ayah',motherName:'Ibu',phone:'0812',address:'Satria Jaya',photo:''});}
function onlyAgama(session){saveSubjectMapping(session,SUBJECTS_DEFAULT.map(subject=>({...subject,active:subject.id==='agama'})));}

test('Data Referensi tidak membuat tahun, semester, rombel, atau mapel duplikat',()=>{
  useMemoryStorage();let refs=getReferenceOverview();assert.equal(new Set(refs.classes).size,24);assert.equal(new Set(refs.subjects.map(item=>item.id)).size,refs.subjects.length);
  createAcademicYear(admin,TAHUN_LAIN);assert.throws(()=>createAcademicYear(admin,TAHUN_LAIN),/sudah tersedia/);refs=getReferenceOverview();assert.equal(refs.academicYears.filter(item=>item.id===TAHUN_LAIN).length,1);assert.deepEqual(listReferenceSemesters({academicYear:TAHUN_LAIN}).map(item=>item.name),['Ganjil','Genap']);
  assert.throws(()=>updateReferenceSubject(admin,'agama',{name:'Matematika'}),/sudah tersedia/);updateReferenceSubject(admin,'agama',{name:'Pendidikan Agama Uji'});assert.equal(getSubjectMapping(teacher())[0].name,'Pendidikan Agama Uji');
});

test('CRUD kokurikuler terisolasi per rombel, semester, dan tahun pelajaran',()=>{
  useMemoryStorage();createAcademicYear(admin,TAHUN_LAIN);const first=createCocurricularActivity(admin,{name:'Projek Literasi',classId:'1A',semester:ganjil,academicYear:ACADEMIC_YEAR,description:'Kegiatan literasi kelas.',active:true});assert.throws(()=>createCocurricularActivity(admin,{name:'projek literasi',classId:'1A',semester:ganjil,academicYear:ACADEMIC_YEAR,description:'Duplikat.',active:true}),/sudah tersedia/);
  createCocurricularActivity(admin,{name:'Projek Literasi',classId:'1A',semester:genap,academicYear:ACADEMIC_YEAR,description:'Semester genap.',active:true});createCocurricularActivity(admin,{name:'Projek Literasi',classId:'1B',semester:ganjil,academicYear:ACADEMIC_YEAR,description:'Rombel lain.',active:true});createCocurricularActivity(admin,{name:'Projek Literasi',classId:'1A',semester:`Ganjil ${TAHUN_LAIN}`,academicYear:TAHUN_LAIN,description:'Tahun lain.',active:true});
  assert.equal(listCocurricularActivities(admin,{classId:'1A',semester:ganjil,academicYear:ACADEMIC_YEAR}).length,1);const updated=updateCocurricularActivity(admin,first.id,{...first,description:'Deskripsi diperbarui.',active:false});assert.equal(updated.active,false);assert.match(updated.description,/diperbarui/);assert.equal(deleteCocurricularActivity(admin,first.id),true);assert.equal(listCocurricularActivities(admin,{classId:'1A',semester:ganjil,academicYear:ACADEMIC_YEAR}).length,0);
});

test('Status Penilaian Admin selalu memuat seluruh 24 rombel',()=>{
  useMemoryStorage();const status=getAdminAssessmentStatus(admin);assert.equal(status.classCount,24);assert.equal(status.classes.length,24);assert.equal(new Set(status.classes.map(item=>item.classId)).size,24);assert.equal(status.classes.every(item=>item.status==='INCOMPLETE'),true);
});

test('Progres Admin dihitung dari nilai dan deskripsi tersimpan, bukan dummy',()=>{
  useMemoryStorage();const scope=teacher();onlyAgama(scope);const student=addStudent(scope);saveManualReportScore(scope,'agama',student.id,88);let row=getAdminAssessmentStatus(admin).classes.find(item=>item.classId==='1A');assert.equal(row.studentCount,1);assert.equal(row.subjectCount,1);assert.equal(row.scoreComplete,1);assert.equal(row.scorePercentage,100);assert.equal(row.descriptionComplete,0);assert.equal(row.descriptionPercentage,0);
  const best=createLearningObjective(scope,'agama',{code:'TP-ADMIN-1',description:'memahami konsep dengan baik.'});const improve=createLearningObjective(scope,'agama',{code:'TP-ADMIN-2',description:'menerapkan konsep secara mandiri.'});saveReportDescription(scope,'agama',student.id,generateReportDescription(scope,'agama',student.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id}));row=getAdminAssessmentStatus(admin).classes.find(item=>item.classId==='1A');assert.equal(row.descriptionComplete,1);assert.equal(row.descriptionPercentage,100);assert.equal(row.subjects[0].missing.length,0);
});

test('Status Admin dan kokurikuler terisolasi antar semester serta tahun pelajaran',()=>{
  useMemoryStorage();createAcademicYear(admin,TAHUN_LAIN);const ganjilTeacher=teacher('2B',ganjil);onlyAgama(ganjilTeacher);addStudent(ganjilTeacher,'scope-ganjil');saveManualReportScore(ganjilTeacher,'agama','scope-ganjil',77);createCocurricularActivity(admin,{name:'Projek Ganjil',classId:'2B',semester:ganjil,academicYear:ACADEMIC_YEAR,description:'Scope pengujian.',active:true});
  const current=getAdminAssessmentStatus(admin,{semester:ganjil,academicYear:ACADEMIC_YEAR}).classes.find(item=>item.classId==='2B');const otherSemester=getAdminAssessmentStatus(admin,{semester:genap,academicYear:ACADEMIC_YEAR}).classes.find(item=>item.classId==='2B');const otherYear=getAdminAssessmentStatus(admin,{semester:`Ganjil ${TAHUN_LAIN}`,academicYear:TAHUN_LAIN}).classes.find(item=>item.classId==='2B');assert.equal(current.studentCount,1);assert.equal(current.scoreComplete,1);assert.equal(otherSemester.studentCount,0);assert.equal(otherYear.studentCount,0);assert.equal(listCocurricularActivities(admin,{classId:'2B',semester:genap,academicYear:ACADEMIC_YEAR}).length,0);assert.equal(listCocurricularActivities(admin,{classId:'2B',semester:ganjil,academicYear:ACADEMIC_YEAR}).length,1);
});
