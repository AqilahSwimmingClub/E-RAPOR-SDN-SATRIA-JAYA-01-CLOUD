import { defaultLearningObjectives, hasDefaultsFor, OBJECTIVE_STATUS, phaseForClassId, TP_SOURCES } from '../data/learning-objective-defaults.js';
import { createLearningObjective, listLearningObjectives, setLearningObjectiveActive } from './objectives.js';
import { scopeKey } from './storage.js';

/* Tujuan Pembelajaran sebagai SATU SUMBER acuan.

   Guru menentukan TP mana yang dipakai HANYA di satu tempat: menu Tujuan Pembelajaran.
   Hasilnya — TP yang berstatus aktif — dibaca apa adanya oleh Penilaian, Intrakurikuler, dan
   penyusun deskripsi rapor. Tidak ada pemilihan TP kedua di menu mana pun, dan tidak ada
   daftar TP khusus per komponen penilaian.

   Dua hal yang sengaja tidak dilakukan di sini, karena keduanya akan mengubah cara menilai
   yang sudah dipakai sekolah:
   1. TIDAK ada nilai per TP. TP hanya menjadi acuan kompetensi dan bahan deskripsi.
   2. TIDAK ada perubahan pada perhitungan Nilai Akhir. Formatif, harian, praktik, sumatif
      lingkup materi, dan sumatif akhir tetap menghasilkan SATU Nilai Akhir seperti semula.

   Katalog bawaan berstatus inspiratif dan boleh diubah guru. TP buatan guru disimpan pada
   koleksi learningObjectives yang sudah ada, sehingga ikut backup akademik seperti biasa. */

export { phaseForClassId, TP_SOURCES, OBJECTIVE_STATUS };

export function objectiveScopeKey(session,subjectId){
  return `${scopeKey(session)}|${subjectId}`;
}

/* Daftar TP yang dipakai guru: TP lokal bila sudah ada, selain itu katalog inspiratif bawaan.
   TP lokal tidak pernah ditimpa katalog, dan katalog tidak pernah ditulis ke database kecuali
   guru memang mengadopsinya lewat menu Tujuan Pembelajaran. */
export function listObjectivesForAssessment(session,subjectId,{activeOnly=true}={}){
  let lokal=[];
  try{lokal=listLearningObjectives(session,subjectId,{activeOnly});}catch{lokal=[];}
  if(lokal.length)
    return lokal.map(record=>({...record,isDefault:false,status:record.status||'lokal',editable:true}));
  /* Bila guru sudah punya TP tetapi seluruhnya dinonaktifkan, hasilnya memang kosong.
     Katalog bawaan tidak boleh muncul kembali dan menutupi keputusan guru itu. */
  let semua=[];
  try{semua=listLearningObjectives(session,subjectId);}catch{semua=[];}
  if(semua.length)return [];
  const bawaan=defaultLearningObjectives(session.classId,subjectId);
  return activeOnly?bawaan.filter(item=>item.active):bawaan;
}

export function hasObjectiveCatalogue(session,subjectId){
  return listObjectivesForAssessment(session,subjectId).length>0||hasDefaultsFor(session.classId,subjectId);
}

/* ---------------------------------------------------------------- TP AKTIF (sumber tunggal)

   Inilah yang dibaca seluruh modul lain. Tidak ada penyimpanan pilihan TP tersendiri: status
   aktif sudah melekat pada TP-nya sendiri dan diatur guru lewat menu Tujuan Pembelajaran. */

export function listActiveObjectives(session,subjectId){
  return listObjectivesForAssessment(session,subjectId,{activeOnly:true});
}

/* Katalog bawaan belum berupa record milik sekolah sehingga statusnya belum dapat diubah satu
   per satu. Begitu guru menyentuh salah satunya, seluruh katalog disalin apa adanya menjadi TP
   milik sekolah — isinya tidak diubah, hanya dijadikan record supaya dapat diaktifkan atau
   dinonaktifkan. TP yang sudah dibuat guru tidak pernah ditimpa. */
export function adoptCatalogueObjectives(session,subjectId){
  let lokal=[];
  try{lokal=listLearningObjectives(session,subjectId);}catch{lokal=[];}
  if(lokal.length)return lokal;
  for(const item of defaultLearningObjectives(session.classId,subjectId))
    createLearningObjective(session,subjectId,{description:item.description,active:item.active!==false});
  return listLearningObjectives(session,subjectId);
}

export function isCatalogueOnly(session,subjectId){
  try{
    return listLearningObjectives(session,subjectId).length===0&&hasDefaultsFor(session.classId,subjectId);
  }catch{return false;}
}

/* Mengaktifkan atau menonaktifkan satu TP dari menu Tujuan Pembelajaran. Bila mapelnya masih
   memakai katalog bawaan, katalog itu diadopsi lebih dulu supaya perubahan status benar-benar
   tersimpan dan tidak hilang saat halaman dibuka ulang. */
export function setActiveObjective(session,subjectId,objectiveId,active){
  if(session?.role!=='teacher')throw new Error('Hanya Guru yang dapat mengatur Tujuan Pembelajaran.');
  const lokal=adoptCatalogueObjectives(session,subjectId);
  const target=lokal.find(item=>item.id===objectiveId)
    ||lokal.find(item=>item.code===objectiveId)
    ||lokal.find(item=>item.description===objectiveId);
  if(!target)throw new Error('Tujuan Pembelajaran tidak ditemukan pada mata pelajaran ini.');
  setLearningObjectiveActive(session,subjectId,target.id,Boolean(active));
  return listActiveObjectives(session,subjectId);
}

/* TP aktif beserta isinya, siap dipakai penyusun deskripsi rapor. */
export function getSelectedObjectiveRecords(session,subjectId){
  return listActiveObjectives(session,subjectId);
}
