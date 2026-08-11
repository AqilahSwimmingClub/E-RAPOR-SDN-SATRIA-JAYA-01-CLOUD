import { getClassCompletion } from './analytics.js';
import { getReportCompleteness } from './documents.js';
import { listMasterClasses } from './master.js';
import { listReferenceAcademicYears, listReferenceSemesters } from './references.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat melihat Status Penilaian seluruh rombel.');}
function percent(completed,total){return total?Math.round(completed/total*100):0;}

function scopeOf(session,{semester=session.semester,academicYear=session.academicYear}={}){
  assertAdmin(session);
  if(!listReferenceAcademicYears().some(item=>item.id===academicYear))throw new Error('Tahun pelajaran status penilaian tidak tersedia.');
  if(!listReferenceSemesters({academicYear}).some(item=>item.label===semester))throw new Error('Semester status penilaian tidak cocok dengan tahun pelajaran.');
  return {semester,academicYear};
}

function summarizeClass(session,classId,filters){
  const scope=scopeOf(session,filters);const teacherSession={...session,role:'teacher',classId,accountId:`teacher:${classId}`,...scope};
  const assessment=getClassCompletion(teacherSession);const report=getReportCompleteness(teacherSession);
  const scoreComplete=assessment.subjects.reduce((sum,item)=>sum+item.scoreComplete,0);const descriptionComplete=assessment.subjects.reduce((sum,item)=>sum+item.descriptionComplete,0);const total=assessment.subjectCount*assessment.studentCount;
  return {
    classId,semester:scope.semester,academicYear:scope.academicYear,studentCount:assessment.studentCount,subjectCount:assessment.subjectCount,
    scoreComplete,scoreTotal:total,scorePercentage:percent(scoreComplete,total),descriptionComplete,descriptionTotal:total,descriptionPercentage:percent(descriptionComplete,total),
    reportCompleteStudents:report.completeStudents,reportIncompleteStudents:report.incompleteStudents,reportCompletedItems:report.students.reduce((sum,item)=>sum+item.completed,0),reportTotalItems:report.students.reduce((sum,item)=>sum+item.total,0),reportPercentage:report.overallPercentage,
    status:report.studentCount>0&&report.status==='COMPLETE'?'COMPLETE':'INCOMPLETE',subjects:clone(assessment.subjects),students:clone(report.students),
  };
}

export function getAdminClassAssessmentStatus(session,classId,filters={}){
  if(!listMasterClasses().includes(classId))throw new Error('Rombel status penilaian tidak valid.');
  return summarizeClass(session,classId,filters);
}

export function getAdminAssessmentStatus(session,filters={}){
  const scope=scopeOf(session,filters);const classes=listMasterClasses().map(classId=>summarizeClass(session,classId,scope));
  const totalStudents=classes.reduce((sum,item)=>sum+item.studentCount,0);const scoreComplete=classes.reduce((sum,item)=>sum+item.scoreComplete,0);const scoreTotal=classes.reduce((sum,item)=>sum+item.scoreTotal,0);const descriptionComplete=classes.reduce((sum,item)=>sum+item.descriptionComplete,0);const descriptionTotal=classes.reduce((sum,item)=>sum+item.descriptionTotal,0);const reportCompletedItems=classes.reduce((sum,item)=>sum+item.reportCompletedItems,0);const reportTotalItems=classes.reduce((sum,item)=>sum+item.reportTotalItems,0);const completeClasses=classes.filter(item=>item.status==='COMPLETE').length;
  return {semester:scope.semester,academicYear:scope.academicYear,classes,classCount:classes.length,totalStudents,completeClasses,incompleteClasses:classes.length-completeClasses,scorePercentage:percent(scoreComplete,scoreTotal),descriptionPercentage:percent(descriptionComplete,descriptionTotal),reportPercentage:percent(reportCompletedItems,reportTotalItems)};
}
