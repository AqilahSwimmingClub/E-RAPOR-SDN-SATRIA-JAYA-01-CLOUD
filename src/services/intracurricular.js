import { composeActivityDescription } from '../data/activity-description.js';
import { CLASSES } from '../data/constants.js';
import { ACTIVITY_PREDICATES, getStudentIntracurricular, saveStudentIntracurricular } from './completeness.js';
import { listObjectivesForAssessment } from './learning-objectives.js';
import { ringkasObjectives } from './objective-summary.js';
import { listReferenceAcademicYears, listReferenceSemesters } from './references.js';
import { loadDb, updateDb } from './storage.js';
import { listStudents } from './students.js';
import { listActiveSubjects } from './subjects.js';

/* Layanan ini sengaja memakai koleksi sendiri (intracurricularActivities) dan tidak berbagi
   penyimpanan dengan Kokurikuler, supaya kedua daftar kegiatan tidak pernah saling menimpa. */

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=1500){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function newId(){return globalThis.crypto?.randomUUID?.()||`intracurricular-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function assertAdmin(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengelola Data Intrakurikuler.');}
function keyOf(record){return `${record.academicYear}|${record.semester}|${record.classId}|${record.id}`;}
function sameScope(a,b){return a.classId===b.classId&&a.semester===b.semester&&a.academicYear===b.academicYear;}

function normalize(session,input){
  assertAdmin(session);const name=clean(input?.name,150),classId=clean(input?.classId,4).toUpperCase(),semester=clean(input?.semester,40),academicYear=clean(input?.academicYear,20),description=clean(input?.description,1500);
  if(!name)throw new Error('Nama kegiatan wajib diisi.');
  if(!CLASSES.includes(classId))throw new Error('Rombel intrakurikuler tidak valid.');
  if(!listReferenceAcademicYears().some(item=>item.id===academicYear))throw new Error('Tahun pelajaran intrakurikuler tidak tersedia pada Data Referensi.');
  if(!listReferenceSemesters({academicYear}).some(item=>item.label===semester))throw new Error('Semester intrakurikuler tidak cocok dengan tahun pelajaran.');
  if(!description)throw new Error('Deskripsi kegiatan wajib diisi.');
  return {name,classId,semester,academicYear,description,active:input?.active!==false};
}

export function listIntracurricularActivities(session,{classId='ALL',semester='ALL',academicYear='ALL'}={}){
  assertAdmin(session);if(classId!=='ALL'&&!CLASSES.includes(classId))throw new Error('Filter rombel intrakurikuler tidak valid.');
  return Object.values(loadDb().intracurricularActivities||{}).filter(item=>(classId==='ALL'||item.classId===classId)&&(semester==='ALL'||item.semester===semester)&&(academicYear==='ALL'||item.academicYear===academicYear)).map(clone).sort((a,b)=>a.classId.localeCompare(b.classId,'id')||a.name.localeCompare(b.name,'id'));
}

/* Wali kelas tidak boleh mengubah master intrakurikuler, tetapi tetap perlu membacanya untuk
   mengisi nilai siswa. Fungsi ini membatasi bacaan pada rombel dan periode yang ditugaskan. */
export function listAssignedIntracurricularActivities(session){
  if(session?.role==='admin')return listIntracurricularActivities(session,{classId:'ALL',academicYear:session.academicYear,semester:session.semester}).filter(item=>item.active!==false);
  if(session?.role!=='teacher'||!session?.classId)throw new Error('Sesi tidak berwenang membaca Data Intrakurikuler.');
  return Object.values(loadDb().intracurricularActivities||{}).filter(item=>item.classId===session.classId&&item.academicYear===session.academicYear&&item.semester===session.semester&&item.active!==false).map(clone).sort((a,b)=>a.name.localeCompare(b.name,'id'));
}

export function createIntracurricularActivity(session,input){
  const value=normalize(session,input);let saved;
  updateDb(db=>{const records=Object.values(db.intracurricularActivities||{});if(records.some(item=>sameScope(item,value)&&item.name.toLowerCase()===value.name.toLowerCase()))throw new Error(`Kegiatan ${value.name} sudah tersedia pada scope yang sama.`);const now=new Date().toISOString();saved={...value,id:newId(),createdAt:now,updatedAt:now};db.intracurricularActivities[keyOf(saved)]=saved;return db;});return clone(saved);
}

export function updateIntracurricularActivity(session,id,input){
  const value=normalize(session,input);let saved;
  updateDb(db=>{const entry=Object.entries(db.intracurricularActivities||{}).find(([,item])=>item.id===id);if(!entry)throw new Error('Kegiatan intrakurikuler tidak ditemukan.');const records=Object.values(db.intracurricularActivities);if(records.some(item=>item.id!==id&&sameScope(item,value)&&item.name.toLowerCase()===value.name.toLowerCase()))throw new Error(`Kegiatan ${value.name} sudah tersedia pada scope yang sama.`);saved={...entry[1],...value,id,updatedAt:new Date().toISOString()};delete db.intracurricularActivities[entry[0]];db.intracurricularActivities[keyOf(saved)]=saved;return db;});return clone(saved);
}

export function deleteIntracurricularActivity(session,id){
  assertAdmin(session);let removed=false;updateDb(db=>{const entry=Object.entries(db.intracurricularActivities||{}).find(([,item])=>item.id===id);if(!entry)throw new Error('Kegiatan intrakurikuler tidak ditemukan.');delete db.intracurricularActivities[entry[0]];removed=true;return db;});return removed;
}


/* ------------------------------------------------- Tahap 8E: Mapel → TP → Predikat → Deskripsi

   Intrakurikuler memakai katalog TP yang sama dengan Penilaian Umum, tetapi pilihannya
   disimpan di dalam catatan intrakurikuler siswa sendiri. Tidak ada satu pun tulisan ke
   koleksi Penilaian Umum maupun Kokurikuler, sehingga ketiganya tidak pernah saling menimpa.

   Nilai Akhir mata pelajaran tidak tersentuh sama sekali: Intrakurikuler hanya menghasilkan
   predikat kegiatan dan deskripsi, persis seperti sebelumnya. Yang berubah hanyalah SUMBER
   isi kolom Kegiatan dan Keterangan pada tabel rapor yang bentuknya tetap. */

export const INTRACURRICULAR_PREDICATES=Object.freeze([...ACTIVITY_PREDICATES]);

function assertTeacherScope(session){
  if(session?.role!=='teacher'||!session?.classId)throw new Error('Sesi Guru tidak valid untuk Intrakurikuler.');
}

/* Mapel intrakurikuler adalah mapel aktif rombel yang memang punya TP pada fasenya. IPAS pada
   Fase A karena itu tidak muncul: pemerintah baru menempatkannya mulai Fase B. */
export function listIntracurricularSubjects(session){
  assertTeacherScope(session);
  return listActiveSubjects(session).filter(subject=>listIntracurricularObjectives(session,subject.id).length>0);
}

/* Pilihan TP Intrakurikuler HANYA berasal dari TP yang berstatus aktif pada menu Tujuan
   Pembelajaran. TP yang dinonaktifkan tidak pernah muncul sebagai pilihan baru. */
export function listIntracurricularObjectives(session,subjectId){
  try{return listObjectivesForAssessment(session,subjectId,{activeOnly:true});}catch{return [];}
}

/* TP yang pernah dipilih guru lalu dinonaktifkan di menu Tujuan Pembelajaran.

   Catatan lamanya TIDAK diubah maupun dihapus; TP seperti ini dikembalikan terpisah supaya
   halaman Intrakurikuler dapat menampilkannya apa adanya beserta keterangan bahwa statusnya
   sudah tidak aktif. Untuk input baru, TP ini tetap tidak boleh dipakai. */
export function listInactiveReferencedObjectives(session,subjectId,objectiveIds=[]){
  const dirujuk=[...new Set((Array.isArray(objectiveIds)?objectiveIds:[]).map(id=>String(id)))];
  if(!dirujuk.length)return [];
  let semua=[];
  try{semua=listObjectivesForAssessment(session,subjectId,{activeOnly:false});}catch{return [];}
  const aktif=new Set(listIntracurricularObjectives(session,subjectId).map(item=>item.id));
  return dirujuk
    .filter(id=>!aktif.has(id))
    .map(id=>semua.find(item=>item.id===id)||null)
    .filter(Boolean)
    .map(item=>({...item,active:false,inactive:true}));
}

/* Deskripsi disusun dari TP yang DIPILIH guru pada menu Intrakurikuler — bukan dari seluruh
   TP aktif — lalu diringkas memakai aturan yang sama dengan deskripsi rapor sehingga tidak ada
   kalimat TP yang ditempel mentah. */
export function composeIntracurricularDescription({studentName='',subjectName='',objectives=[],predicate='Baik'}={}){
  const fokus=ringkasObjectives(objectives||[]);
  const teks=composeActivityDescription({
    studentName,
    activityName:String(subjectName||'').trim(),
    detail:fokus,
    predicate,
    fallbackActivity:'kegiatan intrakurikuler',
  });
  /* Penyusun kalimat bersama tidak menutup bagian fokus dengan titik. Penutupnya ditambahkan
     di sini saja supaya Ekstrakurikuler dan Kokurikuler tetap berbunyi persis seperti semula. */
  return /[.!?]$/.test(teks)?teks:`${teks}.`;
}

/* Catatan lama hanya berisi nama kegiatan. Bentuk bacanya diseragamkan di sini supaya pemanggil
   tidak perlu tahu bedanya: mapel kosong menjadi null dan daftar TP menjadi array kosong. */
export function getStudentIntracurricularSelection(session,studentId){
  const record=getStudentIntracurricular(session,studentId);
  if(!record)return null;
  return {...record,subjectId:record.subjectId||null,objectiveIds:Array.isArray(record.objectiveIds)?[...record.objectiveIds]:[]};
}

export function saveStudentIntracurricularSelection(session,studentId,{subjectId,objectiveIds,predicate,description=''}={}){
  assertTeacherScope(session);
  const subject=listIntracurricularSubjects(session).find(item=>item.id===subjectId);
  if(!subject)throw new Error('Pilih mata pelajaran intrakurikuler yang aktif dan memiliki Tujuan Pembelajaran.');
  const tersedia=listIntracurricularObjectives(session,subject.id);
  const dipilih=[...new Set((Array.isArray(objectiveIds)?objectiveIds:[]).map(id=>String(id)))]
    .map(id=>tersedia.find(item=>item.id===id)||null);
  if(!dipilih.length||dipilih.some(item=>!item))
    throw new Error('Pilih Tujuan Pembelajaran yang tersedia pada mata pelajaran ini.');
  if(!INTRACURRICULAR_PREDICATES.includes(predicate))throw new Error('Predikat intrakurikuler tidak valid.');
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  const teks=String(description||'').trim()||composeIntracurricularDescription({
    studentName:student?.name||'',subjectName:subject.name,objectives:dipilih,predicate});
  const saved=saveStudentIntracurricular(session,studentId,{
    activity:subject.name,predicate,description:teks,
    subjectId:subject.id,objectiveIds:dipilih.map(item=>item.id),
  });
  return {...saved,subjectId:subject.id,objectiveIds:dipilih.map(item=>item.id)};
}
