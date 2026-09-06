
/* DIMENSI PROFIL PELAJAR PANCASILA — INDIKATOR PENILAIAN KOKURIKULER.

   Panduan kegiatan kokurikuler menetapkan bahwa indikator penilaiannya mengacu pada Dimensi
   Profil Pelajar Pancasila, bukan pada penguasaan materi seperti mata pelajaran. Keenamnya
   dicatat di sini sebagai daftar tetap supaya kalimat rapor menyebut dimensi yang memang ada,
   bukan istilah yang diketik bebas dan bisa berbeda-beda antar guru.

   Dimensi bersifat OPSIONAL pada penyimpanan: catatan kokurikuler yang dibuat sebelum daftar
   ini ada tetap sah dan tetap terbaca apa adanya. */
export const DIMENSI_PROFIL_PELAJAR_PANCASILA=Object.freeze([
  Object.freeze({id:'beriman',label:'Beriman dan Berakhlak Mulia',
    penuh:'Beriman, Bertakwa kepada Tuhan Yang Maha Esa, dan Berakhlak Mulia'}),
  Object.freeze({id:'berkebinekaan-global',label:'Berkebinekaan Global',penuh:'Berkebinekaan Global'}),
  Object.freeze({id:'gotong-royong',label:'Gotong Royong',penuh:'Gotong Royong'}),
  Object.freeze({id:'mandiri',label:'Mandiri',penuh:'Mandiri'}),
  Object.freeze({id:'bernalar-kritis',label:'Bernalar Kritis',penuh:'Bernalar Kritis'}),
  Object.freeze({id:'kreatif',label:'Kreatif',penuh:'Kreatif'}),
]);
export function findDimensiProfil(value){
  const teks=String(value||'').trim().toLowerCase();
  if(!teks)return null;
  return DIMENSI_PROFIL_PELAJAR_PANCASILA.find(item=>
    item.id===teks||item.label.toLowerCase()===teks||item.penuh.toLowerCase()===teks)||null;
}

/* PREDIKAT KOKURIKULER — DOMAIN SENDIRI, TERPISAH DARI MENU LAIN.

   Panduan kegiatan kokurikuler menilai PERKEMBANGAN karakter, bukan penguasaan materi, dan
   istilahnya memang berbeda: Belum Berkembang, Mulai Berkembang, Berkembang Sesuai Harapan,
   dan Sangat Berkembang. Menyebut anak "Cukup" pada sebuah projek karakter tidak pernah
   berarti apa pun bagi orang tua.

   Karena itu Kokurikuler kini memakai domainnya sendiri. Intrakurikuler, Ekstrakurikuler, dan
   Nilai Sikap TIDAK ikut berubah - ketiganya tetap memakai predikatnya masing-masing, dan
   perubahan di sini tidak menyentuh satu pun di antaranya.

   CATATAN LAMA TIDAK DIMIGRASI. Predikat versi sebelumnya tetap tersimpan apa adanya di dalam
   database dan diterjemahkan saat DIBACA - satu lawan satu, urutan dan maknanya sejajar:

     Perlu Bimbingan -> BB   Belum Berkembang
     Cukup           -> MB   Mulai Berkembang
     Baik            -> BSH  Berkembang Sesuai Harapan
     Sangat Baik     -> SB   Sangat Berkembang

   Tidak ada penulisan ulang massal: catatan lama baru berpindah istilah ketika guru sendiri
   menyimpannya kembali. */
export const PREDIKAT_KOKURIKULER=Object.freeze([
  Object.freeze({kode:'SB',label:'Sangat Berkembang'}),
  Object.freeze({kode:'BSH',label:'Berkembang Sesuai Harapan'}),
  Object.freeze({kode:'MB',label:'Mulai Berkembang'}),
  Object.freeze({kode:'BB',label:'Belum Berkembang'}),
]);
export const PREDIKAT_KOKURIKULER_LABEL=Object.freeze(PREDIKAT_KOKURIKULER.map(item=>item.label));
export const DEFAULT_PREDIKAT_KOKURIKULER='Berkembang Sesuai Harapan';
/* Predikat versi lama, hanya untuk MEMBACA catatan yang sudah tersimpan. */
export const PREDIKAT_KOKURIKULER_LAMA=Object.freeze({
  'Perlu Bimbingan':'BB',
  'Cukup':'MB',
  'Baik':'BSH',
  'Sangat Baik':'SB',
});
/* Menerima label baru, kodenya, maupun predikat versi lama. Mengembalikan null untuk apa pun
   yang bukan salah satu di antaranya, sehingga istilah karangan tidak pernah lolos. */
export function predikatKokurikuler(value){
  const teks=String(value||'').trim();
  if(!teks)return null;
  const kode=PREDIKAT_KOKURIKULER_LAMA[teks]
    ||PREDIKAT_KOKURIKULER.find(item=>item.label.toLowerCase()===teks.toLowerCase()||item.kode===teks.toUpperCase())?.kode;
  return PREDIKAT_KOKURIKULER.find(item=>item.kode===kode)||null;
}
/* Nama lama dipertahankan supaya pemanggil yang sudah ada tetap berjalan: keduanya menjawab
   pertanyaan yang sama - kategori capaian kokurikuler untuk sebuah predikat. */
export const KATEGORI_CAPAIAN_KOKURIKULER=Object.freeze(Object.fromEntries(
  [...Object.keys(PREDIKAT_KOKURIKULER_LAMA),...PREDIKAT_KOKURIKULER_LABEL]
    .map(nama=>[nama,predikatKokurikuler(nama)])));
export function kategoriCapaianKokurikuler(predicate){return predikatKokurikuler(predicate);}

/* Kegiatan kokurikuler bawaan beserta pilihan deskripsi rapor.
   Setiap kegiatan punya 5 deskripsi kelas rendah (1-3) dan 5 deskripsi kelas tinggi (4-6),
   ditulis dengan bahasa rapor yang formal, positif, dan mudah dipahami orang tua. */
export const COCURRICULAR_ACTIVITY_PRESETS=Object.freeze([
  Object.freeze({
    id:'kunjungan-edukasi',
    name:'Kunjungan Edukasi (Field Trip)',
    dimensions:Object.freeze(['bernalar-kritis','berkebinekaan-global','mandiri']),
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
    dimensions:Object.freeze(['gotong-royong','beriman','kreatif']),
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
    dimensions:Object.freeze(['gotong-royong','beriman','berkebinekaan-global']),
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
    dimensions:Object.freeze(['berkebinekaan-global','kreatif','beriman']),
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
    dimensions:Object.freeze(['bernalar-kritis','mandiri','kreatif']),
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
    dimensions:Object.freeze(['beriman','berkebinekaan-global','mandiri']),
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
    dimensions:Object.freeze(['bernalar-kritis','kreatif','mandiri']),
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
    dimensions:Object.freeze(['kreatif','gotong-royong','berkebinekaan-global']),
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
    dimensions:Object.freeze(['mandiri','kreatif','gotong-royong']),
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
  /* ------------------------------------------------ RAGAM UTAMA MENURUT PANDUAN

     Lima kegiatan berikut disebut panduan sebagai jenis kokurikuler yang utama, tetapi belum
     punya pilihannya sendiri di aplikasi: projek penguatan profil pelajar, tugas observasi
     lapangan, klub mata pelajaran, bimbingan pengayaan dan remedial, serta penerbitan mading
     atau buletin sekolah.

     Sama seperti penambahan sebelumnya, ini MENAMBAH SAJA: kegiatan yang sudah ada beserta id,
     nama, urutan, dan seluruh kalimatnya tidak disentuh, sehingga catatan sekolah yang sudah
     berjalan tetap menemukan presetnya. */
  Object.freeze({
    id:'projek-profil-pelajar',
    name:'Projek Penguatan Profil Pelajar Pancasila (P5)',
    dimensions:Object.freeze(['gotong-royong','kreatif','bernalar-kritis','mandiri']),
    lower:Object.freeze([
      'Terlibat dalam projek kelas dan mengerjakan bagiannya bersama teman dengan gembira.',
      'Mengikuti setiap tahap projek sesuai arahan guru dengan tertib.',
      'Berani menyampaikan idenya ketika kelompok merencanakan kegiatan projek.',
      'Membantu teman sekelompok yang mengalami kesulitan selama projek berlangsung.',
      'Menceritakan kembali pengalaman projeknya dengan bahasa sendiri.',
    ]),
    upper:Object.freeze([
      'Berperan aktif merencanakan, melaksanakan, dan mengevaluasi projek bersama kelompoknya.',
      'Menjalankan peran yang disepakati kelompok dengan tanggung jawab hingga projek selesai.',
      'Mengajukan gagasan pemecahan masalah yang beralasan selama pengerjaan projek.',
      'Menyajikan hasil projek kepada warga sekolah dengan runtut dan percaya diri.',
      'Merefleksikan proses projek serta menyebutkan hal yang dapat diperbaiki berikutnya.',
    ]),
  }),
  Object.freeze({
    id:'observasi-lapangan',
    name:'Tugas Observasi Lapangan',
    dimensions:Object.freeze(['bernalar-kritis','mandiri','berkebinekaan-global']),
    lower:Object.freeze([
      'Mengamati keadaan di sekitarnya dengan rasa ingin tahu selama kegiatan observasi.',
      'Berani bertanya kepada narasumber dengan sopan sesuai panduan guru.',
      'Mencatat hal-hal menarik yang ditemuinya di lapangan dengan bahasa sendiri.',
      'Mengikuti tata tertib dan menjaga sikap selama berada di lokasi observasi.',
      'Menceritakan hasil pengamatannya kepada teman sekelas dengan gembira.',
    ]),
    upper:Object.freeze([
      'Menyusun pertanyaan wawancara yang terarah sebelum kegiatan observasi dimulai.',
      'Mengumpulkan data lapangan secara mandiri dan mencatatnya dengan rapi.',
      'Mengolah hasil pengamatan menjadi laporan sederhana yang runtut dan beralasan.',
      'Menarik kesimpulan dari temuan lapangan serta mengaitkannya dengan materi pelajaran.',
      'Menjaga sikap santun kepada narasumber dan masyarakat selama kegiatan berlangsung.',
    ]),
  }),
  Object.freeze({
    id:'klub-mata-pelajaran',
    name:'Klub Mata Pelajaran',
    dimensions:Object.freeze(['bernalar-kritis','mandiri','kreatif']),
    lower:Object.freeze([
      'Hadir dan mengikuti kegiatan klub dengan semangat sesuai jadwal.',
      'Mencoba mengerjakan tantangan yang diberikan pembimbing klub sampai selesai.',
      'Berani menjawab dan bertanya selama kegiatan klub berlangsung.',
      'Bekerja sama dengan teman satu kelompok saat menyelesaikan tugas klub.',
      'Menunjukkan minat yang tumbuh terhadap bidang yang dipelajari di klub.',
    ]),
    upper:Object.freeze([
      'Mendalami materi klub melampaui yang diajarkan di kelas dengan inisiatif sendiri.',
      'Menyelesaikan tantangan klub dengan langkah kerja yang runtut dan beralasan.',
      'Berbagi pengetahuan kepada teman yang belum memahami materi klub.',
      'Menunjukkan ketekunan berlatih hingga kemampuannya berkembang dari waktu ke waktu.',
      'Mewakili kelasnya dalam kegiatan klub dengan sikap sportif dan percaya diri.',
    ]),
  }),
  Object.freeze({
    id:'pengayaan-remedial',
    name:'Bimbingan Pengayaan dan Remedial',
    dimensions:Object.freeze(['mandiri','bernalar-kritis','beriman']),
    lower:Object.freeze([
      'Mengikuti kegiatan bimbingan tambahan dengan tekun dan tanpa mengeluh.',
      'Mau mencoba kembali soal yang belum dipahaminya bersama guru.',
      'Bertanya ketika menemui bagian materi yang masih sulit baginya.',
      'Menyelesaikan latihan tambahan yang diberikan sampai tuntas.',
      'Menunjukkan kemajuan pada bagian materi yang sebelumnya belum dikuasai.',
    ]),
    upper:Object.freeze([
      'Mengenali sendiri bagian materi yang perlu diperdalam dan meminta bimbingan untuknya.',
      'Mengerjakan latihan pengayaan dengan mandiri serta memeriksa kembali hasilnya.',
      'Menunjukkan kemajuan yang jelas pada kompetensi yang sebelumnya belum tuntas.',
      'Membantu teman memahami materi yang sudah dikuasainya pada kegiatan bimbingan.',
      'Menjaga ketekunan belajar sampai target bimbingan tercapai.',
    ]),
  }),
  Object.freeze({
    id:'mading-buletin',
    name:'Penerbitan Mading dan Buletin Sekolah',
    dimensions:Object.freeze(['kreatif','gotong-royong','bernalar-kritis']),
    lower:Object.freeze([
      'Ikut menyiapkan bahan mading kelas dengan senang hati.',
      'Menulis karya sederhana untuk ditempel pada mading bersama teman.',
      'Menghias mading kelas dengan rapi sesuai tema yang disepakati.',
      'Membagi tugas dengan teman ketika menyusun mading.',
      'Bangga menunjukkan hasil karyanya kepada teman dan guru.',
    ]),
    upper:Object.freeze([
      'Menulis artikel atau opini untuk buletin sekolah dengan gagasan yang jelas.',
      'Menyunting tulisan teman dengan masukan yang santun dan membangun.',
      'Merancang tata letak mading atau buletin agar menarik dan mudah dibaca.',
      'Menjalankan perannya dalam tim redaksi hingga terbitan selesai tepat waktu.',
      'Memeriksa kebenaran informasi sebelum tulisannya diterbitkan.',
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
   adalah kegiatan projeknya beserta capaian karakter yang ditunjukkannya. Karena itu kalimatnya
   tidak pernah berbunyi seperti mata pelajaran, dan tidak memakai bahasa kompetensi seperti
   Intrakurikuler.

   POLA KALIMAT MENGIKUTI PANDUAN:

     [Nama] [kategori capaian] dalam dimensi [Dimensi] pada kegiatan kokurikuler [Kegiatan],
     [kegiatan nyata]. [Aspek yang perlu dikembangkan, bila memang ada.]

   SUMBERNYA HANYA DATA YANG MEMANG ADA: nama kegiatan yang tersimpan, dimensi yang dipilih
   guru, kegiatan nyata dari preset tingkat kelasnya, dan predikat. Tidak ada capaian yang
   dikarang untuk kegiatan yang presetnya tidak dikenal - kalimatnya cukup berhenti pada
   keikutsertaan dan kategori capaiannya.

   BATAS YANG DIJAGA: aspek pengembangan hanya disebut ketika predikatnya memang BELUM yang
   tertinggi. Pada capaian tertinggi tidak ada kekurangan yang dikarang - persis aturan yang
   sudah berlaku pada Intrakurikuler. Aspek itu pun bukan dimensi lain yang tidak pernah
   dinilai guru, melainkan penguatan pada dimensi yang sedang dinilai itu sendiri. */
const NADA_KOKURIKULER=Object.freeze({
  SB:['terlibat aktif dan konsisten','menunjukkan keterlibatan yang sangat baik','berpartisipasi aktif dan konsisten'],
  BSH:['terlibat dengan baik','menunjukkan keterlibatan yang baik','berpartisipasi dengan baik'],
  MB:['terlibat dengan cukup baik','menunjukkan keterlibatan yang cukup'],
  /* Tidak memakai kata sambung "dan" di awal supaya kalimatnya tetap enak dibaca ketika
     didahului kategori capaian. */
  BB:['masih memerlukan bimbingan untuk terlibat secara konsisten','memerlukan pendampingan untuk terlibat secara konsisten'],
});
/* REKOMENDASI PER TINGKAT PERKEMBANGAN.

   Satu kalimat penutup untuk setiap predikat, termasuk yang tertinggi - dan pada yang
   tertinggi kalimatnya memang APRESIASI, bukan kekurangan yang dikarang. Isinya tetap hanya
   menyatakan kembali apa yang sudah dipilih guru, sehingga tidak ada penilaian baru yang
   muncul entah dari mana. */
const REKOMENDASI_KOKURIKULER=Object.freeze({
  BB:'memerlukan bimbingan agar perkembangannya meningkat sesuai konteks kegiatan',
  MB:'dapat ditingkatkan melalui pendampingan/stimulus yang lebih terarah',
  BSH:'masih dapat ditingkatkan agar lebih konsisten pada kegiatan berikutnya',
  SB:'sangat baik dan dapat menjadi contoh positif sesuai konteks kegiatan',
});
/* PROJEK P5 HANYA DISEBUT PADA KEGIATAN P5.

   "sesuai konteks kegiatan" berlaku untuk kegiatan apa pun. Hanya ketika kegiatannya memang
   Projek Penguatan Profil Pelajar Pancasila, frasa itu menyebut projeknya. Kegiatan lain -
   Bakti Sosial, Kunjungan Edukasi, dan seterusnya - tidak pernah disebut sebagai Projek P5,
   karena menyebutnya begitu berarti menuliskan kegiatan yang tidak pernah terjadi. */
export const ID_PRESET_P5='projek-profil-pelajar';
export function adalahKegiatanP5(activity){
  const preset=findCocurricularPreset(String(activity?.name||activity||''));
  return preset?.id===ID_PRESET_P5;
}
function rekomendasiKokurikuler(kode,activity){
  const teks=REKOMENDASI_KOKURIKULER[kode];
  if(!teks)return '';
  return adalahKegiatanP5(activity)?teks.replace('konteks kegiatan','konteks Projek P5'):teks;
}
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

/* Dimensi yang dipakai: pilihan guru bila ada dan sah, kalau tidak dimensi utama kegiatan itu.
   Kegiatan yang presetnya tidak dikenal tidak dipaksakan punya dimensi - lebih baik kalimatnya
   tanpa dimensi daripada menyebut dimensi yang tidak pernah dipilih siapa pun. */
export function dimensiKokurikuler(activity,dimension){
  const dipilih=findDimensiProfil(dimension);
  if(dipilih)return dipilih;
  const preset=findCocurricularPreset(String(activity?.name||activity||''));
  const utama=preset?.dimensions?.[0];
  return utama?findDimensiProfil(utama):null;
}

export function generateCocurricularDescription({studentName='',activity,predicate=DEFAULT_PREDIKAT_KOKURIKULER,
  classId='',dimension=''}={}){
  const activityName=String(activity?.name||activity||'').trim();
  const preset=findCocurricularPreset(activityName);
  const grade=Number.parseInt(String(classId||'').trim(),10);
  const daftar=preset?(grade&&grade<=3?preset.lower:preset.upper):[];
  const nama=String(studentName||'Siswa').trim()||'Siswa';
  const kegiatan=activityName||'kegiatan kokurikuler';
  /* Predikat versi lama tetap dikenali di sini, sehingga catatan lama yang belum pernah
     disimpan ulang tetap menghasilkan kalimat yang benar - bukan kalimat cadangan. */
  const kategori=predikatKokurikuler(predicate)||predikatKokurikuler(DEFAULT_PREDIKAT_KOKURIKULER);
  const nada=pilihNada(NADA_KOKURIKULER[kategori.kode],`${nama}|${kegiatan}|${kategori.kode}`);
  const dimensi=dimensiKokurikuler(activity,dimension);
  /* KALIMATNYA TERIKAT PADA KEGIATAN YANG SEDANG DIPILIH. Nama kegiatan selalu ikut, sehingga
     deskripsi yang lahir untuk satu kegiatan tidak pernah dapat dibaca sebagai deskripsi
     kegiatan lain. */
  /* Kategori capaian dan dimensi berdiri di depan, lalu keterlibatan nyatanya menyusul setelah
     koma - susunan yang sama dengan contoh pada panduan. */
  const capaian=dimensi
    ? `${kategori.label} dalam dimensi ${dimensi.label}, ${nada}`
    : `${kategori.label}, ${nada}`;
  const inti=`Ananda ${nama} ${capaian} pada kegiatan kokurikuler ${kegiatan}.`;
  /* Keterangan preset menerangkan KEGIATANNYA, bukan capaian anak. Ia disebut sebagai fokus
     kegiatan - bukan sebagai prestasi yang tidak pernah dinilai guru. */
  const fokus=tanpaTitik(daftar[0]||'');
  const badan=fokus?`${inti} Kegiatan ini mencakup ${hurufKecilAwal(fokus)}.`:inti;
  const rekomendasi=rekomendasiKokurikuler(kategori.kode,activity);
  if(!rekomendasi||!dimensi)return badan;
  return `${badan} Capaian dimensi ${dimensi.label} Ananda ${nama} ${rekomendasi}.`;
}
