import { loadDb, scopeKey } from './storage.js';
import { requireActiveSubject } from './subjects.js';
import { listCpButir } from './cp-butir.js';
import { listStudents } from './students.js';
import { ASSESSMENT_TYPES, getAssessmentSettings } from './assessment.js';
import { categoryForScore } from './report-rubric.js';

/* CAPAIAN PER BUTIR CP.

   Menu Penilaian menyimpan angka; berkas ini membacanya sebagai KETERCAPAIAN KOMPETENSI.
   Keduanya sengaja dipisah, dan pemisahan itu adalah inti rancangannya:

     NILAI AKHIR MATA PELAJARAN dihitung dari lima komponen penilaian beserta BOBOT-nya.
     Ia adalah nilai rapor, dan berkas ini tidak menyentuhnya sama sekali.

     CAPAIAN BUTIR CP dihitung dari nilai-nilai yang MEMANG menjadi bukti kompetensi itu.
     Ia dipakai untuk melihat kompetensi mana yang sudah dikuasai dan mana yang perlu
     penguatan, lalu menjadi bahan deskripsi.

   Satu angka dapat menjadi bukti satu kompetensi, dan satu kompetensi dapat dibuktikan oleh
   beberapa angka dari komponen yang berbeda. Yang tidak pernah terjadi: bukti kompetensi A
   ikut menghitung kompetensi B. */

/* RUMUS CAPAIAN: RATA-RATA SEDERHANA dari seluruh nilai yang menjadi bukti butir itu.

   Mengapa rata-rata sederhana, bukan rata-rata berbobot seperti Nilai Akhir?

   Bobot pada Nilai Akhir menyatakan seberapa besar peran tiap KOMPONEN dalam menentukan nilai
   satu MATA PELAJARAN - Formatif sekian persen, Sumatif Akhir sekian persen. Bobot itu tidak
   menyatakan apa pun tentang seberapa kuat sebuah komponen membuktikan satu KOMPETENSI.

   Memakainya di sini akan menghitung bobot dua kali: sekali saat menyusun Nilai Akhir, sekali
   lagi saat menyusun capaian kompetensi - dan hasilnya tidak dapat dijelaskan kepada guru
   sebagai apa pun. Rata-rata sederhana dapat: "nilai-nilai yang mengukur kompetensi ini,
   dirata-ratakan".

   Pembulatannya mengikuti kebiasaan yang sudah berlaku pada Nilai Akhir: dibulatkan ke
   bilangan bulat terdekat, lalu itulah angka yang dibandingkan dengan KKTP. Dengan begitu
   angka yang dilihat guru dan angka yang dipakai aplikasi selalu sama - tidak ada capaian
   yang tampak 75 tetapi diperlakukan sebagai 74,6. */
export function hitungCapaianButir(nilai){
  const angka=(Array.isArray(nilai)?nilai:[])
    .map(item=>Number(item?.score??item))
    .filter(item=>Number.isFinite(item));
  if(!angka.length)return null;
  return Math.round(angka.reduce((total,item)=>total+item,0)/angka.length);
}

export const PESAN_KKTP_BELUM_DIATUR='KKTP mata pelajaran ini belum ditetapkan Admin. Atur KKTP terlebih dahulu pada Bobot Penilaian sebelum ketercapaian kompetensi dapat dibaca.';

/* KKTP ADALAH MILIK ADMIN, DAN TIDAK PERNAH DITEBAK.

   Pengaturan penilaian punya bentuk bawaan supaya halaman Bobot dapat dibuka sebelum diisi.
   Bentuk bawaan itu sah untuk MENAMPILKAN formulir, tetapi tidak sah untuk MENYIMPULKAN
   ketercapaian: menyatakan seorang murid "sudah mencapai" berdasarkan angka yang tidak pernah
   ditetapkan sekolahnya adalah kesimpulan yang tidak punya dasar.

   Karena itu ketercapaian hanya dibaca bila Admin benar-benar sudah menyimpan KKTP-nya. Bila
   belum, aplikasi mengatakannya - bukan diam-diam memakai angka bawaan. */
export function kktpTersimpan(session,subjectId){
  requireActiveSubject(session,subjectId);
  const record=loadDb().assessmentSettings?.[`${scopeKey(session)}|${subjectId}`];
  const kktp=Number(record?.kktp);
  return Number.isFinite(kktp)&&kktp>0?kktp:null;
}
export function kktpSudahDiatur(session,subjectId){
  return kktpTersimpan(session,subjectId)!==null;
}
export function requireKktp(session,subjectId){
  const kktp=kktpTersimpan(session,subjectId);
  if(kktp===null)throw new Error(PESAN_KKTP_BELUM_DIATUR);
  return kktp;
}

/* Bukti nilai satu murid pada satu mata pelajaran, dikelompokkan menurut Butir CP.

   Nilai LAMA yang tersimpan sebelum keterangan kompetensi ada tidak punya `cpButirId`. Nilai
   itu tetap dipakai Nilai Akhir seperti biasa - tidak dihapus, tidak diubah, dan tidak
   ditebak kompetensinya. Yang tidak boleh terjadi hanyalah satu: ia diperlakukan sebagai
   bukti sebuah kompetensi, sebab tidak ada yang tahu kompetensi mana yang diukurnya. */
export function buktiButirSiswa(session,subjectId,studentId){
  requireActiveSubject(session,subjectId);
  const awalan=`${scopeKey(session)}|${subjectId}|`;
  const label=new Map(ASSESSMENT_TYPES.map(item=>[item.id,item.label]));
  const hasil=new Map();
  for(const [kunci,record] of Object.entries(loadDb().assessmentScores||{})){
    if(!kunci.startsWith(awalan))continue;
    if(record?.studentId!==studentId)continue;
    const butirId=String(record?.cpButirId||'').trim();
    if(!butirId)continue;
    const score=Number(record?.score);
    if(!Number.isFinite(score))continue;
    if(!hasil.has(butirId))hasil.set(butirId,[]);
    hasil.get(butirId).push({assessmentType:record.assessmentType,
      assessmentLabel:label.get(record.assessmentType)||record.assessmentType,score});
  }
  /* Urutan bukti mengikuti urutan komponen penilaian aplikasi, bukan urutan penyimpanan,
     supaya hasilnya sama persis setiap kali dibaca. */
  const urutan=ASSESSMENT_TYPES.map(item=>item.id);
  for(const daftar of hasil.values())
    daftar.sort((a,b)=>urutan.indexOf(a.assessmentType)-urutan.indexOf(b.assessmentType));
  return hasil;
}

/* CAPAIAN SELURUH BUTIR CP AKTIF satu murid pada satu mata pelajaran.

   Butir yang BELUM punya bukti tetap disebut, dengan capaian null dan `dinilai:false`. Ini
   disengaja: CP AKTIF dan CP SUDAH DINILAI adalah dua hal berbeda, dan aplikasi tidak boleh
   menyimpulkan apa pun tentang butir yang belum pernah diukur - tidak "sudah mencapai",
   tidak pula "belum mencapai". */
export function capaianButirSiswa(session,subjectId,studentId){
  const kktp=requireKktp(session,subjectId);
  const rubrik=getAssessmentSettings(session,subjectId).rubric;
  const bukti=buktiButirSiswa(session,subjectId,studentId);
  return listCpButir(session,subjectId,{activeOnly:true}).map(butir=>{
    const daftar=bukti.get(butir.id)||[];
    const capaian=hitungCapaianButir(daftar);
    return {
      butir,cpButirId:butir.id,
      teori:butir.teori||'',praktik:butir.praktik||'',
      evidence:daftar,
      dinilai:capaian!==null,
      capaian,
      kktp,
      /* Ketercapaian dibaca terhadap KKTP; kategorinya dibaca terhadap Rubrik yang dapat
         diatur sekolah. Keduanya dari sumber yang sama dengan Deskripsi Rapor, sehingga
         tidak mungkin bertentangan. */
      mencapai:capaian===null?null:capaian>=kktp,
      kategori:capaian===null?null:categoryForScore(capaian,rubrik),
    };
  });
}

/* KOMPETENSI TERKUAT dan AREA PENGUATAN.

   Keduanya hanya melihat butir yang BENAR-BENAR sudah dinilai. Butir aktif tanpa bukti tidak
   pernah menjadi "kekuatan" maupun "kekurangan" - menyebutnya salah satu di antaranya berarti
   mengarang.

   Bila capaian tertingginya seri, urutannya ditentukan urutan Butir CP pada mata pelajaran
   itu - bukan urutan penyimpanan dan bukan abjad. Urutan itu tetap sama setiap kali dibaca,
   sehingga hasilnya dapat diulang. */
export function ringkasanCapaianSiswa(session,subjectId,studentId){
  const daftar=capaianButirSiswa(session,subjectId,studentId);
  const dinilai=daftar.filter(item=>item.dinilai);
  const tertinggi=dinilai.length?Math.max(...dinilai.map(item=>item.capaian)):null;
  const kekuatan=dinilai.filter(item=>item.capaian===tertinggi);
  const penguatan=dinilai.filter(item=>item.mencapai===false);
  return {
    subjectId,studentId,
    kktp:daftar[0]?.kktp??requireKktp(session,subjectId),
    butir:daftar,
    dinilai,
    belumDinilai:daftar.filter(item=>!item.dinilai),
    /* Satu butir terkuat: yang pertama menurut urutan Butir CP di antara yang capaiannya
       tertinggi. Daftar lengkap serinya ikut dibawa supaya pemanggil dapat menyebut lebih
       dari satu bila memang perlu. */
    terkuat:kekuatan[0]||null,
    kekuatan,
    penguatan,
    /* Seluruh butir yang sudah dinilai mencapai KKTP: tidak ada kekurangan yang dapat
       disebut, dan aplikasi tidak boleh mengarangnya. */
    seluruhnyaMencapai:dinilai.length>0&&penguatan.length===0,
  };
}

/* Ringkasan seluruh murid satu rombel pada satu mata pelajaran. Dipakai halaman untuk
   menampilkan keadaan kelas sekaligus. */
export function ringkasanCapaianKelas(session,subjectId){
  return listStudents(session,{classId:session.classId}).map(student=>({
    student:{id:student.id,name:student.name},
    ...ringkasanCapaianSiswa(session,subjectId,student.id),
  }));
}

/* ------------------------------------------------------- DESKRIPSI DARI BUKTI CAPAIAN

   Kalimat disusun dari kompetensi yang MEMANG sudah dinilai, ketercapaiannya terhadap KKTP
   sekolah, dan nama muridnya. Yang tidak pernah masuk ke dalam kalimat: angka nilai, angka
   KKTP, kode CP, id, fase, maupun istilah penyimpanan - orang tua membaca kompetensi anaknya,
   bukan isi basis data.

   Dua keadaan yang dibedakan dengan tegas:

     Ada butir di bawah KKTP  -> sebut kekuatannya, lalu sebut yang perlu penguatan.
     Semua yang dinilai tercapai -> sebut kekuatannya saja. TIDAK ADA kekurangan yang dikarang.

   Butir yang belum punya bukti tidak pernah ikut, dalam keadaan mana pun. */
export const PESAN_BELUM_ADA_BUKTI='Belum ada nilai yang terhubung dengan Butir CP pada mata pelajaran ini, sehingga capaian kompetensi belum dapat disimpulkan.';

export function komposisiDeskripsiCapaian(session,subjectId,studentId,{studentName=''}={}){
  const ringkasan=ringkasanCapaianSiswa(session,subjectId,studentId);
  const nama=String(studentName||'').trim();
  if(!nama||!ringkasan.dinilai.length)return null;
  return {
    ...ringkasan,
    studentName:nama,
    kompetensiKuat:ringkasan.kekuatan.map(frasaKompetensi).filter(Boolean),
    kompetensiPenguatan:ringkasan.penguatan.map(frasaKompetensi).filter(Boolean),
  };
}

/* Kompetensi yang disebut adalah rumusan Butir CP itu sendiri. Rumusan Teori dipakai lebih
   dulu karena ia berbentuk pokok kompetensi; rumusan Praktik dipakai bila hanya itu yang ada. */
function frasaKompetensi(item){
  return String(item?.teori||item?.praktik||'').trim();
}

/* ------------------------------------------- PREDIKAT INTRAKURIKULER DARI BUKTI CAPAIAN

   Rubrik Deskripsi Rapor memakai huruf besar - SANGAT BAIK, BAIK, CUKUP, PERLU BIMBINGAN -
   sedangkan predikat kegiatan memakai huruf kapital di awal kata. Keduanya menyatakan hal yang
   sama, jadi yang diperlukan hanyalah menyelaraskan penulisannya; tidak ada aturan kedua yang
   diciptakan di sini.

   Inilah yang menutup kemungkinan bertentangan: predikat Intrakurikuler untuk data yang punya
   bukti nilai TIDAK lagi ditebak guru, melainkan dibaca dari capaian kompetensinya sendiri
   terhadap KKTP dan Rubrik sekolah. Tidak akan ada lagi murid yang capaiannya di bawah KKTP
   tetapi tercatat "Sangat Baik". */
const PREDIKAT_DARI_KATEGORI=Object.freeze({
  'SANGAT BAIK':'Sangat Baik','BAIK':'Baik','CUKUP':'Cukup','PERLU BIMBINGAN':'Perlu Bimbingan',
});

/* Predikat satu murid pada satu mata pelajaran berdasarkan bukti nilai yang terhubung Butir CP.

   Yang dipakai adalah capaian SELURUH butir yang sudah dinilai, dirata-ratakan dengan cara yang
   sama seperti capaian per butir - rata-rata sederhana - lalu dibaca lewat Rubrik. Bila belum
   ada satu pun bukti, hasilnya null: aplikasi tidak menebak, dan guru tetap memilih sendiri
   seperti sebelumnya. */
export function predikatIntraDariCapaian(session,subjectId,studentId){
  let ringkasan;
  try{ringkasan=ringkasanCapaianSiswa(session,subjectId,studentId);}catch{return null;}
  if(!ringkasan.dinilai.length)return null;
  const rata=hitungCapaianButir(ringkasan.dinilai.map(item=>({score:item.capaian})));
  if(rata===null)return null;
  const rubrik=getAssessmentSettings(session,subjectId).rubric;
  const kategori=categoryForScore(rata,rubrik);
  return {predicate:PREDIKAT_DARI_KATEGORI[kategori]||null,kategori,capaian:rata,
    kktp:ringkasan.kktp,mencapai:rata>=ringkasan.kktp,
    butirDinilai:ringkasan.dinilai.length};
}
