import { cpElements, elementIdOf } from './curriculum-cp.js';

/* BUTIR CP PENILAIAN — pemecahan lingkup CP menjadi satuan yang dapat dinilai.

   MENGAPA ADA. Capaian Pembelajaran resmi ditulis sebagai paragraf panjang per ELEMEN dan
   mencakup beberapa kemampuan sekaligus. Satu paragraf seperti itu tidak dapat menjadi satu
   angka nilai: guru tidak dapat menilai "seluruh Bilangan Fase C" dalam satu kolom. Karena itu
   lingkupnya dipecah menjadi BUTIR CP - satuan kompetensi yang cukup spesifik untuk dinilai,
   tetapi tetap berada di bawah elemen CP resminya.

   BUTIR CP BUKAN TP, dan berkas ini BUKAN katalog TP lama yang berganti nama. Bedanya nyata:
   - TP adalah rumusan tujuan yang disusun guru/satuan pendidikan sebagai turunan operasional.
   - Butir CP adalah pemecahan LINGKUP CP itu sendiri: ia tetap milik elemen CP resminya,
     induknya dapat ditelusuri ke keputusan penetapnya, dan ia tidak menambahkan kompetensi
     yang tidak ada pada elemen tersebut.

   DARI MANA ISINYA BERASAL. Setiap butir diturunkan dari NASKAH CP RESMI elemen induknya yang
   sudah dimuat pada `curriculum-cp-naskah.js` - kalimat demi kalimat, tanpa menambahkan
   kompetensi yang tidak ada di sana. Berkas ini TIDAK PERNAH mengisi naskah CP itu sendiri dan
   tidak pernah mengaku sebagai kutipan resmi: yang dimuat hanyalah pemecahan lingkupnya menjadi
   satuan yang dapat dinilai, berstatus `butir_cp` dan sepenuhnya dapat diubah guru.

   MATA PELAJARAN YANG SENGAJA TIDAK PUNYA BUTIR. `seni` (Seni dan Budaya) adalah label payung
   yang dipertahankan demi kompatibilitas mapping lama; ia bukan nama mata pelajaran pada
   dokumen CP resmi, sehingga naskah CP-nya memang tidak ada dan tidak boleh dipinjam dari Seni
   Rupa. Butir untuk mapel itu karena itu TIDAK disediakan - lebih jujur kosong daripada berisi
   rumusan yang tidak dapat ditelusuri ke dokumen penetapnya. Guru tetap dapat membuat Butir CP
   sendiri lewat Buat CP Manual, dan kesiapan Admin tidak menuntutnya.

   BENTUK SATU BARIS KATALOG: [nama, _, _, frasaTeori, frasaPraktik]

   - `nama`        label pendek butir, dipakai di daftar dan pemilihan.
   - `frasaTeori`  substansi butir dalam bentuk yang wajar dibaca setelah kata kerja
                   pengetahuan ("memahami ...", "menguasai ...").
   - `frasaPraktik` substansi yang sama dalam bentuk yang wajar dibaca setelah kata kerja
                   keterampilan ("mampu ...", "terampil ..."). Keduanya ditulis terpisah supaya
                   deskripsi tidak lahir dari pertukaran kata secara buta.

   Salah satu frasa boleh null bila butirnya memang tidak wajar dibaca pada sisi itu; penyusun
   deskripsi memakai frasa yang tersedia.

   DUA KOLOM YANG SUDAH TIDAK DIPAKAI. Posisi kedua dan ketiga dulu memuat `semester` (1/2) dan
   `jenis` ('teori'/'praktik'/'teori_praktik'). Keduanya DIBUANG dari model CP:

     - SEMESTER bukan milik CP. Pemerintah menetapkan CP per FASE, bukan per semester, dan
       membaginya hanya memaksa guru mengurus parameter yang tidak dituntut siapa pun. Semester
       sebuah PENILAIAN kini mengikuti semester aplikasi yang sedang aktif.
     - JENIS PENILAIAN bukan milik CP. Satu butir kompetensi yang sama wajar dinilai sebagai
       pengetahuan maupun keterampilan; yang menentukan adalah KEGIATANNYA, bukan butirnya.
       Teori/Praktik karena itu pindah ke Intrakurikuler, tempat penilaian benar-benar terjadi.

   Nilai lamanya sengaja DIBIARKAN di dalam larik supaya 291 baris substansi CP tidak perlu
   disentuh sama sekali - pembacanya di bawah hanya melewatinya. Tidak ada satu pun rumusan CP
   yang berubah karena penyederhanaan ini. */

export const BUTIR_CP_STATUS='butir_cp';

/* ------------------------------------------------------------------------ KATALOG BUTIR */

const KATALOG={

  /* --------------------------------------- Pendidikan Agama Islam dan Budi Pekerti (PAI BP) */
  agama:{
    A:{
      'Al-Qur\u2019an Hadis':[
        ['Huruf hijaiah berharakat dan bersambung',1,'teori_praktik','huruf hijaiah berharakat dan huruf hijaiah bersambung','melafalkan huruf hijaiah berharakat dan bersambung'],
        ['Surah al-Fatihah dan surah pendek',1,'praktik','Surah al-Fatihah dan beberapa surah pendek Al-Qur\'an','melafalkan Surah al-Fatihah dan beberapa surah pendek Al-Qur\'an'],
        ['Hadis tentang kebersihan',2,'teori','hadis tentang kebersihan','menjelaskan isi hadis tentang kebersihan'],
      ],
      'Akidah':[
        ['Rukun iman dan iman kepada Allah Swt.',1,'teori','rukun iman dan iman kepada Allah Swt.','menyebutkan rukun iman dan makna iman kepada Allah Swt.'],
        ['Asmaulhusna dan iman kepada malaikat',2,'teori','beberapa asmaulhusna dan iman kepada malaikat','menyebutkan beberapa asmaulhusna dan makna iman kepada malaikat'],
      ],
      'Akhlak':[
        ['Akhlak terhadap Allah Swt.',1,'teori','akhlak terhadap Allah Swt. dengan menyucikan dan memuji-Nya','menjelaskan akhlak menyucikan dan memuji Allah Swt.'],
        ['Akhlak terhadap diri sendiri',2,'teori','akhlak terhadap diri sendiri','menjelaskan akhlak terhadap diri sendiri'],
      ],
      'Fikih':[
        ['Rukun Islam dan syahadatain',1,'teori_praktik','rukun Islam dan syahadatain','melafalkan syahadatain dan menyebutkan rukun Islam'],
        ['Tata cara bersuci',1,'teori','tata cara bersuci','menjelaskan tata cara bersuci'],
        ['Salat fardu, azan, dan ikamah',2,'teori','salat fardu, azan, dan ikamah','menjelaskan ketentuan salat fardu, azan, dan ikamah'],
        ['Zikir dan berdoa setelah salat',2,'teori_praktik','zikir dan doa setelah salat','melafalkan zikir dan doa setelah salat'],
      ],
      'Sejarah Peradaban Islam':[
        ['Kisah nabi dan rasul',2,'teori','kisah beberapa nabi dan rasul','menceritakan kembali kisah beberapa nabi dan rasul'],
      ],
    },
    B:{
      'Al-Qur\u2019an Hadis':[
        ['Surah dan ayat tentang kewajiban salat',1,'teori_praktik','beberapa surah pendek dan ayat Al-Qur\'an tentang kewajiban salat','membaca surah pendek dan ayat Al-Qur\'an tentang kewajiban salat'],
        ['Hadis tentang hubungan baik dengan sesama',2,'teori','hadis tentang menjaga hubungan baik dengan sesama','menjelaskan isi hadis tentang menjaga hubungan baik dengan sesama'],
      ],
      'Akidah':[
        ['Sifat Allah Swt. dan asmaulhusna',1,'teori','sifat-sifat Allah Swt. dan beberapa asmaulhusna','menyebutkan sifat-sifat Allah Swt. dan beberapa asmaulhusna'],
        ['Iman kepada kitab dan rasul Allah Swt.',2,'teori','iman kepada kitab-kitab Allah Swt. dan rasul-rasul Allah Swt.','menyebutkan kitab-kitab dan rasul-rasul Allah Swt.'],
      ],
      'Akhlak':[
        ['Berbaik sangka kepada Allah Swt.',1,'teori','akhlak terhadap Allah Swt. dengan berbaik sangka kepada-Nya','menjelaskan akhlak berbaik sangka kepada Allah Swt.'],
        ['Akhlak terhadap orang tua, keluarga, dan pendidik',2,'teori','akhlak terhadap orang tua, keluarga, dan pendidik','menjelaskan akhlak terhadap orang tua, keluarga, dan pendidik'],
      ],
      'Fikih':[
        ['Puasa',1,'teori','puasa','menjelaskan ketentuan puasa'],
        ['Salat jumat dan salat sunah',1,'teori','salat jumat dan salat sunah','menjelaskan ketentuan salat jumat dan salat sunah'],
        ['Balig dan tanggung jawabnya',2,'teori','balig dan tanggung jawab yang menyertainya','menjelaskan tanggung jawab yang menyertai balig'],
      ],
      'Sejarah Peradaban Islam':[
        ['Kisah Nabi Muhammad saw. periode Makkah',2,'teori','kisah Nabi Muhammad saw. sebelum dan sesudah menjadi rasul periode Makkah','menceritakan kisah Nabi Muhammad saw. periode Makkah'],
      ],
    },
    C:{
      'Al-Qur\u2019an Hadis':[
        ['Surah dan ayat tentang keragaman',1,'teori_praktik','beberapa surah pendek dan ayat Al-Qur\'an tentang keragaman','membaca surah pendek dan ayat Al-Qur\'an tentang keragaman'],
        ['Hadis tentang keragaman',2,'teori','hadis tentang keragaman','menjelaskan pesan hadis tentang keragaman'],
      ],
      'Akidah':[
        ['Asmaulhusna',1,'teori','beberapa asmaulhusna','menyebutkan makna beberapa asmaulhusna'],
        ['Iman kepada hari akhir, qada, dan qadar',2,'teori','iman kepada hari akhir serta qada dan qadar','menjelaskan iman kepada hari akhir serta qada dan qadar'],
      ],
      'Akhlak':[
        ['Berdoa dan bertawakal kepada Allah Swt.',1,'teori','akhlak terhadap Allah Swt. dengan berdoa dan bertawakal kepada-Nya','menjelaskan akhlak berdoa dan bertawakal kepada Allah Swt.'],
        ['Akhlak terhadap teman, tetangga, dan non muslim',2,'teori','akhlak terhadap teman, tetangga, dan non muslim','menjelaskan akhlak terhadap teman, tetangga, dan non muslim'],
        ['Akhlak terhadap hewan dan tumbuhan',2,'teori','akhlak terhadap hewan dan tumbuhan','menjelaskan akhlak terhadap hewan dan tumbuhan'],
      ],
      'Fikih':[
        ['Puasa sunah',1,'teori','puasa sunah','menjelaskan ketentuan puasa sunah'],
        ['Zakat, infak, sedekah, dan hadiah',1,'teori','zakat, infak, sedekah, dan hadiah','menjelaskan ketentuan zakat, infak, sedekah, dan hadiah'],
        ['Makanan dan minuman halal dan haram',2,'teori','makanan dan minuman yang halal dan haram','membedakan makanan dan minuman yang halal dan haram'],
      ],
      'Sejarah Peradaban Islam':[
        ['Kisah Nabi Muhammad saw. periode Madinah',1,'teori','kisah Nabi Muhammad saw. periode Madinah','menceritakan kisah Nabi Muhammad saw. periode Madinah'],
        ['Kisah khulafaurasyidin',2,'teori','kisah khulafaurasyidin','menceritakan kisah khulafaurasyidin'],
      ],
    },
  },

  /* ------------------------------------ Pendidikan Agama Kristen dan Budi Pekerti (PAK BP)
     Naskah resminya tersusun atas SUBELEMEN, sehingga pemecahan butirnya mengikuti subelemen
     itu apa adanya - satu subelemen menjadi satu Butir CP. */
  agama_kristen:{
    A:{
      'Allah Berkarya':[
        ['Allah Pencipta',1,'teori','Allah menciptakan dirinya sebagai pribadi yang istimewa dan membangun interaksi dengan lingkungan terdekat','menjelaskan bahwa Allah menciptakan dirinya sebagai pribadi yang istimewa'],
        ['Allah Pemelihara',2,'teori','pemeliharaan Allah pada dirinya melalui kehadiran keluarga','menceritakan pemeliharaan Allah pada dirinya melalui kehadiran keluarga'],
      ],
      'Manusia dan Nilai-nilai Kristiani':[
        ['Hakikat manusia',1,'teori','dirinya sebagai pribadi yang bertumbuh dan berkembang','menceritakan pertumbuhan dan perkembangan dirinya'],
        ['Nilai kebaikan, ramah, dan sopan',2,'teori','makna kebaikan, ramah, dan sopan di rumah dan di sekolah','menjelaskan makna kebaikan, ramah, dan sopan di rumah dan di sekolah'],
      ],
      'Gereja dan Masyarakat Majemuk':[
        ['Gereja sebagai wadah berkumpul dan beribadah',1,'teori','keberadaan gereja sebagai wadah berkumpul dan beribadah serta kewajiban berdoa dan memuji Tuhan','menjelaskan keberadaan gereja sebagai wadah berkumpul dan beribadah'],
        ['Keragaman suku bangsa sebagai anugerah Allah',2,'teori','keragaman suku bangsa sebagai anugerah Allah','menjelaskan keragaman suku bangsa sebagai anugerah Allah'],
      ],
      'Alam dan Lingkungan Hidup':[
        ['Alam sebagai ciptaan Allah',1,'teori','alam dan lingkungan hidup sebagai ciptaan Allah','menyebutkan alam dan lingkungan hidup sebagai ciptaan Allah'],
        ['Memelihara alam di rumah dan sekolah',2,'teori','tugas memelihara alam dan lingkungan hidup di rumah dan di sekolah','menjelaskan tugas memelihara alam dan lingkungan hidup di rumah dan di sekolah'],
      ],
    },
    B:{
      'Allah Berkarya':[
        ['Allah menciptakan flora, fauna, dan manusia',1,'teori','Allah menciptakan flora dan fauna serta manusia','menceritakan karya Allah dalam menciptakan flora, fauna, dan manusia'],
        ['Allah Pemelihara',1,'teori','pemeliharaan Allah pada dirinya melalui kehadiran orang-orang di sekitarnya','menceritakan pemeliharaan Allah melalui orang-orang di sekitarnya'],
        ['Allah Penyelamat dan Allah Pembaru',2,'teori','Allah sebagai penyelamat dan Allah pembaru','menyebutkan karya Allah sebagai penyelamat dan pembaru'],
      ],
      'Manusia dan Nilai-nilai Kristiani':[
        ['Makhluk individu dan sosial',1,'teori','dirinya sebagai makhluk individu dan sosial yang dapat bergaul dan bekerja sama dengan teman, saudara, dan orang tua','menjelaskan dirinya sebagai makhluk individu dan sosial'],
        ['Sikap disiplin di rumah dan sekolah',2,'teori','sikap disiplin di rumah dan di sekolah','menjelaskan sikap disiplin di rumah dan di sekolah'],
      ],
      'Gereja dan Masyarakat Majemuk':[
        ['Tugas panggilan gereja',1,'teori','tugas panggilan gereja untuk bersekutu, bersaksi, dan melayani','menjelaskan tugas panggilan gereja untuk bersekutu, bersaksi, dan melayani'],
        ['Keragaman budaya dan agama',2,'teori','keragaman budaya dan agama sebagai anugerah Allah','menjelaskan keragaman budaya dan agama sebagai anugerah Allah'],
      ],
      'Alam dan Lingkungan Hidup':[
        ['Allah hadir dalam fenomena alam',1,'teori','kehadiran Allah dalam berbagai fenomena alam','menceritakan kehadiran Allah dalam fenomena alam'],
        ['Memelihara alam dan lingkungan sekitar',2,'teori','upaya memelihara alam dan lingkungan sekitarnya','menjelaskan upaya memelihara alam dan lingkungan sekitarnya'],
      ],
    },
    C:{
      'Allah Berkarya':[
        ['Allah Pencipta berkarya',1,'teori','Allah Pencipta berkarya melalui keluarga, sekolah, dan masyarakat','menceritakan karya Allah melalui keluarga, sekolah, dan masyarakat'],
        ['Allah memelihara seluruh umat manusia',1,'teori','Allah memelihara seluruh umat manusia termasuk mereka yang berkebutuhan khusus','menjelaskan pemeliharaan Allah atas seluruh umat manusia'],
        ['Allah menyelamatkan melalui Yesus Kristus',2,'teori','Allah menyelamatkan manusia melalui Yesus Kristus','menjelaskan karya keselamatan Allah melalui Yesus Kristus'],
        ['Allah membarui hidup manusia',2,'teori','Allah membarui hidup manusia','menceritakan pembaruan hidup yang dikerjakan Allah'],
      ],
      'Manusia dan Nilai-nilai Kristiani':[
        ['Manusia sebagai makhluk terbatas',1,'teori','manusia sebagai makhluk yang terbatas','menjelaskan keterbatasan manusia di hadapan Allah'],
        ['Buah Roh dalam interaksi antarsesama',2,'teori','buah Roh dalam interaksi antarsesama','menjelaskan buah Roh dalam interaksi antarsesama'],
      ],
      'Gereja dan Masyarakat Majemuk':[
        ['Pelayanan terhadap sesama',1,'teori','pelayanan terhadap sesama sebagai tanggung jawab orang beriman','menjelaskan pelayanan terhadap sesama sebagai tanggung jawab orang beriman'],
        ['Hidup rukun dan toleransi',2,'teori','hidup rukun dan toleransi dalam masyarakat majemuk','menjelaskan hidup rukun dan toleransi dalam masyarakat majemuk'],
      ],
      'Alam dan Lingkungan Hidup':[
        ['Allah hadir melalui alam ciptaan',1,'teori','kehadiran Allah melalui alam ciptaan','menceritakan kehadiran Allah melalui alam ciptaan'],
        ['Tanggung jawab memelihara alam',2,'teori','tanggung jawab orang beriman dalam memelihara alam dan lingkungan hidup','menjelaskan tanggung jawab orang beriman dalam memelihara alam dan lingkungan hidup'],
      ],
    },
  },

  /* -------------------------------------------------------------------- Pendidikan Pancasila */
  pancasila:{
    A:{
      'Pancasila':[
        ['Bendera negara dan lagu kebangsaan',1,'teori','bendera negara dan lagu kebangsaan','menyebutkan bendera negara dan menyanyikan lagu kebangsaan'],
        ['Simbol dan sila Pancasila pada lambang negara',1,'teori','simbol dan sila-sila Pancasila dalam lambang negara Garuda Pancasila','menunjukkan simbol dan melafalkan sila-sila Pancasila'],
        ['Nilai Pancasila di lingkungan keluarga',2,'teori_praktik','penerapan nilai-nilai Pancasila di lingkungan keluarga','menerapkan nilai-nilai Pancasila di lingkungan keluarga'],
      ],
      'Undang-Undang Dasar Negara Republik Indonesia Tahun 1945':[
        ['Aturan di lingkungan keluarga',1,'teori','aturan di lingkungan keluarga','menyebutkan aturan yang berlaku di lingkungan keluarga'],
        ['Sikap mematuhi aturan keluarga',2,'teori_praktik','sikap mematuhi aturan di lingkungan keluarga','menunjukkan dan menceritakan sikap mematuhi aturan di lingkungan keluarga'],
      ],
      'Bhinneka Tunggal Ika':[
        ['Semboyan Bhinneka Tunggal Ika',1,'teori','semboyan Bhinneka Tunggal Ika','menyebutkan makna semboyan Bhinneka Tunggal Ika'],
        ['Identitas diri dan menghargainya',2,'teori_praktik','identitas dirinya sesuai jenis kelamin, hobi, bahasa, serta agama dan kepercayaan di lingkungan sekitar','mengidentifikasi dan menghargai identitas dirinya serta identitas temannya'],
      ],
      'Negara Kesatuan Republik Indonesia':[
        ['Lingkungan tempat tinggal dan sekolah sebagai bagian NKRI',1,'teori','karakteristik lingkungan tempat tinggal dan sekolah sebagai bagian dari wilayah Negara Kesatuan Republik Indonesia','menceritakan karakteristik lingkungan tempat tinggal dan sekolahnya'],
        ['Bekerja sama menjaga lingkungan sekitar',2,'praktik','kerja sama menjaga lingkungan sekitar dalam keberagaman','mempraktikkan kerja sama menjaga lingkungan sekitar dalam keberagaman'],
      ],
    },
    B:{
      'Pancasila':[
        ['Makna sila Pancasila dan penerapannya',1,'teori_praktik','makna sila-sila Pancasila dan penerapannya dalam kehidupan sehari-hari','menerapkan makna sila-sila Pancasila dalam kehidupan sehari-hari'],
        ['Karakter para perumus Pancasila',1,'teori','karakter para perumus Pancasila','menyebutkan karakter para perumus Pancasila'],
        ['Bangga menjadi anak Indonesia',2,'teori_praktik','sikap bangga menjadi anak Indonesia yang memiliki bahasa Indonesia sebagai bahasa persatuan','menunjukkan sikap bangga berbahasa Indonesia sebagai bahasa persatuan'],
      ],
      'Undang-Undang Dasar Negara Republik Indonesia Tahun 1945':[
        ['Aturan di sekolah dan tempat tinggal',1,'teori_praktik','aturan di sekolah dan lingkungan tempat tinggal','melaksanakan aturan di sekolah dan lingkungan tempat tinggal'],
        ['Hak dan kewajiban di keluarga dan sekolah',2,'teori_praktik','hak yang didapat dan kewajiban sebagai anggota keluarga dan warga sekolah','menerapkan hak dan kewajibannya sebagai anggota keluarga dan warga sekolah'],
      ],
      'Bhinneka Tunggal Ika':[
        ['Identitas keluarga dan teman',1,'teori','identitas keluarga dan teman-temannya sesuai budaya, suku bangsa, bahasa, agama, dan kepercayaan','membedakan identitas keluarga dan teman-temannya di lingkungan sekitar'],
        ['Menghargai perbedaan identitas',2,'teori_praktik','sikap menghargai perbedaan identitas di lingkungan sekitar','menunjukkan sikap menghargai perbedaan identitas di lingkungan sekitar'],
      ],
      'Negara Kesatuan Republik Indonesia':[
        ['Lingkungan tempat tinggal sebagai bagian NKRI',1,'teori','lingkungan tempat tinggal berupa RT, RW, desa atau kelurahan, dan kecamatan sebagai bagian dari wilayah Negara Kesatuan Republik Indonesia','mengidentifikasi lingkungan tempat tinggalnya sebagai bagian wilayah NKRI'],
        ['Kerja sama dalam keberagaman',2,'teori_praktik','perilaku bekerja sama dalam keberagaman suku bangsa, sosial, dan budaya yang terikat persatuan dan kesatuan','menunjukkan perilaku bekerja sama dalam keberagaman di lingkungan sekitar'],
      ],
    },
    C:{
      'Pancasila':[
        ['Sejarah kelahiran Pancasila',1,'teori','kronologi sejarah kelahiran Pancasila','menjelaskan kronologi sejarah kelahiran Pancasila'],
        ['Meneladani para perumus Pancasila',1,'teori_praktik','sikap para perumus Pancasila','meneladani sikap para perumus Pancasila di lingkungan masyarakat'],
        ['Sila Pancasila sebagai satu kesatuan',2,'teori','hubungan sila-sila dalam Pancasila sebagai suatu kesatuan yang utuh','menghubungkan sila-sila Pancasila sebagai satu kesatuan yang utuh'],
        ['Pancasila sebagai dasar negara',2,'teori','makna nilai-nilai Pancasila sebagai dasar negara dan pandangan hidup bangsa','menguraikan makna nilai Pancasila sebagai dasar negara dan pandangan hidup bangsa'],
      ],
      'Undang-Undang Dasar Negara Republik Indonesia Tahun 1945':[
        ['Norma, hak, dan kewajiban warga negara',1,'teori_praktik','bentuk-bentuk norma, hak, dan kewajiban dalam kedudukannya sebagai warga negara','mengimplementasikan norma, hak, dan kewajibannya sebagai warga negara'],
        ['Pembukaan UUD NRI Tahun 1945',1,'teori','Pembukaan Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','menyebutkan isi Pembukaan Undang-Undang Dasar Negara Republik Indonesia Tahun 1945'],
        ['Musyawarah dan kesepakatan bersama',2,'praktik','musyawarah untuk membuat kesepakatan dan aturan bersama','mempraktikkan musyawarah untuk membuat kesepakatan dan aturan bersama di keluarga dan sekolah'],
      ],
      'Bhinneka Tunggal Ika':[
        ['Menghormati dan menjaga keberagaman budaya',1,'teori_praktik','sikap menghormati dan menjaga keberagaman budaya di lingkungan sekitar','menyajikan hasil identifikasi sikap menghormati dan menjaga keberagaman budaya'],
        ['Melestarikan keberagaman budaya',2,'teori_praktik','pelestarian keberagaman budaya sesuai semboyan dalam bingkai Bhinneka Tunggal Ika','ikut melestarikan keberagaman budaya di lingkungan sekitar'],
      ],
      'Negara Kesatuan Republik Indonesia':[
        ['Wilayah kabupaten/kota dan provinsi',1,'teori','wilayahnya dalam konteks kabupaten/kota dan provinsi sebagai bagian dari wilayah Negara Kesatuan Republik Indonesia','menunjukkan wilayah kabupaten/kota dan provinsinya sebagai bagian NKRI'],
        ['Gotong royong menjaga persatuan',2,'teori_praktik','perilaku gotong royong untuk menjaga persatuan sebagai wujud bela negara','menunjukkan perilaku gotong royong menjaga persatuan di lingkungan sekolah dan sekitar'],
      ],
    },
  },

  /* ------------------------------------------------------------------------ Bahasa Indonesia */
  bindo:{
    A:{
      'Menyimak':[
        ['Informasi teks aural nonsastra',1,'teori','informasi dari teks nonsastra berbentuk teks aural berupa percakapan tentang diri, keluarga, dan lingkungan sekitar','menyebutkan informasi dari teks yang dibacakan atau didengarnya'],
        ['Pesan teks sastra aural',2,'teori','pesan teks sastra berbentuk teks aural','menyampaikan kembali pesan teks sastra yang didengarnya'],
      ],
      'Membaca dan Memirsa':[
        ['Membaca kata sederhana dengan fasih',1,'praktik','kata-kata sederhana pada bacaan dan tayangan yang dipirsa','membaca kata-kata sederhana dengan fasih'],
        ['Isi bacaan dan tayangan',2,'teori','isi bacaan dan tayangan yang dipirsa tentang diri, keluarga, kesehatan, dan lingkungan sekitar','menjelaskan isi bacaan dan tayangan yang dipirsanya'],
      ],
      'Berbicara dan Mempresentasikan':[
        ['Bertanya, menjawab, dan menanggapi',1,'praktik','cara bertanya, menjawab, dan menanggapi komentar orang lain dengan baik dan santun','bertanya, menjawab, dan menanggapi komentar orang lain dengan santun'],
        ['Mengungkapkan perasaan dan gagasan',1,'praktik','cara mengungkapkan perasaan dan gagasan secara lisan','mengungkapkan perasaan dan gagasan secara lisan dengan atau tanpa bantuan gambar'],
        ['Menceritakan kembali isi teks',2,'praktik','cara menceritakan kembali isi teks yang dibaca, dipirsa, atau didengar','menceritakan kembali isi teks yang dibaca, dipirsa, atau didengarnya'],
      ],
      'Menulis':[
        ['Menulis permulaan dan tulisan tangan',1,'praktik','menulis permulaan di atas kertas dan melalui media digital','menulis permulaan dengan benar dan mengembangkan tulisan tangan yang semakin baik'],
        ['Menulis teks sederhana',2,'praktik','penulisan teks sederhana dengan beberapa kalimat sederhana','menulis teks sederhana tentang diri, keluarga, dan lingkungan sekitar'],
      ],
    },
    B:{
      'Menyimak':[
        ['Ide pokok teks aural nonsastra',1,'teori','ide pokok suatu informasi dari teks nonsastra berbentuk teks aural','menentukan ide pokok informasi dari teks yang didengarnya'],
        ['Isi teks sastra aural',2,'teori','isi teks sastra berbentuk teks aural','menjelaskan isi teks sastra yang didengarnya'],
      ],
      'Membaca dan Memirsa':[
        ['Membaca kata baru dengan fasih',1,'praktik','kata-kata baru pada bacaan dan tayangan yang dipirsa','membaca kata-kata baru dengan fasih'],
        ['Ide pokok, ide pendukung, pesan, dan informasi',2,'teori','ide pokok, ide pendukung, pesan, dan informasi dalam teks sastra dan nonsastra','menentukan ide pokok, ide pendukung, pesan, dan informasi teks yang dibacanya'],
      ],
      'Berbicara dan Mempresentasikan':[
        ['Menyajikan pendapat dengan intonasi tepat',1,'praktik','pilihan kata, sikap tubuh, volume, dan intonasi yang sesuai konteks','menyajikan pendapat dengan pilihan kata, gestur, volume, dan intonasi yang tepat'],
        ['Menanggapi diskusi sesuai tata cara',1,'praktik','tata cara menanggapi diskusi','menanggapi diskusi sesuai tata cara'],
        ['Menceritakan kembali isi teks',2,'praktik','cara menceritakan kembali isi dan informasi berbagai tipe teks','menceritakan kembali isi dan informasi teks yang dibaca, dipirsa, atau didengarnya'],
      ],
      'Menulis':[
        ['Menulis teks dengan kalimat beragam',1,'praktik','penulisan berbagai tipe teks sederhana dengan rangkaian kalimat yang beragam','menulis teks sederhana dengan rangkaian kalimat yang beragam'],
        ['Kaidah kebahasaan dan kosakata denotatif',2,'teori_praktik','kaidah kebahasaan dan kosakata baru yang memiliki makna denotatif','menggunakan kaidah kebahasaan dan kosakata bermakna denotatif untuk menulis teks'],
      ],
    },
    C:{
      'Menyimak':[
        ['Analisis informasi teks aural nonsastra',1,'teori','informasi dari teks nonsastra berbentuk teks aural','menganalisis informasi dari teks yang dibacakan atau didengarnya'],
        ['Analisis isi teks sastra aural',2,'teori','isi teks sastra berbentuk teks aural','menganalisis isi teks sastra yang didengarnya'],
      ],
      'Membaca dan Memirsa':[
        ['Membaca pola kombinasi huruf dengan fasih',1,'praktik','kata dengan berbagai pola kombinasi huruf pada bacaan dan tayangan yang dipirsa','membaca kata dengan berbagai pola kombinasi huruf secara fasih'],
        ['Analisis informasi dan nilai teks',2,'teori','informasi serta nilai-nilai dalam teks sastra dan nonsastra berwujud teks visual dan audiovisual','menganalisis informasi dan nilai-nilai pada teks visual dan audiovisual'],
      ],
      'Berbicara dan Mempresentasikan':[
        ['Mempresentasikan gagasan',1,'praktik','cara mempresentasikan gagasan dengan efektif dan santun','mempresentasikan gagasan dari berbagai tipe teks dengan efektif dan santun'],
        ['Menyampaikan perasaan dalam teks sastra',2,'praktik','penyampaian perasaan berdasarkan fakta dan imajinasi dalam bentuk teks sastra','menyampaikan perasaan berdasarkan fakta dan imajinasi secara indah dan menarik'],
      ],
      'Menulis':[
        ['Menulis teks dari gagasan dan pengamatan',1,'praktik','penulisan teks berdasarkan gagasan, hasil pengamatan, pengalaman, dan imajinasi','menulis teks dengan rangkaian kalimat kompleks secara kreatif dan menarik'],
        ['Kosakata denotatif dan konotatif',2,'teori_praktik','kaidah kebahasaan dan kosakata baru yang bermakna denotatif dan konotatif','menggunakan kosakata bermakna denotatif dan konotatif dalam tulisannya'],
      ],
    },
  },

  /* ------------------------------------------------------------------------------ Matematika */
  mtk:{
    A:{
      'Bilangan':[
        ['Bilangan cacah sampai 100',1,'teori_praktik','bilangan cacah sampai 100 beserta nilai tempatnya','membaca, menulis, membandingkan, dan mengurutkan bilangan cacah sampai 100'],
        ['Komposisi dan dekomposisi bilangan',1,'teori_praktik','komposisi dan dekomposisi bilangan cacah','menyusun dan mengurai bilangan cacah'],
        ['Penjumlahan dan pengurangan sampai 20',2,'teori_praktik','operasi penjumlahan dan pengurangan sampai 20','menyelesaikan penjumlahan dan pengurangan sampai 20 dengan benda konkret'],
        ['Pecahan setengah dan seperempat',2,'teori','pecahan sebagai bagian dari keseluruhan, yaitu setengah dan seperempat','menunjukkan pecahan setengah dan seperempat pada benda konkret'],
      ],
      'Aljabar':[
        ['Makna simbol sama dengan',1,'teori','makna simbol matematika sama dengan pada kalimat matematika penjumlahan dan pengurangan sampai 20','melengkapi kalimat matematika menggunakan simbol sama dengan'],
        ['Pola bukan bilangan',2,'teori','pola bukan bilangan berupa gambar, warna, dan bunyi','mengenali, meniru, dan melanjutkan pola gambar, warna, atau bunyi'],
      ],
      'Pengukuran':[
        ['Membandingkan panjang, berat, dan durasi',1,'teori_praktik','perbandingan panjang dan berat benda serta durasi waktu','membandingkan panjang dan berat benda secara langsung serta durasi waktu'],
        ['Mengukur dengan satuan tidak baku',2,'praktik','pengukuran panjang dan berat dengan satuan tidak baku','mengukur dan mengestimasi panjang serta berat benda dengan satuan tidak baku'],
      ],
      'Geometri':[
        ['Bangun datar dan bangun ruang',1,'teori','berbagai bangun datar dan bangun ruang','mengenali segitiga, segiempat, segi banyak, lingkaran, balok, kubus, kerucut, dan bola'],
        ['Komposisi dan dekomposisi bangun datar',2,'praktik','komposisi dan dekomposisi bangun datar','menyusun dan mengurai bangun datar'],
        ['Posisi benda',2,'teori_praktik','posisi benda terhadap benda lain','menentukan posisi benda terhadap benda lain'],
      ],
      'Analisis Data dan Peluang':[
        ['Mengelompokkan dan membandingkan data benda',1,'teori_praktik','pengurutan, penyortiran, pengelompokan, dan perbandingan data banyak benda','mengurutkan, menyortir, mengelompokkan, dan membandingkan data banyak benda'],
        ['Menyajikan data dengan turus dan piktogram',2,'praktik','penyajian data dengan turus dan piktogram paling banyak empat kategori','menyajikan data menggunakan turus dan piktogram'],
      ],
    },
    B:{
      'Bilangan':[
        ['Bilangan cacah sampai 10.000',1,'teori_praktik','bilangan cacah sampai 10.000 beserta nilai tempatnya','membaca, menulis, membandingkan, dan mengurutkan bilangan cacah sampai 10.000'],
        ['Penjumlahan dan pengurangan sampai 1.000',1,'teori_praktik','operasi penjumlahan dan pengurangan bilangan cacah sampai 1.000','menyelesaikan masalah penjumlahan dan pengurangan bilangan cacah sampai 1.000'],
        ['Perkalian dan pembagian sampai 100',1,'teori_praktik','operasi perkalian dan pembagian bilangan cacah sampai 100','menyelesaikan masalah perkalian dan pembagian bilangan cacah sampai 100'],
        ['Kelipatan dan faktor',2,'teori','kelipatan dan faktor suatu bilangan','menentukan kelipatan dan faktor suatu bilangan'],
        ['Perbandingan dan pecahan senilai',2,'teori_praktik','perbandingan dan pengurutan pecahan serta pecahan senilai','membandingkan, mengurutkan, dan menerapkan pecahan senilai'],
        ['Pecahan sebagai desimal dan persen',2,'teori','hubungan pecahan dengan desimal dan persen','menentukan pecahan sebagai desimal dan persen'],
      ],
      'Aljabar':[
        ['Nilai yang tidak diketahui',1,'teori','nilai yang tidak diketahui pada kalimat matematika penjumlahan dan pengurangan sampai 100','menemukan nilai yang tidak diketahui dengan menggunakan sifat bilangan dan operasinya'],
        ['Pola gambar dan pola bilangan',2,'teori','pola gambar atau objek sederhana dan pola bilangan membesar serta mengecil','mengidentifikasi, meniru, dan mengembangkan pola gambar dan pola bilangan'],
      ],
      'Pengukuran':[
        ['Mengukur panjang dan berat satuan baku',1,'praktik','pengukuran panjang dan berat benda dengan satuan baku','mengukur panjang dan berat benda menggunakan satuan baku'],
        ['Hubungan antarsatuan baku',1,'teori','hubungan antarsatuan baku panjang dan antarsatuan berat','menentukan hubungan antarsatuan baku panjang dan berat'],
        ['Luas dan volume',2,'teori_praktik','pengukuran luas dan volume dengan satuan tidak baku dan satuan baku','mengukur dan mengestimasi luas serta volume'],
      ],
      'Geometri':[
        ['Ciri bangun datar',1,'teori','ciri berbagai bentuk bangun datar segiempat, segitiga, dan segi banyak','mendeskripsikan ciri berbagai bentuk bangun datar'],
        ['Menyusun dan mengurai bangun datar',2,'praktik','komposisi dan dekomposisi berbagai bangun datar','menyusun dan mengurai berbagai bangun datar dengan lebih dari satu cara'],
      ],
      'Analisis Data dan Peluang':[
        ['Menyajikan data dalam tabel dan piktogram',1,'teori_praktik','penyajian data dalam tabel, diagram gambar, dan piktogram','mengurutkan, membandingkan, dan menyajikan data dalam tabel serta piktogram'],
        ['Menganalisis data diagram batang',2,'teori','analisis dan interpretasi data dalam diagram batang','menganalisis dan menginterpretasi data dalam diagram batang'],
      ],
    },
    C:{
      'Bilangan':[
        ['Bilangan cacah sampai 1.000.000',1,'teori_praktik','bilangan cacah sampai 1.000.000 beserta nilai tempatnya','membaca, menulis, membandingkan, dan mengurutkan bilangan cacah sampai 1.000.000'],
        ['Operasi hitung bilangan cacah',1,'teori_praktik','operasi penjumlahan, pengurangan, perkalian, dan pembagian bilangan cacah sampai 100.000','menyelesaikan operasi hitung bilangan cacah sampai 100.000'],
        ['Masalah yang berkaitan dengan uang',1,'teori_praktik','masalah yang berkaitan dengan uang','menyelesaikan masalah yang berkaitan dengan uang'],
        ['Masalah KPK dan FPB',1,'teori','masalah yang berkaitan dengan KPK dan FPB','menyelesaikan masalah yang berkaitan dengan KPK dan FPB'],
        ['Pecahan dan operasinya',2,'teori_praktik','perbandingan, pengurutan, dan operasi hitung pecahan termasuk pecahan campuran','menyelesaikan operasi penjumlahan, pengurangan, perkalian, dan pembagian pecahan'],
        ['Bentuk pecahan lain dan desimal',2,'teori_praktik','pengubahan pecahan menjadi bentuk pecahan lain serta bilangan desimal','mengubah pecahan menjadi bentuk lain serta membandingkan dan mengurutkan bilangan desimal'],
      ],
      'Aljabar':[
        ['Nilai yang belum diketahui',1,'teori','nilai yang belum diketahui pada kalimat matematika sampai 1.000','menemukan nilai yang belum diketahui menggunakan sifat bilangan dan operasinya'],
        ['Pola bilangan membesar dan mengecil',1,'teori','pola bilangan membesar dan mengecil yang melibatkan perkalian dan pembagian','mengidentifikasi, meniru, dan mengembangkan pola bilangan membesar dan mengecil'],
        ['Bernalar proporsional dengan rasio satuan',2,'teori_praktik','penalaran proporsional dengan rasio satuan','menyelesaikan masalah sehari-hari yang terkait proporsi menggunakan perkalian dan pembagian'],
      ],
      'Pengukuran':[
        ['Keliling dan luas bangun datar',1,'teori_praktik','keliling dan luas berbagai bentuk bangun datar beserta gabungannya','menentukan keliling dan luas bangun datar serta gabungannya'],
        ['Durasi waktu dan besar sudut',2,'teori_praktik','perhitungan durasi waktu dan pengukuran besar sudut','menghitung durasi waktu dan mengukur besar sudut'],
      ],
      'Geometri':[
        ['Bangun ruang dan visualisasi spasial',1,'teori_praktik','konstruksi dan penguraian bangun ruang beserta visualisasi spasialnya','mengkonstruksi dan mengurai bangun ruang serta mengenali tampak depan, atas, dan samping'],
        ['Karakteristik bangun datar dan bangun ruang',2,'teori','perbandingan karakteristik antar bangun datar dan antar bangun ruang','membandingkan karakteristik antar bangun datar dan antar bangun ruang'],
        ['Lokasi pada peta sistem berpetak',2,'teori_praktik','penentuan lokasi pada peta yang menggunakan sistem berpetak','menentukan lokasi pada peta yang menggunakan sistem berpetak'],
      ],
      'Analisis Data dan Peluang':[
        ['Menyajikan dan menganalisis data',1,'teori_praktik','penyajian dan analisis data dalam gambar, piktogram, diagram batang, dan tabel frekuensi','mengurutkan, membandingkan, menyajikan, dan menganalisis data untuk mendapatkan informasi'],
        ['Kemungkinan pada percobaan acak',2,'teori','kejadian dengan kemungkinan yang lebih besar atau lebih kecil pada percobaan acak','menentukan kejadian dengan kemungkinan lebih besar atau lebih kecil'],
      ],
    },
  },

  /* ------------------------------------------------------------------------------------ IPAS */
  ipas:{
    B:{
      'Pemahaman IPAS':[
        ['Bentuk dan fungsi pancaindra',1,'teori','bentuk dan fungsi pancaindra','menjelaskan bentuk dan fungsi pancaindra'],
        ['Siklus hidup makhluk hidup',1,'teori','siklus hidup makhluk hidup dan upaya pelestariannya','menganalisis siklus hidup makhluk hidup dan upaya pelestariannya'],
        ['Pelestarian sumber daya alam',1,'teori_praktik','pelestarian sumber daya alam sebagai upaya mitigasi perubahan iklim','menghasilkan solusi untuk masalah pelestarian sumber daya alam'],
        ['Perubahan wujud zat',1,'teori_praktik','proses perubahan wujud zat','menyimpulkan proses perubahan wujud zat melalui percobaan'],
        ['Sumber dan perubahan bentuk energi',2,'teori_praktik','sumber dan bentuk energi serta proses perubahan bentuk energi','menjelaskan perubahan bentuk energi dalam kehidupan sehari-hari'],
        ['Jenis gaya dan pengaruhnya',2,'teori_praktik','jenis gaya dan pengaruhnya terhadap arah, gerak, dan bentuk benda','membedakan jenis gaya dan pengaruhnya terhadap benda'],
        ['Peran, tugas, dan interaksi sosial',2,'teori','peran, tugas, dan tanggung jawab serta interaksi sosial di sekitar tempat tinggal dan sekolah','menjelaskan peran, tugas, dan interaksi sosial di lingkungannya'],
        ['Letak kabupaten/kota dan provinsi',2,'teori_praktik','letak kabupaten/kota dan provinsi tempat tinggalnya','mengenali letak kabupaten/kota dan provinsinya menggunakan peta konvensional atau digital'],
        ['Bentang alam, profesi, dan budaya',2,'teori','ragam bentang alam dan keterkaitannya dengan profesi masyarakat serta ragam budaya','mengklasifikasikan ragam bentang alam beserta profesi dan budaya masyarakatnya'],
        ['Sejarah masyarakat setempat',2,'teori','sejarah masyarakat di lingkungan tempat tinggal','menganalisis sejarah masyarakat di lingkungan tempat tinggalnya'],
        ['Nilai mata uang dan pengelolaan keuangan',2,'teori_praktik','nilai mata uang dan fungsinya serta cara mengelola keuangan secara bijak','mengelola keuangan sederhana secara bijak'],
      ],
      'Keterampilan Proses':[
        ['Mengamati',1,'praktik','pengamatan fenomena dan peristiwa secara sederhana','mengamati fenomena dan peristiwa serta mencatat hasil pengamatannya'],
        ['Mempertanyakan dan memprediksi',1,'praktik','perumusan pertanyaan dan prediksi saat pengamatan','mengajukan pertanyaan dan membuat prediksi berdasarkan pengetahuan sebelumnya'],
        ['Merencanakan dan melakukan penyelidikan',2,'praktik','perencanaan dan langkah operasional penyelidikan','membuat rencana dan melakukan penyelidikan menggunakan alat bantu pengukuran sederhana'],
        ['Memproses dan menganalisis data',2,'teori_praktik','pengorganisasian data dalam bentuk turus dan diagram gambar','mengorganisasikan data serta membandingkan hasil pengamatan dengan prediksi'],
        ['Mengevaluasi dan refleksi',2,'teori','refleksi terhadap penyelidikan yang sudah dilakukan','melakukan refleksi terhadap penyelidikan yang sudah dilakukan'],
        ['Mengomunikasikan hasil',2,'praktik','cara mengomunikasikan hasil penyelidikan','mengomunikasikan hasil penyelidikan secara lisan dan tertulis dalam berbagai media'],
      ],
    },
    C:{
      'Pemahaman IPAS':[
        ['Sistem organ tubuh manusia',1,'teori','sistem organ tubuh manusia yang dikaitkan dengan cara menjaga kesehatan tubuh','merefleksikan sistem organ tubuh manusia dan cara menjaga kesehatannya'],
        ['Komponen biotik dan abiotik pada ekosistem',1,'teori','hubungan antar komponen biotik dan abiotik serta pengaruhnya terhadap ekosistem','menganalisis hubungan komponen biotik dan abiotik pada ekosistem'],
        ['Gelombang bunyi dan cahaya',1,'teori_praktik','fenomena gelombang bunyi dan cahaya dalam kehidupan sehari-hari','menjelaskan fenomena gelombang bunyi dan cahaya melalui percobaan'],
        ['Penghematan dan energi alternatif',1,'teori_praktik','upaya penghematan energi dan pemanfaatan sumber energi alternatif','menghasilkan upaya penghematan energi dan pemanfaatan energi alternatif di sekitarnya'],
        ['Sistem tata surya',2,'teori','sistem tata surya serta kaitannya dengan rotasi dan revolusi bumi','menjelaskan sistem tata surya beserta rotasi dan revolusi bumi'],
        ['Letak dan kondisi geografis Indonesia',2,'teori_praktik','letak dan kondisi geografis negara Indonesia','menjelaskan letak dan kondisi geografis Indonesia menggunakan peta konvensional atau digital'],
        ['Sejarah perjuangan pahlawan',2,'teori','sejarah perjuangan para pahlawan di lingkungan sekitar tempat tinggal','meninjau sejarah perjuangan para pahlawan di lingkungan sekitarnya'],
        ['Keragaman budaya dan kearifan lokal',2,'teori','keragaman budaya nasional dalam konteks kebinekaan berdasarkan nilai kearifan lokal','menemukan keragaman budaya nasional dan kearifan lokal di wilayah tempat tinggalnya'],
        ['Kegiatan ekonomi masyarakat',2,'teori_praktik','kegiatan ekonomi masyarakat di lingkungan sekitar','menerapkan kegiatan ekonomi masyarakat di lingkungan sekitarnya'],
      ],
      'Keterampilan Proses':[
        ['Mengamati',1,'praktik','pengamatan fenomena dan peristiwa beserta persamaan dan perbedaannya','mengamati fenomena, mencatat hasilnya, serta mencari persamaan dan perbedaannya'],
        ['Mempertanyakan dan memprediksi',1,'praktik','identifikasi pertanyaan yang dapat diselidiki secara ilmiah beserta prediksinya','mengidentifikasi pertanyaan yang dapat diselidiki secara ilmiah dan membuat prediksinya'],
        ['Merencanakan dan melakukan penyelidikan',2,'praktik','perencanaan dan langkah operasional penyelidikan secara mandiri','merencanakan dan melakukan penyelidikan menggunakan alat bantu pengukuran sederhana'],
        ['Memproses dan menganalisis data',2,'teori_praktik','pengolahan data dalam bentuk tabel dan grafik beserta pola atau hubungannya','mengolah data dalam tabel dan grafik serta membandingkannya dengan prediksi berdasarkan bukti'],
        ['Mengevaluasi dan refleksi',2,'teori','refleksi dan saran perbaikan terhadap penyelidikan yang sudah dilakukan','memberikan refleksi dan saran perbaikan terhadap penyelidikannya'],
        ['Mengomunikasikan hasil',2,'praktik','cara mengomunikasikan hasil penyelidikan secara utuh dengan argumen','mengomunikasikan hasil penyelidikan yang ditunjang argumen dalam berbagai media'],
      ],
    },
  },

  /* ------------------------------------------------------------------------------------ PJOK */
  pjok:{
    A:{
      'Terampil Bergerak':[
        ['Keterampilan gerak fundamental',1,'praktik','keterampilan gerak fundamental','mempraktikkan keterampilan gerak fundamental dalam berbagai situasi gerak'],
        ['Eksplorasi strategi gerak',2,'praktik','berbagai strategi gerak','mengeksplorasi berbagai strategi gerak'],
        ['Eksplorasi konsep gerak',2,'teori_praktik','berbagai konsep gerak dan efektivitasnya','mengeksplorasi konsep gerak serta menyimpulkan efektivitasnya'],
      ],
      'Belajar Melalui Gerak':[
        ['Menaati peraturan untuk fair play',1,'teori_praktik','peraturan yang menumbuhkan fair play dalam aktivitas jasmani','menaati peraturan untuk menumbuhkan fair play'],
        ['Strategi kolaborasi',2,'praktik','strategi kolaborasi dalam aktivitas jasmani','menerapkan strategi kolaborasi ketika berpartisipasi dalam aktivitas jasmani'],
      ],
      'Bergaya Hidup Aktif':[
        ['Partisipasi dan manfaat aktivitas jasmani',1,'teori_praktik','manfaat berbagai aktivitas jasmani','berpartisipasi dalam aktivitas jasmani dan mengidentifikasi manfaatnya'],
      ],
      'Memilih Hidup yang Menyehatkan':[
        ['Gaya hidup aktif dan sehat',1,'teori','gaya hidup aktif dan sehat','mengenali gaya hidup aktif dan sehat'],
        ['Makanan bergizi seimbang',2,'teori','manfaat komponen makanan bergizi seimbang','mengenali komponen makanan bergizi seimbang'],
        ['Situasi berisiko dan mencari bantuan',2,'teori_praktik','situasi dan potensi yang berisiko terhadap kesehatan dan keselamatan','mencari bantuan kepada orang dewasa terpercaya saat menghadapi situasi berisiko'],
      ],
    },
    B:{
      'Terampil Bergerak':[
        ['Menghaluskan keterampilan gerak fundamental',1,'praktik','keterampilan gerak fundamental pada situasi gerak yang baru','menghaluskan keterampilan gerak fundamental dan menerapkannya pada situasi baru'],
        ['Menyesuaikan strategi gerak',2,'praktik','penyesuaian strategi gerak untuk mendapatkan capaian keterampilan gerak','menyesuaikan strategi gerak untuk meningkatkan capaian keterampilan gerak'],
        ['Konsep gerak dalam rangkaian gerak',2,'teori_praktik','berbagai konsep gerak yang diterapkan dalam rangkaian gerak','memperagakan konsep gerak dalam rangkaian gerak'],
      ],
      'Belajar Melalui Gerak':[
        ['Strategi gerak dan pemecahan masalah',1,'teori_praktik','strategi gerak sederhana dan pemecahan masalah gerak','menerapkan strategi gerak sederhana dan memecahkan masalah gerak'],
        ['Peraturan dan fair play',1,'teori_praktik','peraturan yang menumbuhkan fair play dalam aktivitas jasmani','menerapkan peraturan untuk menumbuhkan fair play'],
        ['Partisipasi positif dalam kelompok',2,'praktik','partisipasi positif dalam kelompok atau tim','berpartisipasi secara positif dalam kelompok atau tim'],
      ],
      'Bergaya Hidup Aktif':[
        ['Faktor aktivitas jasmani menyenangkan',1,'teori_praktik','faktor-faktor yang menyebabkan aktivitas jasmani menyenangkan','berpartisipasi dalam aktivitas jasmani dan mengenali faktor yang membuatnya menyenangkan'],
      ],
      'Memilih Hidup yang Menyehatkan':[
        ['Risiko kesehatan dan pencegahannya',1,'teori','risiko kesehatan akibat gaya hidup dan aktivitas jasmani untuk pencegahannya','mengenali risiko kesehatan akibat gaya hidup dan cara mencegahnya'],
        ['Pola makan sehat dan bergizi seimbang',2,'teori','pola makan sehat dan bergizi seimbang sesuai rekomendasi kesehatan','mengidentifikasi pola makan sehat untuk menunjang aktivitas sehari-hari'],
        ['Penanganan cedera ringan',2,'praktik','prinsip pertolongan pertama pada cedera ringan','mempraktikkan penanganan cedera ringan sesuai prinsip pertolongan pertama'],
      ],
    },
    C:{
      'Terampil Bergerak':[
        ['Keterampilan gerak lintas situasi',1,'praktik','penyesuaian keterampilan gerak melintasi berbagai situasi gerak','menyesuaikan keterampilan gerak melintasi berbagai situasi gerak'],
        ['Mentransfer strategi gerak',2,'praktik','pemindahan strategi gerak yang sudah dikuasai ke situasi gerak berbeda','mentransfer strategi gerak yang sudah dikuasai ke berbagai situasi gerak'],
        ['Menginvestigasi konsep gerak',2,'teori_praktik','konsep gerak yang dapat meningkatkan capaian keterampilan gerak','menginvestigasi konsep gerak untuk meningkatkan capaian keterampilan geraknya'],
      ],
      'Belajar Melalui Gerak':[
        ['Menguji efektivitas strategi gerak',1,'teori_praktik','efektivitas penerapan strategi gerak pada berbagai situasi gerak','menguji efektivitas penerapan strategi gerak'],
        ['Merancang peraturan dan modifikasi permainan',1,'praktik','peraturan alternatif dan modifikasi permainan untuk fair play dan partisipasi inklusif','merancang peraturan alternatif dan modifikasi permainan yang inklusif'],
        ['Menjalankan peran dalam tim',2,'praktik','berbagai peran untuk mencapai keberhasilan kelompok atau tim','menjalankan berbagai peran untuk keberhasilan kelompok atau tim'],
      ],
      'Bergaya Hidup Aktif':[
        ['Pengaruh aktivitas jasmani teratur',1,'teori_praktik','pengaruh aktivitas jasmani yang teratur terhadap kesehatan','berpartisipasi dalam aktivitas jasmani dan menjelaskan pengaruhnya terhadap kesehatan'],
        ['Rekomendasi aktivitas dan perilaku sedenter',2,'teori','rekomendasi aktivitas jasmani serta pencegahan perilaku sedenter','mengidentifikasi rekomendasi aktivitas jasmani dan mencegah perilaku sedenter'],
      ],
      'Memilih Hidup yang Menyehatkan':[
        ['Gaya hidup, risiko, dan pencegahan',1,'teori','hubungan antara gaya hidup, risiko kesehatan, dan aktivitas pencegahannya','menghubungkan gaya hidup dengan risiko kesehatan dan aktivitas pencegahannya'],
        ['Pola makan sehat berdasarkan kandungan gizi',2,'teori','pola makan sehat berdasarkan informasi kandungan gizi pada makanan','menjelaskan pola makan sehat untuk menunjang aktivitas jasmani'],
        ['Penanganan cedera sedang',2,'praktik','prinsip pertolongan pertama pada cedera sedang','mempraktikkan penanganan cedera sedang sesuai prinsip pertolongan pertama'],
      ],
    },
  },

  /* -------------------------------------------------------------------------------- Seni Rupa
     Naskah resminya menamai elemen dengan padanan Inggris di dalam kurung; nama elemen pada
     aplikasi memakai bagian Indonesianya. */
  seni_rupa:{
    A:{
      'Mengalami':[
        ['Unsur rupa di sekitar',1,'teori','unsur-unsur rupa pada benda-benda di sekitar dan karya seni rupa','mengenali dan menyebutkan unsur rupa pada benda di sekitarnya'],
      ],
      'Menciptakan':[
        ['Karya rupa dari pengalaman',1,'praktik','pembuatan karya seni rupa berdasarkan pengalaman','membuat karya seni rupa berdasarkan pengalamannya'],
        ['Karya rupa dari pengamatan lingkungan',2,'praktik','pembuatan karya seni rupa berdasarkan hasil pengamatan terhadap lingkungan sekitar','membuat karya seni rupa berdasarkan pengamatan lingkungan sekitar'],
      ],
      'Merefleksikan':[
        ['Merefleksikan karya sendiri',2,'teori','refleksi dan apresiasi terhadap karya diri sendiri','merefleksikan dan mengapresiasi karya diri sendiri'],
      ],
      'Berpikir dan Bekerja Artistik':[
        ['Menguji coba alat dan bahan',1,'praktik','alat dan bahan yang dimiliki untuk berkarya','mengenali dan menguji coba alat serta bahan yang dimiliki'],
      ],
      'Berdampak':[
        ['Karya yang berdampak pada perasaan',2,'teori_praktik','karya seni rupa yang berdampak pada perasaan dirinya','menghasilkan karya seni rupa yang berdampak pada perasaannya'],
      ],
    },
    B:{
      'Mengalami':[
        ['Unsur rupa dan prinsip desain',1,'teori','unsur rupa dan prinsip desain pada benda di sekitar dan karya seni rupa','mengidentifikasi unsur rupa dan prinsip desain pada benda di sekitarnya'],
      ],
      'Menciptakan':[
        ['Karya rupa dari pengalaman',1,'praktik','pembuatan karya seni rupa berdasarkan pengalaman','membuat karya seni rupa berdasarkan pengalamannya'],
        ['Karya rupa dari pengamatan lingkungan',2,'praktik','pembuatan karya seni rupa berdasarkan hasil pengamatan terhadap lingkungan sekitar','membuat karya seni rupa berdasarkan pengamatan lingkungan sekitar'],
      ],
      'Merefleksikan':[
        ['Apresiasi karya sendiri dan teman',2,'teori','refleksi dan apresiasi karya diri sendiri dan teman sekelas dengan kosa kata seni rupa','merefleksikan dan mengapresiasi karya diri sendiri serta teman sekelas'],
      ],
      'Berpikir dan Bekerja Artistik':[
        ['Alat, bahan, dan prosedur penggunaannya',1,'praktik','alat dan bahan yang dimiliki beserta prosedur penggunaannya','mengenali dan menguji coba alat, bahan, serta prosedur penggunaannya'],
      ],
      'Berdampak':[
        ['Karya yang mewakili harapan',2,'teori_praktik','karya seni rupa yang berdampak pada perasaan atau mewakili harapannya','menghasilkan karya seni rupa yang mewakili perasaan atau harapannya'],
      ],
    },
    C:{
      'Mengalami':[
        ['Menjelaskan unsur rupa dan prinsip desain',1,'teori','unsur rupa dan prinsip desain pada benda di sekitar dan karya seni rupa','menjelaskan unsur rupa dan prinsip desain pada karya seni rupa'],
      ],
      'Menciptakan':[
        ['Karya rupa dari pengalaman dan pengamatan',1,'praktik','pembuatan karya seni rupa berdasarkan pengalaman dan hasil pengamatan terhadap lingkungan sekitar','membuat karya seni rupa berdasarkan pengalaman dan pengamatan lingkungan sekitar'],
        ['Karya rupa melalui pengembangan imajinasi',2,'praktik','pengembangan imajinasi dalam membuat karya seni rupa','membuat karya seni rupa melalui pengembangan imajinasinya'],
      ],
      'Merefleksikan':[
        ['Apresiasi karya sendiri dan teman',2,'teori','refleksi dan apresiasi karya diri sendiri dan teman sekelas dengan kosa kata seni rupa','merefleksikan dan mengapresiasi karya diri sendiri serta teman sekelas'],
      ],
      'Berpikir dan Bekerja Artistik':[
        ['Variasi teknik penggunaan alat dan bahan',1,'praktik','variasi teknik penggunaan alat dan bahan','mengenali dan menguji coba variasi teknik penggunaan alat serta bahan'],
      ],
      'Berdampak':[
        ['Karya yang mewakili minat',2,'teori_praktik','karya seni rupa yang mewakili minatnya','menghasilkan karya seni rupa yang mewakili minatnya'],
      ],
    },
  },

  /* -------------------------------------------------------------------------- Bahasa Inggris */
  bing:{
    B:{
      'Menyimak - Berbicara':[
        ['Memahami teks lisan dan multimodal',1,'teori','teks lisan atau teks multimodal sederhana tentang kehidupan sehari-hari','memahami teks lisan atau multimodal sederhana tentang kehidupan sehari-hari'],
        ['Merespons teks sesuai konteks',2,'praktik','cara merespons teks secara verbal atau non-verbal sesuai konteks','merespons teks lisan atau multimodal secara verbal maupun non-verbal sesuai konteks'],
      ],
      'Membaca - Memirsa':[
        ['Memahami teks tulis pendek sederhana',1,'teori','teks tulis pendek sederhana atau teks multimodal tentang kehidupan sehari-hari','memahami teks tulis pendek sederhana atau teks multimodal'],
        ['Merespons teks yang dibaca',2,'praktik','cara merespons teks yang dibaca secara verbal atau non-verbal sesuai konteks','merespons teks yang dibacanya secara verbal maupun non-verbal'],
      ],
      'Menulis - Mempresentasikan':[
        ['Mengomunikasikan gagasan dalam teks tulis',1,'praktik','pengomunikasian gagasan tentang topik sehari-hari dalam teks tulis pendek','mengomunikasikan gagasan tentang topik sehari-hari dalam teks tulis pendek'],
        ['Mengomunikasikan gagasan dalam teks multimodal',2,'praktik','pengomunikasian gagasan dalam teks multimodal sesuai konteks','mengomunikasikan gagasannya dalam teks multimodal sesuai konteks'],
      ],
    },
    C:{
      'Menyimak - Berbicara':[
        ['Memahami alur informasi teks',1,'teori','alur informasi teks secara keseluruhan pada teks lisan atau multimodal sederhana','memahami alur informasi teks lisan atau multimodal tentang topik sehari-hari'],
        ['Merespons dengan kalimat pendek dan sederhana',2,'praktik','respons lisan dengan kalimat pendek dan sederhana sesuai konteks','merespons teks lisan atau multimodal secara lisan dengan kalimat pendek dan sederhana'],
      ],
      'Membaca - Memirsa':[
        ['Alur informasi, gagasan utama, dan rincian',1,'teori','alur informasi secara keseluruhan, gagasan utama, dan informasi rinci dari teks pendek atau multimodal','memahami alur informasi, gagasan utama, dan informasi rinci dari beragam teks pendek'],
        ['Merespons beragam teks pendek',2,'praktik','cara merespons beragam teks pendek atau multimodal sesuai konteks','merespons beragam teks pendek atau multimodal sesuai konteks'],
      ],
      'Menulis - Mempresentasikan':[
        ['Mengomunikasikan ide dalam teks tulis',1,'praktik','pengomunikasian ide melalui teks tulis sederhana tentang topik sehari-hari','mengomunikasikan idenya melalui teks tulis sederhana'],
        ['Mengomunikasikan pengalaman dalam teks multimodal',2,'praktik','pengomunikasian pengalaman melalui teks multimodal tentang topik sehari-hari','mengomunikasikan pengalamannya melalui teks multimodal sesuai konteks'],
      ],
    },
  },

  /* ------------------------------------------------------ Bahasa Sunda (Muatan Lokal Jabar) */
  sunda:{
    A:{
      'Menyimak':[
        ['Menjadi penyimak yang baik (saregep)',1,'teori_praktik','sikap menjadi penyimak yang baik atau saregep','bersikap menjadi penyimak yang baik saat menyimak berbahasa Sunda'],
        ['Informasi dari instruksi lisan dan teks aural',2,'teori','informasi atau pesan dari instruksi lisan sederhana berbahasa Sunda dan teks aural fiksi maupun nonfiksi','memahami informasi dari instruksi lisan dan teks aural berbahasa Sunda'],
      ],
      'Membaca dan Memirsa':[
        ['Informasi dan kosakata teks sederhana',1,'teori','informasi dan kosakata tipe teks fiksi dan nonfiksi sederhana berbahasa Sunda','memahami informasi dan kosakata teks berbahasa Sunda yang dibaca atau dipirsa'],
        ['Menambah kosakata baru',2,'teori_praktik','penambahan kosakata baru bahasa Sunda dari teks yang dibaca atau tayangan yang dipirsa','menambah kosakata baru bahasa Sunda dengan bantuan ilustrasi'],
      ],
      'Berbicara dan Menyajikan/Mempresentasikan':[
        ['Melafalkan teks dengan lentong yang tepat',1,'praktik','pelafalan teks pendek berbahasa Sunda dengan volume dan intonasi (lentong) yang tepat','melafalkan teks pendek berbahasa Sunda dengan volume dan intonasi yang tepat'],
        ['Bertanya, menjawab, dan menanggapi',1,'praktik','cara bertanya, menjawab, dan menanggapi komentar orang lain dengan bahasa Sunda yang benar dan santun','bertanya, menjawab, dan menanggapi komentar orang lain dalam bahasa Sunda dengan santun'],
        ['Mengungkapkan gagasan dan menceritakan kembali',2,'praktik','pengungkapan gagasan berbahasa Sunda dan penceritaan kembali sesuai tatakrama Sunda','mengungkapkan gagasan dengan bantuan gambar dan menceritakan kembali informasi dalam bahasa Sunda'],
      ],
      'Menulis':[
        ['Tulisan tangan huruf lepas dan tegak bersambung',1,'praktik','tulisan tangan huruf lepas dan tegak bersambung berdasarkan kata bahasa Sunda','mengembangkan tulisan tangan huruf lepas dan tegak bersambung yang semakin baik'],
        ['Menulis teks pendek berbahasa Sunda',2,'praktik','penulisan teks pendek fiksi dan nonfiksi berbahasa Sunda','menulis teks pendek berbahasa Sunda dengan beberapa kata'],
      ],
    },
    B:{
      'Menyimak':[
        ['Ide pokok dan pendukung teks',1,'teori','ide pokok dan ide pendukung dari teks fiksi dan nonfiksi berbahasa Sunda','memahami dan memaknai ide pokok serta ide pendukung teks berbahasa Sunda'],
        ['Instruksi lisan dan teks aural',2,'teori','instruksi lisan dan teks aural berbahasa Sunda melalui media audio dan audiovisual','memahami instruksi lisan dan teks aural berbahasa Sunda'],
      ],
      'Membaca dan Memirsa':[
        ['Informasi dan ide pokok teks',1,'teori','informasi serta ide pokok dan pendukung dari teks fiksi dan nonfiksi berbahasa Sunda','memahami informasi dan ide pokok teks berbahasa Sunda bentuk cetak maupun elektronik'],
        ['Menambah kosakata sesuai topik',2,'teori_praktik','penambahan kosakata baru dari teks berbahasa Sunda sesuai topik','menambah kosakata baru dari teks berbahasa Sunda yang dibaca atau dipirsa'],
      ],
      'Berbicara dan Menyajikan/Mempresentasikan':[
        ['Berbicara sesuai kaidah dan norma budaya Sunda',1,'praktik','pilihan kata, gestur, volume, dan intonasi sesuai kaidah bahasa dan norma budaya Sunda','berbicara bahasa Sunda dengan pilihan kata, gestur, dan intonasi yang santun'],
        ['Mengajukan dan menanggapi pertanyaan',1,'praktik','cara mengajukan dan menanggapi pertanyaan dalam percakapan atau diskusi berbahasa Sunda','mengajukan dan menanggapi pertanyaan berbahasa Sunda secara aktif'],
        ['Menceritakan kembali informasi',2,'praktik','penceritaan kembali informasi dari teks fiksi dan nonfiksi berbahasa Sunda','menceritakan kembali informasi dari teks berbahasa Sunda dengan beragam topik'],
      ],
      'Menulis':[
        ['Menulis tegak bersambung',1,'praktik','penulisan tegak bersambung kalimat dan teks sederhana bahasa Sunda','menulis tegak bersambung kalimat dan teks sederhana berbahasa Sunda'],
        ['Menulis sesuai ejaan dan tata bahasa',2,'praktik','kaidah penulisan (ejaan) dan tata bahasa Sunda','menulis teks fiksi dan nonfiksi berbahasa Sunda sesuai kaidah ejaan dan tata bahasa'],
      ],
    },
    C:{
      'Menyimak':[
        ['Menganalisis fakta dan prosedur',1,'teori','informasi berupa fakta dan prosedur dari berbagai tipe teks berbahasa Sunda','menganalisis informasi berupa fakta dan prosedur dari teks berbahasa Sunda'],
        ['Ciri objek, urutan kejadian, dan nilai teks',2,'teori','ciri objek, urutan proses kejadian, dan nilai-nilai dari berbagai tipe teks berbahasa Sunda','mengidentifikasi ciri objek, urutan kejadian, dan nilai pada teks berbahasa Sunda'],
      ],
      'Membaca dan Memirsa':[
        ['Membaca lancar dan indah',1,'praktik','pembacaan yang lancar dan indah serta kosakata bermakna denotatif dan konotatif','membaca dengan lancar dan indah serta memahami kosakata baru berbahasa Sunda'],
        ['Ide pokok, struktur, dan nilai teks',1,'teori','ide pokok dan struktur tipe teks fiksi dan nonfiksi berbahasa Sunda beserta nilai di dalamnya','mengidentifikasi ide pokok dan struktur teks serta menafsirkan nilai yang terkandung'],
        ['Membaca kalimah beraksara Sunda',2,'praktik','kalimah sederhana yang menggunakan aksara Sunda','membaca kalimah sederhana yang menggunakan aksara Sunda'],
      ],
      'Berbicara dan Menyajikan/Mempresentasikan':[
        ['Menyampaikan informasi secara fasih dan santun',1,'praktik','penyampaian informasi dalam bahasa Sunda secara fasih dan santun sesuai kaidah dan norma budaya Sunda','menyampaikan informasi berbahasa Sunda secara fasih dan santun'],
        ['Menyampaikan pesan dalam prosa atau puisi',2,'praktik','penyampaian informasi atau pesan berdasarkan fakta, pengalaman, atau imajinasi dalam prosa dan puisi berbahasa Sunda','menyampaikan pesan dalam bentuk prosa atau puisi berbahasa Sunda secara kreatif'],
      ],
      'Menulis':[
        ['Menulis berbagai tipe teks',1,'praktik','penulisan berbagai tipe teks fiksi dan nonfiksi berbahasa Sunda dari informasi, pengamatan, dan imajinasi','menulis berbagai tipe teks berbahasa Sunda serta menjelaskan hubungan kausalitasnya'],
        ['Kaidah kebahasaan dan kosakata',2,'teori_praktik','kaidah kebahasaan dan kesastraan serta kosakata bermakna denotatif dan konotatif','menggunakan kaidah kebahasaan dan kosakata berbahasa Sunda sesuai konteks dan norma budaya Sunda'],
        ['Menulis kata beraksara Sunda',2,'praktik','penulisan kata-kata menggunakan aksara Sunda','menulis kata-kata menggunakan aksara Sunda'],
      ],
    },
  },

  /* ------------------------------------------------ Koding dan Kecerdasan Artifisial (Fase C) */
  koding:{
    C:{
      'Berpikir Komputasional':[
        ['Pemecahan masalah secara sistematis',1,'teori','permasalahan sederhana dalam kehidupan sehari-hari dan pemecahannya secara sistematis','menerapkan pemecahan masalah sehari-hari secara sistematis'],
        ['Instruksi logis dan terstruktur',2,'teori_praktik','penulisan instruksi logis dan terstruktur menggunakan sekumpulan kosakata atau simbol','menuliskan instruksi logis dan terstruktur menggunakan kosakata atau simbol'],
      ],
      'Literasi Digital':[
        ['Konsep, manfaat, dan dampak teknologi digital',1,'teori','konsep dasar, manfaat, dan dampak teknologi digital','menjelaskan konsep dasar, manfaat, dan dampak teknologi digital'],
        ['Sistem komputer tingkat pradasar',1,'teori','sistem komputer tingkat pradasar','menjelaskan bagian sistem komputer tingkat pradasar'],
        ['Pengamanan informasi pribadi',2,'teori_praktik','pengamanan informasi pribadi dalam komunikasi daring','menerapkan pengamanan informasi pribadi saat berkomunikasi daring'],
        ['Memanfaatkan internet dan konten digital',2,'praktik','pemanfaatan internet serta produksi dan diseminasi konten digital berupa teks dan gambar','memanfaatkan internet serta memproduksi dan mendiseminasi konten digital teks dan gambar'],
      ],
      'Literasi dan Etika Kecerdasan Artifisial':[
        ['Konsep, manfaat, dan dampak KA',1,'teori','konsep kecerdasan artifisial sederhana beserta manfaat dan dampaknya pada kehidupan sehari-hari','menjelaskan konsep kecerdasan artifisial sederhana beserta manfaat dan dampaknya'],
        ['Perbedaan manusia, komputer, dan mesin cerdas',1,'teori','perbedaan manusia dan komputer dalam melakukan penginderaan serta perbedaan mesin cerdas dan mesin non-cerdas','membedakan penginderaan manusia dengan komputer serta mesin cerdas dengan mesin non-cerdas'],
        ['Prinsip dan etika penggunaan KA',2,'teori_praktik','prinsip bahwa kecerdasan artifisial dikembangkan untuk meningkatkan kesejahteraan manusia dan tidak boleh merugikan manusia, serta etika dasar penggunaannya','menerapkan etika dasar penggunaan kecerdasan artifisial seperti empati dan tidak menyakiti orang lain'],
      ],
      'Pemanfaatan dan Pengembangan Kecerdasan Artifisial':[
        ['Simulasi kerja KA mengenali pola',1,'teori_praktik','cara kerja kecerdasan artifisial saat mengenali pola','menyimulasikan secara sederhana kerja kecerdasan artifisial saat mengenali pola'],
        ['Klasifikasi benda dan pengaruh input',2,'teori_praktik','klasifikasi benda konkret berdasarkan sifatnya dan pengaruh input terhadap prediksi sistem kecerdasan artifisial','mengklasifikasi benda konkret berdasarkan sifatnya dan menunjukkan pengaruh input terhadap prediksi'],
      ],
    },
  },
};

/* ------------------------------------------------------------------------------- Pembacaan */

function slug(value){return String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}

/* ID butir dibangun dari ID ELEMEN, bukan dari nama tampilannya. Nama elemen dapat disamakan
   dengan naskah resmi tanpa mengubah id - dan tanpa memutus Butir CP, nilai murid, maupun
   penyesuaian guru yang sudah tersimpan dengan id lama. Bentuk nama tetap diterima demi
   pemanggil lama. */
export function butirIdOf(subjectId,phase,elementRef,order){
  const rujukan=String(elementRef||'');
  const slugElemen=rujukan.includes(':')?rujukan.slice(rujukan.indexOf(':')+1):slug(rujukan);
  return `cpb-${subjectId}-${phase}-${slugElemen}-${order}`;
}

/* Butir CP bawaan untuk satu mata pelajaran pada satu fase. Urutan elemen mengikuti urutan
   resmi pada `curriculum-cp.js`, sehingga tabel butir terbaca searah dengan dokumen CP-nya. */
export function defaultCpButir(subjectId,phase){
  const perElemen=KATALOG[subjectId]?.[phase];
  if(!perElemen)return [];
  const elemen=cpElements(subjectId,phase);
  if(!elemen.length)return [];
  const hasil=[];
  for(const item of elemen){
    const daftar=perElemen[item.name]||[];
    /* Kolom kedua dan ketiga larik katalog (dulu semester dan jenis) sengaja dilewati. */
    daftar.forEach(([nama,,,teori,praktik],index)=>{
      const order=index+1;
      hasil.push(Object.freeze({
        id:butirIdOf(subjectId,phase,item.id,order),
        code:`CP ${item.name} ${order}`,
        name:nama,
        subjectId,phase,
        elementId:item.id,
        elementName:item.name,
        elementOrder:item.order,
        order,
        teori:teori||null,
        praktik:praktik||null,
        active:true,
        status:BUTIR_CP_STATUS,
        isDefault:true,
        editable:true,
      }));
    });
  }
  return hasil;
}

export function subjectsWithCpButir(){return Object.keys(KATALOG);}
export function phasesWithCpButir(subjectId){return Object.keys(KATALOG[subjectId]||{});}
export function hasCpButir(subjectId,phase){return defaultCpButir(subjectId,phase).length>0;}

/* Ringkasan cakupan katalog, dipakai audit dan test agar tidak ada mapel/fase yang diam-diam
   kosong padahal CP-nya berlaku. */
export function cpButirCoverage(subjectIds,phases=['A','B','C']){
  return subjectIds.flatMap(subjectId=>phases.map(phase=>{
    const butir=defaultCpButir(subjectId,phase);
    const elemen=cpElements(subjectId,phase);
    const terpakai=new Set(butir.map(item=>item.elementId));
    return {
      subjectId,phase,
      elemen:elemen.length,
      butir:butir.length,
      elemenTanpaButir:elemen.filter(item=>!terpakai.has(item.id)).map(item=>item.name),
    };
  }));
}

export { elementIdOf };
