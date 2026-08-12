import { RELIGION_SUBJECTS, isReligionSubject } from '../data/constants.js';
import { getSubjectMapping } from './storage.js';

function assertTeacherSession(session){
  if(!session || session.role!=='teacher' || !session.classId) throw new Error('Session Guru tidak valid.');
}

export function listActiveSubjects(session){
  assertTeacherSession(session);
  return getSubjectMapping(session)
    .filter(subject=>subject.active)
    .sort((a,b)=>(a.group==='A'?0:1)-(b.group==='A'?0:1)||a.order-b.order)
    .map(subject=>({...subject}));
}

export function requireActiveSubject(session,subjectId){
  const subject=listActiveSubjects(session).find(item=>item.id===subjectId);
  if(!subject) throw new Error('Mata pelajaran tidak aktif pada Mapping Mata Pelajaran scope ini.');
  return subject;
}

/* Agama siswa tidak pernah ditebak. Selama Data Siswa belum diisi, tidak ada mapel agama yang
   dipilihkan untuk siswa tersebut. Pemetaan agama ke mapel diambil dari RELIGION_SUBJECTS,
   sehingga menambah mapel agama baru cukup dengan menambah satu entri di sana. */
export function religionSubjectIdFor(student){
  const religion=String(student?.religion||'').trim().toLowerCase();
  if(!religion)return null;
  return Object.keys(RELIGION_SUBJECTS).find(id=>RELIGION_SUBJECTS[id].toLowerCase()===religion)||null;
}

/* Status pengisian agama siswa, dipakai Cek Kelengkapan untuk menuntun guru ke Data Siswa. */
export function hasStudentReligion(student){return Boolean(String(student?.religion||'').trim());}

/* Mapel agama yang tidak sesuai benar-benar dikeluarkan dari daftar, bukan disembunyikan CSS.
   Agama kosong maupun agama yang belum punya mapel khusus tidak menerima mapel agama sama
   sekali. Mapping global tidak disentuh sehingga seluruh mapel agama tetap tersedia untuk
   siswa lain, dan nilai agama yang terlanjur tersimpan tidak dihapus, hanya tidak ditampilkan. */
export function listSubjectsForStudent(session,student){
  const dipakai=religionSubjectIdFor(student);
  return listActiveSubjects(session).filter(subject=>!isReligionSubject(subject.id)||subject.id===dipakai);
}
