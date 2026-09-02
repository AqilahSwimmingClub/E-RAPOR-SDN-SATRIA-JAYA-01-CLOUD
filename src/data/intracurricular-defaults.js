import { composeActivityDescription } from './activity-description.js';

const PHASE_BY_GRADE=Object.freeze({1:'A',2:'A',3:'B',4:'B',5:'C',6:'C'});

const ACTIVITIES=Object.freeze({
  A:Object.freeze([
    {name:'Literasi Membaca dan Menceritakan Kembali',description:'Menguatkan kemampuan memahami bacaan sederhana, menemukan informasi penting, dan menceritakan kembali dengan bahasa sendiri.'},
    {name:'Numerasi Bilangan dan Operasi Dasar',description:'Menguatkan pemahaman bilangan, perbandingan, penjumlahan, pengurangan, serta penerapannya dalam situasi sehari-hari.'},
    {name:'Pengamatan Lingkungan Sekitar',description:'Melatih siswa mengamati benda, makhluk hidup, cuaca, dan perubahan sederhana di lingkungan sekitar.'},
    {name:'Proyek Hidup Bersih dan Sehat',description:'Membiasakan perilaku hidup bersih, sehat, aman, dan bertanggung jawab di rumah maupun sekolah.'},
    {name:'Komunikasi dan Kerja Sama',description:'Melatih kemampuan menyampaikan pendapat, mendengarkan, berbagi tugas, dan bekerja sama dengan teman.'},
    {name:'Seni dan Ekspresi Kreatif',description:'Mengembangkan kreativitas melalui gambar, bentuk, bunyi, gerak, dan karya sederhana sesuai pengalaman siswa.'}
  ]),
  B:Object.freeze([
    {name:'Literasi Teks Informasi dan Cerita',description:'Menguatkan kemampuan menemukan ide pokok, informasi rinci, kosakata, dan menyampaikan kembali isi teks secara runtut.'},
    {name:'Numerasi Pemecahan Masalah',description:'Mengembangkan strategi pemecahan masalah menggunakan operasi hitung, pengukuran, pecahan sederhana, dan data.'},
    {name:'Eksplorasi IPAS Lingkungan dan Energi',description:'Menguatkan keterampilan mengamati, menanya, mencoba, mencatat hasil, dan menjelaskan gejala alam maupun sosial di sekitar.'},
    {name:'Proyek Peduli Lingkungan',description:'Mendorong siswa mengenali masalah lingkungan sederhana dan melakukan tindakan nyata yang bertanggung jawab.'},
    {name:'Komunikasi, Kolaborasi, dan Presentasi',description:'Melatih siswa bekerja dalam kelompok, menyusun hasil kerja, serta mempresentasikan gagasan dengan percaya diri.'},
    {name:'Kreativitas Seni dan Karya Terapan',description:'Mengembangkan ide kreatif melalui karya visual, musik, gerak, kerajinan, atau produk sederhana yang kontekstual.'}
  ]),
  C:Object.freeze([
    {name:'Literasi Kritis dan Presentasi',description:'Menguatkan kemampuan memahami berbagai teks, membandingkan informasi, menyimpulkan, dan mempresentasikan hasil pemikiran secara runtut.'},
    {name:'Numerasi Kontekstual dan Data',description:'Mengembangkan kemampuan menggunakan pecahan, desimal, pengukuran, geometri, data, dan operasi hitung untuk memecahkan masalah kontekstual.'},
    {name:'Investigasi IPAS dan Pemecahan Masalah',description:'Melatih siswa merancang pengamatan atau penyelidikan sederhana, mengolah informasi, menarik kesimpulan, dan menjelaskan keterkaitan sebab akibat.'},
    {name:'Proyek Kepedulian Sosial dan Lingkungan',description:'Mendorong siswa mengidentifikasi kebutuhan di sekitar, merancang tindakan, bekerja sama, dan melakukan refleksi atas hasil kegiatan.'},
    {name:'Kolaborasi, Kepemimpinan, dan Komunikasi',description:'Menguatkan kemampuan membagi peran, mengambil tanggung jawab, menyampaikan argumen, serta menghargai pendapat dalam kerja kelompok.'},
    {name:'Kreativitas, Teknologi, dan Karya',description:'Mengembangkan kreativitas melalui perencanaan, pembuatan, pengujian, dan perbaikan karya atau solusi sederhana dengan memanfaatkan teknologi secara bijak.'}
  ])
});

function gradeOf(classId){const match=String(classId||'').trim().match(/^([1-6])/);return match?Number(match[1]):null;}

export function defaultIntracurricularActivities(classId){
  const grade=gradeOf(classId);if(!grade)return [];
  const phase=PHASE_BY_GRADE[grade];
  return ACTIVITIES[phase].map((item,index)=>({id:`default-${grade}-${index+1}`,name:item.name,description:item.description,phase,grade,active:true,isDefault:true}));
}

export function generateIntracurricularDescription({studentName='',activity,predicate='Baik'}={}){
  return composeActivityDescription({
    studentName,
    activityName:String(activity?.name||activity||'').trim(),
    detail:activity?.description,
    predicate,
    fallbackActivity:'kegiatan intrakurikuler',
  });
}
