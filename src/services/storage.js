import { SUBJECTS_DEFAULT, ASSESSMENT_DEFAULT, CLASSES, DEFAULT_SCHOOL_NAME, ACADEMIC_YEAR, SEMESTERS, availableAcademicYears, semestersOf } from '../data/constants.js';
import { normalizeMappingGroups } from './mapping.js';
import { APP_SCHEMA_VERSION, APP_VERSION } from '../data/version.js';

const DB_KEY = 'erapor_satria_jaya_01_v1';

function clone(value){ return JSON.parse(JSON.stringify(value)); }

function defaultReferenceData(){
  return {
    /* Tahun dasar, tahun berjalan, dan tahun berikutnya selalu disediakan. Tahun pelajaran yang
       sudah ada pada database guru tidak pernah dibuang: daftar ini hanya ditambahkan. */
    academicYears:availableAcademicYears().map(year=>({id:year,label:year,active:true})),
    semesters:availableAcademicYears().flatMap(year=>semestersOf(year).map(label=>({id:label,label,name:label.split(' ')[0],academicYear:year,active:true}))),
    subjects:clone(SUBJECTS_DEFAULT),
  };
}

function uniqueRecords(records,keyOf){
  const seen=new Set();return records.filter(record=>{const key=keyOf(record);if(!key||seen.has(key))return false;seen.add(key);return true;});
}

function normalizeReferenceData(input){
  const defaults=defaultReferenceData();const source=input&&typeof input==='object'?input:{};
  const academicYears=uniqueRecords([...(Array.isArray(source.academicYears)?source.academicYears:[]),...defaults.academicYears].map(item=>({id:String(item?.id||item?.label||'').trim(),label:String(item?.label||item?.id||'').trim(),active:item?.active!==false})),item=>item.id);
  const semesters=uniqueRecords([...(Array.isArray(source.semesters)?source.semesters:[]),...defaults.semesters].map(item=>({id:String(item?.id||item?.label||'').trim(),label:String(item?.label||item?.id||'').trim(),name:String(item?.name||'').trim(),academicYear:String(item?.academicYear||'').trim(),active:item?.active!==false})),item=>item.id);
  /* Mapping tersimpan menang atas bawaan, TETAPI hanya untuk mapel yang memang ada di dalamnya.
     Mapel bawaan yang belum pernah dikenal Mapping sebuah sekolah memakai status bawaannya
     sendiri - itulah yang membuat mapel baru dapat ditambahkan dalam keadaan nonaktif tanpa
     mengubah konfigurasi sekolah yang sudah berjalan. */
  const savedSubjects=new Map((Array.isArray(source.subjects)?source.subjects:[]).map(item=>[item?.id,item]));
  const subjects=normalizeMappingGroups(SUBJECTS_DEFAULT.map(subject=>({...subject,...(savedSubjects.get(subject.id)||{}),id:subject.id,name:String(savedSubjects.get(subject.id)?.name||subject.name),active:savedSubjects.has(subject.id)?savedSubjects.get(subject.id)?.active!==false:subject.active!==false})));
  return {academicYears,semesters,subjects};
}

function defaultMasterData(){
  return {
    /* Instalasi baru bersih dari identitas sekolah mana pun. Seluruh nilai diisi Admin
       lewat Setup Awal. Merge di loadDb() memastikan instalasi lama tetap memakai
       identitas sekolah yang sudah tersimpan. */
    school:{name:DEFAULT_SCHOOL_NAME,principalName:'',principalNip:'',npsn:'',registrationNumber:'',status:'',address:'',village:'',district:'',city:'',province:'',postalCode:'',phone:'',website:'',email:'',ministryLogo:'',regionLogo:'',schoolLogo:''},
    /* Profil akun Admin milik sekolah pengguna, bukan identitas pembuat aplikasi. */
    admin:{name:'Administrator',nip:'',phone:'',email:'',photo:''},
    classes:[...CLASSES],
    teachers:Object.fromEntries(CLASSES.map(classId=>[classId,{classId,name:`Guru / Wali Kelas ${classId}`,nip:'',phone:'',email:'',photo:'',updatedAt:null}])),
    references:defaultReferenceData(),
  };
}

function baseDb(){
  return {
    schemaVersion: 1,
    appSchemaVersion: APP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {},
    masterData: defaultMasterData(),
    userAccounts: {},
    security: {},
    subjectMappings: {},
    assessmentSettings: {},
    students: {}, attendance: {}, manualAttendance: {}, learningObjectives: {}, cpButir: {}, cpButirScores: {}, assessmentScores: {},
    reportScores: {}, reportDescriptions: {}, extracurricularScores: {}, cocurricularActivities: {}, cocurricularScores: {},
    intracurricularActivities: {}, intracurricularScores: {}, dapodikSyncState: {}, dapodikSyncLogs: {}, dapodikMappings: {}, publishedReports: {},
    attitudeProfiles: {}, printSettings: {}, homeroomNotes: {}, promotionStatus: {}, graduationStatus: {}, transcriptScores: {},
    backupHistory: [], migrationHistory: []
  };
}

/* Hasil pembacaan database disimpan di memori dan dipakai ulang selama teks mentahnya belum
   berubah. Setiap penulisan mengganti teks itu sehingga cache otomatis kedaluwarsa; tidak ada
   data basi yang bisa terbaca. Tanpa ini, satu kali pindah mata pelajaran memicu puluhan
   JSON.parse database penuh sehingga terasa lambat. */
let cacheRaw=null,cacheDb=null;
export function invalidateDbCache(){cacheRaw=null;cacheDb=null;}

export function loadDb(){
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return baseDb();
    if(raw===cacheRaw&&cacheDb)return cacheDb;
    const parsed = JSON.parse(raw);
    const db={...baseDb(), ...parsed};
    const defaults=defaultMasterData();
    db.masterData={...defaults,...(parsed.masterData||{}),school:{...defaults.school,...(parsed.masterData?.school||{})},admin:{...defaults.admin,...(parsed.masterData?.admin||{})},classes:[...CLASSES],teachers:Object.fromEntries(CLASSES.map(classId=>[classId,{...defaults.teachers[classId],...(parsed.masterData?.teachers?.[classId]||{}),classId}])),references:normalizeReferenceData(parsed.masterData?.references)};
    db.subjectMappings=Object.fromEntries(Object.entries(db.subjectMappings||{}).map(([key,mapping])=>[
      key,Array.isArray(mapping)?normalizeMappingGroups(mapping):mapping
    ]));
    cacheRaw=raw;cacheDb=db;
    return db;
  } catch (error) {
    invalidateDbCache();
    throw new Error(`Database lokal tidak dapat dibaca: ${error.message}`);
  }
}

export function saveDb(db){
  const next = {...db, updatedAt:new Date().toISOString()};
  const raw=JSON.stringify(next);
  localStorage.setItem(DB_KEY, raw);
  /* Cache diperbarui bersama penulisan agar pembacaan berikutnya tetap mutakhir. */
  invalidateDbCache();
  return next;
}

export function updateDb(mutator){
  const db = loadDb();
  const draft = clone(db);
  const result = mutator(draft) || draft;
  return saveDb(result);
}

export function scopeKey(session){
  const klass = session.role === 'admin' ? 'ALL' : session.classId;
  return `${session.academicYear}|${session.semester}|${klass}`;
}

export function mappingKey(session){ return scopeKey(session); }

export function getSubjectMapping(session){
  const db = loadDb();
  return clone(db.subjectMappings[mappingKey(session)] || db.masterData.references.subjects);
}

export function saveSubjectMapping(session, mapping){
  return updateDb(db => {
    db.subjectMappings[mappingKey(session)] = normalizeMappingGroups(mapping);
    return db;
  });
}

export function resetSubjectMapping(session){
  return updateDb(db => {
    db.subjectMappings[mappingKey(session)] = clone(db.masterData.references.subjects);
    return db;
  });
}

export function getAssessmentWeights(session, subjectId){
  const db = loadDb();
  const key = `${scopeKey(session)}|${subjectId}`;
  return clone(db.assessmentSettings[key] || {...ASSESSMENT_DEFAULT, kktp:75});
}

export function exportDb(){ return clone(loadDb()); }
export function replaceDb(data){ return saveDb(data); }
export function storageKey(){ return DB_KEY; }
