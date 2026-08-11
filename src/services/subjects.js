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
