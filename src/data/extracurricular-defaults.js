import { composeActivityDescription } from './activity-description.js';

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

export function generateExtracurricularDescription({studentName='',activity,predicate='Baik',classId=''}={}){
  const activityName=String(activity?.name||activity||'').trim();
  const detail=String(activity?.description||findExtracurricularDefault(classId,activityName)?.description||'').trim();
  return composeActivityDescription({studentName,activityName,detail,predicate,fallbackActivity:'ekstrakurikuler'});
}
