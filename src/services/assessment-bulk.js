import { ASSESSMENT_TYPES, saveAssessmentScores } from './assessment.js';
import { getDailyAttendanceMode } from './report.js';
import { listStudents } from './students.js';
import { requireActiveSubject } from './subjects.js';

/* Bila studentId diisi, seluruh komponen nilai hanya masuk ke siswa tersebut dan nilai
   siswa lain tidak tersentuh. Tanpa studentId, pengisian berlaku untuk satu rombel. */
export function fillAllAssessmentScores(session,subjectId,value=80,{studentId=null}={}){
  requireActiveSubject(session,subjectId);
  const score=Number(value);
  if(!Number.isFinite(score)||score<0||score>100)throw new Error('Nilai massal harus berupa angka 0 sampai 100.');
  const classStudents=listStudents(session,{classId:session.classId});
  const students=studentId?classStudents.filter(student=>student.id===studentId):classStudents;
  if(studentId&&!students.length)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  const values=Object.fromEntries(students.map(student=>[student.id,score]));
  const dailyFromAttendance=getDailyAttendanceMode(session,subjectId);
  const savedTypes=[];const skippedTypes=[];
  ASSESSMENT_TYPES.forEach(type=>{
    if(type.id==='daily'&&dailyFromAttendance){skippedTypes.push(type.id);return;}
    saveAssessmentScores(session,subjectId,type.id,values);savedTypes.push(type.id);
  });
  return {subjectId,value:score,studentId,studentCount:students.length,dailyFromAttendance,savedTypes,skippedTypes};
}
