import { loadDb, updateDb } from './storage.js';

/* Administrasi transkrip milik Admin: setting tampilan dan nomor ijazah. Keduanya disimpan di
   settings, terpisah dari transcriptScores, supaya nilai transkrip yang sudah diisi wali kelas
   tidak pernah ikut berubah saat Admin mengatur format atau memasukkan nomor ijazah. */

const DEFAULT_SETTINGS=Object.freeze({title:'Transkrip Nilai',identityGapMm:7,headerHeightMm:8,rowHeightMm:6,headerPercent:100});

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=200){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengelola administrasi transkrip.');}
function boundedNumber(value,min,max,fallback){const angka=Number(value);if(!Number.isFinite(angka))return fallback;return Math.min(max,Math.max(min,Math.round(angka)));}
function diplomaKey(academicYear,studentId){return `${academicYear}|${studentId}`;}

export function getTranscriptSettings(session){
  assertAdmin(session);
  const saved=loadDb().settings?.transcript;
  return {...DEFAULT_SETTINGS,...(saved||{})};
}

export function saveTranscriptSettings(session,input){
  assertAdmin(session);
  const value={
    title:clean(input?.title,120)||DEFAULT_SETTINGS.title,
    identityGapMm:boundedNumber(input?.identityGapMm,0,30,DEFAULT_SETTINGS.identityGapMm),
    headerHeightMm:boundedNumber(input?.headerHeightMm,4,30,DEFAULT_SETTINGS.headerHeightMm),
    rowHeightMm:boundedNumber(input?.rowHeightMm,3,20,DEFAULT_SETTINGS.rowHeightMm),
    headerPercent:boundedNumber(input?.headerPercent,50,100,DEFAULT_SETTINGS.headerPercent),
    updatedAt:new Date().toISOString()
  };
  updateDb(db=>{if(!db.settings)db.settings={};db.settings.transcript=value;return db;});
  return clone(value);
}

function diplomaRecords(){const saved=loadDb().settings?.diplomaNumbers;return saved&&typeof saved==='object'?saved:{};}

export function getDiplomaNumber(session,studentId){
  assertAdmin(session);
  const record=diplomaRecords()[diplomaKey(session.academicYear,clean(studentId,120))];
  return record?clone(record):null;
}

export function listDiplomaNumbers(session){
  assertAdmin(session);
  return Object.values(diplomaRecords()).filter(item=>item.academicYear===session.academicYear).map(clone).sort((a,b)=>a.number.localeCompare(b.number,'id'));
}

/* Nomor ijazah wajib unik dalam satu tahun pelajaran, baik terhadap nomor yang sudah tersimpan
   maupun terhadap baris lain pada permintaan yang sama. */
export function saveDiplomaNumbers(session,records){
  assertAdmin(session);
  const daftar=(Array.isArray(records)?records:[]).map(item=>({studentId:clean(item?.studentId,120),number:clean(item?.number,60)}));
  if(!daftar.length)return [];
  for(const item of daftar){
    if(!item.studentId)throw new Error('Siswa nomor ijazah tidak valid.');
    if(!item.number)throw new Error('Nomor ijazah wajib diisi.');
  }
  let saved;
  updateDb(db=>{
    if(!db.settings)db.settings={};
    const tersimpan=db.settings.diplomaNumbers&&typeof db.settings.diplomaNumbers==='object'?db.settings.diplomaNumbers:{};
    const dipakai=new Map();
    for(const record of Object.values(tersimpan)){
      if(record.academicYear===session.academicYear)dipakai.set(record.number.toLowerCase(),record.studentId);
    }
    const now=new Date().toISOString();
    saved=daftar.map(item=>{
      const kunci=item.number.toLowerCase();
      const pemilik=dipakai.get(kunci);
      if(pemilik&&pemilik!==item.studentId)throw new Error(`Nomor ijazah ${item.number} sudah dipakai siswa lain pada tahun pelajaran ini.`);
      dipakai.set(kunci,item.studentId);
      const lama=tersimpan[diplomaKey(session.academicYear,item.studentId)];
      const record={studentId:item.studentId,number:item.number,academicYear:session.academicYear,createdAt:lama?.createdAt||now,updatedAt:now};
      tersimpan[diplomaKey(session.academicYear,item.studentId)]=record;
      return record;
    });
    db.settings.diplomaNumbers=tersimpan;
    return db;
  });
  return clone(saved);
}

/* Pencocokan import memakai NISN lebih dulu, baru id siswa, sesuai urutan yang disepakati. */
export function previewDiplomaNumberImport(session,data){
  assertAdmin(session);
  const students=Object.values(loadDb().students||{}).filter(student=>student.academicYear===session.academicYear&&student.isActive!==false);
  const olehNisn=new Map(students.filter(student=>student.nisn).map(student=>[String(student.nisn).trim(),student]));
  const olehId=new Map(students.map(student=>[student.id,student]));
  const dipakai=new Map(Object.values(diplomaRecords()).filter(item=>item.academicYear===session.academicYear).map(item=>[item.number.toLowerCase(),item.studentId]));
  const rows=(Array.isArray(data)?data:[]).map((item,index)=>{
    const nisn=clean(item?.nisn,40),studentId=clean(item?.studentId,120),number=clean(item?.number,60);
    const student=(nisn&&olehNisn.get(nisn))||(studentId&&olehId.get(studentId))||null;
    const errors=[];
    if(!student)errors.push('Siswa tidak ditemukan pada tahun pelajaran aktif.');
    if(!number)errors.push('Nomor ijazah wajib diisi.');
    if(student&&number){
      const pemilik=dipakai.get(number.toLowerCase());
      if(pemilik&&pemilik!==student.id)errors.push(`Nomor ijazah ${number} sudah dipakai siswa lain.`);
      else dipakai.set(number.toLowerCase(),student.id);
    }
    return {rowNumber:index+1,studentId:student?.id||'',studentName:student?.name||'',nisn:student?.nisn||nisn,number,valid:!errors.length,errors};
  });
  const validCount=rows.filter(row=>row.valid).length;
  return {rows,validCount,invalidCount:rows.length-validCount,canCommit:validCount>0};
}
