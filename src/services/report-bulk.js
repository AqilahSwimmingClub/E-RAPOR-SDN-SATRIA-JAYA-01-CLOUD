import { generateAllReportDescriptions } from './descriptions.js';
import { saveAutomaticReportScores } from './report.js';
import { listStudents } from './students.js';
import { listActiveSubjects } from './subjects.js';

/* SIMPAN OTOMATIS SELURUH MATA PELAJARAN.

   AKAR MASALAH YANG DIPERBAIKI DI SINI. Versi sebelumnya memaksa jalur TP:

       const objectives=listActiveObjectives(session,subject.id);
       if(!objectives.length)throw new Error('Belum ada TP aktif untuk deskripsi.');
       const sumberDeskripsi={objectiveIds:objectives.map(item=>item.id)};

   Dua akibatnya nyata. Pertama, mata pelajaran yang tidak punya TP - dan sejak penilaian
   beralih ke Butir CP hampir semuanya begitu - GAGAL sebelum satu deskripsi pun tersimpan,
   sehingga guru menekan tombol lalu mendapati tidak ada yang berubah. Kedua, `objectiveIds`
   yang selalu dikirim membuat penyusun deskripsi mengambil jalur TP walaupun CP tersedia.

   Sekarang tidak ada satu pun rujukan TP di berkas ini. Deskripsi disusun dari Butir CP aktif
   mata pelajaran yang bersangkutan, dan setiap mata pelajaran diproses dengan subjectId-nya
   sendiri sehingga hasil satu mapel tidak pernah tertulis ke mapel lain.

   Kegagalan satu mata pelajaran tidak lagi menggagalkan yang lain: nilai tetap tersimpan dan
   kegagalan deskripsinya dilaporkan per siswa.

   DESKRIPSI DIBUAT OTOMATIS DI SINI, bukan menunggu guru membukanya satu per satu. Begitu Nilai
   Akhir sebuah mata pelajaran tersimpan, deskripsinya langsung disusun dan disimpan untuk
   seluruh murid yang memang punya nilai pada mata pelajaran itu.

   DUA PENJAGA YANG DISENGAJA:

   - MURID TANPA NILAI DILEWATI (`requireScore`). Deskripsi rapor menyatakan tingkat capaian,
     dan tingkat itu dibaca dari Nilai Akhir. Membuatkan kalimat untuk murid yang belum dinilai
     akan mengisi kolom rapor dengan sesuatu yang tampak sudah selesai padahal belum.
   - TULISAN GURU TIDAK DITIMPA. Deskripsi yang terkunci maupun yang sudah disunting sendiri
     oleh guru dipertahankan; keduanya dilaporkan sebagai dilewati, bukan sebagai kegagalan.

   Tombol "Generate Semua Siswa" pada halaman Nilai Rapor tetap ada dan tidak digantikan: ia
   adalah REGENERATE manual untuk satu mata pelajaran, dipakai ketika guru mengubah Butir CP
   atau nilai lalu ingin kalimatnya disusun ulang. */

export function saveAllAutomaticReports(session,{onProgress,overwriteEdited=false}={}){
  const subjects=listActiveSubjects(session);
  const students=listStudents(session,{classId:session.classId});
  const errors=[];
  let scoreCount=0;let descriptionCount=0;let completedSubjects=0;let skippedCount=0;
  const subjectsWithDescription=[];
  subjects.forEach((subject,index)=>{
    try{
      /* 1. NILAI AKHIR DULU. Deskripsi membaca Nilai Akhir, jadi ia harus sudah tersimpan. */
      const scores=saveAutomaticReportScores(session,subject.id);
      scoreCount+=scores.length;
      /* 2. LALU DESKRIPSINYA, otomatis. subject.id dikirim apa adanya - bukan indeks, bukan
         mapel aktif halaman - sehingga hasilnya selalu tersimpan pada mata pelajaran yang
         sedang diproses dan tidak pernah bocor ke mata pelajaran lain. */
      const hasil=generateAllReportDescriptions(session,subject.id,{overwriteEdited,requireScore:true});
      descriptionCount+=hasil.terisi;
      skippedCount+=hasil.dilewati.length;
      if(hasil.terisi)subjectsWithDescription.push(subject.id);
      for(const gagal of hasil.gagal)
        errors.push({subjectId:subject.id,subjectName:subject.name,
          studentId:gagal.studentId,studentName:gagal.name,message:gagal.alasan});
      completedSubjects+=1;
    }catch(error){
      errors.push({subjectId:subject.id,subjectName:subject.name,
        studentId:null,studentName:null,message:error.message});
    }
    onProgress?.({current:index+1,total:subjects.length,subjectId:subject.id,
      subjectName:subject.name,
      percentage:subjects.length?Math.round((index+1)/subjects.length*100):100});
  });
  return {subjectCount:subjects.length,studentCount:students.length,completedSubjects,
    scoreCount,descriptionCount,skippedCount,subjectsWithDescription,
    errors,success:errors.length===0};
}
