
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
  /* ------------------------------------------------------------------ RAGAM TAMBAHAN

     Empat kegiatan berikut melengkapi ragam yang sudah ada supaya rumpun kegiatan kokurikuler
     yang lazim diselenggarakan sekolah dasar - keagamaan dan karakter, sains dan teknologi,
     seni, serta kewirausahaan - punya pilihannya sendiri. Sebelumnya rumpun itu terpaksa
     dititipkan ke kegiatan lain yang deskripsinya tidak menceritakannya.

     Penambahannya bersifat MENAMBAH SAJA: kelima kegiatan lama beserta id, nama, dan seluruh
     kalimatnya tidak disentuh, sehingga data yang sudah tersimpan tetap menemukan presetnya. */
  Object.freeze({
    id:'keagamaan-karakter',
    name:'Kegiatan Keagamaan dan Penguatan Karakter',
    lower:Object.freeze([
      'Terbiasa berdoa sebelum dan sesudah kegiatan dengan tertib dan sungguh-sungguh.',
      'Mengikuti kegiatan keagamaan di sekolah dengan senang hati dan penuh perhatian.',
      'Membiasakan diri mengucapkan salam, terima kasih, dan maaf kepada guru dan teman.',
      'Menunjukkan sikap jujur dan berani mengakui kesalahan dalam kegiatan sehari-hari.',
      'Mulai terbiasa menolong teman tanpa diminta dalam kegiatan bersama.',
    ]),
    upper:Object.freeze([
      'Mengikuti kegiatan keagamaan dengan khusyuk serta memahami makna di balik pembiasaannya.',
      'Menunjukkan kejujuran dan tanggung jawab yang konsisten dalam kegiatan sehari-hari.',
      'Menjadi teladan bagi teman dalam bersikap santun kepada guru dan sesama.',
      'Aktif mengambil peran dalam kegiatan keagamaan sekolah dengan penuh kesungguhan.',
      'Mampu menjelaskan nilai baik yang dipelajarinya dan menerapkannya dalam pergaulan.',
    ]),
  }),
  Object.freeze({
    id:'sains-teknologi',
    name:'Praktik Sains dan Teknologi',
    lower:Object.freeze([
      'Antusias mengikuti percobaan sederhana dan mengamati hasilnya dengan rasa ingin tahu.',
      'Mampu menyebutkan apa yang dilihatnya selama percobaan dengan bahasa sendiri.',
      'Mengikuti langkah percobaan sesuai arahan guru dengan tertib dan hati-hati.',
      'Berani bertanya mengenai hal baru yang ditemuinya saat kegiatan praktik.',
      'Senang mencoba kembali kegiatan percobaan bersama teman kelompoknya.',
    ]),
    upper:Object.freeze([
      'Melakukan percobaan sesuai prosedur dan mencatat hasil pengamatannya secara mandiri.',
      'Mampu menarik kesimpulan sederhana dari data yang diperolehnya selama percobaan.',
      'Menggunakan alat dan bahan praktik dengan tepat serta menjaga keselamatan kerja.',
      'Menunjukkan sikap teliti dan pantang menyerah ketika percobaan belum berhasil.',
      'Menyampaikan hasil percobaan kepada teman dengan runtut dan percaya diri.',
    ]),
  }),
  Object.freeze({
    id:'pentas-seni',
    name:'Pentas Seni dan Kreativitas',
    lower:Object.freeze([
      'Senang mengikuti kegiatan menyanyi, menari, dan berkarya bersama teman.',
      'Berani tampil di depan kelas dengan percaya diri sesuai kemampuannya.',
      'Mengerjakan karya sederhana dengan rapi dan penuh semangat.',
      'Mengikuti latihan bersama dengan tertib dan mendengarkan arahan pembimbing.',
      'Menghargai penampilan teman dengan memberi tepuk tangan dan sikap yang baik.',
    ]),
    upper:Object.freeze([
      'Menampilkan karya seni dengan persiapan yang matang dan percaya diri.',
      'Mengembangkan gagasan kreatif menjadi karya yang utuh dan layak ditampilkan.',
      'Bekerja sama dalam kelompok latihan dan menjalankan perannya dengan tanggung jawab.',
      'Menunjukkan disiplin berlatih hingga penampilannya berkembang dari waktu ke waktu.',
      'Menghargai karya teman serta memberi tanggapan yang membangun.',
    ]),
  }),
  Object.freeze({
    id:'kewirausahaan',
    name:'Kewirausahaan (Market Day)',
    lower:Object.freeze([
      'Antusias menyiapkan barang dagangan bersama kelompok dengan gembira.',
      'Berani menawarkan produk kepada pembeli dengan sopan dan ramah.',
      'Mulai memahami kegiatan jual beli sederhana beserta nilai uang.',
      'Menjaga kebersihan dan kerapian meja kelompok selama kegiatan berlangsung.',
      'Bekerja sama dengan teman dalam membagi tugas kegiatan Market Day.',
    ]),
    upper:Object.freeze([
      'Merencanakan produk, harga, dan pembagian tugas kelompok dengan matang.',
      'Melayani pembeli dengan ramah, jujur, dan bertanggung jawab.',
      'Mampu menghitung modal serta hasil penjualan kelompoknya dengan teliti.',
      'Menunjukkan inisiatif dan kreativitas dalam menarik minat pembeli.',
      'Mengevaluasi jalannya kegiatan dan menyampaikan usulan perbaikan secara santun.',
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
  'Sangat Baik':['terlibat aktif dan konsisten','menunjukkan keterlibatan yang sangat baik','berpartisipasi aktif dan konsisten'],
  'Baik':['terlibat dengan baik','menunjukkan keterlibatan yang baik','berpartisipasi dengan baik'],
  'Cukup':['terlibat dengan cukup baik','menunjukkan keterlibatan yang cukup'],
  'Perlu Bimbingan':['terlibat dan masih memerlukan bimbingan','masih memerlukan bimbingan untuk terlibat secara konsisten'],
});
/* Redaksi berganti-ganti supaya satu rombel tidak berbunyi seragam, tetapi TETAP untuk masukan
   yang sama: kalimat yang sama harus lahir lagi ketika guru menekan Generate untuk kedua
   kalinya. Indeksnya karena itu diturunkan dari isi masukannya, bukan dari Math.random. */
function pilihNada(daftar,kunci){
  if(!Array.isArray(daftar)||!daftar.length)return '';
  let angka=0;const teks=String(kunci||'');
  for(let i=0;i<teks.length;i+=1)angka=(angka*31+teks.charCodeAt(i))>>>0;
  return daftar[angka%daftar.length];
}
function tanpaTitik(teks){return String(teks||'').trim().replace(/[.!?]+$/,'');}
function hurufKecilAwal(teks){return `${String(teks||'').charAt(0).toLowerCase()}${String(teks||'').slice(1)}`;}

export function generateCocurricularDescription({studentName='',activity,predicate='Baik',classId=''}={}){
  const activityName=String(activity?.name||activity||'').trim();
  const preset=findCocurricularPreset(activityName);
  const grade=Number.parseInt(String(classId||'').trim(),10);
  const daftar=preset?(grade&&grade<=3?preset.lower:preset.upper):[];
  const nama=String(studentName||'Siswa').trim()||'Siswa';
  const kegiatan=activityName||'kegiatan kokurikuler';
  const nada=pilihNada(NADA_KOKURIKULER[predicate]||NADA_KOKURIKULER.Baik,`${nama}|${kegiatan}|${predicate}`);
  /* KALIMATNYA TERIKAT PADA KEGIATAN YANG SEDANG DIPILIH. Nama kegiatan selalu ikut, sehingga
     deskripsi yang lahir untuk satu kegiatan tidak pernah dapat dibaca sebagai deskripsi
     kegiatan lain. */
  const inti=`Ananda ${nama} ${nada} pada kegiatan kokurikuler ${kegiatan}.`;
  /* Keterangan preset menerangkan KEGIATANNYA, bukan capaian anak. Ia disebut sebagai fokus
     kegiatan - bukan sebagai prestasi yang tidak pernah dinilai guru. */
  const fokus=tanpaTitik(daftar[0]||'');
  return fokus?`${inti} Kegiatan ini mencakup ${hurufKecilAwal(fokus)}.`:inti;
}
