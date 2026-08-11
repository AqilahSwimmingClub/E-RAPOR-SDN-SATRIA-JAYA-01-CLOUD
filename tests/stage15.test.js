import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveAttendance } from '../src/services/attendance.js';
import { createExtracurricular, saveHomeroomNote } from '../src/services/completeness.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { getDocumentIdentity, getLeger, getReportDocument, legerWorkbookBytes, legerWorkbookRows } from '../src/services/documents.js';
import { readWorkbookRows } from '../src/services/excel.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { getSchoolMaster, saveSchoolMaster } from '../src/services/master.js';
import { savePrintSettings } from '../src/services/print-settings.js';
import { saveManualReportScore } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { saveSubjectMapping } from '../src/services/storage.js';
import { saveStudentAttitude } from '../src/services/attitudes.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const teacher={role:'teacher',classId:'6A',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
function mapping(){const active=['mtk','agama','sunda'];return [...active.map(id=>SUBJECTS_DEFAULT.find(item=>item.id===id)),...SUBJECTS_DEFAULT.filter(item=>!active.includes(item.id))].map((item,index)=>({...item,active:active.includes(item.id),order:index+1}));}
function addStudent(index){return createStudent(teacher,{id:`stage15-${index}`,classId:'6A',nis:`19200101${index}`,nisn:`312788373${index}`,name:`Siswa Tahap ${index}`,gender:index%2?'L':'P',birthPlace:'Purwakarta',birthDate:'2012-12-01',parentName:'Muhammad Idrus',phone:'085775731525',address:'Kp. Gebang',photo:''});}
function describe(student,subjectId,index){const best=createLearningObjective(teacher,subjectId,{code:`TP-B-${subjectId}-${index}`,description:`memahami ${subjectId} dengan baik.`});const improve=createLearningObjective(teacher,subjectId,{code:`TP-I-${subjectId}-${index}`,description:`menerapkan ${subjectId} secara mandiri.`});return saveReportDescription(teacher,subjectId,student.id,generateReportDescription(teacher,subjectId,student.id,{bestObjectiveId:best.id,improvementObjectiveId:improve.id}));}
function fillStudent(student,index,scores){Object.entries(scores).forEach(([subjectId,value])=>{saveManualReportScore(teacher,subjectId,student.id,value);describe(student,subjectId,`${index}-${subjectId}`);});createExtracurricular(teacher,student.id,{name:'Pramuka Penggalang',predicate:'Baik',description:'Aktif mengikuti kegiatan kepramukaan.'});saveHomeroomNote(teacher,student.id,'Pertahankan semangat belajar.');}
function markSick(students){saveAttendance(teacher,'2026-08-10',Object.fromEntries(students.map(student=>[student.id,'Sakit'])));}

test('Leger Tahap 15 menyediakan NISN, NIS, total, rank, ketidakhadiran, serta nilai tertinggi dan terendah',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());
  const first=addStudent(1),second=addStudent(2);
  fillStudent(first,1,{mtk:90,agama:80,sunda:88});
  fillStudent(second,2,{mtk:70,agama:75,sunda:80});
  markSick([first,second]);
  const leger=getLeger(teacher);
  const rowFirst=leger.students.find(row=>row.student.id===first.id);
  const rowSecond=leger.students.find(row=>row.student.id===second.id);
  assert.equal(rowFirst.total,258);
  assert.equal(rowSecond.total,225);
  assert.equal(rowFirst.rank,1);
  assert.equal(rowSecond.rank,2);
  assert.equal(rowFirst.student.nisn,'3127883731');
  assert.equal(rowFirst.student.nis,'192001011');
  assert.equal(rowFirst.attendance.Sakit,1);
  assert.deepEqual(leger.subjectAverages.map(item=>item.highest),[90,80,88]);
  assert.deepEqual(leger.subjectAverages.map(item=>item.lowest),[70,75,80]);
  assert.equal(leger.academicYear,ACADEMIC_YEAR);
  assert.equal(leger.semesterNumber,1);
});

test('Rank leger memakai peringkat kembar untuk total nilai yang sama',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());
  const first=addStudent(1),second=addStudent(2),third=addStudent(3);
  fillStudent(first,1,{mtk:90,agama:90,sunda:90});
  fillStudent(second,2,{mtk:90,agama:90,sunda:90});
  fillStudent(third,3,{mtk:70,agama:70,sunda:70});
  markSick([first,second,third]);
  const ranks=new Map(getLeger(teacher).students.map(row=>[row.student.id,row.rank]));
  assert.equal(ranks.get(first.id),1);
  assert.equal(ranks.get(second.id),1);
  assert.equal(ranks.get(third.id),3);
});

test('Workbook leger mengikuti judul, identitas sekolah, dan baris rekap referensi',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());
  const student=addStudent(1);fillStudent(student,1,{mtk:90,agama:80,sunda:88});markSick([student]);
  const rows=legerWorkbookRows(teacher);
  assert.equal(rows[0][0],`LEGER NILAI RAPOR SISWA TAHUN PELAJARAN ${ACADEMIC_YEAR} GANJIL`);
  assert.deepEqual(rows[1],['SEKOLAH',':',getSchoolMaster().name]);
  assert.deepEqual(rows[2],['Kelas',':','Kelas 6A']);
  assert.deepEqual(rows[4].slice(0,4),['NO','NAMA SISWA','NISN','NIS']);
  assert.deepEqual(rows[4].slice(-6),['TOTAL','RATA-RATA','RANK','SAKIT','IZIN','ALPA']);
  assert.equal(rows[5][1],'Siswa Tahap 1');
  assert.equal(rows.at(-3)[0],'NILAI TERTINGGI');
  assert.equal(rows.at(-2)[0],'NILAI TERENDAH');
  assert.equal(rows.at(-1)[0],'RATA-RATA MAPEL');
  const bytes=legerWorkbookBytes(teacher);
  assert.equal(String.fromCharCode(...new Uint8Array(bytes).slice(0,2)),'PK');
  assert.equal(readWorkbookRows(bytes)[4][0],'NO');
});

test('Identitas sekolah lengkap tersimpan dan dipakai halaman Perlengkapan',()=>{
  useMemoryStorage();
  const defaults=getSchoolMaster();
  assert.equal(defaults.npsn,'20218098');
  assert.equal(defaults.registrationNumber,'101022205007');
  assert.equal(defaults.address,'Kp. Gebang');
  assert.equal(defaults.province,'Prov. Jawa Barat');
  const saved=saveSchoolMaster(admin,{npsn:'20218098',registrationNumber:'101022205007',address:'Kp. Gebang',village:'Satriajaya',district:'Kec. Tambun Utara',city:'Kab. Bekasi',province:'Prov. Jawa Barat',website:'',email:'sdnsatriajaya01tamara@gmail.com',principalName:'Misan, S.Pd',principalNip:'196604171992031008'});
  assert.equal(saved.village,'Satriajaya');
  assert.equal(saved.email,'sdnsatriajaya01tamara@gmail.com');
  assert.equal(getSchoolMaster().principalName,'Misan, S.Pd');
  assert.throws(()=>saveSchoolMaster(admin,{email:'bukan-email',principalName:'A',principalNip:'1'}),/email sekolah tidak valid/);
});

test('Identitas dokumen sama pada leger, cover, perlengkapan, dan rapor',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());
  saveSchoolMaster(admin,{npsn:'20218098',registrationNumber:'101022205007',address:'Kp. Gebang',village:'Satriajaya',district:'Kec. Tambun Utara',city:'Kab. Bekasi',province:'Prov. Jawa Barat',website:'',email:'sdnsatriajaya01tamara@gmail.com',principalName:'Misan, S.Pd',principalNip:'196604171992031008'});
  const student=addStudent(1);fillStudent(student,1,{mtk:90,agama:80,sunda:88});markSick([student]);
  savePrintSettings(teacher,{principalName:'Misan, S.Pd',principalNip:'196604171992031008',teacherName:'FAHMI DJAWAS, S.Pd',teacherNip:'199101232025211006',city:'Bekasi',printDate:'2026-12-22'});
  const identity=getDocumentIdentity(teacher);
  const document=getReportDocument(teacher,student.id);
  const leger=getLeger(teacher);
  assert.equal(identity.classLabel,'Kelas 6A');
  assert.equal(identity.semesterNumber,1);
  assert.equal(document.classLabel,identity.classLabel);
  assert.equal(document.semesterNumber,identity.semesterNumber);
  assert.equal(document.academicYear,identity.academicYear);
  assert.equal(document.master.school.name,leger.school.name);
  assert.equal(document.master.school.address,'Kp. Gebang');
  assert.equal(document.master.school.principalName,'Misan, S.Pd');
  assert.equal(document.master.teacher.name,'FAHMI DJAWAS, S.Pd');
  assert.equal(document.master.teacher.nip,'199101232025211006');
  assert.equal(document.printSettings.printDateLabel,'Bekasi, 22 Desember 2026');
});

test('Semester Genap dinomori 2 dan status akhir tetap tersedia',()=>{
  useMemoryStorage();
  const genap={...teacher,semester:`Genap ${ACADEMIC_YEAR}`};
  saveSubjectMapping(genap,mapping());
  assert.equal(getDocumentIdentity(genap).semesterNumber,2);
  assert.equal(getDocumentIdentity(teacher).semesterNumber,1);
});

test('Dokumen rapor membawa sikap, ekstrakurikuler, ketidakhadiran, dan catatan untuk cetak',()=>{
  useMemoryStorage();saveSubjectMapping(teacher,mapping());
  const student=addStudent(1);fillStudent(student,1,{mtk:90,agama:80,sunda:88});markSick([student]);
  saveStudentAttitude(teacher,student.id,'faith',{level:'Berkembang Sesuai Harapan'});
  const document=getReportDocument(teacher,student.id);
  assert.equal(document.attitudes.length,1);
  assert.match(document.attitudes[0].description,/dimensi/);
  assert.equal(document.extracurricular[0].name,'Pramuka Penggalang');
  assert.equal(document.attendance.Sakit,1);
  assert.equal(document.homeroomNote,'Pertahankan semangat belajar.');
  assert.deepEqual(document.subjects.map(row=>row.subject.group),['A','A','B']);
});

test('Halaman Cetak Nilai memuat tab Perlengkapan dan seluruh blok format referensi',()=>{
  const page=read('src/pages/print.js');
  assert.match(page,/data-tab="equipment"/);
  assert.match(page,/SEKOLAH DASAR/);
  assert.match(page,/KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH/);
  assert.match(page,/IDENTITAS PESERTA DIDIK/);
  assert.match(page,/KETERANGAN PINDAH SEKOLAH/);
  assert.match(page,/LAPORAN HASIL BELAJAR/);
  assert.match(page,/Deskripsi Capaian Profil Lulusan/);
  assert.match(page,/B\. Pengetahuan dan Keterampilan/);
  assert.match(page,/Tanggapan Orang Tua\/Wali Murid/);
  assert.match(page,/Tanpa Keterangan/);
  assert.match(page,/LEGER NILAI RAPOR SISWA TAHUN PELAJARAN/);
  assert.match(page,/NILAI TERTINGGI/);
});

test('Cetak dan Simpan PDF seluruh tab memakai satu jalur bridge lintas platform',()=>{
  const page=read('src/pages/print.js');
  const service=read('src/services/print-service.js');
  assert.match(page,/printCurrentDocument\(\{title:documentTitle\(label,student\),savePdf\}\)/);
  assert.equal(page.includes('window.print()'),false);
  assert.match(service,/desktopBridge\?\.printCurrent/);
  assert.match(service,/NativePrint\?\.printCurrentDocument/);
  assert.match(service,/globalThis\.print\(\)/);
});

test('Gaya cetak Tahap 15 memecah halaman dokumen dan menjaga tabel leger tetap tercetak',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/\.document-sheet\+\.document-sheet\{break-before:page/);
  assert.match(css,/\.leger-table-card\{display:block!important/);
  assert.match(css,/\.leger-table thead tr\+tr th\{writing-mode:vertical-rl/);
  assert.match(css,/\.leger-table th,\.leger-table td\{min-width:0!important[^}]*white-space:normal!important/);
});
