import { capaianPembelajaran, cpElementById, cpElementForObjective } from '../data/curriculum-cp.js';
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

/* TP yang dipakai guru adalah TP SEKOLAH — yaitu yang sudah dimasukkan lewat menu Tujuan
   Pembelajaran. Katalog bawaan TIDAK pernah ikut terhitung: ia hanya menjadi pilihan pada
   modal + Tambah TP. Dengan begitu tabel pada menu Tujuan Pembelajaran benar-benar menjadi
   satu-satunya sumber, dan Penilaian tidak pernah memakai TP yang tidak pernah dipilih guru. */
export function listObjectivesForAssessment(session,subjectId,{activeOnly=true}={}){
  let lokal=[];
  try{lokal=listLearningObjectives(session,subjectId,{activeOnly});}catch{lokal=[];}
  return lokal.map(record=>({...record,isDefault:false,status:record.status||'lokal',editable:true}));
}

/* Mencari satu TP berdasarkan id, termasuk butir katalog yang pernah dirujuk data lama.
   Dipakai untuk MENAMPILKAN riwayat: butir katalog tidak pernah dianggap TP aktif. */
export function resolveObjective(session,subjectId,objectiveId){
  const id=String(objectiveId||'');
  const sekolah=listObjectivesForAssessment(session,subjectId,{activeOnly:false})
    .find(item=>item.id===id);
  if(sekolah)return sekolah;
  const katalog=defaultLearningObjectives(session?.classId,subjectId).find(item=>item.id===id);
  return katalog?{...katalog,isDefault:true,active:false}:null;
}

/* Katalog TP hanya dianggap tersedia bila CP mapel itu memang berlaku pada fase rombel.
   Ini mencegah katalog legacy (misalnya Bahasa Inggris Fase A) muncul sebagai TP baru ketika
   dokumen CP resmi menetapkan mapelnya mulai Fase B. Data historis tetap dapat dibaca. */
export function hasObjectiveCatalogue(session,subjectId){
  const cp=capaianPembelajaran(session?.classId,subjectId);
  if(cp?.available===false)return listObjectivesForAssessment(session,subjectId).length>0;
  return listObjectivesForAssessment(session,subjectId).length>0||hasDefaultsFor(session.classId,subjectId);
}

/* ---------------------------------------------------------------- TP AKTIF (sumber tunggal) */
export function listActiveObjectives(session,subjectId){
  return listObjectivesForAssessment(session,subjectId,{activeOnly:true});
}

/* -------------------------------------------------------------------- CP sebagai acuan */
export function capaianPembelajaranFor(session,subjectId){
  return capaianPembelajaran(session?.classId,subjectId);
}

/* ------------------------------------------------------- Katalog TP referensi (+ Tambah TP)

   Katalog bukan "TP sekolah" dan tidak pernah masuk sendiri ke daftar guru. Ia hanya menjadi
   pilihan pada modal + Tambah TP. Butir yang sudah pernah dimasukkan ditandai `sudahDipakai`
   supaya tidak terkirim dua kali. Fase yang CP-nya tidak berlaku selalu menghasilkan daftar
   kosong meskipun katalog legacy pernah memiliki butir untuk fase tersebut. */
export function listReferenceObjectives(session,subjectId){
  const phase=phaseForClassId(session?.classId);
  if(!phase)return [];
  const cp=capaianPembelajaran(session?.classId,subjectId);
  if(cp?.available===false)return [];
  let dipakai=[];
  try{dipakai=listLearningObjectives(session,subjectId);}catch{dipakai=[];}
  const sudah=new Set(dipakai.map(item=>String(item.description).trim().toLowerCase()));
  return defaultLearningObjectives(session?.classId,subjectId).map(item=>({
    ...item,
    cpElement:cpElementForObjective(subjectId,phase,item.order),
    sudahDipakai:sudah.has(String(item.description).trim().toLowerCase()),
  }));
}

/* Menambahkan TP referensi yang dicentang guru menjadi TP sekolah. Hanya butir terpilih yang
   masuk — tidak pernah seluruh katalog sekaligus — dan butir yang sudah ada dilewati sehingga
   menekan Simpan dua kali tidak menghasilkan TP kembar. */
export function addReferenceObjectives(session,subjectId,referenceIds){
  if(session?.role!=='teacher')throw new Error('Hanya Guru yang dapat mengatur Tujuan Pembelajaran.');
  const diminta=[...new Set((Array.isArray(referenceIds)?referenceIds:[]).map(id=>String(id)))];
  if(!diminta.length)throw new Error('Pilih minimal satu Tujuan Pembelajaran.');
  const katalog=listReferenceObjectives(session,subjectId);
  const dipilih=diminta.map(id=>katalog.find(item=>item.id===id)||null);
  if(dipilih.some(item=>!item))throw new Error('Tujuan Pembelajaran referensi tidak ditemukan pada mata pelajaran ini.');
  const ditambah=[];
  for(const item of dipilih){
    if(item.sudahDipakai)continue;
    ditambah.push(createLearningObjective(session,subjectId,{
      description:item.description,active:true,
      cpElementId:item.cpElement?.id||null,
    }));
  }
  return {added:ditambah.length,skipped:dipilih.length-ditambah.length,
    objectives:listLearningObjectives(session,subjectId)};
}

/* Daftar TP sekolah beserta konteksnya, siap ditampilkan sebagai tabel pada menu Tujuan
   Pembelajaran: tingkat kelas, fase, semester, isi TP, status, dan elemen CP yang diturunkan. */
export function listSchoolObjectives(session,subjectId){
  const phase=phaseForClassId(session?.classId);
  let daftar=[];
  try{daftar=listLearningObjectives(session,subjectId);}catch{daftar=[];}
  return daftar.map(item=>({
    ...item,
    phase:item.phase||phase,
    grade:Number.parseInt(String(session?.classId||'').trim(),10)||null,
    semester:session?.semester||'',
    academicYear:session?.academicYear||'',
    cpElement:item.cpElementId?cpElementById(subjectId,item.cpElementId):null,
  }));
}

export function setActiveObjective(session,subjectId,objectiveId,active){
  if(session?.role!=='teacher')throw new Error('Hanya Guru yang dapat mengatur Tujuan Pembelajaran.');
  setLearningObjectiveActive(session,subjectId,objectiveId,Boolean(active));
  return listActiveObjectives(session,subjectId);
}

/* TP aktif beserta isinya, siap dipakai penyusun deskripsi rapor. */
export function getSelectedObjectiveRecords(session,subjectId){
  return listActiveObjectives(session,subjectId);
}
