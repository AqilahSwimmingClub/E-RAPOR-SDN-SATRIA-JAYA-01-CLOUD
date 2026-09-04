import { composeReportButirDescription, composeReportCpDescription, cpAcuanFor,
  kategoriRapor } from './cp-descriptions.js';
import { getAssessmentSettings } from './assessment.js';
import { listCpButirForSemester } from './cp-butir.js';
import { listActiveObjectives, listObjectivesForAssessment } from './learning-objectives.js';
import { ringkasObjectives } from './objective-summary.js';
import { calculateReportScore, getReportScore } from './report.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';

export { ringkasObjectives };

function clone(value){return JSON.parse(JSON.stringify(value));}
function key(session,subjectId,studentId){return `${scopeKey(session)}|${subjectId}|${studentId}`;}
function phrase(value){return String(value||'').trim().replace(/[.!?]+$/,'');}
function context(session,subjectId,studentId,bestObjectiveId,improvementObjectiveId){
  requireActiveSubject(session,subjectId);const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);if(!student)throw new Error('Siswa tidak ditemukan pada scope aktif.');
  const objectives=listObjectivesForAssessment(session,subjectId,{activeOnly:true});if(!objectives.length)throw new Error('Belum ada TP aktif untuk membuat deskripsi.');
  const best=objectives.find(item=>item.id===bestObjectiveId);const improvement=objectives.find(item=>item.id===improvementObjectiveId);
  if(!best||!improvement)throw new Error('Pilih TP aktif untuk capaian terbaik dan yang perlu ditingkatkan.');return {student,best,improvement};
}

/* --------------------------------------------------- Deskripsi bersumber dari TP acuan penilaian

   TP hanya menjadi ACUAN. Nilai Akhir tetap satu angka dari pipeline penilaian lama, dan angka
   itulah yang menentukan tingkat capaian pada kalimat deskripsi. Tidak ada nilai per TP, dan
   tidak ada kompetensi yang ditambahkan di luar TP yang dipilih guru. */

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
/* Jalur TP lama memakai rubrik yang sama persis dengan jalur CP, sehingga tidak ada dua
   standar capaian yang saling bertentangan di dalam satu aplikasi. */
function levelCapaian(finalScore,rubric){
  const kategori=kategoriRapor(finalScore,rubric);
  return kategori===null?null:kategori.toLowerCase();
}
function objectiveDescription(session,subjectId,studentId,objectiveIds){
  requireActiveSubject(session,subjectId);
  const student=studentOf(session,studentId);
  const tersedia=listObjectivesForAssessment(session,subjectId);
  const dipilih=[...new Set(objectiveIds.map(id=>String(id)))]
    .map(id=>tersedia.find(item=>item.id===id)||null);
  if(dipilih.some(item=>!item))throw new Error('Tujuan Pembelajaran acuan tidak ditemukan pada mata pelajaran ini.');
  const {finalScore,kktp,rubric}=finalScoreOf(session,subjectId,studentId);
  const level=levelCapaian(finalScore,rubric);
  const isi=ringkasObjectives(dipilih);
  /* Tingkat capaian tetap berasal dari Nilai Akhir dan KKTP yang sudah ada; tidak ada standar
     interval baru yang diperkenalkan di sini. */
  const text=level===null
    ? `Ananda ${student.name} mampu ${isi}.`
    : finalScore>=kktp
      ? `Ananda ${student.name} mampu ${isi} dengan ${level}.`
      : `Ananda ${student.name} mampu ${isi} dengan bimbingan, dan perlu penguatan agar tercapai secara utuh.`;
  return {text,objectiveIds:dipilih.map(item=>item.id),bestObjectiveId:null,improvementObjectiveId:null,finalScore,kktp};
}

/* DESKRIPSI CAPAIAN KOMPETENSI NILAI RAPOR.

   SUMBERNYA: Butir CP AKTIF mata pelajaran itu, dinyatakan menurut NILAI AKHIR murid terhadap
   KKTP. Nilai Akhir tetap satu angka dari lima komponen penilaian yang sudah berjalan - tidak
   ada nilai Teori, tidak ada nilai Praktik, dan tidak ada angka baru yang lahir dari CP.

   TIDAK ADA TP di jalur ini. Guru tidak pernah diminta memilih Tujuan Pembelajaran untuk
   menghasilkan deskripsi rapor. Jalur TP hanya tersisa sebagai CADANGAN untuk mata pelajaran
   yang memang belum punya CP pada fase rombel, dan hanya bila pemanggil menyebut objectiveIds
   secara eksplisit - itu pun agar catatan lama tetap dapat diproses, bukan sebagai alur baru.

   Penyusunnya SENGAJA berbeda dari penyusun Intrakurikuler meskipun kompetensinya sama: yang
   satu merangkum capaian satu semester dari Nilai Akhir, yang lain menceritakan satu kegiatan
   penilaian dari predikat. Menyatukan keduanya membuat dua kolom berbeda di rapor berbunyi
   sama. */
function cpDescription(session,subjectId,studentId){
  requireActiveSubject(session,subjectId);
  const cp=cpAcuanFor(session,subjectId);
  if(!cp)return null;
  const student=studentOf(session,studentId);
  const {finalScore,kktp,rubric}=finalScoreOf(session,subjectId,studentId);
  /* SUMBER UTAMA adalah BUTIR CP AKTIF mata pelajaran ini - kompetensi yang memang diajarkan
     dan dinilai pada semester berjalan. */
  let butir=[];
  try{butir=listCpButirForSemester(session,subjectId);}catch{butir=[];}
  const dariButir=composeReportButirDescription({butir,finalScore,rubric});
  if(dariButir)
    return {text:dariButir,source:'CP_BUTIR',cpPhase:cp.phase,objectiveIds:null,
      butirIds:butir.map(item=>item.id),studentId:student.id,
      bestObjectiveId:null,improvementObjectiveId:null,finalScore,kktp};
  /* Mata pelajaran ini belum punya Butir CP: lingkup elemen CP dipakai supaya rapor tidak
     kosong. Nama mata pelajaran tetap tidak pernah disebut di dalam kalimat. */
  const text=composeReportCpDescription({cp,finalScore,rubric});
  if(!text)return null;
  return {text,source:'CP',cpPhase:cp.phase,objectiveIds:null,studentId:student.id,
    bestObjectiveId:null,improvementObjectiveId:null,finalScore,kktp};
}

export function generateReportDescription(session,subjectId,studentId,input){
  /* CP adalah sumber utama dan didahulukan tanpa syarat. */
  const dariCp=cpDescription(session,subjectId,studentId);
  if(dariCp)return dariCp;
  /* CADANGAN UNTUK MAPEL TANPA CP. Hanya sampai di sini bila mata pelajaran itu memang belum
     berlaku pada fase rombel atau elemennya belum diketahui. TP aktif dipakai apa adanya
     sehingga guru tetap tidak diminta memilih TP. */
  const objectiveIds=Array.isArray(input?.objectiveIds)&&input.objectiveIds.length
    ? input.objectiveIds
    : listActiveObjectives(session,subjectId).map(item=>item.id);
  if(objectiveIds.length)return objectiveDescription(session,subjectId,studentId,objectiveIds);
  const {bestObjectiveId,improvementObjectiveId}=input||{};
  const {student,best,improvement}=context(session,subjectId,studentId,bestObjectiveId,improvementObjectiveId);
  const text=best.id===improvement.id
    ? `Ananda ${student.name} menunjukkan capaian pada ${phrase(best.description)}.`
    : `Ananda ${student.name} sangat baik dalam ${phrase(best.description)}, serta perlu meningkatkan kemampuan dalam ${phrase(improvement.description)}.`;
  return {text,bestObjectiveId:best.id,improvementObjectiveId:improvement.id};
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
      const dibuat=generateReportDescription(session,subjectId,student.id,{});
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
  const generated=generateReportDescription(session,subjectId,studentId,input);const text=String(input?.text||'').trim().slice(0,1500);if(!text)throw new Error('Deskripsi rapor wajib diisi.');let saved;
  updateDb(db=>{const now=new Date().toISOString();saved={studentId,classId:session.classId,subjectId,semester:session.semester,academicYear:session.academicYear,text,bestObjectiveId:generated.bestObjectiveId,improvementObjectiveId:generated.improvementObjectiveId,...(generated.objectiveIds?{objectiveIds:generated.objectiveIds}:{}),status:text===generated.text?'AUTO':'EDITED',locked:false,createdAt:current?.createdAt||now,updatedAt:now};db.reportDescriptions[key(session,subjectId,studentId)]=saved;return db;});return clone(saved);
}

export function lockReportDescription(session,subjectId,studentId){
  const current=getReportDescription(session,subjectId,studentId);if(!current?.text)throw new Error('Simpan deskripsi sebelum menguncinya.');if(current.locked)return current;let locked;
  updateDb(db=>{locked={...current,locked:true,status:'LOCKED',updatedAt:new Date().toISOString()};db.reportDescriptions[key(session,subjectId,studentId)]=locked;return db;});return clone(locked);
}
