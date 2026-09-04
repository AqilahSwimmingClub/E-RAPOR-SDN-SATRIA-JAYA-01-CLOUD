import { composeActivityDescription } from '../data/activity-description.js';
import { CLASSES } from '../data/constants.js';
import { composeIntracurricularButirDescription, composeIntracurricularCpDescription, cpAcuanFor,
  cpAlasanTidakTersedia, JENIS_INTRAKURIKULER, jenisIntrakurikuler,
  jenisIntrakurikulerValid } from './cp-descriptions.js';
import { cpButirAvailable, listCpButirForSemester, semesterNumberOf } from './cp-butir.js';
import { ACTIVITY_PREDICATES, getStudentIntracurricular, saveStudentIntracurricular } from './completeness.js';
import { listObjectivesForAssessment, resolveObjective } from './learning-objectives.js';
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

/* Mapel intrakurikuler adalah mapel aktif rombel yang memang mempunyai CP pada fase rombel itu.
   IPAS pada Fase A karena itu tidak muncul, begitu pula Koding & KA di kelas 1-4: pemerintah
   memang belum menempatkannya pada fase tersebut.

   Sejak Intrakurikuler beralih ke CP, ketersediaan TP tidak lagi menjadi syarat. Guru tidak
   perlu menyiapkan TP lebih dulu hanya untuk dapat mengisi Intrakurikuler. */
export function listIntracurricularSubjects(session){
  assertTeacherScope(session);
  return listActiveSubjects(session).filter(subject=>Boolean(cpAcuanFor(session,subject.id)));
}

/* Butir CP semester berjalan untuk satu mata pelajaran. Halaman Intrakurikuler menampilkannya
   supaya guru tahu kompetensi apa saja yang menjadi dasar deskripsi. */
export function listIntracurricularButir(session,subjectId){
  assertTeacherScope(session);
  try{return listCpButirForSemester(session,subjectId);}catch{return [];}
}

/* Acuan CP satu mata pelajaran beserta alasannya bila tidak tersedia. Halaman memakai ini untuk
   menyatakan keadaan sebenarnya, bukan menyembunyikan mapel tanpa penjelasan. */
export function getIntracurricularCp(session,subjectId){
  assertTeacherScope(session);
  const cp=cpAcuanFor(session,subjectId);
  return cp?{...cp,available:true,reason:null}
    :{available:false,reason:cpAlasanTidakTersedia(session,subjectId),elements:[],phase:null};
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
  const aktif=new Set(listIntracurricularObjectives(session,subjectId).map(item=>item.id));
  return dirujuk
    .filter(id=>!aktif.has(id))
    .map(id=>{try{return resolveObjective(session,subjectId,id);}catch{return null;}})
    .filter(Boolean)
    .map(item=>({...item,active:false,inactive:true}));
}

/* ================================================================= ALUR INTRAKURIKULER

   Pilih siswa -> pilih SATU ATAU BEBERAPA Butir CP aktif -> pilih TEORI atau PRAKTIK ->
   pilih PREDIKAT -> deskripsi tersusun.

   TIDAK ADA INPUT ANGKA di jalur ini. Intrakurikuler menghasilkan PREDIKAT dan DESKRIPSI;
   Nilai Akhir mata pelajaran tetap milik lima komponen penilaian yang sudah berjalan dan tidak
   pernah disentuh dari sini.

   SATU PENILAIAN = SATU PREDIKAT, berapa pun butir yang dipilih. Guru yang memilih tiga butir
   tidak diminta tiga predikat; ketiganya adalah kompetensi yang ditunjukkan pada penilaian yang
   sama, dan deskripsinya meringkas ketiganya menjadi satu kalimat. */

export { JENIS_INTRAKURIKULER, jenisIntrakurikuler, jenisIntrakurikulerValid };
export const DEFAULT_JENIS_INTRAKURIKULER='teori';

/* Butir CP yang boleh dipilih: HANYA yang aktif. Butir nonaktif tidak pernah ditawarkan,
   sehingga tidak mungkin ikut ke dalam deskripsi. */
function butirAktif(session,subjectId){
  try{return listCpButirForSemester(session,subjectId);}catch{return [];}
}

/* Menyaring pilihan guru terhadap butir yang benar-benar aktif. Id yang tidak dikenal atau
   sudah nonaktif dibuang di sini - bukan dilaporkan sebagai kompetensi yang dikuasai anak. */
function butirTerpilih(session,subjectId,butirIds){
  const aktif=butirAktif(session,subjectId);
  const diminta=[...new Set((Array.isArray(butirIds)?butirIds:[]).map(id=>String(id)))];
  if(!diminta.length)return [];
  const peta=new Map(aktif.map(item=>[item.id,item]));
  return diminta.map(id=>peta.get(id)).filter(Boolean);
}

function jenisBersih(nilai){
  const teks=String(nilai||'').trim().toLowerCase();
  return jenisIntrakurikulerValid(teks)?teks:DEFAULT_JENIS_INTRAKURIKULER;
}

/* Deskripsi Intrakurikuler. Sumbernya PERSIS butir yang dipilih guru, jenis penilaian, dan
   predikat - tidak ada yang lain. Penyusun deskripsi Nilai Rapor tidak pernah dipanggil dari
   sini: keduanya boleh membaca kompetensi yang sama, tetapi kalimatnya harus berbeda. */
export function composeIntracurricularDescriptionFromCp(session,{subjectId='',butirIds=[],
  jenis=DEFAULT_JENIS_INTRAKURIKULER,predicate='Baik'}={}){
  return susunDeskripsiIntra(session,{subjectId,butirIds,jenis,predicate});
}

function susunDeskripsiIntra(session,{subjectId='',butirIds=[],jenis=DEFAULT_JENIS_INTRAKURIKULER,
  predicate='Baik'}={}){
  const pilihan=jenisBersih(jenis);
  const butir=butirTerpilih(session,subjectId,butirIds);
  const dariButir=composeIntracurricularButirDescription({butir,jenis:pilihan,predicate});
  if(dariButir)return dariButir;
  /* Guru belum memilih satu butir pun - atau mata pelajaran ini memang belum punya butir.
     Lingkup kompetensi elemen CP dipakai supaya kalimatnya tetap benar, bukan kolom kosong. */
  const cp=cpAcuanFor(session,subjectId);
  return composeIntracurricularCpDescription({cp,jenis:pilihan,predicate});
}

/* Bentuk lama berbasis TP dipertahankan supaya catatan dan pemanggil lama tetap berjalan.
   Alur Intrakurikuler yang baru tidak memakainya lagi. */
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

/* Catatan Intrakurikuler satu murid pada SATU mata pelajaran.

   `subjectId` wajib disebut pemanggil yang peduli mapel. Tanpa itu, yang dikembalikan adalah
   catatan terakhir murid - bentuk lama yang dipertahankan untuk dokumen rapor. */
export function getStudentIntracurricularSelection(session,studentId,subjectId=''){
  const record=getStudentIntracurricular(session,studentId,subjectId);
  if(!record)return null;
  return {...record,
    subjectId:record.subjectId||null,
    butirIds:Array.isArray(record.butirIds)?[...record.butirIds]:[],
    jenis:jenisIntrakurikulerValid(record.jenis)?record.jenis:DEFAULT_JENIS_INTRAKURIKULER,
    objectiveIds:Array.isArray(record.objectiveIds)?[...record.objectiveIds]:[]};
}

/* Menyimpan Intrakurikuler satu murid pada SATU mata pelajaran.

   Kuncinya memuat mata pelajaran, jadi menyimpan IPAS tidak pernah menyentuh catatan Pancasila
   murid yang sama. Semester tidak pernah diminta: ia sudah terbawa scopeKey dari semester
   aplikasi yang sedang aktif. */
export function saveStudentIntracurricularSelection(session,studentId,{subjectId,butirIds=[],
  jenis=DEFAULT_JENIS_INTRAKURIKULER,predicate,description='',objectiveIds=[]}={}){
  assertTeacherScope(session);
  const subject=listActiveSubjects(session).find(item=>item.id===subjectId);
  if(!subject)throw new Error('Pilih mata pelajaran intrakurikuler yang aktif pada rombel ini.');
  const cp=cpAcuanFor(session,subject.id);
  if(!cp)throw new Error(cpAlasanTidakTersedia(session,subject.id)||'CP mata pelajaran ini belum tersedia pada fase rombel aktif.');
  if(!INTRACURRICULAR_PREDICATES.includes(predicate))throw new Error('Predikat intrakurikuler tidak valid.');
  const pilihanJenis=jenisBersih(jenis);
  const butir=butirTerpilih(session,subject.id,butirIds);
  const otomatis=susunDeskripsiIntra(session,{subjectId:subject.id,
    butirIds:butir.map(item=>item.id),jenis:pilihanJenis,predicate});
  const teks=String(description||'').trim()||otomatis;
  if(!teks)throw new Error('Deskripsi intrakurikuler tidak dapat disusun karena CP belum tersedia.');
  /* Rujukan TP lama dipertahankan apa adanya supaya riwayat catatan tidak putus. */
  const rujukanTp=[...new Set((Array.isArray(objectiveIds)?objectiveIds:[]).map(id=>String(id)))];
  const saved=saveStudentIntracurricular(session,studentId,{
    activity:subject.name,predicate,description:teks,
    subjectId:subject.id,butirIds:butir.map(item=>item.id),jenis:pilihanJenis,
    objectiveIds:rujukanTp,
    cpPhase:cp.phase,source:'CP',cpButir:cpButirAvailable(session,subject.id),
    status:teks===otomatis?'AUTO':'EDITED',
  });
  return {...saved,subjectId:subject.id,butirIds:butir.map(item=>item.id),jenis:pilihanJenis,
    objectiveIds:rujukanTp,cpPhase:cp.phase,source:'CP',
    semesterNumber:semesterNumberOf(session)};
}

/* ------------------------------------------------------- ISI OTOMATIS SEMUA SISWA

   Guru tidak perlu menyusuri siswa satu per satu. Satu mata pelajaran, satu kumpulan Butir CP,
   satu jenis, dan satu predikat diproses untuk seluruh murid rombel aktif.

   MATA PELAJARAN YANG DIPROSES ADALAH YANG DIKIRIM PEMANGGIL, dan hasilnya ditulis dengan kunci
   mata pelajaran itu juga. Tidak ada satu jalur pun di sini yang jatuh ke "mapel pertama".

   Dua sikap hati-hati yang disengaja:
   - Catatan yang PERNAH DISUNTING guru (status EDITED) tidak ditimpa diam-diam.
   - Kegagalan satu murid tidak menggagalkan seluruh batch; tiap kegagalan dicatat sendiri. */
export function fillAllIntracurricular(session,{subjectId,butirIds=[],
  jenis=DEFAULT_JENIS_INTRAKURIKULER,predicate='Baik',overwriteManual=false}={}){
  assertTeacherScope(session);
  const subject=listActiveSubjects(session).find(item=>item.id===subjectId);
  if(!subject)throw new Error('Pilih mata pelajaran intrakurikuler yang aktif pada rombel ini.');
  const cp=cpAcuanFor(session,subject.id);
  if(!cp)throw new Error(cpAlasanTidakTersedia(session,subject.id)||'CP mata pelajaran ini belum tersedia pada fase rombel aktif.');
  if(!INTRACURRICULAR_PREDICATES.includes(predicate))throw new Error('Predikat intrakurikuler tidak valid.');

  const pilihanJenis=jenisBersih(jenis);
  const butir=butirTerpilih(session,subject.id,butirIds);
  const idButir=butir.map(item=>item.id);
  const students=listStudents(session,{classId:session.classId});
  const hasil={subjectId:subject.id,subjectName:subject.name,phase:cp.phase,predicate,
    jenis:pilihanJenis,butirIds:idButir,semesterNumber:semesterNumberOf(session),
    total:students.length,terisi:0,dilewati:[],gagal:[]};
  const otomatis=susunDeskripsiIntra(session,{subjectId:subject.id,butirIds:idButir,
    jenis:pilihanJenis,predicate});
  for(const student of students){
    try{
      const lama=getStudentIntracurricularSelection(session,student.id,subject.id);
      /* Deskripsi yang diketik sendiri oleh guru tidak boleh hilang hanya karena tombol batch
         ditekan. Catatan baru menandainya dengan status EDITED; catatan LAMA belum punya
         penanda itu, sehingga dikenali dengan membandingkan isinya terhadap kalimat yang akan
         disusun aplikasi - berbeda berarti tulisan tangan guru. */
      const manual=Boolean(lama&&(lama.status==='EDITED'
        ||(!lama.status&&String(lama.description||'').trim()&&String(lama.description||'').trim()!==otomatis)));
      if(!overwriteManual&&manual){
        hasil.dilewati.push({studentId:student.id,name:student.name,alasan:'deskripsi manual dipertahankan'});
        continue;
      }
      saveStudentIntracurricularSelection(session,student.id,{subjectId:subject.id,
        butirIds:idButir,jenis:pilihanJenis,predicate});
      hasil.terisi+=1;
    }catch(error){
      hasil.gagal.push({studentId:student.id,name:student.name,alasan:error.message});
    }
  }
  return hasil;
}
