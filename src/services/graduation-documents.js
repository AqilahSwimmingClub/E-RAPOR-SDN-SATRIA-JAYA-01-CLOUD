import { phaseForClassId } from '../data/learning-objective-defaults.js';
import { getGraduationStatus, saveGraduationStatus } from './completeness.js';
import { getSchoolMaster } from './master.js';
import { formatIndonesianPrintDate } from './print-settings.js';
import { formatBirthPlaceDate, listStudents } from './students.js';
import { loadDb, updateDb } from './storage.js';
import { reportSubjectName } from './subjects.js';
import { getTranscriptRows, saveTranscriptScores } from './transcript.js';
import { readDiplomaNumber, saveDiplomaNumbers } from './transcript-admin.js';

/* TRANSKRIP - SKL - SKKB: SATU MESIN DATA UNTUK TIGA DOKUMEN.

   Ketiganya menerbitkan orang yang sama, dari sekolah yang sama, pada kelulusan yang sama.
   Karena itu tidak ada tiga model terpisah di sini: satu catatan per siswa per tahun pelajaran
   menyimpan apa yang memang HANYA milik dokumen - nomor suratnya, nomor peserta ujian, dan
   predikat kelakuan - sedangkan seluruh sisanya DIBACA dari sumber yang sudah ada:

     identitas sekolah, kepala sekolah, dan lambang daerah  -> Data Sekolah (masterData.school)
     identitas siswa                                        -> Data Siswa (students)
     daftar dan urutan mata pelajaran                       -> Mapping Mata Pelajaran aktif
     nilai                                                  -> transcriptScores
     nomor ijazah                                           -> settings.diplomaNumbers
     LULUS / TIDAK LULUS                                    -> graduationStatus

   Tidak ada satu pun identitas sekolah, nama daerah, nomor surat, atau lambang yang ditulis di
   dalam kode. Aplikasi ini dipakai banyak sekolah: begitu Admin mengubah Data Sekolah, ketiga
   dokumen ikut berubah pada cetakan berikutnya. */

export const CONDUCT_PREDICATES=Object.freeze(['Sangat Baik','Baik','Cukup']);
export const GRADUATION_DECISIONS=Object.freeze([
  {id:'GRADUATED',label:'LULUS'},
  {id:'NOT_GRADUATED',label:'TIDAK LULUS'},
]);

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=200){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function isoDate(value){const raw=clean(value,10);if(!raw)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw new Error('Tanggal harus memakai format YYYY-MM-DD.');const tanggal=new Date(`${raw}T00:00:00`);if(Number.isNaN(tanggal.getTime()))throw new Error('Tanggal dokumen tidak valid.');return raw;}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengelola TRANSKRIP-SKL-SKKB.');}
function yearOf(session){const year=clean(session?.academicYear,40);if(!year)throw new Error('Tahun pelajaran tidak ditemukan pada sesi aktif.');return year;}
function documentKey(academicYear,studentId){return `${academicYear}|${studentId}`;}
function teacherScope(session,classId){return {...session,role:'teacher',classId:clean(classId,10)||session.classId};}

/* ------------------------------------------------------------------ PENGATURAN PER TAHUN */

const SETTINGS_DEFAULT=Object.freeze({graduationDate:'',documentDate:'',documentCity:''});

export function getGraduationSettings(session){
  const year=yearOf(session);
  const school=getSchoolMaster();
  const saved=loadDb().graduationSettings?.[year];
  const graduationDate=clean(saved?.graduationDate,10);
  const documentDate=clean(saved?.documentDate,10);
  /* Kota penerbitan mengikuti kota rapor sekolah bila Admin belum mengisinya sendiri, sehingga
     sekolah yang sudah menyetel Tanggal Rapor tidak perlu mengetik kotanya dua kali. */
  const documentCity=clean(saved?.documentCity||school.reportCity||school.city,80);
  return {academicYear:year,graduationDate,documentDate,documentCity,
    graduationDateLabel:graduationDate?formatIndonesianPrintDate(graduationDate,''):'',
    documentDateLabel:documentDate?formatIndonesianPrintDate(documentDate,documentCity):'',
    updatedAt:saved?.updatedAt||''};
}

export function saveGraduationSettings(session,input){
  assertAdmin(session);
  const year=yearOf(session);
  const value={academicYear:year,
    graduationDate:isoDate(input?.graduationDate??SETTINGS_DEFAULT.graduationDate),
    documentDate:isoDate(input?.documentDate??SETTINGS_DEFAULT.documentDate),
    documentCity:clean(input?.documentCity,80),
    updatedAt:new Date().toISOString()};
  updateDb(db=>{if(!db.graduationSettings)db.graduationSettings={};db.graduationSettings[year]=value;return db;});
  return getGraduationSettings(session);
}

/* -------------------------------------------------------------- CATATAN DOKUMEN PER SISWA */

const EMPTY_RECORD=Object.freeze({transcriptNumber:'',sklNumber:'',skkbNumber:'',examNumber:'',conductPredicate:''});

function documentRecords(){const saved=loadDb().graduationDocuments;return saved&&typeof saved==='object'?saved:{};}

export function readStudentDocument(academicYear,studentId){
  const record=documentRecords()[documentKey(clean(academicYear,40),clean(studentId,120))];
  return {...EMPTY_RECORD,...(record?clone(record):{})};
}

export function getStudentDocument(session,studentId){return readStudentDocument(yearOf(session),studentId);}

export function listStudentDocuments(session){
  const year=yearOf(session);
  return Object.entries(documentRecords()).filter(([kunci])=>kunci.startsWith(`${year}|`)).map(([,record])=>clone(record));
}

function normalizePredicate(value){
  const predikat=clean(value,40);
  if(!predikat)return '';
  const cocok=CONDUCT_PREDICATES.find(item=>item.toLowerCase()===predikat.toLowerCase());
  if(!cocok)throw new Error(`Predikat SKKB harus salah satu dari ${CONDUCT_PREDICATES.join(', ')}.`);
  return cocok;
}

/* Nomor surat wajib unik dalam satu tahun pelajaran per jenis dokumen: dua siswa tidak boleh
   memegang nomor SKL yang sama. Pemeriksaannya menyertakan baris lain pada permintaan ini,
   bukan hanya yang sudah tersimpan, sehingga satu import berisi nomor kembar ikut tertahan. */
const NUMBER_FIELDS=Object.freeze([
  ['transcriptNumber','Nomor Transkrip'],
  ['sklNumber','Nomor SKL'],
  ['skkbNumber','Nomor SKKB'],
]);

export function saveStudentDocuments(session,records){
  assertAdmin(session);
  const year=yearOf(session);
  const daftar=(Array.isArray(records)?records:[]).map(item=>{
    const studentId=clean(item?.studentId,120);
    if(!studentId)throw new Error('Siswa dokumen kelulusan tidak valid.');
    return {studentId,
      transcriptNumber:clean(item?.transcriptNumber,80),
      sklNumber:clean(item?.sklNumber,80),
      skkbNumber:clean(item?.skkbNumber,80),
      examNumber:clean(item?.examNumber,60),
      conductPredicate:normalizePredicate(item?.conductPredicate)};
  });
  if(!daftar.length)return [];
  let saved;
  updateDb(db=>{
    if(!db.graduationDocuments)db.graduationDocuments={};
    const tersimpan=db.graduationDocuments;
    const dipakai=new Map(NUMBER_FIELDS.map(([field])=>[field,new Map()]));
    for(const [kunci,record] of Object.entries(tersimpan)){
      if(!kunci.startsWith(`${year}|`))continue;
      for(const [field] of NUMBER_FIELDS){
        const nomor=clean(record?.[field],80).toLowerCase();
        if(nomor)dipakai.get(field).set(nomor,record.studentId);
      }
    }
    const now=new Date().toISOString();
    saved=daftar.map(item=>{
      for(const [field,label] of NUMBER_FIELDS){
        const nomor=item[field].toLowerCase();
        if(!nomor)continue;
        const pemilik=dipakai.get(field).get(nomor);
        if(pemilik&&pemilik!==item.studentId)throw new Error(`${label} ${item[field]} sudah dipakai siswa lain pada tahun pelajaran ini.`);
        dipakai.get(field).set(nomor,item.studentId);
      }
      const kunci=documentKey(year,item.studentId);
      const lama=tersimpan[kunci];
      const record={...item,academicYear:year,createdAt:lama?.createdAt||now,updatedAt:now};
      tersimpan[kunci]=record;
      return record;
    });
    return db;
  });
  return clone(saved);
}

/* --------------------------------------------------------------------- PENYUSUN DOKUMEN */

/* Kop surat mengikuti daerah sekolah pengguna. Kata PEMERINTAH tidak diulang bila kolom
   Kabupaten/Kota sudah memuatnya, dan barisnya kosong bila daerah belum diisi Admin. */
export function regionHeading(school){
  const daerah=clean(school?.city,120);
  if(!daerah)return '';
  return /^pemerintah\b/i.test(daerah)?daerah.toUpperCase():`PEMERINTAH ${daerah.toUpperCase()}`;
}

/* Alamat kop disusun dari potongan yang memang terisi saja, sehingga sekolah yang belum
   melengkapi desa atau kecamatan tidak mencetak koma menggantung. */
export function schoolAddressLine(school){
  return [clean(school?.address,200),clean(school?.village,120)&&`Desa ${clean(school.village,120)}`,
    clean(school?.district,120)&&`Kec. ${clean(school.district,120)}`,clean(school?.postalCode,10)]
    .filter(Boolean).join(' ');
}

function averageScore(values){
  const valid=values.filter(value=>Number.isFinite(value));
  if(!valid.length)return null;
  return Math.round((valid.reduce((sum,value)=>sum+value,0)/valid.length+Number.EPSILON)*100)/100;
}

/* Status kelulusan hanya ada pada rombel kelas 6. Untuk rombel lain jawabannya null - bukan
   galat - supaya pratinjau tetap dapat dibuka dan menyebutkan apa yang belum ditetapkan. */
function graduationDecision(session,studentId){
  try{return getGraduationStatus(session,studentId);}
  catch{return null;}
}

function subjectRows(scope,studentId){
  return getTranscriptRows(scope,studentId).map((row,index)=>({
    number:index+1,
    subjectId:row.subject.id,
    name:reportSubjectName(row.subject.name),
    score:Number.isFinite(row.score)?row.score:null,
  }));
}

function baseDocument(session,classId,studentId){
  const scope=teacherScope(session,classId);
  const student=listStudents(scope,{classId:scope.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada rombel yang dipilih.');
  const school=getSchoolMaster();
  const settings=getGraduationSettings(session);
  const record=readStudentDocument(settings.academicYear,student.id);
  return {
    academicYear:settings.academicYear,
    classId:scope.classId,
    classLabel:`Kelas ${scope.classId}`,
    phase:phaseForClassId(scope.classId)||'',
    school:{...school,regionHeading:regionHeading(school),addressLine:schoolAddressLine(school)},
    student:{...clone(student),birthPlaceDate:formatBirthPlaceDate(student),
      genderLabel:student.gender==='L'?'Laki-Laki':student.gender==='P'?'Perempuan':''},
    settings,record,
    diplomaNumber:readDiplomaNumber(settings.academicYear,student.id)?.number||'',
    scope,
  };
}

export function buildTranscriptDocument(session,classId,studentId){
  const doc=baseDocument(session,classId,studentId);
  const rows=subjectRows(doc.scope,studentId);
  return {...doc,type:'TRANSKRIP',title:'TRANSKRIP NILAI',
    number:doc.record.transcriptNumber,rows,average:averageScore(rows.map(row=>row.score))};
}

export function buildSklDocument(session,classId,studentId){
  const doc=baseDocument(session,classId,studentId);
  const rows=subjectRows(doc.scope,studentId);
  const decision=graduationDecision(doc.scope,studentId);
  const status=decision?.status||'';
  return {...doc,type:'SKL',title:'SURAT KETERANGAN LULUS',
    number:doc.record.sklNumber,rows,average:averageScore(rows.map(row=>row.score)),
    status,statusLabel:GRADUATION_DECISIONS.find(item=>item.id===status)?.label||''};
}

export function buildSkkbDocument(session,classId,studentId){
  const doc=baseDocument(session,classId,studentId);
  return {...doc,type:'SKKB',title:'SURAT KETERANGAN KELAKUAN BAIK',
    number:doc.record.skkbNumber,
    examNumber:doc.record.examNumber,
    predicate:doc.record.conductPredicate};
}

/* =================================================== TEMPLATE DAN IMPORT SATU BARIS PER SISWA

   TEMPLATE TIDAK MEMINTA GURU MENGETIK ULANG APA PUN YANG SUDAH ADA DI DATABASE.

   NISN, NIS, dan Nama sudah terisi dan hanya berfungsi sebagai penunjuk baris - identitas
   sekolah, tempat/tanggal lahir, jenis kelamin, dan nama orang tua tidak ikut sama sekali,
   sebab dokumen membacanya sendiri dari Data Siswa. Yang diminta hanyalah data yang memang
   belum ada di mana pun: nomor surat, nomor peserta ujian, status kelulusan, predikat SKKB,
   dan nilai transkrip.

   KOLOM MATA PELAJARAN DIBANGKITKAN DARI MAPPING AKTIF, bukan dari daftar tetap. Sekolah dengan
   mapping berbeda mengunduh template dengan kolom yang berbeda pula, dalam urutan yang sama
   dengan Rapor dan lembar Transkrip. */

export const IMPORT_FIXED_HEADERS=Object.freeze([
  'NISN','NIS','Nama Siswa','Nomor Ijazah','Nomor Transkrip','Nomor SKL','Nomor SKKB',
  'No. Peserta Ujian','Status SKL','Predikat SKKB',
]);
const FIXED_FIELDS=Object.freeze(['nisn','nis','name','diplomaNumber','transcriptNumber','sklNumber','skkbNumber','examNumber','graduationStatus','conductPredicate']);
export const IMPORT_GUIDE='PETUNJUK: NISN, NIS, dan Nama hanya penunjuk baris - jangan diubah. Isi kolom yang diperlukan saja; kolom kosong tidak mengubah data tersimpan. Status SKL: LULUS atau TIDAK LULUS. Predikat SKKB: SANGAT BAIK, BAIK, atau CUKUP. Nilai mata pelajaran: angka 0 sampai 100.';

function importSubjects(scope){
  const students=listStudents(scope,{classId:scope.classId});
  /* Kolom mapel diambil dari mapping aktif rombel ini. Mapel agama mengikuti agama tiap siswa,
     jadi kolomnya adalah gabungan seluruh mapel yang benar-benar dipakai kelas ini - urutannya
     tetap urutan Mapping, sehingga sama dengan Rapor. */
  const terlihat=new Map();
  for(const student of students)
    for(const row of subjectRows(scope,student.id))
      if(!terlihat.has(row.subjectId))terlihat.set(row.subjectId,row.name);
  return [...terlihat].map(([id,name])=>({id,name}));
}

export function documentImportTemplate(session,classId){
  assertAdmin(session);
  const scope=teacherScope(session,classId);
  const students=listStudents(scope,{classId:scope.classId});
  const subjects=importSubjects(scope);
  const header=[...IMPORT_FIXED_HEADERS,...subjects.map(subject=>subject.name)];
  const rows=students.map(student=>{
    const record=readStudentDocument(yearOf(session),student.id);
    const status=graduationDecision(scope,student.id)?.status||'';
    const nilai=new Map(subjectRows(scope,student.id).map(row=>[row.subjectId,row.score]));
    return [student.nisn||'',student.nis||'',student.name,
      readDiplomaNumber(yearOf(session),student.id)?.number||'',
      record.transcriptNumber,record.sklNumber,record.skkbNumber,record.examNumber,
      GRADUATION_DECISIONS.find(item=>item.id===status)?.label||'',
      record.conductPredicate?record.conductPredicate.toUpperCase():'',
      ...subjects.map(subject=>{const value=nilai.get(subject.id);return Number.isFinite(value)?value:'';})];
  });
  return {sheetName:`TRANSKRIP-SKL-SKKB ${scope.classId}`,
    rows:[[IMPORT_GUIDE],[],header,...rows],
    columnWidths:[16,14,28,22,24,24,24,18,14,15,...subjects.map(()=>13)],
    subjects,studentCount:students.length};
}

function normalizeHeader(value){return String(value??'').replace(/^﻿/,'').trim().toLowerCase().replace(/\s+/g,' ');}
const FIXED_HEADER_LOOKUP=new Map(IMPORT_FIXED_HEADERS.map((label,index)=>[normalizeHeader(label),FIXED_FIELDS[index]]));

function importScore(value){
  const raw=String(value??'').trim();
  if(!raw)return null;
  const angka=Number(raw.replace(',','.'));
  if(!Number.isFinite(angka)||angka<0||angka>100)throw new Error('Nilai harus berupa angka 0 sampai 100.');
  return Math.round((angka+Number.EPSILON)*100)/100;
}
function importStatus(value){
  const raw=clean(value,40);
  if(!raw)return '';
  const cocok=GRADUATION_DECISIONS.find(item=>item.label.toLowerCase()===raw.toLowerCase()||item.id.toLowerCase()===raw.toLowerCase());
  if(!cocok)throw new Error('Status SKL harus LULUS atau TIDAK LULUS.');
  return cocok.id;
}

/* Preview memeriksa SELURUH baris lalu melaporkan setiap baris yang bermasalah beserta
   alasannya. Tidak ada baris yang dilewati diam-diam: selama masih ada satu baris tidak valid,
   tombol simpan tetap terkunci. */
export function previewDocumentImport(session,classId,table){
  assertAdmin(session);
  const scope=teacherScope(session,classId);
  const year=yearOf(session);
  const matrix=(Array.isArray(table)?table:[]).map(row=>Array.isArray(row)?row:[]);
  const headerIndex=matrix.findIndex(row=>row.some(cell=>normalizeHeader(cell)==='nisn'));
  if(headerIndex<0)throw new Error('Baris header tidak ditemukan. Gunakan template yang diunduh dari halaman ini.');
  const headerRow=matrix[headerIndex].map(normalizeHeader);
  const students=listStudents(scope,{classId:scope.classId});
  const subjectsByName=new Map();
  for(const student of students)
    for(const row of subjectRows(scope,student.id))
      subjectsByName.set(normalizeHeader(row.name),row.subjectId);

  const columns=headerRow.map(label=>{
    if(!label)return null;
    const tetap=FIXED_HEADER_LOOKUP.get(label);
    if(tetap)return {kind:'field',field:tetap};
    const subjectId=subjectsByName.get(label);
    if(subjectId)return {kind:'subject',subjectId,label};
    return {kind:'unknown',label};
  });
  const asing=columns.filter(column=>column?.kind==='unknown').map(column=>column.label);
  if(asing.length)throw new Error(`Kolom tidak dikenali: ${asing.join(', ')}. Mata pelajaran harus sesuai Mapping aktif rombel ini.`);
  if(!columns.some(column=>column?.kind==='field'&&column.field==='nisn'))throw new Error('Kolom NISN wajib ada pada template.');

  const olehNisn=new Map(students.filter(student=>student.nisn).map(student=>[clean(student.nisn,40),student]));
  const olehNis=new Map(students.filter(student=>student.nis).map(student=>[clean(student.nis,40),student]));
  const nomorTersimpan=new Map(NUMBER_FIELDS.map(([field])=>[field,new Map()]));
  for(const [kunci,record] of Object.entries(documentRecords())){
    if(!kunci.startsWith(`${year}|`))continue;
    for(const [field] of NUMBER_FIELDS){
      const nomor=clean(record?.[field],80).toLowerCase();
      if(nomor)nomorTersimpan.get(field).set(nomor,record.studentId);
    }
  }
  const terlihat=new Set();
  const rows=matrix.slice(headerIndex+1)
    .filter(row=>row.some(cell=>String(cell??'').trim()))
    .map((cells,index)=>{
      const raw={};const scores={};
      columns.forEach((column,position)=>{
        if(!column)return;
        const value=cells[position];
        if(column.kind==='field')raw[column.field]=value;
        else scores[column.subjectId]=value;
      });
      const errors=[];
      const nisn=clean(raw.nisn,40),nis=clean(raw.nis,40);
      const student=(nisn&&olehNisn.get(nisn))||(nis&&olehNis.get(nis))||null;
      if(!student)errors.push('Siswa tidak ditemukan pada rombel yang dipilih.');
      if(student){
        if(terlihat.has(student.id))errors.push('Siswa muncul lebih dari satu kali pada berkas ini.');
        terlihat.add(student.id);
      }
      const numbers={};
      for(const [field,label] of NUMBER_FIELDS){
        const nomor=clean(raw[field],80);
        numbers[field]=nomor;
        if(!nomor||!student)continue;
        const pemilik=nomorTersimpan.get(field).get(nomor.toLowerCase());
        if(pemilik&&pemilik!==student.id)errors.push(`${label} ${nomor} sudah dipakai siswa lain.`);
        else nomorTersimpan.get(field).set(nomor.toLowerCase(),student.id);
      }
      let graduationStatus='',conductPredicate='';
      try{graduationStatus=importStatus(raw.graduationStatus);}catch(error){errors.push(error.message);}
      try{conductPredicate=normalizePredicate(raw.conductPredicate);}catch(error){errors.push(error.message);}
      const nilai={};
      for(const [subjectId,value] of Object.entries(scores)){
        try{const angka=importScore(value);if(angka!==null)nilai[subjectId]=angka;}
        catch(error){errors.push(`${error.message} (kolom mata pelajaran)`);}
      }
      return {rowNumber:headerIndex+index+2,
        studentId:student?.id||'',studentName:student?.name||clean(raw.name,150),
        nisn:student?.nisn||nisn,nis:student?.nis||nis,
        diplomaNumber:clean(raw.diplomaNumber,60),
        transcriptNumber:numbers.transcriptNumber,sklNumber:numbers.sklNumber,skkbNumber:numbers.skkbNumber,
        examNumber:clean(raw.examNumber,60),graduationStatus,conductPredicate,scores:nilai,
        scoreCount:Object.keys(nilai).length,valid:errors.length===0,errors};
    });
  const invalidCount=rows.filter(row=>!row.valid).length;
  return {classId:scope.classId,rows,validCount:rows.length-invalidCount,invalidCount,
    canCommit:rows.length>0&&invalidCount===0,sourceRows:matrix};
}

/* Simpan hanya berjalan bila SELURUH baris valid, dan pemeriksaannya diulang dari sumber yang
   sama supaya preview yang sudah basi tidak dapat dipakai menyelundupkan data. */
export function commitDocumentImport(session,classId,preview){
  assertAdmin(session);
  if(!preview||!Array.isArray(preview.sourceRows))throw new Error('Preview import TRANSKRIP-SKL-SKKB tidak valid.');
  const checked=previewDocumentImport(session,classId,preview.sourceRows);
  if(!checked.canCommit)throw new Error(checked.rows.flatMap(row=>row.errors)[0]||'Import TRANSKRIP-SKL-SKKB tidak valid.');
  const scope=teacherScope(session,classId);
  const ringkas={students:0,scores:0,diplomas:0,statuses:0};
  const dokumen=[],ijazah=[];
  for(const row of checked.rows){
    ringkas.students+=1;
    dokumen.push({studentId:row.studentId,transcriptNumber:row.transcriptNumber,sklNumber:row.sklNumber,
      skkbNumber:row.skkbNumber,examNumber:row.examNumber,conductPredicate:row.conductPredicate});
    if(row.diplomaNumber)ijazah.push({studentId:row.studentId,number:row.diplomaNumber});
    if(row.scoreCount){saveTranscriptScores(scope,row.studentId,row.scores,{partial:true});ringkas.scores+=row.scoreCount;}
    if(row.graduationStatus){saveGraduationStatus(scope,row.studentId,row.graduationStatus);ringkas.statuses+=1;}
  }
  saveStudentDocuments(session,dokumen);
  if(ijazah.length){saveDiplomaNumbers(session,ijazah);ringkas.diplomas=ijazah.length;}
  return ringkas;
}
