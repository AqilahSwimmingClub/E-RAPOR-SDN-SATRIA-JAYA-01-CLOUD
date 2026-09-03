import { defaultLearningObjectives, hasDefaultsFor, OBJECTIVE_STATUS, phaseForClassId, TP_SOURCES } from '../data/learning-objective-defaults.js';
import { ASSESSMENT_TYPES } from './assessment.js';
import { listLearningObjectives } from './objectives.js';
import { loadDb, scopeKey, updateDb } from './storage.js';

/* Tujuan Pembelajaran sebagai ACUAN penilaian.

   Dua hal yang sengaja tidak dilakukan di sini, karena keduanya akan mengubah cara menilai
   yang sudah dipakai sekolah:
   1. TIDAK ada nilai per TP. TP hanya menjadi acuan kompetensi dan bahan deskripsi.
   2. TIDAK ada perubahan pada perhitungan Nilai Akhir. Formatif, harian, praktik, sumatif
      lingkup materi, dan sumatif akhir tetap menghasilkan SATU Nilai Akhir seperti semula.

   Katalog bawaan berstatus inspiratif dan boleh diubah guru. TP buatan guru disimpan pada
   koleksi learningObjectives yang sudah ada, sehingga ikut backup akademik seperti biasa. */

export { phaseForClassId, TP_SOURCES, OBJECTIVE_STATUS };

const SELECTION_COLLECTION='assessmentObjectiveSelection';

/* Kunci penyimpanan pilihan TP.

   Tanpa komponen, kuncinya sama persis dengan bentuk lama sehingga pilihan TP tingkat mata
   pelajaran yang sudah tersimpan tetap terbaca apa adanya. Dengan komponen, kuncinya bertambah
   satu ruas sehingga Formatif, Harian, Praktik, Sumatif Lingkup Materi, dan Sumatif Akhir
   masing-masing punya pilihan TP sendiri. */
export function objectiveScopeKey(session,subjectId,assessmentType=''){
  const komponen=String(assessmentType||'').trim();
  return `${scopeKey(session)}|${subjectId}${komponen?`|${komponen}`:''}`;
}

export const OBJECTIVE_COMPONENTS=Object.freeze(ASSESSMENT_TYPES.map(type=>Object.freeze({...type})));

function assertComponent(assessmentType){
  const komponen=String(assessmentType||'').trim();
  if(!komponen)return '';
  if(!OBJECTIVE_COMPONENTS.some(type=>type.id===komponen))
    throw new Error('Komponen penilaian tidak valid untuk pemilihan Tujuan Pembelajaran.');
  return komponen;
}

/* Daftar TP yang dipakai guru: TP lokal bila sudah ada, selain itu katalog inspiratif bawaan.
   TP lokal tidak pernah ditimpa katalog, dan katalog tidak pernah ditulis ke database. */
export function listObjectivesForAssessment(session,subjectId,{activeOnly=true}={}){
  let lokal=[];
  try{lokal=listLearningObjectives(session,subjectId,{activeOnly});}catch{lokal=[];}
  if(lokal.length)
    return lokal.map(record=>({...record,isDefault:false,status:record.status||'lokal',editable:true}));
  const bawaan=defaultLearningObjectives(session.classId,subjectId);
  return activeOnly?bawaan.filter(item=>item.active):bawaan;
}

export function hasObjectiveCatalogue(session,subjectId){
  return listObjectivesForAssessment(session,subjectId).length>0||hasDefaultsFor(session.classId,subjectId);
}

/* ------------------------------------------------------ Pemilihan TP per penilaian */

/* Satu penilaian boleh mengacu pada beberapa TP sekaligus. Yang disimpan hanya DAFTAR ID,
   tidak ada satu pun angka per TP. */
export function getSelectedAssessmentObjectives(session,subjectId,assessmentType=''){
  const komponen=assertComponent(assessmentType);
  const db=loadDb();
  const record=db[SELECTION_COLLECTION]?.[objectiveScopeKey(session,subjectId,komponen)];
  const tersedia=listObjectivesForAssessment(session,subjectId);
  const dipilih=Array.isArray(record?.objectiveIds)?record.objectiveIds:[];
  /* TP yang sudah dihapus guru otomatis gugur dari pilihan. */
  return dipilih.filter(id=>tersedia.some(item=>item.id===id));
}

export function setSelectedAssessmentObjectives(session,subjectId,objectiveIds,assessmentType=''){
  if(session?.role!=='teacher')throw new Error('Hanya Guru yang dapat memilih Tujuan Pembelajaran penilaian.');
  const komponen=assertComponent(assessmentType);
  const tersedia=listObjectivesForAssessment(session,subjectId);
  const bersih=[...new Set((Array.isArray(objectiveIds)?objectiveIds:[]).map(id=>String(id)))]
    .filter(id=>tersedia.some(item=>item.id===id));
  let saved;
  updateDb(db=>{
    if(!db[SELECTION_COLLECTION])db[SELECTION_COLLECTION]={};
    saved={subjectId,classId:session.classId,semester:session.semester,academicYear:session.academicYear,
      assessmentType:komponen||null,
      objectiveIds:bersih,updatedAt:new Date().toISOString()};
    db[SELECTION_COLLECTION][objectiveScopeKey(session,subjectId,komponen)]=saved;
    return db;
  });
  return {...saved,objectives:tersedia.filter(item=>bersih.includes(item.id))};
}

/* Ringkasan untuk UI Penilaian: berapa TP yang dipakai tiap komponen. Dipakai agar tabel nilai
   cukup menampilkan "3 TP dipilih", bukan seluruh teks TP yang membuat kolom menjadi sempit. */
export function getComponentObjectiveSummary(session,subjectId){
  const tersedia=listObjectivesForAssessment(session,subjectId);
  return OBJECTIVE_COMPONENTS.map(type=>{
    const ids=getSelectedAssessmentObjectives(session,subjectId,type.id);
    return {...type,objectiveIds:ids,count:ids.length,
      objectives:tersedia.filter(item=>ids.includes(item.id))};
  });
}

/* TP terpilih beserta isinya, siap dipakai penyusun deskripsi rapor.

   Gabungan acuan tingkat mata pelajaran dengan seluruh TP yang dipakai komponen penilaian,
   sehingga TP yang guru pilih di Formatif/Harian/Praktik/Sumatif ikut tersedia bagi penyusun
   deskripsi. Urutannya mengikuti daftar TP, dan tiap TP hanya muncul sekali. */
export function getSelectedObjectiveRecords(session,subjectId){
  const dipilih=new Set(getSelectedAssessmentObjectives(session,subjectId));
  for(const type of OBJECTIVE_COMPONENTS)
    for(const id of getSelectedAssessmentObjectives(session,subjectId,type.id))dipilih.add(id);
  return listObjectivesForAssessment(session,subjectId).filter(item=>dipilih.has(item.id));
}
