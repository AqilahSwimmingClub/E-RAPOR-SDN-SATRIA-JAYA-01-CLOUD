import { CLASSES } from '../data/constants.js';
import { loadDb, updateDb } from './storage.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=180){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengubah Data Referensi.');}
function normalizeAcademicYear(value){
  const label=clean(value,20);const match=label.match(/^(\d{4})\/(\d{4})$/);
  if(!match||Number(match[2])!==Number(match[1])+1)throw new Error('Tahun pelajaran harus berformat YYYY/YYYY dan berurutan.');
  return label;
}

export function listReferenceAcademicYears(){
  return clone(loadDb().masterData.references.academicYears).sort((a,b)=>b.label.localeCompare(a.label,'id'));
}

export function listReferenceSemesters({academicYear='ALL'}={}){
  return clone(loadDb().masterData.references.semesters).filter(item=>academicYear==='ALL'||item.academicYear===academicYear).sort((a,b)=>b.academicYear.localeCompare(a.academicYear,'id')||(['Ganjil','Genap'].indexOf(a.name)-['Ganjil','Genap'].indexOf(b.name)));
}

export function listReferenceSubjects(){
  return clone(loadDb().masterData.references.subjects).sort((a,b)=>a.order-b.order);
}

export function listReferenceClasses(){return [...CLASSES];}

export function createAcademicYear(session,value){
  assertAdmin(session);const academicYear=normalizeAcademicYear(value);let created;
  updateDb(db=>{
    const refs=db.masterData.references;
    if(refs.academicYears.some(item=>item.id.toLowerCase()===academicYear.toLowerCase()))throw new Error(`Tahun pelajaran ${academicYear} sudah tersedia.`);
    const now=new Date().toISOString();created={id:academicYear,label:academicYear,active:true,createdAt:now,updatedAt:now};refs.academicYears.push(created);
    ['Ganjil','Genap'].forEach(name=>{const label=`${name} ${academicYear}`;if(!refs.semesters.some(item=>item.id===label))refs.semesters.push({id:label,label,name,academicYear,active:true,createdAt:now,updatedAt:now});});
    return db;
  });return clone(created);
}

export function setSemesterReferenceActive(session,semesterId,active){
  assertAdmin(session);let saved;
  updateDb(db=>{const refs=db.masterData.references;const semester=refs.semesters.find(item=>item.id===semesterId);if(!semester)throw new Error('Semester tidak ditemukan pada Data Referensi.');if(!active&&refs.semesters.filter(item=>item.active!==false&&item.id!==semesterId).length===0)throw new Error('Minimal satu semester harus tetap aktif untuk login.');saved={...semester,active:Boolean(active),updatedAt:new Date().toISOString()};Object.assign(semester,saved);const year=refs.academicYears.find(item=>item.id===semester.academicYear);if(year){year.active=refs.semesters.some(item=>item.academicYear===year.id&&item.active!==false);year.updatedAt=saved.updatedAt;}return db;});return clone(saved);
}

export function copyAcademicYearData(session,{fromAcademicYear,toAcademicYear}){
  assertAdmin(session);if(fromAcademicYear===toAcademicYear)throw new Error('Tahun sumber dan tujuan harus berbeda.');const refs=loadDb().masterData.references;if(!refs.academicYears.some(item=>item.id===fromAcademicYear)||!refs.academicYears.some(item=>item.id===toAcademicYear))throw new Error('Tahun sumber atau tujuan tidak tersedia.');const counts={subjectMappings:0,assessmentSettings:0,learningObjectives:0,skipped:0};
  updateDb(db=>{const collections=['subjectMappings','assessmentSettings','learningObjectives'];['Ganjil','Genap'].forEach(name=>{const fromSemester=`${name} ${fromAcademicYear}`,toSemester=`${name} ${toAcademicYear}`,fromPrefix=`${fromAcademicYear}|${fromSemester}|`,toPrefix=`${toAcademicYear}|${toSemester}|`;collections.forEach(collection=>{Object.entries(db[collection]||{}).filter(([recordKey])=>recordKey.startsWith(fromPrefix)).forEach(([recordKey,record])=>{const targetKey=`${toPrefix}${recordKey.slice(fromPrefix.length)}`;if(Object.hasOwn(db[collection],targetKey)){counts.skipped+=1;return;}db[collection][targetKey]=collection==='subjectMappings'?clone(record):{...clone(record),academicYear:toAcademicYear,semester:toSemester,updatedAt:new Date().toISOString()};counts[collection]+=1;});});});return db;});return {...counts,copiedMappings:counts.subjectMappings,copiedAssessmentSettings:counts.assessmentSettings,copiedLearningObjectives:counts.learningObjectives};
}

export function updateReferenceSubject(session,subjectId,input){
  assertAdmin(session);const name=clean(input?.name,180);if(!name)throw new Error('Nama mata pelajaran wajib diisi.');let saved;
  updateDb(db=>{
    const subjects=db.masterData.references.subjects;const index=subjects.findIndex(item=>item.id===subjectId);
    if(index<0)throw new Error('Mata pelajaran tidak ditemukan pada master.');
    if(subjects.some(item=>item.id!==subjectId&&item.name.toLowerCase()===name.toLowerCase()))throw new Error(`Mata pelajaran ${name} sudah tersedia.`);
    saved={...subjects[index],name,updatedAt:new Date().toISOString()};subjects[index]=saved;
    Object.values(db.subjectMappings||{}).forEach(mapping=>{if(!Array.isArray(mapping))return;const item=mapping.find(subject=>subject.id===subjectId);if(item)item.name=name;});
    return db;
  });return clone(saved);
}

export function listLoginSemesters(){
  return listReferenceSemesters().filter(item=>item.active!==false).map(item=>item.label);
}

export function resolveSemesterAcademicYear(semester){
  const record=listReferenceSemesters().find(item=>item.label===semester);
  if(!record)throw new Error('Semester tidak tersedia pada Data Referensi.');
  return record.academicYear;
}

export function getReferenceOverview(){
  return {academicYears:listReferenceAcademicYears(),semesters:listReferenceSemesters(),classes:listReferenceClasses(),subjects:listReferenceSubjects()};
}
