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

/* Daftar mapel untuk satu siswa: mapel agama yang tidak sesuai agama siswa disaring keluar.
   Bila agama siswa belum diisi, seluruh mapel aktif tetap tampil seperti sebelumnya agar
   data lama tidak berubah perilakunya. */
export function listSubjectsForStudent(session,student){
  const subjects=listActiveSubjects(session);
  const religion=String(student?.religion||'').trim();
  if(!religion)return subjects;
  const cocok=Object.entries(RELIGION_SUBJECTS).filter(([,nama])=>nama.toLowerCase()===religion.toLowerCase()).map(([id])=>id);
  return subjects.filter(subject=>{
    if(!isReligionSubject(subject.id))return true;
    if(!cocok.length)return true;
    return cocok.includes(subject.id);
  });
}
