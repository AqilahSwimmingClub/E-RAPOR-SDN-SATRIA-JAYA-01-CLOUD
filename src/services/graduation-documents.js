import { phaseForClassId } from '../data/learning-objective-defaults.js';
import { cellText } from './excel.js';
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
/* Data siswa dan nilai tetap berada pada scope rombel, sedangkan Mapping yang dilihat Admin
   berada pada scope ALL. Penanda ini membuat layanan transkrip memakai Mapping Admin sebagai
   sumber visibility tanpa mengubah kunci penyimpanan nilai historis. */
function teacherScope(session,classId){return {...session,role:'teacher',
  classId:clean(classId,10)||session.classId,adminContext:session?.role==='admin'||session?.adminContext===true};}
/* Status kelulusan hanya dimiliki kelas 6, sama seperti koleksi graduationStatus yang dipakai
   Rapor - jadi rombel lain tidak boleh menerimanya lewat pintu mana pun, termasuk import. */
function isGraduatingClass(classId){return Number.parseInt(String(classId||'').match(/^([1-6])/)?.[1]||'',10)===6;}

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

/* Status kelulusan hanya ada pada rombel kelas 6. Untuk rombel lain jawabannya null - bukan
   galat - supaya pratinjau tetap dapat dibuka dan menyebutkan apa yang belum ditetapkan. */
function graduationDecision(session,studentId){
  try{return getGraduationStatus(session,studentId);}
  catch{return null;}
}

function subjectRows(scope,studentId){
  return getTranscriptRows(scope,studentId).map((row,index)=>({
    number:Number(row.subject.order)||index+1,
    subjectId:row.subject.id,
    name:reportSubjectName(row.subject.name),
    parent:clean(row.subject.parent,80),
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
    number:doc.record.transcriptNumber,rows};
}

export function buildSklDocument(session,classId,studentId){
  const doc=baseDocument(session,classId,studentId);
  const rows=subjectRows(doc.scope,studentId);
  const decision=graduationDecision(doc.scope,studentId);
  const status=decision?.status||'';
  return {...doc,type:'SKL',title:'SURAT KETERANGAN LULUS',
    number:doc.record.sklNumber,rows,
    status,statusLabel:GRADUATION_DECISIONS.find(item=>item.id===status)?.label||''};
}

export function buildSkkbDocument(session,classId,studentId){
  const doc=baseDocument(session,classId,studentId);
  return {...doc,type:'SKKB',title:'SURAT KETERANGAN KELAKUAN BAIK',
    number:doc.record.skkbNumber,
    examNumber:doc.record.examNumber,
    predicate:doc.record.conductPredicate};
}

/* ------------------------------------------------------- SATU ROMBEL PENUH: CETAK SEMUA

   Penyusun tunggal untuk mode Cetak Semua. Ia memanggil penyusun satu siswa BERULANG dengan
   studentId masing-masing, jadi tidak ada satu pun nilai, nomor, status, atau predikat yang
   dapat menyeberang dari siswa yang tadi dipratinjau ke siswa berikutnya - satu-satunya jalan
   masuk ke tiap dokumen adalah id siswanya sendiri.

   Urutan siswa mengikuti listStudents, urutan yang sama dengan seluruh halaman lain. */
export const DOCUMENT_BUILDERS=Object.freeze({
  TRANSKRIP:buildTranscriptDocument,
  SKL:buildSklDocument,
  SKKB:buildSkkbDocument,
});

export function buildClassDocuments(session,classId,type){
  const builder=DOCUMENT_BUILDERS[type];
  if(!builder)throw new Error('Jenis dokumen kelulusan tidak dikenal.');
  const scope=teacherScope(session,classId);
  return listStudents(scope,{classId:scope.classId}).map(student=>builder(session,scope.classId,student.id));
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

/* ==================================== TEMPLATE NOMOR & STATUS DOKUMEN (TANPA NILAI)

   Halaman Nomor & Status Dokumen hanya mengurus nomor surat, nomor peserta ujian, status
   kelulusan, dan predikat kelakuan. Templatenya karena itu sengaja TIDAK memuat kolom mata
   pelajaran: yang mengisi biasanya operator sekolah yang sedang menyalin nomor dari buku
   induk, bukan guru yang sedang memasukkan nilai. Template lengkap dengan nilai tetap ada
   pada halaman Import Data & Nilai dan tidak diubah.

   TIDAK ADA PENYIMPANAN BARU. Seluruh hasil import ditulis lewat pintu yang sudah dipakai
   tombol Simpan pada halaman yang sama:

     Nomor Ijazah                  -> saveDiplomaNumbers   (settings.diplomaNumbers)
     Nomor Transkrip/SKL/SKKB,
     No. Peserta Ujian, Predikat   -> saveStudentDocuments (graduationDocuments)
     Status SKL                    -> saveGraduationStatus (graduationStatus)

   Dengan begitu apa pun yang masuk lewat Excel langsung terbaca Transkrip, SKL, dan SKKB. */

export const NUMBER_STATUS_HEADERS=Object.freeze([
  'No','NIS/NISN','Nama Siswa','No. Ijazah','No. Transkrip','No. SKL','No. SKKB',
  'No. Peserta Ujian','Status SKL','Predikat SKKB',
]);
/* Kolom yang isinya nomor dokumen - bukan bilangan - ditandai sebagai teks di berkas Excel
   supaya nol di depan tidak hilang dan nomor panjang tidak berubah menjadi notasi ilmiah. */
export const NUMBER_STATUS_TEXT_COLUMNS=Object.freeze([1,3,4,5,6,7]);
export const NUMBER_STATUS_GUIDE='PETUNJUK: kolom No, NIS/NISN, dan Nama Siswa hanya penunjuk baris - jangan diubah atau dihapus. Isi kolom yang diperlukan saja; kolom yang dikosongkan tidak mengubah data yang sudah tersimpan. Status SKL: LULUS atau TIDAK LULUS. Predikat SKKB: SANGAT BAIK, BAIK, atau CUKUP.';

/* Identitas di kepala berkas dibaca dari Data Sekolah dan sesi aktif, tidak pernah diketik
   di sini, sehingga sekolah mana pun mengunduh template dengan identitasnya sendiri. */
function numberStatusIdentity(session,classId){
  const school=getSchoolMaster(session)||{};
  return [
    ['Satuan Pendidikan',clean(school.name,150)],
    ['NPSN',clean(school.npsn,40)],
    ['Rombel',clean(classId,10)],
    ['Tahun Pelajaran',yearOf(session)],
  ];
}

export function numberStatusTemplate(session,classId){
  assertAdmin(session);
  const scope=teacherScope(session,classId);
  const year=yearOf(session);
  const students=listStudents(scope,{classId:scope.classId});
  const identitas=numberStatusIdentity(session,scope.classId);
  const rows=students.map((student,index)=>{
    const record=readStudentDocument(year,student.id);
    const status=graduationDecision(scope,student.id)?.status||'';
    return [index+1,
      clean(student.nisn||student.nis,40),
      clean(student.name,150),
      readDiplomaNumber(year,student.id)?.number||'',
      record.transcriptNumber,record.sklNumber,record.skkbNumber,record.examNumber,
      GRADUATION_DECISIONS.find(item=>item.id===status)?.label||'',
      record.conductPredicate?record.conductPredicate.toUpperCase():''];
  });
  return {
    sheetName:`NOMOR-STATUS ${scope.classId}`,
    fileName:`TEMPLATE-NOMOR-STATUS-DOKUMEN-${scope.classId}-${year.replace('/','-')}.xlsx`,
    rows:[[NUMBER_STATUS_GUIDE],[],
      ...identitas.map(([label,value])=>[`${label}`,value]),[],
      [...NUMBER_STATUS_HEADERS],...rows],
    columnWidths:[6,18,30,24,26,26,26,20,15,16],
    textColumns:[...NUMBER_STATUS_TEXT_COLUMNS],
    identity:identitas,studentCount:students.length,classId:scope.classId,academicYear:year};
}

const NUMBER_STATUS_FIELDS=Object.freeze(['no','identifier','name','diplomaNumber','transcriptNumber','sklNumber','skkbNumber','examNumber','graduationStatus','conductPredicate']);
const NUMBER_STATUS_LOOKUP=new Map(NUMBER_STATUS_HEADERS.map((label,index)=>[normalizeHeader(label),NUMBER_STATUS_FIELDS[index]]));

/* Preview memeriksa SELURUH baris lalu melaporkan tiap baris bermasalah beserta alasannya.
   Pencocokan siswa memakai NISN lalu NIS - identitas yang stabil dari Data Siswa - sehingga
   urutan baris di Excel boleh diacak tanpa membuat data masuk ke siswa yang salah. Nomor urut
   No sengaja TIDAK dipakai mencocokkan; ia hanya penanda bagi pembaca. */
export function previewNumberStatusImport(session,classId,table){
  assertAdmin(session);
  const scope=teacherScope(session,classId);
  const year=yearOf(session);
  const matrix=(Array.isArray(table)?table:[]).map(row=>Array.isArray(row)?row:[]);
  const headerIndex=matrix.findIndex(row=>row.some(cell=>normalizeHeader(cell)==='nis/nisn'));
  if(headerIndex<0)throw new Error('Baris header tidak ditemukan. Gunakan template yang diunduh dari halaman Nomor & Status Dokumen.');
  const headerRow=matrix[headerIndex].map(normalizeHeader);
  const columns=headerRow.map(label=>label?(NUMBER_STATUS_LOOKUP.get(label)||{unknown:label}):null);
  const asing=columns.filter(column=>column&&typeof column==='object'&&column.unknown).map(column=>column.unknown);
  if(asing.length)throw new Error(`Kolom tidak dikenali: ${asing.join(', ')}. Gunakan template tanpa mengubah judul kolom.`);
  if(!columns.includes('identifier'))throw new Error('Kolom NIS/NISN wajib ada pada template.');

  const students=listStudents(scope,{classId:scope.classId});
  const olehNisn=new Map(students.filter(student=>student.nisn).map(student=>[clean(student.nisn,40),student]));
  const olehNis=new Map(students.filter(student=>student.nis).map(student=>[clean(student.nis,40),student]));
  /* Nomor yang sudah dipakai siswa lain pada tahun ini tetap dijaga, sama seperti tombol Simpan. */
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
      const raw={};
      columns.forEach((column,position)=>{if(typeof column==='string')raw[column]=cells[position];});
      const errors=[];
      /* Seluruh nomor dibaca sebagai TEKS, termasuk bila Excel terlanjur menyimpannya
         sebagai bilangan - nomor panjang tidak boleh berubah menjadi notasi ilmiah. */
      const identifier=clean(cellText(raw.identifier),40);
      const student=(identifier&&(olehNisn.get(identifier)||olehNis.get(identifier)))||null;
      if(!identifier)errors.push('NIS/NISN kosong.');
      else if(!student)errors.push(`Siswa dengan NIS/NISN ${identifier} tidak ada pada rombel ini.`);
      if(student){
        if(terlihat.has(student.id))errors.push('Siswa muncul lebih dari satu kali pada berkas ini.');
        terlihat.add(student.id);
        /* Nama hanya rujukan tambahan: kalau berbeda jauh, kemungkinan barisnya salah tempel. */
        const nama=clean(cellText(raw.name),150);
        if(nama&&nama.toLowerCase()!==clean(student.name,150).toLowerCase())
          errors.push(`Nama "${nama}" tidak cocok dengan pemilik NIS/NISN ${identifier} (${student.name}).`);
      }
      const numbers={};
      for(const [field,label] of NUMBER_FIELDS){
        const nomor=clean(cellText(raw[field]),80);
        numbers[field]=nomor;
        if(!nomor||!student)continue;
        const pemilik=nomorTersimpan.get(field).get(nomor.toLowerCase());
        if(pemilik&&pemilik!==student.id)errors.push(`${label} ${nomor} sudah dipakai siswa lain.`);
        else nomorTersimpan.get(field).set(nomor.toLowerCase(),student.id);
      }
      let graduationStatus='',conductPredicate='';
      try{graduationStatus=importStatus(raw.graduationStatus);}catch(error){errors.push(error.message);}
      try{conductPredicate=normalizePredicate(raw.conductPredicate);}catch(error){errors.push(error.message);}
      /* Status kelulusan hanya berlaku bagi kelas 6, persis seperti tabelnya. */
      if(graduationStatus&&!isGraduatingClass(scope.classId))
        errors.push('Status SKL hanya berlaku untuk rombel kelas 6.');
      return {rowNumber:headerIndex+index+2,
        studentId:student?.id||'',studentName:student?.name||clean(cellText(raw.name),150),
        identifier,diplomaNumber:clean(cellText(raw.diplomaNumber),60),
        transcriptNumber:numbers.transcriptNumber,sklNumber:numbers.sklNumber,skkbNumber:numbers.skkbNumber,
        examNumber:clean(cellText(raw.examNumber),60),graduationStatus,conductPredicate,
        valid:errors.length===0,errors};
    });
  const invalidCount=rows.filter(row=>!row.valid).length;
  return {classId:scope.classId,academicYear:year,rows,
    validCount:rows.length-invalidCount,invalidCount,
    canCommit:rows.length>0&&invalidCount===0,sourceRows:matrix};
}

/* NOL PENYIMPANAN SEBAGIAN. Seluruh baris diperiksa ulang dari sumber yang sama lebih dulu;
   begitu ada satu baris tidak valid, fungsi ini berhenti SEBELUM menyentuh database sama
   sekali. Penulisannya sendiri dikumpulkan dahulu lalu dijalankan sekaligus, jadi tidak ada
   keadaan setengah tersimpan bila salah satu penulisan menolak di tengah jalan. */
export function commitNumberStatusImport(session,classId,preview){
  assertAdmin(session);
  if(!preview||!Array.isArray(preview.sourceRows))throw new Error('Preview import Nomor & Status Dokumen tidak valid.');
  const checked=previewNumberStatusImport(session,classId,preview.sourceRows);
  if(!checked.canCommit)throw new Error(checked.rows.flatMap(row=>row.errors)[0]||'Import Nomor & Status Dokumen tidak valid.');
  const scope=teacherScope(session,classId);
  const dokumen=checked.rows.map(row=>({studentId:row.studentId,
    transcriptNumber:row.transcriptNumber,sklNumber:row.sklNumber,skkbNumber:row.skkbNumber,
    examNumber:row.examNumber,conductPredicate:row.conductPredicate}));
  const ijazah=checked.rows.filter(row=>row.diplomaNumber).map(row=>({studentId:row.studentId,number:row.diplomaNumber}));
  const status=checked.rows.filter(row=>row.graduationStatus);
  saveStudentDocuments(session,dokumen);
  if(ijazah.length)saveDiplomaNumbers(session,ijazah);
  for(const row of status)saveGraduationStatus(scope,row.studentId,row.graduationStatus);
  return {students:dokumen.length,diplomas:ijazah.length,statuses:status.length,classId:checked.classId};
}
