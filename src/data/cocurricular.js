
/* Kegiatan kokurikuler bawaan beserta pilihan deskripsi rapor.
   Setiap kegiatan punya 5 deskripsi kelas rendah (1-3) dan 5 deskripsi kelas tinggi (4-6),
   ditulis dengan bahasa rapor yang formal, positif, dan mudah dipahami orang tua. */
export const COCURRICULAR_ACTIVITY_PRESETS=Object.freeze([
  Object.freeze({
    id:'kunjungan-edukasi',
    name:'Kunjungan Edukasi (Field Trip)',
    lower:Object.freeze([
      'Antusias mengikuti kunjungan edukasi dan mengamati lingkungan baru dengan rasa ingin tahu yang besar.',
      'Mampu menyebutkan kembali hal-hal menarik yang dilihat selama kunjungan dengan bahasa sendiri.',
      'Menunjukkan sikap tertib dan mengikuti arahan pendamping selama kegiatan kunjungan berlangsung.',
      'Berani bertanya kepada petugas maupun guru mengenai hal baru yang ditemui saat kunjungan.',
      'Senang berbagi cerita pengalaman kunjungan kepada teman dan keluarga di rumah.',
    ]),
    upper:Object.freeze([
      'Mengamati objek kunjungan dengan cermat dan mencatat informasi penting secara mandiri.',
      'Mampu menghubungkan pengalaman langsung saat kunjungan dengan materi pelajaran di kelas.',
      'Menyusun laporan sederhana hasil kunjungan dengan runtut dan menyampaikannya dengan percaya diri.',
      'Menunjukkan rasa ingin tahu yang tinggi melalui pertanyaan kritis selama kegiatan kunjungan.',
      'Menjaga sikap, ketertiban, dan nama baik sekolah selama kegiatan kunjungan edukasi.',
    ]),
  }),
  Object.freeze({
    id:'peduli-lingkungan',
    name:'Proyek Peduli Lingkungan',
    lower:Object.freeze([
      'Terbiasa membuang sampah pada tempatnya dan menjaga kebersihan kelas setiap hari.',
      'Aktif mengikuti kegiatan kebersihan bersama dengan gembira dan penuh semangat.',
      'Mulai memahami pentingnya menjaga kebersihan lingkungan sekolah dan rumah.',
      'Ikut merawat tanaman di lingkungan sekolah dengan penuh tanggung jawab.',
      'Mengajak teman untuk menjaga kebersihan kelas dan halaman sekolah.',
    ]),
    upper:Object.freeze([
      'Berperan aktif dalam proyek peduli lingkungan dan menjalankan tugas kelompok dengan tanggung jawab.',
      'Mampu menjelaskan dampak menjaga kebersihan bagi kesehatan dan kenyamanan bersama.',
      'Menunjukkan inisiatif memilah sampah serta mengajak teman melakukan hal yang sama.',
      'Merancang dan melaksanakan kegiatan sederhana untuk merawat lingkungan sekolah.',
      'Konsisten menjaga kebersihan dan menjadi teladan bagi teman dalam kepedulian lingkungan.',
    ]),
  }),
  Object.freeze({
    id:'bakti-sosial',
    name:'Bakti Sosial',
    lower:Object.freeze([
      'Ikut serta dalam kegiatan berbagi dengan senang hati dan tanpa membeda-bedakan teman.',
      'Menunjukkan sikap peduli kepada teman yang membutuhkan bantuan.',
      'Mulai memahami pentingnya berbagi dan menolong sesama.',
      'Bekerja sama dengan teman saat menyiapkan bantuan dalam kegiatan bakti sosial.',
      'Bersikap ramah dan sopan kepada semua pihak selama kegiatan bakti sosial.',
    ]),
    upper:Object.freeze([
      'Aktif merencanakan dan melaksanakan kegiatan bakti sosial bersama kelompok dengan penuh tanggung jawab.',
      'Menunjukkan empati yang tinggi terhadap sesama dan peka pada kebutuhan orang lain.',
      'Mampu bekerja sama dan membagi tugas dengan baik selama kegiatan bakti sosial.',
      'Menjadi penggerak bagi teman dalam kegiatan kepedulian sosial di sekolah.',
      'Melaksanakan kegiatan bakti sosial dengan tulus serta menjaga sikap santun kepada penerima bantuan.',
    ]),
  }),
  Object.freeze({
    id:'pengenalan-budaya',
    name:'Pengenalan Budaya',
    lower:Object.freeze([
      'Senang mengenal lagu, permainan, dan pakaian daerah yang diperkenalkan di sekolah.',
      'Mampu menyebutkan beberapa contoh budaya daerah yang telah dipelajari.',
      'Ikut serta dengan gembira dalam kegiatan seni dan budaya di kelas.',
      'Menunjukkan sikap menghargai perbedaan kebiasaan dan budaya teman.',
      'Berani menampilkan kesenian daerah sederhana di depan teman-temannya.',
    ]),
    upper:Object.freeze([
      'Mengenal beragam budaya daerah dan mampu menjelaskan ciri khasnya dengan baik.',
      'Menunjukkan sikap menghargai keberagaman budaya dalam pergaulan sehari-hari.',
      'Aktif menampilkan dan melestarikan kesenian daerah dalam kegiatan sekolah.',
      'Mampu membandingkan budaya daerah sendiri dengan daerah lain secara santun.',
      'Bangga terhadap budaya bangsa dan mengajak teman ikut melestarikannya.',
    ]),
  }),
  Object.freeze({
    id:'pelatihan-literasi',
    name:'Pelatihan Literasi',
    lower:Object.freeze([
      'Senang membaca buku cerita dan mulai terbiasa membaca setiap hari.',
      'Mampu menceritakan kembali isi bacaan sederhana dengan bahasa sendiri.',
      'Menunjukkan minat baca yang baik dan rajin mengunjungi pojok baca kelas.',
      'Berani membacakan cerita di depan teman dengan suara yang jelas.',
      'Mulai mampu menuliskan gagasan sederhana setelah membaca.',
    ]),
    upper:Object.freeze([
      'Membaca beragam teks dengan lancar dan memahami isi bacaan dengan baik.',
      'Mampu menemukan informasi penting dari bacaan dan menyampaikannya kembali secara runtut.',
      'Terampil menuangkan gagasan dalam tulisan yang rapi dan mudah dipahami.',
      'Aktif berdiskusi mengenai isi bacaan dengan pendapat yang beralasan.',
      'Menunjukkan kebiasaan membaca yang konsisten dan menjadi teladan literasi bagi teman.',
    ]),
  }),
]);

export function cocurricularActivityNames(){return COCURRICULAR_ACTIVITY_PRESETS.map(item=>item.name);}
export function findCocurricularPreset(activity){
  const value=String(activity||'').trim().toLowerCase();
  return COCURRICULAR_ACTIVITY_PRESETS.find(item=>item.id===value||item.name.toLowerCase()===value)||null;
}

/* DESKRIPSI KOKURIKULER - penyusun sendiri, bukan template bersama.

   Kokurikuler adalah PROJEK: anak mengerjakan sesuatu bersama, dan yang layak diceritakan
   adalah kegiatan projeknya beserta capaian yang ditunjukkannya. Karena itu kalimatnya dibuka
   dengan keikutsertaan pada projek - bukan dengan "menunjukkan penguasaan" seperti mata
   pelajaran, dan bukan dengan bahasa kompetensi seperti Intrakurikuler.

   SUMBERNYA HANYA DATA KOKURIKULER YANG MEMANG ADA: nama kegiatan yang tersimpan, capaian dari
   preset tingkat kelasnya, dan predikat. Tidak ada capaian yang dikarang untuk kegiatan yang
   presetnya tidak dikenal - kalimatnya cukup berhenti pada keikutsertaan dan predikat. */
const NADA_KOKURIKULER=Object.freeze({
  'Sangat Baik':'terlibat aktif dan konsisten',
  'Baik':'terlibat dengan baik',
  'Cukup':'terlibat dengan cukup baik',
  'Perlu Bimbingan':'terlibat dan masih memerlukan bimbingan',
});
function tanpaTitik(teks){return String(teks||'').trim().replace(/[.!?]+$/,'');}
function hurufKecilAwal(teks){return `${String(teks||'').charAt(0).toLowerCase()}${String(teks||'').slice(1)}`;}

export function generateCocurricularDescription({studentName='',activity,predicate='Baik',classId=''}={}){
  const activityName=String(activity?.name||activity||'').trim();
  const preset=findCocurricularPreset(activityName);
  const grade=Number.parseInt(String(classId||'').trim(),10);
  const daftar=preset?(grade&&grade<=3?preset.lower:preset.upper):[];
  const nada=NADA_KOKURIKULER[predicate]||NADA_KOKURIKULER.Baik;
  const nama=String(studentName||'Siswa').trim()||'Siswa';
  const kegiatan=activityName||'kegiatan kokurikuler';
  const capaian=tanpaTitik(daftar[0]||'');
  const inti=`${nama} ${nada} pada kegiatan kokurikuler ${kegiatan}.`;
  return capaian?`${inti} ${capaian[0].toUpperCase()}${hurufKecilAwal(capaian).slice(1)}.`:inti;
}
