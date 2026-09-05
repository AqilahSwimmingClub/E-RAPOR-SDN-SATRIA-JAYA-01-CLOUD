
/* Pilihan ekstrakurikuler tersedia langsung di dropdown. Guru tidak perlu membuat master
   apa pun sebelum mengisi nilai siswa. Pramuka selalu berada di urutan pertama sebagai
   ekstrakurikuler wajib, dan namanya mengikuti tingkat kelas: Siaga untuk kelas 1-3,
   Penggalang untuk kelas 4-6. */

const UMUM=Object.freeze([
  {name:'Olahraga dan Kebugaran',description:'melatih kebugaran, sportivitas, dan kerja sama melalui permainan serta latihan fisik yang menyenangkan.'},
  {name:'Seni Tari dan Musik',description:'mengembangkan ekspresi, kepekaan irama, dan percaya diri melalui latihan gerak, lagu, dan penampilan bersama.'},
  {name:'Baca Tulis Al-Quran',description:'membiasakan membaca, menulis, dan memahami bacaan Al-Quran dengan tertib serta penuh tanggung jawab.'},
  {name:'Dokter Kecil dan UKS',description:'mengenalkan perilaku hidup bersih dan sehat serta melatih kepedulian terhadap kesehatan diri dan teman.'},
  {name:'Pramuka Garuda dan Kepemimpinan',description:'melatih kepemimpinan, kemandirian, dan tanggung jawab melalui kegiatan kepramukaan lanjutan.'},
  {name:'Pencak Silat',description:'melatih kedisiplinan, ketangkasan, dan pengendalian diri melalui gerakan dasar bela diri.'},
  {name:'English Club',description:'membiasakan penggunaan kosakata dan percakapan bahasa Inggris sederhana dengan percaya diri.'},
  {name:'Komputer dan Literasi Digital',description:'mengenalkan penggunaan perangkat digital secara bijak untuk belajar dan berkarya.'},
]);

function gradeOf(classId){const match=String(classId||'').trim().match(/^([1-6])/);return match?Number(match[1]):null;}

export function pramukaActivityName(classId){const grade=gradeOf(classId);return grade&&grade<=3?'Pramuka Siaga':'Pramuka Penggalang';}

export function defaultExtracurricularActivities(classId){
  const grade=gradeOf(classId);
  const pramuka={
    name:pramukaActivityName(classId),
    description:grade&&grade<=3
      ?'melatih kemandirian, kedisiplinan, dan kerja sama melalui latihan dasar kepramukaan.'
      :'melatih kepemimpinan, keterampilan kepramukaan, kedisiplinan, dan kepedulian terhadap lingkungan.',
    isDefault:true,
  };
  return [pramuka,...UMUM.filter(item=>item.name!==pramuka.name).map(item=>({...item,isDefault:false}))];
}

export function findExtracurricularDefault(classId,name){
  const target=String(name||'').trim().toLowerCase();
  return defaultExtracurricularActivities(classId).find(item=>item.name.toLowerCase()===target)||null;
}

/* DESKRIPSI EKSTRAKURIKULER - penyusun sendiri, bukan template bersama.

   Ekstrakurikuler bukan mata pelajaran, jadi kalimatnya tidak boleh berbunyi seperti deskripsi
   mata pelajaran. Yang diceritakan adalah KEIKUTSERTAAN anak pada kegiatan itu beserta
   perkembangan yang ditunjukkannya - untuk Pramuka misalnya kemandirian, kedisiplinan, dan
   kerja sama, yang memang tersimpan sebagai keterangan kegiatannya.

   SUMBERNYA HANYA DATA EKSTRAKURIKULER YANG MEMANG ADA: nama kegiatan, keterangan kegiatan yang
   tersimpan atau bawaannya, dan predikat. Kegiatan yang tidak punya keterangan tidak dikarangkan
   capaian - kalimatnya berhenti pada keikutsertaan dan predikat. */
const NADA_EKSTRA=Object.freeze({
  'Sangat Baik':['mengikuti dengan sangat baik, aktif, dan konsisten','menunjukkan keaktifan yang sangat baik dalam mengikuti'],
  'Baik':['mengikuti dengan baik dan tertib','menunjukkan keaktifan yang baik dalam mengikuti'],
  'Cukup':['mengikuti dengan cukup baik','cukup aktif mengikuti'],
  'Perlu Bimbingan':['mengikuti dan masih memerlukan bimbingan','masih memerlukan bimbingan untuk mengikuti secara konsisten'],
});
/* Sama seperti Kokurikuler: bervariasi, tetapi tetap untuk masukan yang sama. */
function pilihNadaEkstra(daftar,kunci){
  if(!Array.isArray(daftar)||!daftar.length)return '';
  let angka=0;const teks=String(kunci||'');
  for(let i=0;i<teks.length;i+=1)angka=(angka*31+teks.charCodeAt(i))>>>0;
  return daftar[angka%daftar.length];
}
function tanpaTitikEkstra(teks){return String(teks||'').trim().replace(/[.!?]+$/,'');}

export function generateExtracurricularDescription({studentName='',activity,predicate='Baik',classId=''}={}){
  const activityName=String(activity?.name||activity||'').trim();
  const detail=tanpaTitikEkstra(activity?.description
    ||findExtracurricularDefault(classId,activityName)?.description||'');
  const nama=String(studentName||'Siswa').trim()||'Siswa';
  const kegiatan=activityName||'kegiatan ekstrakurikuler';
  const nada=pilihNadaEkstra(NADA_EKSTRA[predicate]||NADA_EKSTRA.Baik,`${nama}|${kegiatan}|${predicate}`);
  /* Nama kegiatan selalu ikut ke dalam kalimat, sehingga deskripsi satu kegiatan tidak pernah
     dapat terbaca sebagai deskripsi kegiatan lain. */
  const inti=`Ananda ${nama} ${nada} pada kegiatan ekstrakurikuler ${kegiatan}.`;
  return detail?`${inti} Kegiatan ini ${detail}.`:inti;
}
