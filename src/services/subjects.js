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

/* Mapel agama yang dipakai bila agama siswa belum diisi pada Data Siswa. */
export const DEFAULT_RELIGION_SUBJECT='agama';

/* Satu siswa hanya boleh menerima SATU mapel agama, yaitu yang sesuai agamanya pada Data Siswa.
   Sebelumnya agama kosong membuat seluruh mapel aktif diloloskan, sehingga rapor memuat
   PAI BP dan PAK BP sekaligus. Agama yang belum punya mapel khusus juga jatuh ke mapel
   bawaan, bukan menampilkan keduanya. */
export function religionSubjectIdFor(student){
  const religion=String(student?.religion||'').trim().toLowerCase();
  return Object.keys(RELIGION_SUBJECTS).find(id=>RELIGION_SUBJECTS[id].toLowerCase()===religion)||DEFAULT_RELIGION_SUBJECT;
}

/* Mapel agama yang tidak sesuai benar-benar dikeluarkan dari daftar, bukan disembunyikan CSS.
   Mapping global tidak disentuh sehingga PAI BP dan PAK BP tetap tersedia untuk siswa lain. */
export function listSubjectsForStudent(session,student){
  const dipakai=religionSubjectIdFor(student);
  return listActiveSubjects(session).filter(subject=>!isReligionSubject(subject.id)||subject.id===dipakai);
}
