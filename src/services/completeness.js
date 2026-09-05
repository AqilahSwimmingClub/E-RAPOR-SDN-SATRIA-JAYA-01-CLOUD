import { COCURRICULAR_ACTIVITY_PRESETS, cocurricularActivityNames, findCocurricularPreset } from '../data/cocurricular.js';
import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';

export const PROMOTION_STATUSES=[
  {id:'PROMOTED',label:'Naik ke kelas berikutnya'},
  {id:'RETAINED',label:'Tinggal di kelas'},
];
export const GRADUATION_STATUSES=[
  {id:'GRADUATED',label:'Lulus'},
  {id:'NOT_GRADUATED',label:'Tidak Lulus'},
];
/* EMPAT PREDIKAT, urut dari yang tertinggi - sama untuk Intrakurikuler, Kokurikuler, dan
   Ekstrakurikuler. "Perlu Bimbingan" dulu hanya dikenali saat MEMBACA catatan lama dan tidak
   pernah dapat dipilih guru, sehingga murid yang memang memerlukan bimbingan terpaksa dicatat
   "Cukup". Sekarang ia menjadi pilihan yang sah seperti tiga lainnya. */
export const ACTIVITY_PREDICATES=['Sangat Baik','Baik','Cukup','Perlu Bimbingan'];
/* Baik tetap menjadi pilihan awal setiap form, bukan predikat pertama pada daftar. */
export const DEFAULT_ACTIVITY_PREDICATE='Baik';
/* Tidak ada lagi predikat lama di luar daftar: keempatnya sudah tercakup di atas. */
export const LEGACY_ACTIVITY_PREDICATES=[];
function knownPredicate(value){return ACTIVITY_PREDICATES.includes(value)||LEGACY_ACTIVITY_PREDICATES.includes(value);}
export const ACTIVITY_DESCRIPTIONS={
  'Sangat Baik':'Menunjukkan partisipasi, kedisiplinan, dan tanggung jawab yang sangat baik dalam kegiatan.',
  'Baik':'Menunjukkan partisipasi dan tanggung jawab yang baik dalam kegiatan.',
  'Cukup':'Cukup berpartisipasi dan perlu meningkatkan konsistensi dalam kegiatan.',
  'Perlu Bimbingan':'Masih memerlukan bimbingan untuk berpartisipasi secara konsisten dalam kegiatan.',
};
export const PRAMUKA_DESCRIPTIONS={siaga:['Aktif mengikuti latihan dasar kepramukaan dan mampu mengikuti aturan kelompok dengan baik.','Menunjukkan kemandirian, kedisiplinan, dan tanggung jawab dalam kegiatan Pramuka Siaga.','Mampu bekerja sama dengan teman dalam permainan dan kegiatan kelompok.','Menunjukkan kepedulian terhadap lingkungan, kebersihan, dan sesama.','Aktif mengembangkan keberanian, keterampilan, dan rasa percaya diri.'],penggalang:['Aktif mengikuti kegiatan kepramukaan serta menunjukkan disiplin dan tanggung jawab.','Mampu bekerja sama, memimpin, dan menyelesaikan tugas kelompok.','Menunjukkan keterampilan kepramukaan, kemandirian, dan kepedulian lingkungan.','Mampu menerapkan gotong royong dan tanggung jawab dalam kegiatan.','Menunjukkan percaya diri, kepemimpinan, dan kemampuan bekerja sama.']};
export const COCURRICULAR_DESCRIPTIONS={lower:['Aktif mengikuti kegiatan bersama dan mampu bekerja sama.','Menunjukkan rasa ingin tahu dan semangat belajar.','Mampu menyelesaikan tugas sederhana dengan tanggung jawab.','Menunjukkan kepedulian terhadap kebersihan dan lingkungan.','Mampu menyampaikan ide dan berpartisipasi dalam kelompok.'],upper:['Aktif berkolaborasi dan menyelesaikan tugas dengan tanggung jawab.','Mampu mengembangkan ide dan memecahkan masalah.','Menunjukkan kemandirian, disiplin, dan kemampuan berkomunikasi.','Menunjukkan kepedulian lingkungan dan gotong royong.','Mampu mengembangkan kreativitas, bernalar kritis, dan bekerja sama.']};
export function pramukaPresetForClass(classId){const grade=gradeOf(classId);return grade<=3?'Pramuka Siaga':'Pramuka Penggalang';}
export function pramukaDescriptionsForClass(classId){return [...(gradeOf(classId)<=3?PRAMUKA_DESCRIPTIONS.siaga:PRAMUKA_DESCRIPTIONS.penggalang)];}
export function cocurricularDescriptionsForClass(classId,activity){
  const preset=findCocurricularPreset(activity);
  if(preset)return [...(gradeOf(classId)<=3?preset.lower:preset.upper)];
  return [...(gradeOf(classId)<=3?COCURRICULAR_DESCRIPTIONS.lower:COCURRICULAR_DESCRIPTIONS.upper)];
}
export function listCocurricularActivities(){return cocurricularActivityNames();}
export function cocurricularPresets(){return COCURRICULAR_ACTIVITY_PRESETS;}
function predicatePrefix(predicate){return {'Cukup':'Cukup','Baik':'Baik','Sangat Baik':'Sangat baik','Perlu Bimbingan':'Masih memerlukan bimbingan'}[predicate]||'Baik';}
export function pramukaDescriptionTemplates(classId,predicate){if(!knownPredicate(predicate))throw new Error('Predikat ekstrakurikuler tidak valid.');return pramukaDescriptionsForClass(classId).map(text=>`${predicatePrefix(predicate)} dalam ${text.charAt(0).toLowerCase()}${text.slice(1)}`);}
export function cocurricularDescriptionTemplates(classId,predicate,activity){if(!knownPredicate(predicate))throw new Error('Predikat kokurikuler tidak valid.');return cocurricularDescriptionsForClass(classId,activity);}

function clone(value){return JSON.parse(JSON.stringify(value));}
function newId(prefix){return globalThis.crypto?.randomUUID?.()||`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function clean(value,max=1500){return String(value??'').trim().slice(0,max);}
function assertTeacher(session){if(!session||session.role!=='teacher'||!session.classId)throw new Error('Session Guru tidak valid.');}
function scopedRecord(session,studentId,extra={}){return {classId:session.classId,studentId,semester:session.semester,academicYear:session.academicYear,...extra};}
function requireStudent(session,studentId){
  assertTeacher(session);
  const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
  if(!student)throw new Error('Siswa tidak ditemukan pada scope rombel aktif.');
  return student;
}
function studentKey(session,studentId){return `${scopeKey(session)}|${studentId}`;}
function activityKey(session,studentId,id){return `${scopeKey(session)}|${studentId}|${id}`;}
function gradeOf(classId){return Number.parseInt(String(classId||'').match(/^([1-6])/)?.[1]||'',10);}

export function listExtracurriculars(session,studentId){
  requireStudent(session,studentId);const prefix=`${scopeKey(session)}|${studentId}|`;
  return Object.entries(loadDb().extracurricularScores||{}).filter(([key])=>key.startsWith(prefix)).map(([,record])=>clone(record)).sort((a,b)=>(a.order||0)-(b.order||0)||a.name.localeCompare(b.name,'id'));
}

function normalizeActivity(input){
  const record={name:clean(input?.name,120),predicate:clean(input?.predicate,50),description:clean(input?.description,1000)};
  if(!record.name)throw new Error('Nama ekstrakurikuler wajib diisi.');
  if(!record.predicate)throw new Error('Predikat ekstrakurikuler wajib diisi.');
  if(!knownPredicate(record.predicate))throw new Error('Predikat ekstrakurikuler tidak valid.');
  if(!record.description)throw new Error('Deskripsi ekstrakurikuler wajib diisi.');
  return record;
}

/* Terapkan ke Semua Siswa: kegiatan, predikat, dan deskripsi yang sama untuk seluruh siswa
   rombel, ditulis dalam SATU commit. Data individual dengan kegiatan yang sama hanya ditimpa
   bila pemanggil memang meminta overwrite, sehingga hasil edit per siswa tidak hilang diam-diam. */
export function saveExtracurricularBulk(session,input,{overwrite=true,onlyEmpty=false}={}){
  assertTeacher(session);
  const predicate=clean(input?.predicate,50);
  if(!ACTIVITY_PREDICATES.includes(predicate))throw new Error('Predikat ekstrakurikuler tidak valid.');
  const name=clean(input?.name||pramukaPresetForClass(session.classId),120);
  const description=clean(input?.description||pramukaDescriptionTemplates(session.classId,predicate)[0]||ACTIVITY_DESCRIPTIONS[predicate],1000);
  if(!description)throw new Error('Deskripsi ekstrakurikuler wajib diisi.');
  const students=listStudents(session,{classId:session.classId});
  const saved=[];let dilewati=0;
  updateDb(db=>{
    const now=new Date().toISOString();
    students.forEach(student=>{
      const prefix=`${scopeKey(session)}|${student.id}|`;
      const entri=Object.entries(db.extracurricularScores||{}).filter(([key])=>key.startsWith(prefix));
      /* onlyEmpty melewati siswa yang sudah punya kegiatan apa pun, sehingga isian
         individual guru tidak pernah tertimpa oleh tombol massal. */
      if(onlyEmpty&&entri.length){dilewati+=1;saved.push(clone(entri[0][1]));return;}
      const cocok=entri.find(([,record])=>String(record.name||'').toLowerCase()===name.toLowerCase());
      if(cocok&&!overwrite){dilewati+=1;saved.push(clone(cocok[1]));return;}
      const id=cocok?cocok[1].id:newId('extra');
      const record=scopedRecord(session,student.id,{id,name,predicate,description,order:cocok?cocok[1].order||entri.length+1:entri.length+1,createdAt:cocok?.[1]?.createdAt||now,updatedAt:now});
      db.extracurricularScores[`${prefix}${id}`]=record;
      saved.push(record);
    });
    return db;
  });
  return {saved:clone(saved),studentCount:students.length,skipped:dilewati};
}

/* Form Ekstrakurikuler yang baru bekerja pada satu kegiatan per siswa, tetapi penyimpanannya
   tetap koleksi lama yang bisa memuat beberapa kegiatan. getStudentExtracurricular memilih
   kegiatan yang terakhir disunting, dan penyimpanan menimpa kegiatan bernama sama bila ada
   sehingga data rombel dari versi sebelumnya tidak pernah hilang atau terduplikasi. */
export function getStudentExtracurricular(session,studentId){
  const daftar=listExtracurriculars(session,studentId);
  if(!daftar.length)return null;
  return [...daftar].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
}

export function saveStudentExtracurricular(session,studentId,input){
  requireStudent(session,studentId);
  const value=normalizeActivity(input);
  const existing=listExtracurriculars(session,studentId).find(item=>String(item.name||'').toLowerCase()===value.name.toLowerCase());
  return existing
    ?updateExtracurricular(session,studentId,existing.id,value)
    :createExtracurricular(session,studentId,value);
}

function cocurricularKey(session,studentId){return `${scopeKey(session)}|${studentId}`;}
function normalizeCocurricular(input){const record={activity:clean(input?.activity||input?.projectTitle||input?.theme,180),predicate:clean(input?.predicate,50),description:clean(input?.description,1200)};if(!record.activity)throw new Error('Kegiatan kokurikuler wajib diisi.');if(!knownPredicate(record.predicate))throw new Error('Predikat kokurikuler tidak valid.');if(!record.description)throw new Error('Deskripsi kokurikuler wajib diisi.');return record;}

export function getStudentCocurricular(session,studentId){requireStudent(session,studentId);const record=loadDb().cocurricularScores?.[cocurricularKey(session,studentId)];return record?clone(record):null;}

export function saveStudentCocurricular(session,studentId,input){requireStudent(session,studentId);const value=normalizeCocurricular(input);let saved;updateDb(db=>{const key=cocurricularKey(session,studentId);const existing=db.cocurricularScores[key];const now=new Date().toISOString();saved=scopedRecord(session,studentId,{...value,createdAt:existing?.createdAt||now,updatedAt:now});db.cocurricularScores[key]=saved;return db;});return clone(saved);}

/* ============================ ISI OTOMATIS SEMUA SISWA UNTUK KEGIATAN (KOKURIKULER/EKSTRA)

   POLA YANG SAMA PERSIS DENGAN INTRAKURIKULER, dan untuk alasan yang sama:

     [Isi Otomatis Semua Siswa]  menyusun hasil untuk seluruh murid dan MENAMPILKANNYA saja.
     [Simpan Semua]              menyimpan apa yang sedang ditampilkan itu.

   AKAR MASALAH YANG DIPERBAIKI DI SINI. Halaman Kokurikuler dan Ekstrakurikuler dulu menyusun
   kalimat untuk kegiatan yang sedang dipilih, lalu menaruhnya di kotak deskripsi. Ketika guru
   mengganti kegiatan, kotak itu TIDAK ikut berganti - tidak ada satu pun penanganan untuk
   perubahan pilihan kegiatan - sehingga deskripsi kegiatan A tersimpan sebagai deskripsi
   kegiatan B. Baris hasil di bawah karena itu SELALU membawa nama kegiatannya sendiri, dan
   penyimpanan menolak baris yang kegiatannya tidak sama dengan kegiatan yang sedang diproses.

   Tidak ada satu pun tulisan ke penyimpanan pada tahap pratinjau. */

function predikatKegiatan(nilai,bawaan){
  const teks=clean(nilai,50);
  return ACTIVITY_PREDICATES.find(item=>item.toLowerCase()===teks.toLowerCase())||bawaan;
}

/* Menyusun hasil Kokurikuler seluruh murid untuk SATU kegiatan. Tidak menyimpan apa pun. */
export function previewAllCocurricular(session,{activity,predicate=DEFAULT_ACTIVITY_PREDICATE,
  predicates={},describe}={}){
  assertTeacher(session);
  const kegiatan=clean(activity,180);
  if(!kegiatan)throw new Error('Pilih kegiatan kokurikuler terlebih dahulu.');
  if(!knownPredicate(predicate))throw new Error('Predikat kokurikuler tidak valid.');
  if(typeof describe!=='function')throw new Error('Penyusun deskripsi kokurikuler tidak tersedia.');
  const students=listStudents(session,{classId:session.classId});
  const rows=students.map(student=>{
    const tersimpan=loadDb().cocurricularScores?.[cocurricularKey(session,student.id)];
    /* Predikat milik murid masing-masing: yang sudah ditentukan guru tidak diseragamkan. */
    const predikat=predikatKegiatan(predicates?.[student.id],null)
      ||(String(tersimpan?.activity||'')===kegiatan?predikatKegiatan(tersimpan?.predicate,null):null)
      ||predicate;
    return {studentId:student.id,name:student.name,activity:kegiatan,predicate:predikat,
      description:clean(describe({student,activity:kegiatan,predicate:predikat}),1200)};
  });
  return {activity:kegiatan,predicate,total:students.length,rows};
}

/* Menyimpan hasil Kokurikuler yang sedang ditampilkan. */
export function saveAllCocurricular(session,{activity,rows=[]}={}){
  assertTeacher(session);
  const kegiatan=clean(activity,180);
  if(!kegiatan)throw new Error('Pilih kegiatan kokurikuler terlebih dahulu.');
  const daftar=Array.isArray(rows)?rows:[];
  if(!daftar.length)throw new Error('Belum ada hasil yang dapat disimpan. Tekan Isi Otomatis Semua Siswa terlebih dahulu.');
  const hasil={activity:kegiatan,total:daftar.length,tersimpan:0,gagal:[]};
  for(const row of daftar){
    try{
      /* Kegiatan baris dipaksa ke kegiatan yang sedang diproses, sehingga tidak ada baris
         yang dapat menyimpan deskripsi kegiatan lain. */
      saveStudentCocurricular(session,row.studentId,{activity:kegiatan,
        predicate:row.predicate,description:row.description});
      hasil.tersimpan+=1;
    }catch(error){hasil.gagal.push({studentId:row.studentId,name:row.name,alasan:error.message});}
  }
  return hasil;
}

/* Menyusun hasil Ekstrakurikuler seluruh murid untuk SATU kegiatan. Tidak menyimpan apa pun. */
export function previewAllExtracurricular(session,{name,predicate=DEFAULT_ACTIVITY_PREDICATE,
  predicates={},describe}={}){
  assertTeacher(session);
  const kegiatan=clean(name,120);
  if(!kegiatan)throw new Error('Pilih kegiatan ekstrakurikuler terlebih dahulu.');
  if(!knownPredicate(predicate))throw new Error('Predikat ekstrakurikuler tidak valid.');
  if(typeof describe!=='function')throw new Error('Penyusun deskripsi ekstrakurikuler tidak tersedia.');
  const students=listStudents(session,{classId:session.classId});
  const rows=students.map(student=>{
    const tersimpan=listExtracurriculars(session,student.id)
      .find(item=>String(item.name||'').toLowerCase()===kegiatan.toLowerCase());
    const predikat=predikatKegiatan(predicates?.[student.id],null)
      ||predikatKegiatan(tersimpan?.predicate,null)
      ||predicate;
    return {studentId:student.id,name:student.name,activity:kegiatan,predicate:predikat,
      description:clean(describe({student,activity:kegiatan,predicate:predikat}),1000)};
  });
  return {activity:kegiatan,predicate,total:students.length,rows};
}

/* Menyimpan hasil Ekstrakurikuler yang sedang ditampilkan. */
export function saveAllExtracurricular(session,{name,rows=[]}={}){
  assertTeacher(session);
  const kegiatan=clean(name,120);
  if(!kegiatan)throw new Error('Pilih kegiatan ekstrakurikuler terlebih dahulu.');
  const daftar=Array.isArray(rows)?rows:[];
  if(!daftar.length)throw new Error('Belum ada hasil yang dapat disimpan. Tekan Isi Otomatis Semua Siswa terlebih dahulu.');
  const hasil={activity:kegiatan,total:daftar.length,tersimpan:0,gagal:[]};
  for(const row of daftar){
    try{
      saveStudentExtracurricular(session,row.studentId,{name:kegiatan,
        predicate:row.predicate,description:row.description});
      hasil.tersimpan+=1;
    }catch(error){hasil.gagal.push({studentId:row.studentId,name:row.name,alasan:error.message});}
  }
  return hasil;
}

/* Intrakurikuler memakai koleksi intracurricularScores sendiri. Kunci, validasi, dan
   bentuk record sengaja sejajar dengan kokurikuler supaya perilaku keduanya konsisten,
   tetapi penyimpanannya tidak pernah bersinggungan. */
/* KUNCI INTRAKURIKULER MEMUAT MATA PELAJARAN.

   Dulu kuncinya hanya `scope|siswa`, sehingga satu murid hanya punya SATU catatan Intrakurikuler
   untuk seluruh mata pelajaran. Akibatnya nyata dan merusak: mengisi Intrakurikuler IPAS
   MENIMPA catatan Pancasila murid yang sama, dan halaman yang membaca ulang catatan itu
   menampilkan mapel yang tersimpan terakhir - itulah sebab "pilih IPAS, Isi Semua, lalu kembali
   ke Pancasila dan hasil IPAS hilang".

   Kunci baru memuat subjectId sehingga tiap mata pelajaran berdiri sendiri. Catatan LAMA yang
   masih memakai kunci tanpa mapel TIDAK dihapus dan tetap terbaca: `intracurricularKey` jatuh
   ke bentuk lama ketika mapelnya tidak disebut, dan pembacaan per mapel mengenali catatan lama
   yang kebetulan menyimpan subjectId yang cocok. */
function intracurricularKey(session,studentId,subjectId=''){
  const mapel=clean(subjectId,40);
  return mapel?`${scopeKey(session)}|${mapel}|${studentId}`:`${scopeKey(session)}|${studentId}`;
}
/* Sejak Tahap 8E kegiatan intrakurikuler boleh mengacu pada satu mata pelajaran beserta TP-nya.
   Kedua field itu OPSIONAL: catatan lama yang hanya berisi nama kegiatan tetap sah dan tidak
   diubah, sehingga data instalasi lama terbaca apa adanya. */
function normalizeIntracurricular(input){
  const record={activity:clean(input?.activity,180),predicate:clean(input?.predicate,50),description:clean(input?.description,1200)};
  if(!record.activity)throw new Error('Kegiatan intrakurikuler wajib diisi.');
  if(!knownPredicate(record.predicate))throw new Error('Predikat intrakurikuler tidak valid.');
  if(!record.description)throw new Error('Deskripsi intrakurikuler wajib diisi.');
  const subjectId=clean(input?.subjectId,40);
  if(subjectId)record.subjectId=subjectId;
  /* TAMPIL DI RAPOR adalah keadaan tersendiri, bukan turunan dari "ada catatannya".

     Dulu setiap mata pelajaran yang pernah disimpan otomatis menjadi satu baris Intrakurikuler
     pada rapor. Akibatnya guru yang mengisi tiga mapel lalu memutuskan hanya satu yang layak
     dilaporkan tetap melihat ketiganya tercetak - tidak ada satu pun tempat untuk menyatakan
     kehendaknya.

     Sekarang kehendak itu punya tempatnya sendiri. Yang absen - catatan yang tersimpan sebelum
     penanda ini ada - dibaca sebagai TAMPIL, sebab guru memang sengaja menyimpannya dahulu;
     menganggapnya tersembunyi akan mengosongkan rapor yang selama ini benar. Melepas centang
     hanya mengubah penanda ini dan tidak menghapus satu pun catatan. */
  /* HANYA true YANG BERARTI TAMPIL. false, null, undefined, dan penanda yang memang tidak ada
     sama-sama berarti tidak tampil. Bila pemanggil tidak menyebut penanda sama sekali, ia
     dibiarkan kosong di sini supaya penyimpanan dapat mewarisi penanda yang sudah ada -
     mengubah deskripsi tidak boleh diam-diam melepas centang yang sudah diberikan guru. */
  if(Object.hasOwn(input||{},'includeInReport'))record.includeInReport=input.includeInReport===true;
  const objectiveIds=Array.isArray(input?.objectiveIds)
    ? [...new Set(input.objectiveIds.map(id=>clean(id,80)).filter(Boolean))].slice(0,20)
    : [];
  if(objectiveIds.length)record.objectiveIds=objectiveIds;
  /* BUTIR CP YANG DIPILIH GURU beserta JENIS penilaiannya. Keduanya opsional supaya catatan
     lama tetap sah, tetapi alur Intrakurikuler yang baru selalu mengisinya - itulah yang
     membuat deskripsi dapat ditelusuri kembali ke butir yang benar-benar dipilih. */
  const butirIds=Array.isArray(input?.butirIds)
    ? [...new Set(input.butirIds.map(id=>clean(id,120)).filter(Boolean))].slice(0,40)
    : [];
  if(butirIds.length)record.butirIds=butirIds;
  const jenis=clean(input?.jenis,20);
  if(jenis)record.jenis=jenis;
  /* Jejak asal deskripsi. `source` menyebut CP atau TP, `cpPhase` fase yang dipakai, dan
     `status` membedakan kalimat susunan aplikasi (AUTO) dari yang diketik guru (EDITED).
     Ketiganya opsional supaya catatan lama tetap terbaca apa adanya. */
  const source=clean(input?.source,20);
  if(source)record.source=source;
  const cpPhase=clean(input?.cpPhase,4);
  if(cpPhase)record.cpPhase=cpPhase;
  const status=clean(input?.status,10);
  if(status)record.status=status;
  return record;
}

/* Catatan Intrakurikuler satu murid pada SATU mata pelajaran.

   `subjectId` adalah bagian dari identitas catatan, sama pentingnya dengan tahun, semester,
   rombel, dan murid. Tanpa `subjectId` yang dikembalikan HANYA catatan lama yang memang
   disimpan tanpa mata pelajaran - bentuk kegiatan bebas dari versi sebelum Intrakurikuler
   beralih ke mapel.

   Yang sengaja TIDAK dilakukan di sini: menebak. Tidak ada penelusuran "catatan pertama",
   tidak ada "catatan yang paling baru diperbarui", dan tidak ada mapel bawaan. Menebak
   membuat rapor menampilkan mapel yang tidak pernah dinilai guru - persis bug yang membuat
   IPAS yang disimpan muncul sebagai Pendidikan Pancasila. Pemanggil yang peduli mapel WAJIB
   menyebut mapelnya; yang ingin semuanya memakai listStudentIntracurricular. */
export function getStudentIntracurricular(session,studentId,subjectId=''){
  requireStudent(session,studentId);
  const semua=loadDb().intracurricularScores||{};
  const mapel=clean(subjectId,40);
  const lama=semua[intracurricularKey(session,studentId)];
  if(mapel){
    const langsung=semua[intracurricularKey(session,studentId,mapel)];
    if(langsung)return clone(langsung);
    /* Catatan lama tanpa mapel pada kunci sebelumnya tetap dikenali bila memang milik mapel
       yang diminta, sehingga isian guru dari versi sebelumnya tidak hilang dari layar. */
    return lama&&lama.subjectId===mapel?clone(lama):null;
  }
  /* Catatan lama yang sudah punya mapel bukan milik "tanpa mapel": mengembalikannya di sini
     sama saja dengan menebak mapel. Ia hanya terbaca lewat subjectId-nya sendiri. */
  return lama&&!lama.subjectId?clone(lama):null;
}

/* Seluruh catatan Intrakurikuler satu murid, satu baris per mata pelajaran. */
export function listStudentIntracurricular(session,studentId){
  requireStudent(session,studentId);
  const semua=loadDb().intracurricularScores||{};
  const awalan=`${scopeKey(session)}|`;
  const akhiran=`|${studentId}`;
  const hasil=Object.entries(semua)
    .filter(([key])=>key.startsWith(awalan)&&key.endsWith(akhiran))
    .map(([,record])=>clone(record));
  return hasil.sort((a,b)=>String(a.activity||'').localeCompare(String(b.activity||''),'id'));
}

/* SATU-SATUNYA TEMPAT penanda "tampil di rapor" dibaca, supaya aturannya tidak pernah
   ditafsirkan dua kali di tempat berbeda.

   HANYA YANG DINYATAKAN TAMPIL YANG TAMPIL. Penanda yang bernilai false, tidak ada, null,
   atau undefined sama-sama berarti TIDAK TAMPIL.

   Aturan ini sengaja diperketat dari bentuk sebelumnya, yang membaca catatan tanpa penanda
   sebagai "tampil". Alasannya: keberadaan sebuah catatan bukan persetujuan untuk
   mencetaknya. Guru menyimpan catatan Intrakurikuler untuk banyak keperluan - mencoba
   redaksi, menilai lebih dulu, menyiapkan bahan - dan tidak satu pun di antaranya sama
   dengan menyatakan "cetak ini pada rapor".

   Catatan lamanya TIDAK dihapus dan tidak diubah. Ia tetap tersimpan utuh, tinggal dicentang
   sekali oleh guru untuk kembali tampil. */
export function intracurricularIncludedInReport(record){
  return record?.includeInReport===true;
}

/* Mengubah HANYA penanda tampil-di-rapor satu mata pelajaran, tanpa menyentuh deskripsi,
   predikat, butir CP, maupun stempel waktu pembuatannya. Melepas centang BUKAN menghapus. */
export function setIntracurricularReportInclusion(session,studentId,subjectId,include){
  requireStudent(session,studentId);
  const kunci=String(subjectId||'');
  let saved=null;
  updateDb(db=>{
    const key=intracurricularKey(session,studentId,kunci);
    const existing=db.intracurricularScores?.[key];
    if(!existing)return db;
    saved={...existing,includeInReport:include!==false,updatedAt:new Date().toISOString()};
    db.intracurricularScores[key]=saved;
    return db;
  });
  if(!saved)throw new Error('Catatan intrakurikuler mata pelajaran ini belum ada.');
  return clone(saved);
}

export function saveStudentIntracurricular(session,studentId,input){
  requireStudent(session,studentId);
  const value=normalizeIntracurricular(input);
  let saved;
  updateDb(db=>{
    const key=intracurricularKey(session,studentId,value.subjectId||'');
    const existing=db.intracurricularScores?.[key];
    const now=new Date().toISOString();
    saved=scopedRecord(session,studentId,{...value,
      includeInReport:value.includeInReport??existing?.includeInReport===true,
      createdAt:existing?.createdAt||now,updatedAt:now});
    if(!db.intracurricularScores)db.intracurricularScores={};
    db.intracurricularScores[key]=saved;
    /* Catatan lama tanpa mapel milik MAPEL YANG SAMA dibereskan ke kunci barunya supaya tidak
       ada dua sumber kebenaran untuk satu mapel. Catatan lama milik mapel LAIN - atau yang
       memang tidak punya mapel - tidak disentuh sama sekali. */
    if(value.subjectId){
      const kunciLama=intracurricularKey(session,studentId);
      const lama=db.intracurricularScores[kunciLama];
      if(lama&&lama.subjectId===value.subjectId)delete db.intracurricularScores[kunciLama];
    }
    return db;
  });
  return clone(saved);
}

/* Bawaan overwrite:false supaya isian guru per siswa tidak tertimpa diam-diam oleh isian massal. */
export function saveIntracurricularBulk(session,input,{overwrite=false}={}){
  assertTeacher(session);
  const value=normalizeIntracurricular(input);
  const students=listStudents(session,{classId:session.classId});
  const saved=[];let dilewati=0;
  updateDb(db=>{
    const now=new Date().toISOString();
    if(!db.intracurricularScores)db.intracurricularScores={};
    students.forEach(student=>{
      const key=intracurricularKey(session,student.id,value.subjectId||'');
      const existing=db.intracurricularScores[key];
      if(existing&&!overwrite){dilewati+=1;saved.push(clone(existing));return;}
      const record=scopedRecord(session,student.id,{...value,createdAt:existing?.createdAt||now,updatedAt:now});
      db.intracurricularScores[key]=record;
      saved.push(record);
    });
    return db;
  });
  return {saved:clone(saved),studentCount:students.length,skipped:dilewati};
}

/* Terapkan ke Semua Siswa untuk kokurikuler, juga dalam satu commit. */
export function saveCocurricularBulk(session,input,{overwrite=true}={}){
  assertTeacher(session);
  const predicate=clean(input?.predicate,50);
  const value=normalizeCocurricular({...input,description:clean(input?.description,1200)||cocurricularDescriptionTemplates(session.classId,predicate,input?.activity)[0]});
  const students=listStudents(session,{classId:session.classId});
  const saved=[];let dilewati=0;
  updateDb(db=>{
    const now=new Date().toISOString();
    students.forEach(student=>{
      const key=cocurricularKey(session,student.id);
      const existing=db.cocurricularScores[key];
      if(existing&&!overwrite){dilewati+=1;saved.push(clone(existing));return;}
      const record=scopedRecord(session,student.id,{...value,createdAt:existing?.createdAt||now,updatedAt:now});
      db.cocurricularScores[key]=record;
      saved.push(record);
    });
    return db;
  });
  return {saved:clone(saved),studentCount:students.length,skipped:dilewati};
}

export function createExtracurricular(session,studentId,input){
  requireStudent(session,studentId);const value=normalizeActivity(input);let saved;
  updateDb(db=>{const now=new Date().toISOString();const id=input?.id||newId('extracurricular');const order=Object.values(db.extracurricularScores||{}).filter(item=>item.classId===session.classId&&item.studentId===studentId&&item.semester===session.semester&&item.academicYear===session.academicYear).length+1;saved=scopedRecord(session,studentId,{...value,id,order,createdAt:now,updatedAt:now});db.extracurricularScores[activityKey(session,studentId,id)]=saved;return db;});
  return clone(saved);
}

export function updateExtracurricular(session,studentId,id,input){
  requireStudent(session,studentId);const value=normalizeActivity(input);let saved;
  updateDb(db=>{const key=activityKey(session,studentId,id);const existing=db.extracurricularScores[key];if(!existing)throw new Error('Data ekstrakurikuler tidak ditemukan pada scope aktif.');saved={...existing,...value,updatedAt:new Date().toISOString()};db.extracurricularScores[key]=saved;return db;});
  return clone(saved);
}

export function deleteExtracurricular(session,studentId,id){
  requireStudent(session,studentId);let removed=false;
  updateDb(db=>{const key=activityKey(session,studentId,id);if(!db.extracurricularScores[key])throw new Error('Data ekstrakurikuler tidak ditemukan pada scope aktif.');delete db.extracurricularScores[key];removed=true;return db;});return removed;
}

export function getHomeroomNote(session,studentId){
  requireStudent(session,studentId);const record=loadDb().homeroomNotes[studentKey(session,studentId)];return record?clone(record):null;
}

/* Catatan massal. Secara bawaan hanya mengisi siswa yang catatannya masih kosong sehingga
   catatan individual tidak tertimpa. Timpa hanya terjadi bila pemanggil sudah meminta
   konfirmasi guru dan mengirim overwrite:true. */
export function saveHomeroomNoteBulk(session,note,{overwrite=false}={}){
  assertTeacher(session);const text=clean(note,2000);if(!text)throw new Error('Catatan wali kelas wajib diisi.');
  const students=listStudents(session,{classId:session.classId});
  if(!students.length)throw new Error('Belum ada siswa pada rombel ini.');
  const saved=[];const skipped=[];
  students.forEach(student=>{
    const existing=getHomeroomNote(session,student.id);
    if(existing?.text&&!overwrite){skipped.push(student.id);return;}
    saved.push(saveHomeroomNote(session,student.id,text));
  });
  return {saved:saved.length,skipped:skipped.length,skippedIds:skipped,total:students.length,overwrite};
}

export function saveHomeroomNote(session,studentId,note){
  requireStudent(session,studentId);const text=clean(note,2000);if(!text)throw new Error('Catatan wali kelas wajib diisi.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.homeroomNotes[key];const now=new Date().toISOString();saved=scopedRecord(session,studentId,{text,createdAt:existing?.createdAt||now,updatedAt:now});db.homeroomNotes[key]=saved;return db;});return clone(saved);
}

export function getPromotionStatus(session,studentId){
  requireStudent(session,studentId);const record=loadDb().promotionStatus[studentKey(session,studentId)];return record?clone(record):null;
}

export function savePromotionStatus(session,studentId,status){
  requireStudent(session,studentId);const grade=gradeOf(session.classId);if(grade===6)throw new Error('Kelas 6 menggunakan struktur status kelulusan terpisah.');if(!PROMOTION_STATUSES.some(item=>item.id===status))throw new Error('Status kenaikan kelas tidak valid.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.promotionStatus[key];const now=new Date().toISOString();const letter=session.classId.slice(1);saved=scopedRecord(session,studentId,{status,targetClass:status==='PROMOTED'?`${grade+1}${letter}`:session.classId,createdAt:existing?.createdAt||now,updatedAt:now});db.promotionStatus[key]=saved;return db;});return clone(saved);
}

export function getGraduationStatus(session,studentId){
  requireStudent(session,studentId);if(gradeOf(session.classId)!==6)throw new Error('Struktur kelulusan hanya tersedia untuk Kelas 6.');const record=loadDb().graduationStatus[studentKey(session,studentId)];return record?clone(record):null;
}

export function prepareGraduationStatus(session,studentId){
  requireStudent(session,studentId);if(gradeOf(session.classId)!==6)throw new Error('Struktur kelulusan hanya tersedia untuk Kelas 6.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.graduationStatus[key];const now=new Date().toISOString();saved=existing||scopedRecord(session,studentId,{status:null,prepared:true,resultType:'GRADUATION',createdAt:now,updatedAt:now});db.graduationStatus[key]=saved;return db;});return clone(saved);
}

export function saveGraduationStatus(session,studentId,status){
  requireStudent(session,studentId);if(gradeOf(session.classId)!==6)throw new Error('Status kelulusan hanya tersedia untuk Kelas 6.');if(!GRADUATION_STATUSES.some(item=>item.id===status))throw new Error('Status kelulusan tidak valid.');let saved;
  updateDb(db=>{const key=studentKey(session,studentId);const existing=db.graduationStatus[key];const now=new Date().toISOString();saved=scopedRecord(session,studentId,{...existing,status,prepared:true,resultType:'GRADUATION',createdAt:existing?.createdAt||now,updatedAt:now});db.graduationStatus[key]=saved;return db;});return clone(saved);
}
