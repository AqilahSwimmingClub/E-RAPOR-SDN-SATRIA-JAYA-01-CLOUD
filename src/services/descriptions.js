import { composeReportButirDescription, cpAcuanFor } from './cp-descriptions.js';
import { getAssessmentSettings } from './assessment.js';
import { listCpButirForSemester } from './cp-butir.js';
import { calculateReportScore, getReportScore } from './report.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';


function clone(value){return JSON.parse(JSON.stringify(value));}
function key(session,subjectId,studentId){return `${scopeKey(session)}|${subjectId}|${studentId}`;}
function studentOf(session,studentId){
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope aktif.');
  return student;
}
/* KKTP DAN RUBRIK SELALU MILIK MATA PELAJARAN YANG SEDANG DIPROSES.

   Keduanya dibaca dari pengaturan penilaian mata pelajaran itu, dan keduanya menjawab
   pertanyaan yang berbeda: KKTP menentukan status ketuntasan, RUBRIK menentukan kategori yang
   dipakai kalimat Deskripsi Rapor. Tidak ada angka tetap di sini - menuliskan satu angka
   berarti menilai seluruh mata pelajaran dengan penggaris yang sama, padahal setiap mata
   pelajaran menetapkan ambangnya sendiri. */
function pengaturanMapel(session,subjectId){
  try{return getAssessmentSettings(session,subjectId);}catch{return null;}
}
function finalScoreOf(session,subjectId,studentId){
  const pengaturan=pengaturanMapel(session,subjectId);
  const rubric=pengaturan?.rubric??null;
  const tersimpan=getReportScore(session,subjectId,studentId);
  if(tersimpan&&tersimpan.finalScore!==null&&tersimpan.finalScore!==undefined)
    return {finalScore:tersimpan.finalScore,kktp:tersimpan.kktp??pengaturan?.kktp??null,rubric};
  const dihitung=calculateReportScore(session,subjectId,studentId);
  return {finalScore:dihitung.finalScore,kktp:dihitung.kktp??pengaturan?.kktp??null,rubric};
}

/* ------------------------------------------------------------- SUMBER TUNGGAL: BUTIR CP AKTIF

   JALUR TUJUAN PEMBELAJARAN DIBUANG SELURUHNYA DARI BERKAS INI.

   Sebelumnya ada rantai cadangan: bila Butir CP tidak menghasilkan kalimat, penyusun jatuh ke
   Elemen CP; bila itu pun tidak ada, ia jatuh ke TP aktif; dan bila tidak ada TP aktif, ia
   jatuh lagi ke sepasang TP "terbaik" dan "perlu ditingkatkan". Rantai itu terlihat aman -
   selalu ada kalimat yang keluar - dan justru itulah bahayanya: rapor terisi oleh kompetensi
   yang bukan dasar penilaian yang berlaku, tanpa seorang pun tahu dari mana asalnya.

   Sekarang hanya ada SATU sumber: Butir CP yang AKTIF pada mata pelajaran itu. Bila tidak ada,
   tidak ada kalimat yang disusun dan alasannya dikatakan apa adanya. Data TP lama tetap utuh di
   penyimpanan; ia hanya tidak pernah lagi dibaca dari sini. */
export const PESAN_TANPA_BUTIR_AKTIF='Belum ada Butir CP aktif untuk mata pelajaran ini. Aktifkan atau tambahkan Butir CP terlebih dahulu.';

/* DESKRIPSI CAPAIAN KOMPETENSI NILAI RAPOR.

   SUMBERNYA: Butir CP AKTIF mata pelajaran itu, dinyatakan menurut NILAI AKHIR murid terhadap
   RUBRIK mata pelajaran itu. Nilai Akhir tetap satu angka dari lima komponen penilaian yang
   sudah berjalan - tidak ada nilai Teori, tidak ada nilai Praktik, dan tidak ada angka baru
   yang lahir dari CP.

   TIDAK ADA TP di jalur ini, dan tidak ada cadangan apa pun. Guru tidak pernah diminta memilih
   Tujuan Pembelajaran, dan tidak ada keadaan yang membuat penyusun jatuh kembali ke TP lama,
   ke Butir CP nonaktif, maupun ke kompetensi mata pelajaran lain.

   Penyusunnya SENGAJA berbeda dari penyusun Intrakurikuler meskipun kompetensinya sama: yang
   satu merangkum capaian satu semester dari Nilai Akhir, yang lain menceritakan satu kegiatan
   penilaian dari predikat. Menyatukan keduanya membuat dua kolom berbeda di rapor berbunyi
   sama. */
function cpDescription(session,subjectId,studentId){
  requireActiveSubject(session,subjectId);
  const student=studentOf(session,studentId);
  const {finalScore,kktp,rubric}=finalScoreOf(session,subjectId,studentId);
  /* SATU-SATUNYA SUMBER: Butir CP AKTIF mata pelajaran ini pada semester berjalan. */
  let butir=[];
  try{butir=listCpButirForSemester(session,subjectId);}catch{butir=[];}
  if(!butir.length)return null;
  const text=composeReportButirDescription({studentName:student.name,butir,finalScore,rubric});
  if(!text)return null;
  /* Catatan yang dihasilkan tidak lagi membawa rujukan TP sama sekali - bukan pula
     `objectiveIds:null`. Yang ditunjuk hanyalah Butir CP yang benar-benar menjadi dasarnya. */
  return {text,source:'CP_BUTIR',cpPhase:cpAcuanFor(session,subjectId)?.phase||null,
    butirIds:butir.map(item=>item.id),studentId:student.id,
    bestObjectiveId:null,improvementObjectiveId:null,finalScore,kktp};
}

export function generateReportDescription(session,subjectId,studentId){
  const dariCp=cpDescription(session,subjectId,studentId);
  if(dariCp)return dariCp;
  /* Tidak ada cadangan. Mata pelajaran tanpa Butir CP aktif tidak menghasilkan deskripsi, dan
     guru diberi tahu apa yang harus dilakukan - bukan diberi kalimat yang tampak benar. */
  throw new Error(PESAN_TANPA_BUTIR_AKTIF);
}

/* ------------------------------------------------------ GENERATE SEMUA SISWA SATU MAPEL

   Guru tidak perlu membuka modal deskripsi satu per satu. Satu klik menghasilkan deskripsi
   untuk SELURUH siswa rombel pada mata pelajaran YANG SEDANG DIPILIH.

   MATA PELAJARANNYA ADALAH YANG DIKIRIM PEMANGGIL. Tidak ada satu jalur pun di sini yang
   membaca "mapel pertama" atau indeks tampilan, dan setiap penyimpanan memakai subjectId yang
   sama persis - itulah yang membuat Generate IPAS tidak pernah menulis ke Pancasila.

   Deskripsi yang sudah DIKUNCI tidak pernah ditimpa. Deskripsi yang disunting guru ditimpa
   hanya bila pemanggil memintanya secara eksplisit. */
export function generateAllReportDescriptions(session,subjectId,{overwriteEdited=false,
  requireScore=false}={}){
  requireActiveSubject(session,subjectId);
  const students=listStudents(session,{classId:session.classId});
  const hasil={subjectId,total:students.length,terisi:0,dilewati:[],gagal:[]};
  for(const student of students){
    try{
      /* `requireScore` dipakai jalur OTOMATIS. Deskripsi rapor menyatakan tingkat capaian, dan
         tingkat itu dibaca dari Nilai Akhir; murid yang belum punya nilai sama sekali akan
         mendapat kalimat "menempuh pembelajaran pada kompetensi ..." yang tampak seolah rapornya
         sudah terisi padahal belum. Jalur manual tetap boleh membuatnya - guru yang menekan
         Generate memang tahu apa yang ia minta. */
      if(requireScore&&!punyaNilai(session,subjectId,student.id)){
        hasil.dilewati.push({studentId:student.id,name:student.name,alasan:'belum ada nilai'});
        continue;
      }
      const lama=getReportDescription(session,subjectId,student.id);
      if(lama?.locked){
        hasil.dilewati.push({studentId:student.id,name:student.name,alasan:'deskripsi terkunci'});
        continue;
      }
      if(!overwriteEdited&&lama?.status==='EDITED'){
        hasil.dilewati.push({studentId:student.id,name:student.name,alasan:'deskripsi diedit guru'});
        continue;
      }
      const dibuat=generateReportDescription(session,subjectId,student.id);
      saveReportDescription(session,subjectId,student.id,{text:dibuat.text});
      hasil.terisi+=1;
    }catch(error){
      hasil.gagal.push({studentId:student.id,name:student.name,alasan:error.message});
    }
  }
  return hasil;
}

/* Apakah murid ini benar-benar punya Nilai Akhir pada mata pelajaran ini - baik dari nilai
   rapor yang sudah tersimpan maupun dari perhitungan lima komponen yang sudah terisi. */
function punyaNilai(session,subjectId,studentId){
  try{
    const {finalScore}=finalScoreOf(session,subjectId,studentId);
    return finalScore!==null&&finalScore!==undefined;
  }catch{return false;}
}

export function getReportDescription(session,subjectId,studentId){
  requireActiveSubject(session,subjectId);const record=loadDb().reportDescriptions[key(session,subjectId,studentId)];return record?clone(record):null;
}

export function saveReportDescription(session,subjectId,studentId,input){
  const current=getReportDescription(session,subjectId,studentId);if(current?.locked)throw new Error('Deskripsi sudah terkunci dan tidak dapat diubah.');
  const generated=generateReportDescription(session,subjectId,studentId);const text=String(input?.text||'').trim().slice(0,1500);if(!text)throw new Error('Deskripsi rapor wajib diisi.');let saved;
  updateDb(db=>{const now=new Date().toISOString();saved={studentId,classId:session.classId,subjectId,semester:session.semester,academicYear:session.academicYear,text,bestObjectiveId:generated.bestObjectiveId,improvementObjectiveId:generated.improvementObjectiveId,status:text===generated.text?'AUTO':'EDITED',locked:false,createdAt:current?.createdAt||now,updatedAt:now};db.reportDescriptions[key(session,subjectId,studentId)]=saved;return db;});return clone(saved);
}

export function lockReportDescription(session,subjectId,studentId){
  const current=getReportDescription(session,subjectId,studentId);if(!current?.text)throw new Error('Simpan deskripsi sebelum menguncinya.');if(current.locked)return current;let locked;
  updateDb(db=>{locked={...current,locked:true,status:'LOCKED',updatedAt:new Date().toISOString()};db.reportDescriptions[key(session,subjectId,studentId)]=locked;return db;});return clone(locked);
}
