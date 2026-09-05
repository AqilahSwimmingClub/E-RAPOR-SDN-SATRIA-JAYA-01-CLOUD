import { semesterAttendanceRecap } from './attendance.js';
import { getGraduationStatus, getHomeroomNote, getPromotionStatus, getStudentCocurricular, listExtracurriculars, listStudentIntracurricular, intracurricularIncludedInReport } from './completeness.js';
import { listStudentAttitudes } from './attitudes.js';
import { getPrintSettings } from './print-settings.js';
import { getStoredReportRows } from './report.js';
import { listStudents } from './students.js';
import { isReportPublished } from './publications.js';
import { hasStudentReligion, listActiveSubjects, listSubjectsForStudent } from './subjects.js';
import { getSchoolMaster, getTeacherProfile } from './master.js';
import { createWorkbookBytes } from './excel.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(!session||session.role!=='teacher'||!session.classId)throw new Error('Session dokumen rapor tidak valid.');}
function semesterNumber(session){return String(session?.semester||'').startsWith('Genap ')?2:1;}
function average(values){const valid=values.filter(value=>Number.isFinite(value));return valid.length?Math.round((valid.reduce((sum,value)=>sum+value,0)/valid.length+Number.EPSILON)*100)/100:null;}
function gradeOf(classId){return Number.parseInt(String(classId||''),10);}
/* NIS dan NISN adalah data identitas: cukup salah satu terisi. Siswa yang NIS-nya belum
   terbit tetap dapat dinilai, dicetak, dan masuk seluruh dokumen. */
function identityComplete(student){return ['name','gender','birthPlace','birthDate','address'].every(field=>String(student[field]||'').trim())&&Boolean(String(student.nis||student.nisn||'').trim())&&Boolean(String(student.parentName||student.fatherName||student.motherName||'').trim());}

export function getLeger(session){
  assertTeacher(session);const students=listStudents(session,{classId:session.classId});const subjects=listActiveSubjects(session);const reportRows=getStoredReportRows(session);const attendance=semesterAttendanceRecap(session,{classId:session.classId});
  const rows=students.map(student=>{
    const scores=subjects.map(subject=>{const row=reportRows.find(item=>item.student.id===student.id&&item.subject.id===subject.id);return {subject,score:row?.scoreComplete?Number(row.score.finalScore):null};});
    const values=scores.map(item=>item.score).filter(Number.isFinite);const absence=attendance.students.find(item=>item.id===student.id);
    return {student,scores,average:average(scores.map(item=>item.score)),total:values.length?values.reduce((sum,value)=>sum+value,0):null,
      attendance:{Sakit:absence?.Sakit||0,Izin:absence?.Izin||0,Alpa:absence?.Alpa||0},completeCount:values.length};
  });
  const ranked=rows.map(row=>row.total).filter(total=>total!==null).sort((a,b)=>b-a);
  rows.forEach(row=>{row.rank=row.total===null?null:ranked.indexOf(row.total)+1;});
  const subjectAverages=subjects.map(subject=>{const values=rows.map(row=>row.scores.find(item=>item.subject.id===subject.id)?.score??null).filter(Number.isFinite);
    return {subject,average:average(values),highest:values.length?Math.max(...values):null,lowest:values.length?Math.min(...values):null};});
  return {students:rows,subjects,subjectAverages,classAverage:average(rows.flatMap(row=>row.scores.map(item=>item.score))),
    school:getSchoolMaster(),classId:session.classId,semester:session.semester,semesterNumber:semesterNumber(session),academicYear:session.academicYear};
}

export function legerWorkbookRows(session){
  const data=getLeger(session);const subjectNames=data.subjects.map(subject=>subject.name);
  const header=['NO','NAMA SISWA','NISN','NIS',...subjectNames,'TOTAL','RATA-RATA','RANK','SAKIT','IZIN','ALPA'];
  const body=data.students.map((row,index)=>[index+1,row.student.name,row.student.nisn,row.student.nis,...row.scores.map(item=>item.score??''),row.total??'',row.average??'',row.rank??'',row.attendance.Sakit,row.attendance.Izin,row.attendance.Alpa]);
  const pad=['','',''];
  return [
    [`LEGER NILAI RAPOR SISWA TAHUN PELAJARAN ${data.academicYear} ${String(data.semester).split(' ')[0].toUpperCase()}`],
    ['SEKOLAH',':',data.school.name],['Kelas',':',`Kelas ${data.classId}`],[],header,...body,
    ['NILAI TERTINGGI','','','',...data.subjectAverages.map(item=>item.highest??''),...pad],
    ['NILAI TERENDAH','','','',...data.subjectAverages.map(item=>item.lowest??''),...pad],
    ['RATA-RATA MAPEL','','','',...data.subjectAverages.map(item=>item.average??''),...pad],
  ];
}

export function legerWorkbookBytes(session){
  const data=getLeger(session);
  return createWorkbookBytes(`Leger ${data.classId}`,legerWorkbookRows(session),{columnWidths:[5,30,16,16,...data.subjects.map(()=>11),9,11,7,7,7,7]});
}

export function getDocumentIdentity(session){
  assertTeacher(session);const printSettings=getPrintSettings(session);const schoolMaster=getSchoolMaster();
  /* Foto profil guru hanya untuk antarmuka aplikasi. Foto tidak pernah ikut ke dokumen agar
     kertas Rapor, Cover, Perlengkapan, Leger, dan Transkrip tetap bersih sesuai format final. */
  const {photo:_fotoGuru,...teacherMaster}=getTeacherProfile(session.classId);
  return {
    school:{...schoolMaster,principalName:printSettings.principalName||schoolMaster.principalName,principalNip:printSettings.principalNip||schoolMaster.principalNip},
    teacher:{...teacherMaster,name:printSettings.teacherName||teacherMaster.name,nip:printSettings.teacherNip||teacherMaster.nip},
    printSettings,classId:session.classId,classLabel:`Kelas ${session.classId}`,
    semester:session.semester,semesterNumber:semesterNumber(session),academicYear:session.academicYear,
  };
}

function finalStatus(session,studentId){return gradeOf(session.classId)===6?getGraduationStatus(session,studentId):getPromotionStatus(session,studentId);}

/* Kelengkapan satu siswa dihitung dari data yang sudah disiapkan pemanggil, sehingga
   Preview Rapor satu siswa tidak perlu menghitung ulang seluruh rombel. */
function studentCompleteness(session,student,{reportRows,attendance}){
  const studentReports=reportRows.filter(row=>row.student.id===student.id);
  const studentAttendance=attendance.students.find(item=>item.id===student.id);
  const attendanceCount=studentAttendance?studentAttendance.Hadir+studentAttendance.Sakit+studentAttendance.Izin+studentAttendance.Alpa:0;
  /* Mapel agama disaring sesuai agama siswa, sehingga siswa Kristen tidak dinilai belum
     lengkap karena nilai Pendidikan Agama Islam kosong, dan sebaliknya. */
  const studentSubjects=listSubjectsForStudent(session,student);
  const studentSubjectIds=new Set(studentSubjects.map(item=>item.id));
  const relevanReports=studentReports.filter(row=>studentSubjectIds.has(row.subject.id));
  /* Ekstrakurikuler dan kokurikuler bersifat opsional sehingga tidak pernah menahan cetak.
     Agama wajib diisi lebih dulu karena menentukan mapel agama mana yang dipakai siswa. */
  const categories={identity:identityComplete(student),religion:hasStudentReligion(student),scores:studentSubjects.length>0&&relevanReports.filter(row=>row.scoreComplete).length===studentSubjects.length,descriptions:studentSubjects.length>0&&relevanReports.filter(row=>row.descriptionComplete).length===studentSubjects.length,attendance:attendanceCount>0,homeroomNote:Boolean(getHomeroomNote(session,student.id)?.text)};
  const labels={identity:'Identitas peserta didik',religion:'Agama belum diisi',scores:'Nilai seluruh mapel',descriptions:'Deskripsi seluruh mapel',attendance:'Absensi semester',homeroomNote:'Catatan wali kelas'};
  const missing=Object.entries(categories).filter(([,complete])=>!complete).map(([key])=>labels[key]);
  const completed=Object.values(categories).filter(Boolean).length;const total=Object.keys(categories).length;
  return {student,categories,missing,completed,total,percentage:Math.round(completed/total*100),status:missing.length?'INCOMPLETE':'COMPLETE'};
}

export function getReportCompleteness(session){
  assertTeacher(session);
  const students=listStudents(session,{classId:session.classId});
  const konteks={reportRows:getStoredReportRows(session),attendance:semesterAttendanceRecap(session,{classId:session.classId})};
  const rows=students.map(student=>studentCompleteness(session,student,konteks));
  const completedItems=rows.reduce((sum,row)=>sum+row.completed,0);const totalItems=rows.reduce((sum,row)=>sum+row.total,0);
  return {students:rows,studentCount:rows.length,completeStudents:rows.filter(row=>row.status==='COMPLETE').length,incompleteStudents:rows.filter(row=>row.status==='INCOMPLETE').length,overallPercentage:totalItems?Math.round(completedItems/totalItems*100):0,status:rows.length&&rows.every(row=>row.status==='COMPLETE')?'COMPLETE':'INCOMPLETE'};
}

/* INTRAKURIKULER RAPOR: satu baris per mata pelajaran yang benar-benar dinilai guru.

   Dokumen tidak pernah memilih salah satu catatan mewakili yang lain. Setiap catatan dicetak
   dengan nama mata pelajarannya sendiri, urut mengikuti urutan mapel murid itu, dan catatan
   milik mapel yang tidak diampu murid ini tidak ikut. Karena setiap baris membawa mapelnya
   sendiri, tidak ada jalur yang dapat menukar deskripsi IPAS menjadi Pendidikan Pancasila. */
function studentIntracurricularRows(session,studentId,subjectIds){
  const urutan=[...subjectIds];
  const posisi=id=>{const index=urutan.indexOf(id);return index<0?urutan.length:index;};
  return listStudentIntracurricular(session,studentId)
    .filter(record=>!record.subjectId||subjectIds.has(record.subjectId))
    /* YANG TIDAK DICENTANG TIDAK TAMPIL. Catatannya tetap tersimpan utuh - yang dibaca di sini
       hanyalah kehendak guru tentang apa yang layak dilaporkan. */
    .filter(record=>intracurricularIncludedInReport(record))
    .sort((a,b)=>posisi(a.subjectId||'')-posisi(b.subjectId||'')
      ||String(a.activity||'').localeCompare(String(b.activity||''),'id'))
    .map(record=>clone(record));
}

export function getReportDocument(session,studentId){
  assertTeacher(session);
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  const summary=studentCompleteness(session,student,{reportRows:getStoredReportRows(session),attendance:semesterAttendanceRecap(session,{classId:session.classId})});
  const studentSubjectIds=new Set(listSubjectsForStudent(session,summary.student).map(item=>item.id));
  const reportRows=getStoredReportRows(session).filter(row=>row.student.id===studentId&&studentSubjectIds.has(row.subject.id));const attendance=semesterAttendanceRecap(session,{classId:session.classId}).students.find(item=>item.id===studentId)||{Hadir:0,Sakit:0,Izin:0,Alpa:0};const extracurricular=listExtracurriculars(session,studentId);const cocurricular=getStudentCocurricular(session,studentId);const intracurricular=studentIntracurricularRows(session,studentId,studentSubjectIds);const attitudes=listStudentAttitudes(session,studentId).filter(item=>item.status!=='EMPTY');const homeroomNote=getHomeroomNote(session,studentId);const status=finalStatus(session,studentId);
  /* Tanpa keterangan "tidak diperlukan". Bila guru belum menentukan, bagian ini tidak dicetak. */
  const statusLabel=gradeOf(session.classId)===6
    ?(status?.status==='GRADUATED'?'Lulus':status?.status==='NOT_GRADUATED'?'Tidak Lulus':'')
    :(status?.status==='PROMOTED'?`Naik ke Kelas ${status.targetClass}`:status?.status==='RETAINED'?'Tinggal di kelas':'');
  const identity=getDocumentIdentity(session);const {school,teacher,printSettings}=identity;
  const published=isReportPublished(session,studentId,'report');
  return {session:clone(session),master:{school,teacher},printSettings,student:clone(summary.student),attitudes,published,
    classId:identity.classId,classLabel:identity.classLabel,semester:identity.semester,semesterNumber:identity.semesterNumber,academicYear:identity.academicYear,subjects:reportRows.map(row=>({subject:clone(row.subject),score:row.score?.finalScore??null,kktp:row.score?.kktp??null,masteryStatus:row.score?.masteryStatus??null,description:row.description?.text||''})),attendance:{Hadir:attendance.Hadir,Sakit:attendance.Sakit,Izin:attendance.Izin,Alpa:attendance.Alpa},extracurricular,cocurricular,intracurricular,homeroomNote:homeroomNote?.text||'',finalStatus:status?clone(status):null,finalStatusLabel:statusLabel,complete:summary.status==='COMPLETE',missing:clone(summary.missing),categories:clone(summary.categories),percentage:summary.percentage};
}

export function assertReportPrintable(session,studentId){const document=getReportDocument(session,studentId);if(!document.complete)throw new Error(`Rapor belum lengkap: ${document.missing.join(', ')}.`);return document;}
