import { cpElements } from '../data/curriculum-cp.js';
import { BUTIR_CP_STATUS, defaultCpButir, JENIS_PENILAIAN, jenisPenilaian, jenisValid,
  hasCpButir } from '../data/cp-butir-defaults.js';
import { phaseForClassId } from '../data/learning-objective-defaults.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';
import { listStudents } from './students.js';

/* BUTIR CP sebagai objek penilaian.

   Rantainya: CP RESMI -> ELEMEN -> BUTIR CP -> SEMESTER -> JENIS PENILAIAN -> NILAI SISWA.
   Butir CP menggantikan TP sebagai dasar penilaian kompetensi; TP tidak dihapus dari aplikasi
   dan catatan lamanya tetap terbaca, tetapi tidak lagi menjadi objek yang dinilai.

   DUA PENYIMPANAN, DUA CAKUPAN YANG SENGAJA BERBEDA:

   - `cpButir`       penyesuaian guru atas butir bawaan dan butir buatan guru sendiri. Kuncinya
                     TIDAK memuat semester, karena semester adalah PROPERTI butir: satu daftar
                     butir dipetakan ke Semester 1 dan Semester 2 sekaligus. Kalau kuncinya
                     memuat semester, butir Semester 2 akan hilang saat guru membuka Semester 1.
   - `cpButirScores` nilai murid. Kuncinya MEMUAT semester lewat scopeKey, karena nilai memang
                     milik satu semester berjalan dan tidak boleh terbawa ke semester lain.

   Tidak ada satu pun fungsi di berkas ini yang menghapus data akademik pengguna. Butir bawaan
   tidak dapat dihapus - hanya dinonaktifkan - supaya nilai yang pernah terikat padanya tetap
   dapat ditelusuri. */

export { JENIS_PENILAIAN, jenisPenilaian, jenisValid };

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
function newId(){return `cpb-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}

function assertTeacher(session){
  if(session?.role!=='teacher'||!session?.classId)
    throw new Error('Hanya Guru yang dapat mengelola Capaian Pembelajaran.');
}

/* Cakupan butir: tahun pelajaran + rombel + mata pelajaran. Semester sengaja TIDAK ikut. */
function butirScope(session,subjectId){
  const klass=session?.role==='admin'?'ALL':session?.classId;
  return `${session?.academicYear}|${klass}|${subjectId}`;
}
function butirKey(session,subjectId,id){return `${butirScope(session,subjectId)}|${id}`;}
function scoreKey(session,subjectId,butirId,studentId){
  return `${scopeKey(session)}|${subjectId}|${butirId}|${studentId}`;
}

function simpanan(db,session,subjectId){
  const awalan=`${butirScope(session,subjectId)}|`;
  return Object.entries(db.cpButir||{})
    .filter(([key])=>key.startsWith(awalan))
    .map(([,record])=>record);
}

function phaseOf(session){
  const phase=phaseForClassId(session?.classId);
  if(!phase)throw new Error('Fase tidak dapat ditentukan dari rombel aktif.');
  return phase;
}

function normalizeSemester(value,fallback=1){
  const angka=Number.parseInt(String(value??''),10);
  return angka===2?2:angka===1?1:fallback;
}

/* --------------------------------------------------------------------------- Pembacaan */

/* Daftar butir CP satu mata pelajaran: bawaan yang sudah ditimpa penyesuaian guru, ditambah
   butir buatan guru. Butir bawaan yang belum pernah disentuh tampil apa adanya. */
export function listCpButir(session,subjectId,{semester='ALL',activeOnly=false}={}){
  requireActiveSubject(session,subjectId);
  const phase=phaseOf(session);
  const tersimpan=new Map(simpanan(loadDb(),session,subjectId).map(record=>[record.id,record]));
  const bawaan=defaultCpButir(subjectId,phase).map(item=>{
    const timpa=tersimpan.get(item.id);
    tersimpan.delete(item.id);
    return timpa?{...item,...timpa,isDefault:true,editable:true,disesuaikan:true}:{...item,disesuaikan:false};
  });
  const manual=[...tersimpan.values()]
    .filter(record=>record.phase===phase)
    .map(record=>({...record,isDefault:false,editable:true,disesuaikan:true}));
  return [...bawaan,...manual]
    .filter(item=>semester==='ALL'||normalizeSemester(item.semester)===normalizeSemester(semester))
    .filter(item=>!activeOnly||item.active!==false)
    .map(clone)
    .sort((a,b)=>(a.elementOrder||99)-(b.elementOrder||99)||(a.order||0)-(b.order||0)
      ||String(a.name).localeCompare(String(b.name),'id'));
}

export function getCpButir(session,subjectId,butirId){
  return listCpButir(session,subjectId,{semester:'ALL'}).find(item=>item.id===String(butirId))||null;
}

/* Butir yang dipakai penilaian dan deskripsi pada semester berjalan: aktif, dan semesternya
   cocok dengan semester sesi. */
export function listCpButirForSemester(session,subjectId){
  const semester=/genap/i.test(String(session?.semester||''))?2:1;
  return listCpButir(session,subjectId,{semester,activeOnly:true});
}

export function cpButirAvailable(session,subjectId){
  try{return hasCpButir(subjectId,phaseOf(session))||listCpButir(session,subjectId).length>0;}
  catch{return false;}
}

/* --------------------------------------------------------------------------- Penulisan */

function validate(session,subjectId,input,{existing=null}={}){
  const phase=phaseOf(session);
  const elemen=cpElements(subjectId,phase);
  const name=clean(input?.name??existing?.name,150);
  if(!name)throw new Error('Nama Butir CP wajib diisi.');
  const elementId=clean(input?.elementId??existing?.elementId,160);
  const element=elemen.find(item=>item.id===elementId);
  if(!element)throw new Error('Pilih Elemen CP yang berlaku pada mata pelajaran dan fase ini.');
  const jenis=clean(input?.jenis??existing?.jenis??'teori',40);
  if(!jenisValid(jenis))throw new Error('Jenis penilaian harus Teori, Praktik, atau Teori + Praktik.');
  const teori=clean(input?.teori??existing?.teori??'',400)||null;
  const praktik=clean(input?.praktik??existing?.praktik??'',400)||null;
  /* Minimal satu rumusan substansi harus ada; tanpa itu deskripsi tidak akan punya isi. */
  if(!teori&&!praktik)throw new Error('Isi Butir CP wajib diisi minimal pada salah satu jenis penilaian.');
  return {
    name,elementId,elementName:element.name,elementOrder:element.order,
    semester:normalizeSemester(input?.semester??existing?.semester,1),
    jenis,teori,praktik,
    active:input?.active===undefined?(existing?.active!==false):input.active!==false,
  };
}

/* Menyimpan penyesuaian atas butir bawaan, atau memperbarui butir buatan guru. Butir bawaan
   TIDAK PERNAH diubah di dataset; yang tersimpan adalah salinan penyesuaiannya. */
export function updateCpButir(session,subjectId,butirId,input){
  assertTeacher(session);
  requireActiveSubject(session,subjectId);
  const existing=getCpButir(session,subjectId,butirId);
  if(!existing)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  const nilai=validate(session,subjectId,input,{existing});
  let saved;
  updateDb(db=>{
    const now=new Date().toISOString();
    saved={...existing,...nilai,id:existing.id,code:existing.code,subjectId,phase:existing.phase,
      order:existing.order,status:existing.status||BUTIR_CP_STATUS,
      isDefault:existing.isDefault===true,
      createdAt:existing.createdAt||now,updatedAt:now};
    db.cpButir[butirKey(session,subjectId,existing.id)]=saved;
    return db;
  });
  return clone(saved);
}

/* Butir CP tambahan buatan guru. Dipakai penilaian dengan mekanisme yang sama persis dengan
   butir bawaan - tidak ada jalur kedua. */
export function createCpButir(session,subjectId,input){
  assertTeacher(session);
  requireActiveSubject(session,subjectId);
  const phase=phaseOf(session);
  const nilai=validate(session,subjectId,input);
  let saved;
  updateDb(db=>{
    const sudah=simpanan(db,session,subjectId);
    const nomor=sudah.filter(item=>item.isDefault===false).length+1;
    const now=new Date().toISOString();
    const id=newId();
    saved={...nilai,id,code:`CP ${nilai.elementName} M${nomor}`,subjectId,phase,
      order:900+nomor,status:BUTIR_CP_STATUS,isDefault:false,editable:true,
      classId:session.classId,academicYear:session.academicYear,
      createdAt:now,updatedAt:now};
    db.cpButir[butirKey(session,subjectId,id)]=saved;
    return db;
  });
  return clone(saved);
}

/* Hanya butir buatan guru yang dapat dihapus. Butir bawaan cukup dinonaktifkan supaya nilai
   yang pernah terikat padanya tidak kehilangan induknya. Nilai murid TIDAK ikut dihapus. */
export function deleteCpButir(session,subjectId,butirId){
  assertTeacher(session);
  requireActiveSubject(session,subjectId);
  const existing=getCpButir(session,subjectId,butirId);
  if(!existing)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  if(existing.isDefault)
    throw new Error('Butir CP bawaan tidak dapat dihapus. Nonaktifkan bila tidak dipakai pada semester ini.');
  updateDb(db=>{delete db.cpButir[butirKey(session,subjectId,existing.id)];return db;});
  return true;
}

export function setCpButirActive(session,subjectId,butirId,active){
  const existing=getCpButir(session,subjectId,butirId);
  if(!existing)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  return updateCpButir(session,subjectId,butirId,{...existing,active:Boolean(active)});
}

export function setCpButirJenis(session,subjectId,butirId,jenis){
  const existing=getCpButir(session,subjectId,butirId);
  if(!existing)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  return updateCpButir(session,subjectId,butirId,{...existing,jenis});
}

export function setCpButirSemester(session,subjectId,butirId,semester){
  const existing=getCpButir(session,subjectId,butirId);
  if(!existing)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  return updateCpButir(session,subjectId,butirId,{...existing,semester});
}

/* ------------------------------------------------------------------------ Nilai per butir */

function angka(value){
  if(value===''||value===null||value===undefined)return null;
  const nilai=Number(value);
  if(!Number.isFinite(nilai))throw new Error('Nilai Butir CP harus berupa angka 0-100.');
  if(nilai<0||nilai>100)throw new Error('Nilai Butir CP harus berada pada rentang 0-100.');
  return Math.round(nilai*100)/100;
}

/* PENGGABUNGAN TEORI DAN PRAKTIK.

   Untuk butir berjenis Teori + Praktik, nilai butirnya adalah RATA-RATA kedua nilai. Aturan ini
   dipilih karena paling mudah dijelaskan kepada guru dan tidak memerlukan bobot baru yang harus
   diatur di tempat lain. Bila baru satu sisi yang terisi, nilai butirnya memakai sisi itu apa
   adanya sehingga guru dapat menilai bertahap tanpa angka yang menyesatkan.

   Nilai butir TIDAK ikut ke perhitungan Nilai Akhir rapor: lima komponen penilaian yang sudah
   berjalan tetap menjadi satu-satunya penentu Nilai Akhir. Nilai butir dipakai untuk menyatakan
   capaian per kompetensi dan menjadi bahan deskripsi. */
export function gabungNilaiButir({jenis='teori',teori=null,praktik=null}={}){
  const info=jenisPenilaian(jenis)||jenisPenilaian('teori');
  const dipakai=[];
  if(info.teori&&teori!==null&&teori!==undefined)dipakai.push(Number(teori));
  if(info.praktik&&praktik!==null&&praktik!==undefined)dipakai.push(Number(praktik));
  if(!dipakai.length)return null;
  return Math.round((dipakai.reduce((total,item)=>total+item,0)/dipakai.length)*100)/100;
}

export function getCpButirScore(session,subjectId,butirId,studentId){
  const record=loadDb().cpButirScores?.[scoreKey(session,subjectId,butirId,studentId)];
  return record?clone(record):null;
}

/* Lembar nilai satu butir untuk seluruh murid rombel, siap ditampilkan sebagai tabel. Kolom
   yang muncul mengikuti JENIS PENILAIAN butir itu, bukan pengaturan global mata pelajaran. */
export function getCpButirScoreSheet(session,subjectId,butirId){
  requireActiveSubject(session,subjectId);
  const butir=getCpButir(session,subjectId,butirId);
  if(!butir)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  const info=jenisPenilaian(butir.jenis)||jenisPenilaian('teori');
  const db=loadDb();
  const rows=listStudents(session,{classId:session.classId}).map(student=>{
    const record=db.cpButirScores?.[scoreKey(session,subjectId,butirId,student.id)]||null;
    const teori=record?.teori??null;
    const praktik=record?.praktik??null;
    return {studentId:student.id,name:student.name,nis:student.nis,
      teori:info.teori?teori:null,praktik:info.praktik?praktik:null,
      nilai:gabungNilaiButir({jenis:butir.jenis,teori,praktik})};
  });
  return {butir,jenis:info,kolomTeori:info.teori,kolomPraktik:info.praktik,rows};
}

/* Menyimpan nilai satu butir untuk beberapa murid sekaligus. Kolom yang tidak berlaku pada
   jenis penilaian butir diabaikan, sehingga nilai praktik tidak pernah tersimpan diam-diam
   pada butir yang guru tetapkan sebagai Teori saja. */
export function saveCpButirScores(session,subjectId,butirId,values={}){
  assertTeacher(session);
  requireActiveSubject(session,subjectId);
  const butir=getCpButir(session,subjectId,butirId);
  if(!butir)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  if(butir.active===false)throw new Error('Butir CP ini sedang nonaktif dan tidak dapat dinilai.');
  const info=jenisPenilaian(butir.jenis)||jenisPenilaian('teori');
  const murid=new Map(listStudents(session,{classId:session.classId}).map(item=>[item.id,item]));
  const masukan=Object.entries(values||{});
  for(const [studentId] of masukan)
    if(!murid.has(studentId))throw new Error('Terdapat siswa di luar rombel aktif pada input nilai Butir CP.');
  let tersimpan=0;
  updateDb(db=>{
    const now=new Date().toISOString();
    for(const [studentId,isi] of masukan){
      const teori=info.teori?angka(isi?.teori):null;
      const praktik=info.praktik?angka(isi?.praktik):null;
      const key=scoreKey(session,subjectId,butirId,studentId);
      if(teori===null&&praktik===null){delete db.cpButirScores[key];continue;}
      const lama=db.cpButirScores[key]||null;
      db.cpButirScores[key]={studentId,subjectId,butirId,classId:session.classId,
        semester:session.semester,academicYear:session.academicYear,
        jenis:butir.jenis,teori,praktik,
        nilai:gabungNilaiButir({jenis:butir.jenis,teori,praktik}),
        createdAt:lama?.createdAt||now,updatedAt:now};
      tersimpan+=1;
    }
    return db;
  });
  return {butirId:butir.id,jenis:butir.jenis,tersimpan};
}

/* Capaian seluruh butir satu murid pada mata pelajaran dan semester berjalan. Inilah bahan
   deskripsi Intrakurikuler dan deskripsi rapor: butir + jenis + nilai. */
export function studentCpButirAchievements(session,subjectId,studentId,{onlyScored=true}={}){
  requireActiveSubject(session,subjectId);
  const db=loadDb();
  return listCpButirForSemester(session,subjectId).map(butir=>{
    const record=db.cpButirScores?.[scoreKey(session,subjectId,butir.id,studentId)]||null;
    return {
      butirId:butir.id,code:butir.code,name:butir.name,
      elementName:butir.elementName,jenis:butir.jenis,
      teoriTeks:butir.teori,praktikTeks:butir.praktik,
      teori:record?.teori??null,praktik:record?.praktik??null,
      nilai:record?record.nilai:null,
    };
  }).filter(item=>!onlyScored||item.nilai!==null);
}

/* Rata-rata capaian butir satu murid. Dipakai untuk menyatakan tingkat capaian pada deskripsi
   ketika Nilai Akhir rapor belum tersedia. */
export function cpButirAverage(session,subjectId,studentId){
  const capaian=studentCpButirAchievements(session,subjectId,studentId);
  if(!capaian.length)return null;
  const total=capaian.reduce((jumlah,item)=>jumlah+item.nilai,0);
  return Math.round((total/capaian.length)*100)/100;
}
