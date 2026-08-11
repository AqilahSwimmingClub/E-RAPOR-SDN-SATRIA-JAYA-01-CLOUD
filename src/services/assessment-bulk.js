import { ASSESSMENT_TYPES, saveAssessmentScores } from './assessment.js';
import { getDailyAttendanceMode } from './report.js';
import { listStudents } from './students.js';
import { requireActiveSubject } from './subjects.js';

export function fillAllAssessmentScores(session,subjectId,value=80){
  requireActiveSubject(session,subjectId);
  const score=Number(value);
  if(!Number.isFinite(score)||score<0||score>100)throw new Error('Nilai massal harus berupa angka 0 sampai 100.');
  const students=listStudents(session,{classId:session.classId});
  const values=Object.fromEntries(students.map(student=>[student.id,score]));
  const dailyFromAttendance=getDailyAttendanceMode(session,subjectId);
  const savedTypes=[];const skippedTypes=[];
  ASSESSMENT_TYPES.forEach(type=>{
    if(type.id==='daily'&&dailyFromAttendance){skippedTypes.push(type.id);return;}
    saveAssessmentScores(session,subjectId,type.id,values);savedTypes.push(type.id);
  });
  return {subjectId,value:score,studentCount:students.length,dailyFromAttendance,savedTypes,skippedTypes};
}
