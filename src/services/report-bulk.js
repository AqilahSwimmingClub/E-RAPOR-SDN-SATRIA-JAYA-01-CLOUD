import { generateReportDescription, getReportDescription, saveReportDescription } from './descriptions.js';
import { listLearningObjectives } from './objectives.js';
import { saveAutomaticReportScores } from './report.js';
import { listStudents } from './students.js';
import { listActiveSubjects } from './subjects.js';

export function saveAllAutomaticReports(session,{onProgress}={}){
  const subjects=listActiveSubjects(session);const students=listStudents(session,{classId:session.classId});
  const errors=[];let scoreCount=0;let descriptionCount=0;let completedSubjects=0;
  subjects.forEach((subject,index)=>{
    try{
      const scores=saveAutomaticReportScores(session,subject.id);scoreCount+=scores.length;
      const objectives=listLearningObjectives(session,subject.id,{activeOnly:true});
      if(!objectives.length)throw new Error('Belum ada TP aktif untuk deskripsi.');
      students.forEach(student=>{
        try{
          if(getReportDescription(session,subject.id,student.id)?.locked)return;
          const generated=generateReportDescription(session,subject.id,student.id,{bestObjectiveId:objectives[0].id,improvementObjectiveId:(objectives[1]||objectives[0]).id});
          saveReportDescription(session,subject.id,student.id,{...generated,text:generated.text});descriptionCount+=1;
        }catch(error){errors.push({subjectId:subject.id,subjectName:subject.name,studentId:student.id,studentName:student.name,message:error.message});}
      });
      completedSubjects+=1;
    }catch(error){errors.push({subjectId:subject.id,subjectName:subject.name,studentId:null,studentName:null,message:error.message});}
    onProgress?.({current:index+1,total:subjects.length,subjectId:subject.id,subjectName:subject.name,percentage:subjects.length?Math.round((index+1)/subjects.length*100):100});
  });
  return {subjectCount:subjects.length,studentCount:students.length,completedSubjects,scoreCount,descriptionCount,errors,success:errors.length===0};
}
