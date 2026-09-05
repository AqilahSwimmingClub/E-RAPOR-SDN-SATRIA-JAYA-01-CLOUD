import { ASSESSMENT_TYPES, saveAssessmentScores } from './assessment.js';
import { getDailyAttendanceMode } from './report.js';
import { listStudents } from './students.js';
import { requireActiveSubject } from './subjects.js';

/* Bila studentId diisi, seluruh komponen nilai hanya masuk ke siswa tersebut dan nilai
   siswa lain tidak tersentuh. Tanpa studentId, pengisian berlaku untuk satu rombel. */
export function fillAllAssessmentScores(session,subjectId,value=80,{studentId=null,cpButirId=null}={}){
  requireActiveSubject(session,subjectId);
  const score=Number(value);
  if(!Number.isFinite(score)||score<0||score>100)throw new Error('Nilai massal harus berupa angka 0 sampai 100.');
  const classStudents=listStudents(session,{classId:session.classId});
  const students=studentId?classStudents.filter(student=>student.id===studentId):classStudents;
  if(studentId&&!students.length)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  const values=Object.fromEntries(students.map(student=>[student.id,score]));
  /* Isi Semua Nilai SELALU mengisi kelima komponen, termasuk Penilaian Harian - juga ketika
     Nilai Kehadiran sedang ON.

     Sebelumnya komponen Harian dilewati saat toggle ON, dan itu keliru: yang berpindah karena
     toggle bukanlah tempat penyimpanan nilainya, melainkan SUMBER yang dipakai saat menghitung
     Nilai Akhir. Nilai Harian manual tetap data milik guru; ia tetap ditulis, tetap tersimpan,
     dan langsung terpakai kembali begitu toggle dimatikan - tanpa guru diminta mengisinya ulang. */
  const dailyFromAttendance=getDailyAttendanceMode(session,subjectId);
  const savedTypes=[];
  /* Butir CP yang sedang dinilai ikut terbawa ke kelima komponen, sehingga nilai massal pun
     tetap punya keterangan kompetensi - bukan angka tanpa asal. */
  ASSESSMENT_TYPES.forEach(type=>{
    saveAssessmentScores(session,subjectId,type.id,values,{cpButirId});savedTypes.push(type.id);
  });
  /* `skippedTypes` dipertahankan sebagai array kosong supaya pemanggil lama tidak pecah. */
  return {subjectId,value:score,studentId,studentCount:students.length,dailyFromAttendance,savedTypes,skippedTypes:[]};
}
