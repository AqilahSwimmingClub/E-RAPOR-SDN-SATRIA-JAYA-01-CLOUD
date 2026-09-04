import { cpElements } from '../data/curriculum-cp.js';
import { BUTIR_CP_STATUS, defaultCpButir, hasCpButir } from '../data/cp-butir-defaults.js';
import { phaseForClassId } from '../data/learning-objective-defaults.js';
import { loadDb, scopeKey, updateDb } from './storage.js';
import { requireActiveSubject } from './subjects.js';
import { listStudents } from './students.js';

/* BUTIR CP sebagai objek kompetensi.

   Rantainya sekarang pendek dan itu memang disengaja:

     CP RESMI -> ELEMEN -> BUTIR CP

   Tidak ada semester dan tidak ada jenis penilaian di dalamnya. Keduanya pernah menjadi
   properti butir dan keduanya DIBUANG:

   - SEMESTER. CP ditetapkan pemerintah per FASE, bukan per semester. Membaginya hanya membuat
     guru mengurus parameter yang tidak dituntut siapa pun, dan membuat butir yang sama harus
     digandakan bila dipakai di dua semester. Sekarang SELURUH butir aktif tersedia pada
     semester mana pun; semester sebuah PENILAIAN mengikuti semester aplikasi yang sedang aktif
     dan sudah terbawa oleh scopeKey.
   - JENIS PENILAIAN. Satu butir kompetensi yang sama wajar dinilai sebagai pengetahuan maupun
     keterampilan. Yang menentukan Teori atau Praktik adalah KEGIATAN PENILAIANNYA, bukan
     butirnya. Karena itu Teori/Praktik pindah ke Intrakurikuler, tempat penilaian benar-benar
     terjadi, dan tidak pernah lagi muncul di menu CP.

   Yang tersisa untuk guru pada menu CP hanyalah: Aktifkan, Nonaktifkan, Edit, dan Tambah.

   Tidak ada satu pun fungsi di berkas ini yang menghapus data akademik pengguna. Butir bawaan
   tidak dapat dihapus - hanya dinonaktifkan - supaya catatan yang pernah terikat padanya tetap
   dapat ditelusuri, dan field lama (`semester`, `jenis`) pada catatan penyesuaian guru dibiarkan
   tersimpan apa adanya: ia hanya tidak lagi dibaca. */

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

/* --------------------------------------------------------------------------- Pembacaan */

/* Daftar butir CP satu mata pelajaran: bawaan yang sudah ditimpa penyesuaian guru, ditambah
   butir buatan guru. Butir bawaan yang belum pernah disentuh tampil apa adanya. */
/* Field lama pada catatan penyesuaian guru dibuang saat DIBACA, bukan dihapus dari storage.
   Butir yang dulu tersimpan dengan semester/jenis tetap utuh di basis data - ia hanya tidak
   lagi ikut ke dalam model. Guru yang membuka semester mana pun kini melihat butir yang sama. */
const FIELD_LAMA=['semester','jenis'];
function tanpaFieldLama(record){
  const salinan={...record};
  for(const kunci of FIELD_LAMA)delete salinan[kunci];
  return salinan;
}

export function listCpButir(session,subjectId,{activeOnly=false}={}){
  requireActiveSubject(session,subjectId);
  const phase=phaseOf(session);
  const tersimpan=new Map(simpanan(loadDb(),session,subjectId).map(record=>[record.id,record]));
  const bawaan=defaultCpButir(subjectId,phase).map(item=>{
    const timpa=tersimpan.get(item.id);
    tersimpan.delete(item.id);
    return timpa?{...item,...tanpaFieldLama(timpa),isDefault:true,editable:true,disesuaikan:true}
      :{...item,disesuaikan:false};
  });
  const manual=[...tersimpan.values()]
    .filter(record=>record.phase===phase)
    .map(record=>({...tanpaFieldLama(record),isDefault:false,editable:true,disesuaikan:true}));
  return [...bawaan,...manual]
    .filter(item=>!activeOnly||item.active!==false)
    .map(clone)
    .sort((a,b)=>(a.elementOrder||99)-(b.elementOrder||99)||(a.order||0)-(b.order||0)
      ||String(a.name).localeCompare(String(b.name),'id'));
}

export function getCpButir(session,subjectId,butirId){
  return listCpButir(session,subjectId).find(item=>item.id===String(butirId))||null;
}

/* Butir yang tersedia untuk penilaian dan deskripsi pada semester BERJALAN.

   Jawabannya kini sederhana: SELURUH butir aktif. Butir tidak lagi dimiliki satu semester, jadi
   butir yang sama boleh dipakai pada Ganjil maupun Genap. Yang memisahkan hasilnya adalah kunci
   penyimpanan penilaiannya, yang memang sudah memuat semester lewat scopeKey. */
export function listCpButirForSemester(session,subjectId){
  return listCpButir(session,subjectId,{activeOnly:true});
}

/* Nomor semester dari sesi aplikasi. Ganjil -> 1, Genap -> 2. Inilah satu-satunya penentu
   semester sebuah penilaian; guru tidak pernah memilihnya pada CP. */
export function semesterNumberOf(session){
  return /genap/i.test(String(session?.semester||''))?2:1;
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
  const teori=clean(input?.teori??existing?.teori??'',400)||null;
  const praktik=clean(input?.praktik??existing?.praktik??'',400)||null;
  /* Minimal satu rumusan substansi harus ada; tanpa itu deskripsi tidak akan punya isi. Guru
     TIDAK diminta memilih jenis penilaian maupun semester di sini - keduanya bukan milik CP. */
  if(!teori&&!praktik)
    throw new Error('Isi Butir CP wajib diisi minimal pada rumusan pengetahuan atau keterampilan.');
  return {
    name,elementId,elementName:element.name,elementOrder:element.order,
    teori,praktik,
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

/* NONAKTIFKAN SELURUH BUTIR CP SATU MATA PELAJARAN.

   CAKUPANNYA SATU MATA PELAJARAN, dan itu ditegakkan oleh bentuk kuncinya sendiri, bukan oleh
   kehati-hatian pemanggil: `butirKey` memuat subjectId, jadi tidak ada jalan bagi fungsi ini
   menyentuh baris milik mata pelajaran lain. Menonaktifkan seluruh Butir CP IPAS tidak dapat
   mengubah satu butir pun pada Matematika.

   NONAKTIF BUKAN HAPUS. Yang berubah hanya field `active`. Rumusan butirnya tetap ada, catatan
   Intrakurikuler yang pernah menunjuknya tetap ada, deskripsi rapor yang sudah tersimpan tetap
   ada, dan nilai apa pun tidak tersentuh. Butir yang dinonaktifkan berhenti DITAWARKAN, bukan
   berhenti ADA - itulah sebabnya butir bawaan memang tidak boleh dihapus sama sekali.

   Tidak ada pasangan "aktifkan semua" di berkas ini. Mengaktifkan kembali dilakukan satu per
   satu lewat setCpButirActive, sesuai perancangan alurnya. */
export function deactivateAllCpButir(session,subjectId){
  assertTeacher(session);
  requireActiveSubject(session,subjectId);
  const daftar=listCpButir(session,subjectId).filter(item=>item.active!==false);
  let dinonaktifkan=0;
  for(const butir of daftar){
    updateCpButir(session,subjectId,butir.id,{...butir,active:false});
    dinonaktifkan+=1;
  }
  return {subjectId,dinonaktifkan,tersisaAktif:listCpButir(session,subjectId,{activeOnly:true}).length};
}


/* ------------------------------------------------------------------------ Nilai per butir */

function angka(value){
  if(value===''||value===null||value===undefined)return null;
  const nilai=Number(value);
  if(!Number.isFinite(nilai))throw new Error('Nilai Butir CP harus berupa angka 0-100.');
  if(nilai<0||nilai>100)throw new Error('Nilai Butir CP harus berada pada rentang 0-100.');
  return Math.round(nilai*100)/100;
}

/* CATATAN NILAI PER BUTIR - WARISAN, BUKAN JALUR AKTIF.

   Bagian ini melayani catatan yang SUDAH TERSIMPAN dari versi sebelumnya. Ia sengaja tidak
   dihapus: menghapusnya akan membuat angka yang pernah diisi guru tidak dapat dibaca lagi.

   Yang berubah: menu CP tidak lagi menyediakan input angka per butir, dan tidak ada satu pun
   penyusun deskripsi yang membacanya. Intrakurikuler memakai PREDIKAT, dan Rapor memakai NILAI
   AKHIR mata pelajaran dari lima komponen penilaian yang sudah berjalan. Tidak ada angka baru
   yang lahir dari CP.

   Karena butir tidak lagi punya jenis penilaian, kedua kolom - pengetahuan dan keterampilan -
   selalu tersedia dan nilai butir adalah rata-rata sisi yang terisi. */
export function gabungNilaiButir({teori=null,praktik=null}={}){
  const dipakai=[teori,praktik].filter(nilai=>nilai!==null&&nilai!==undefined).map(Number);
  if(!dipakai.length)return null;
  return Math.round((dipakai.reduce((total,item)=>total+item,0)/dipakai.length)*100)/100;
}

export function getCpButirScore(session,subjectId,butirId,studentId){
  const record=loadDb().cpButirScores?.[scoreKey(session,subjectId,butirId,studentId)];
  return record?clone(record):null;
}

/* Lembar nilai satu butir untuk seluruh murid rombel. Dipertahankan agar catatan lama tetap
   terbaca; kedua kolom selalu tersedia karena butir tidak lagi mengunci jenis penilaian. */
export function getCpButirScoreSheet(session,subjectId,butirId){
  requireActiveSubject(session,subjectId);
  const butir=getCpButir(session,subjectId,butirId);
  if(!butir)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  const db=loadDb();
  const rows=listStudents(session,{classId:session.classId}).map(student=>{
    const record=db.cpButirScores?.[scoreKey(session,subjectId,butirId,student.id)]||null;
    const teori=record?.teori??null;
    const praktik=record?.praktik??null;
    return {studentId:student.id,name:student.name,nis:student.nis,teori,praktik,
      nilai:gabungNilaiButir({teori,praktik})};
  });
  return {butir,kolomTeori:true,kolomPraktik:true,rows};
}

/* Menyimpan nilai satu butir untuk beberapa murid sekaligus. Dipertahankan untuk pemanggil dan
   catatan lama; menu CP tidak lagi memanggilnya. */
export function saveCpButirScores(session,subjectId,butirId,values={}){
  assertTeacher(session);
  requireActiveSubject(session,subjectId);
  const butir=getCpButir(session,subjectId,butirId);
  if(!butir)throw new Error('Butir CP tidak ditemukan pada mata pelajaran ini.');
  if(butir.active===false)throw new Error('Butir CP ini sedang nonaktif dan tidak dapat dinilai.');
  const murid=new Map(listStudents(session,{classId:session.classId}).map(item=>[item.id,item]));
  const masukan=Object.entries(values||{});
  for(const [studentId] of masukan)
    if(!murid.has(studentId))throw new Error('Terdapat siswa di luar rombel aktif pada input nilai Butir CP.');
  let tersimpan=0;
  updateDb(db=>{
    const now=new Date().toISOString();
    for(const [studentId,isi] of masukan){
      const teori=angka(isi?.teori);
      const praktik=angka(isi?.praktik);
      const key=scoreKey(session,subjectId,butirId,studentId);
      if(teori===null&&praktik===null){delete db.cpButirScores[key];continue;}
      const lama=db.cpButirScores[key]||null;
      db.cpButirScores[key]={studentId,subjectId,butirId,classId:session.classId,
        semester:session.semester,academicYear:session.academicYear,
        teori,praktik,
        nilai:gabungNilaiButir({teori,praktik}),
        createdAt:lama?.createdAt||now,updatedAt:now};
      tersimpan+=1;
    }
    return db;
  });
  return {butirId:butir.id,tersimpan};
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
      elementName:butir.elementName,
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
