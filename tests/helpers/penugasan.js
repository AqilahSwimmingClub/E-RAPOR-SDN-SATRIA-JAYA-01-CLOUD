import { setTeacherAssignment } from '../../src/services/teacher-assignments.js';
import { saveSubjectMapping as simpanMappingAsli } from '../../src/services/storage.js';

/* MAPPING LALU PENUGASAN — dua langkah Admin yang memang terpisah di aplikasi.

   Sejak penugasan menjadi satu-satunya sumber otorisasi, akun Guru yang belum ditugaskan tidak
   boleh menjalankan fungsi akademik apa pun. Diamnya Admin bukan izin.

   Test yang ingin menguji pekerjaan Guru karena itu harus menempatkan sekolah pada keadaan
   yang sama dengan sekolah yang sudah dikonfigurasi Admin: Mapping Mata Pelajaran diatur,
   LALU mapel itu ditugaskan kepada wali kelasnya. Pembantu ini menempuh keduanya sekaligus
   supaya maksud setiap test tetap terbaca, tanpa mengendurkan aturan otorisasi di aplikasi.

   Test yang justru menguji keadaan "belum ditugaskan" memakai saveSubjectMapping asli dari
   layanan storage, bukan pembantu ini. */
export function saveSubjectMapping(session,mapping){
  const hasil=simpanMappingAsli(session,mapping);
  if(session?.role==='teacher'&&session.classId){
    const admin={role:'admin',academicYear:session.academicYear,semester:session.semester,
      userName:'Admin Test'};
    const subjectIds=(Array.isArray(mapping)?mapping:[])
      .filter(item=>item?.active).map(item=>item.id);
    try{setTeacherAssignment(admin,session.classId,{subjectIds,active:true,
      reason:'penyiapan test'});}catch{/* periode belum lengkap: penugasan memang tidak berlaku */}
  }
  return hasil;
}

/* Penugasan eksplisit untuk test yang mengatur mapelnya sendiri. */
export function tugaskan(session,subjectIds,{active=true}={}){
  const admin={role:'admin',academicYear:session.academicYear,semester:session.semester,
    userName:'Admin Test'};
  return setTeacherAssignment(admin,session.classId,{subjectIds,active,reason:'penyiapan test'});
}
