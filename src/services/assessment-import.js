import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentScores } from './assessment.js';
import { createWorkbookBytes, readWorkbookRows } from './excel.js';
import { listStudents } from './students.js';
import { requireActiveSubject } from './subjects.js';

/* Template Nilai dibuat sama seperti Template Data Siswa: berkas unduhan sudah berisi seluruh
   siswa rombel aktif beserta nilai yang tersimpan, sehingga guru tinggal mengisi sel kosong
   lalu mengimpornya kembali. Baris informasi di atas header mengunci berkas pada tahun
   pelajaran, semester, rombel, dan mata pelajaran yang sedang dibuka supaya template mapel
   lain tidak bisa masuk ke mapel yang salah. */
export const ASSESSMENT_IDENTITY_HEADERS=['NIS','NISN','Nama'];
export const ASSESSMENT_ID_HEADER='ID Sistem (jangan diubah)';
export const ASSESSMENT_SCORE_HEADERS=ASSESSMENT_TYPES.map(type=>type.label);
export const ASSESSMENT_HEADERS=[...ASSESSMENT_IDENTITY_HEADERS,...ASSESSMENT_SCORE_HEADERS,ASSESSMENT_ID_HEADER];
const INFO_LABEL='Tahun Pelajaran';

function normalize(value){return String(value??'').trim();}
function headerKey(value){return normalize(value).toLowerCase().replace(/[_.-]+/g,' ').replace(/\s+/g,' ');}
function kunciNomor(value){return normalize(value).replace(/\s+/g,'').toUpperCase();}
const TYPE_BY_HEADER=new Map(ASSESSMENT_TYPES.map(type=>[headerKey(type.label),type.id]));
/* Penulisan pendek yang lazim dipakai guru tetap dikenali. */
[['formatif','formative'],['harian','daily'],['praktik','practice'],['sumatif lingkup materi','scopeSummative'],['sumatif lingkup','scopeSummative'],['sumatif akhir','semesterSummative'],['sumatif akhir semester','semesterSummative']]
  .forEach(([label,id])=>TYPE_BY_HEADER.set(label,id));

function infoRow(session,subject){
  return [`${INFO_LABEL}: ${session.academicYear}`,`Semester: ${session.semester}`,`Rombel: ${session.classId}`,`Mapel: ${subject.name}`,`Mapel ID: ${subject.id}`];
}

function sheetsOf(session,subjectId){
  return new Map(ASSESSMENT_TYPES.map(type=>[type.id,new Map(getAssessmentSheet(session,subjectId,type.id).rows.map(row=>[row.studentId,row.score]))]));
}

export function assessmentTemplateWorkbook(session,subjectId){
  const subject=requireActiveSubject(session,subjectId);
  const students=listStudents(session,{classId:session.classId});
  const nilai=sheetsOf(session,subjectId);
  const rows=students.map(student=>[
    student.nis,student.nisn,student.name,
    ...ASSESSMENT_TYPES.map(type=>{const score=nilai.get(type.id).get(student.id);return score===null||score===undefined?'':score;}),
    student.id,
  ]);
  return createWorkbookBytes('Nilai',[infoRow(session,subject),ASSESSMENT_HEADERS,...rows],{columnWidths:[14,18,30,12,12,12,20,18,38]});
}

export function assessmentTemplateFilename(session,subjectId){
  const subject=requireActiveSubject(session,subjectId);
  const bersih=value=>String(value||'').trim().replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase();
  return `TEMPLATE-NILAI-${bersih(session.classId)}-${bersih(subject.name)}-${bersih(String(session.semester).split(' ')[0])}-${bersih(session.academicYear)}.xlsx`;
}

function bacaInfo(rows){
  const gabungan=(rows[0]||[]).map(normalize).join(' | ');
  const ambil=label=>{const cocok=new RegExp(`${label}\\s*:\\s*([^|]+)`,'i').exec(gabungan);return cocok?cocok[1].trim():'';};
  return {academicYear:ambil('Tahun Pelajaran'),semester:ambil('Semester'),classId:ambil('Rombel'),subjectId:ambil('Mapel ID'),ada:Boolean(gabungan.trim())};
}

function cariHeader(rows){
  return rows.findIndex(row=>{
    const kunci=row.map(headerKey);
    return kunci.includes('nis')&&kunci.includes('nama')&&kunci.some(item=>TYPE_BY_HEADER.has(item));
  });
}

function bacaNilai(value){
  const teks=normalize(value);
  if(teks==='')return {score:null,error:null};
  const angka=Number(teks.replace(',','.'));
  if(!Number.isFinite(angka))return {score:null,error:`Nilai "${teks}" bukan angka.`};
  if(angka<0||angka>100)return {score:null,error:`Nilai ${angka} di luar rentang 0 sampai 100.`};
  return {score:Number(angka.toFixed(2)),error:null};
}

/* Siswa dicocokkan dengan ID sistem lebih dulu, lalu NISN, lalu NIS. Nomor kosong tidak pernah
   dipakai mencocokkan sehingga nilai siswa tidak mungkin masuk ke siswa lain, dan siswa yang
   belum punya NIS tetap dapat menerima nilai. */
export function matchAssessmentStudent(raw,students){
  const id=normalize(raw.studentId);
  if(id){const cocok=students.find(item=>item.id===id);if(cocok)return cocok;}
  const nisn=kunciNomor(raw.nisn);
  if(nisn){const cocok=students.find(item=>kunciNomor(item.nisn)===nisn);if(cocok)return cocok;}
  const nis=kunciNomor(raw.nis);
  if(nis){const cocok=students.find(item=>kunciNomor(item.nis)===nis);if(cocok)return cocok;}
  return null;
}

export function previewAssessmentImport(session,subjectId,data){
  const subject=requireActiveSubject(session,subjectId);
  const rows=Array.isArray(data)?data:readWorkbookRows(data);
  if(!rows.length)throw new Error('Berkas nilai kosong.');
  const info=bacaInfo(rows);
  if(info.ada){
    if(info.subjectId&&info.subjectId!==subjectId)throw new Error(`Berkas ini milik mata pelajaran ${info.subjectId}, bukan ${subjectId}. Pilih mapel yang sesuai lalu ulangi.`);
    if(info.classId&&info.classId.toUpperCase()!==String(session.classId).toUpperCase())throw new Error(`Berkas ini milik rombel ${info.classId}, bukan ${session.classId}.`);
    if(info.academicYear&&info.academicYear!==session.academicYear)throw new Error(`Berkas ini milik tahun pelajaran ${info.academicYear}.`);
    if(info.semester&&info.semester!==session.semester)throw new Error(`Berkas ini milik ${info.semester}.`);
  }
  const headerIndex=cariHeader(rows);
  if(headerIndex<0)throw new Error('Baris header template nilai tidak ditemukan. Unduh Template Nilai lalu isi berkas itu.');
  const headers=rows[headerIndex].map(headerKey);
  const kolom={nis:headers.indexOf('nis'),nisn:headers.indexOf('nisn'),name:headers.indexOf('nama'),
    studentId:headers.findIndex(item=>item.startsWith('id sistem'))};
  const komponen=ASSESSMENT_TYPES.map(type=>({type,column:headers.findIndex(item=>TYPE_BY_HEADER.get(item)===type.id)})).filter(item=>item.column>=0);
  if(!komponen.length)throw new Error('Tidak ada kolom komponen penilaian pada berkas.');
  const students=listStudents(session,{classId:session.classId});
  const sebelum=sheetsOf(session,subjectId);
  const dipakai=new Set();
  const daftar=rows.slice(headerIndex+1).filter(row=>row.some(cell=>normalize(cell)!=='')).map((cells,index)=>{
    const ambil=column=>column>=0?cells[column]:'';
    const raw={nis:normalize(ambil(kolom.nis)),nisn:normalize(ambil(kolom.nisn)),name:normalize(ambil(kolom.name)),studentId:normalize(ambil(kolom.studentId))};
    const errors=[];
    const student=matchAssessmentStudent(raw,students);
    if(!student)errors.push(`Siswa ${raw.name||raw.nis||raw.nisn||'tanpa identitas'} tidak ditemukan pada rombel ${session.classId}.`);
    else if(dipakai.has(student.id))errors.push('Siswa muncul lebih dari satu kali pada berkas.');
    if(student)dipakai.add(student.id);
    const scores={};let terisi=0,baru=0,diperbarui=0;
    komponen.forEach(({type,column})=>{
      const {score,error}=bacaNilai(cells[column]);
      if(error){errors.push(`${type.label}: ${error}`);return;}
      scores[type.id]=score;
      if(score===null)return;
      terisi+=1;
      const lama=student?sebelum.get(type.id).get(student.id)??null:null;
      if(lama===null)baru+=1;else if(lama!==score)diperbarui+=1;
    });
    return {rowNumber:headerIndex+index+2,studentId:student?.id||null,studentName:student?.name||raw.name||'—',
      nis:raw.nis,nisn:raw.nisn,scores,filledCount:terisi,newCount:baru,updatedCount:diperbarui,
      valid:errors.length===0,errors:[...new Set(errors)]};
  });
  const invalidCount=daftar.filter(row=>!row.valid).length;
  const valid=daftar.filter(row=>row.valid);
  return {sourceRows:rows,subjectId,subjectName:subject.name,classId:session.classId,semester:session.semester,academicYear:session.academicYear,
    components:komponen.map(item=>item.type.id),rows:daftar,studentCount:students.length,
    validCount:daftar.length-invalidCount,invalidCount,
    newScoreCount:valid.reduce((sum,row)=>sum+row.newCount,0),
    updatedScoreCount:valid.reduce((sum,row)=>sum+row.updatedCount,0),
    filledScoreCount:valid.reduce((sum,row)=>sum+row.filledCount,0),
    canCommit:daftar.length>0&&invalidCount===0};
}

/* Nilai ditulis lewat saveAssessmentScores yang sama dengan halaman Penilaian, sehingga hasil
   import langsung terbaca Input Nilai Rapor, Nilai Tersimpan, Rapor, dan Leger. Hanya komponen
   yang kolomnya ada di berkas yang disentuh; sel kosong berarti belum ada nilai, bukan nol. */
export function commitAssessmentImport(session,preview){
  if(!preview||!Array.isArray(preview.sourceRows))throw new Error('Preview import nilai tidak valid.');
  const checked=previewAssessmentImport(session,preview.subjectId,preview.sourceRows);
  if(!checked.canCommit)throw new Error(checked.rows.flatMap(row=>row.errors)[0]||'Berkas nilai belum valid.');
  const perKomponen=new Map(checked.components.map(id=>[id,{}]));
  checked.rows.forEach(row=>{
    checked.components.forEach(id=>{
      if(!Object.hasOwn(row.scores,id))return;
      perKomponen.get(id)[row.studentId]=row.scores[id];
    });
  });
  const hasil=[];
  perKomponen.forEach((values,id)=>{if(Object.keys(values).length)hasil.push(saveAssessmentScores(session,checked.subjectId,id,values));});
  return {subjectId:checked.subjectId,components:checked.components,sheets:hasil,
    studentCount:checked.rows.length,newScoreCount:checked.newScoreCount,updatedScoreCount:checked.updatedScoreCount};
}
