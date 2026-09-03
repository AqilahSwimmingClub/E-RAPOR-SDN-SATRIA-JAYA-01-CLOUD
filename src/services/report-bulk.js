import { generateReportDescription, getReportDescription, saveReportDescription } from './descriptions.js';
import { listActiveObjectives } from './learning-objectives.js';
import { saveAutomaticReportScores } from './report.js';
import { listStudents } from './students.js';
import { listActiveSubjects } from './subjects.js';

export function saveAllAutomaticReports(session,{onProgress}={}){
  const subjects=listActiveSubjects(session);const students=listStudents(session,{classId:session.classId});
  const errors=[];let scoreCount=0;let descriptionCount=0;let completedSubjects=0;
  subjects.forEach((subject,index)=>{
    try{
      const scores=saveAutomaticReportScores(session,subject.id);scoreCount+=scores.length;
      /* TP aktif dari menu Tujuan Pembelajaran menjadi satu-satunya sumber deskripsi. */
      const objectives=listActiveObjectives(session,subject.id);
      if(!objectives.length)throw new Error('Belum ada TP aktif untuk deskripsi.');
      const sumberDeskripsi={objectiveIds:objectives.map(item=>item.id)};
      students.forEach(student=>{
        try{
          if(getReportDescription(session,subject.id,student.id)?.locked)return;
          const generated=generateReportDescription(session,subject.id,student.id,sumberDeskripsi);
          saveReportDescription(session,subject.id,student.id,{...sumberDeskripsi,text:generated.text});descriptionCount+=1;
        }catch(error){errors.push({subjectId:subject.id,subjectName:subject.name,studentId:student.id,studentName:student.name,message:error.message});}
      });
      completedSubjects+=1;
    }catch(error){errors.push({subjectId:subject.id,subjectName:subject.name,studentId:null,studentName:null,message:error.message});}
    onProgress?.({current:index+1,total:subjects.length,subjectId:subject.id,subjectName:subject.name,percentage:subjects.length?Math.round((index+1)/subjects.length*100):100});
  });
  return {subjectCount:subjects.length,studentCount:students.length,completedSubjects,scoreCount,descriptionCount,errors,success:errors.length===0};
}
