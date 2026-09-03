/* Tujuan Pembelajaran (TP) bawaan aplikasi — berstatus INSPIRATIF / ACUAN.

   PENTING, dan disengaja: pemerintah menetapkan CAPAIAN PEMBELAJARAN (CP), bukan Tujuan
   Pembelajaran. TP disusun satuan pendidikan dan guru dengan menurunkannya dari CP. Karena itu
   seluruh butir di berkas ini diberi status 'inspiratif' dan editable: ia adalah titik mulai
   yang boleh diubah, ditambah, atau dihapus guru, BUKAN teks nasional yang wajib dipakai.

   Rujukan resmi tercantum pada SOURCES di bawah dan diringkas di docs/TP-SOURCES.md.

   Pemetaan fase mengikuti aturan: Kelas 1-2 Fase A, Kelas 3-4 Fase B, Kelas 5-6 Fase C.
   IPAS baru berdiri sebagai mata pelajaran tersendiri mulai Fase B. */

export const OBJECTIVE_STATUS='inspiratif';

export const TP_SOURCES=Object.freeze({
  cp_umum:Object.freeze({
    id:'cp_umum',
    title:'Capaian Pembelajaran pada PAUD, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah',
    decision:'Keputusan Kepala BSKAP Nomor 046/H/KR/2025',
    authority:'Badan Standar, Kurikulum, dan Asesmen Pendidikan, Kementerian Pendidikan Dasar dan Menengah',
    scope:'nasional',
    verified:true,
    note:'Perubahan atas Keputusan Kepala BSKAP Nomor 032/H/KR/2024. Berlaku untuk seluruh mata pelajaran selain Agama dan Budi Pekerti.',
    year:2025,
    url:'https://kurikulum.kemdikbud.go.id/rujukan/regulasi-kurikulum-merdeka',
  }),
  /* Pendidikan Agama dan Budi Pekerti memakai CP versi 2025, yaitu keputusan yang sama dengan
     mata pelajaran nasional lainnya. Sumbernya tetap dipisahkan dari cp_umum karena keduanya
     menyampaikan hal berbeda kepada guru: cp_umum menyatakan berlaku untuk mapel SELAIN Agama,
     sedangkan entri ini menyatakan bagian Agama dari keputusan yang sama.

     Keputusan Kepala BKPDM Nomor 020 Tahun 2026 memang sudah terbit dan memperbarui CP Agama,
     tetapi pada tahap ini aplikasi sengaja memakai versi 2025 lebih dulu. Catatan di bawah
     menyimpan fakta itu supaya keputusan tersebut tidak terlupakan ketika naskahnya dimuat. */
  cp_pabp:Object.freeze({
    id:'cp_pabp',
    title:'Capaian Pembelajaran mata pelajaran Pendidikan Agama dan Budi Pekerti',
    decision:'Keputusan Kepala BSKAP Nomor 046/H/KR/2025',
    authority:'BSKAP Kemendikdasmen',
    scope:'nasional',
    verified:true,
    note:'Bagian Pendidikan Agama dan Budi Pekerti pada Keputusan Kepala BSKAP Nomor 046/H/KR/2025. Keputusan Kepala BKPDM Nomor 020 Tahun 2026 memperbarui CP Agama, namun pada tahap ini aplikasi sengaja memakai versi resmi 2025.',
    year:2025,
    url:'https://kurikulum.kemdikbud.go.id/rujukan/regulasi-kurikulum-merdeka',
  }),
  inspirasi_atp:Object.freeze({
    id:'inspirasi_atp',
    title:'Inspirasi Alur Tujuan Pembelajaran (ATP) — Referensi Penerapan Kurikulum',
    decision:'Ruang GTK Kemendikdasmen',
    authority:'Ruang GTK, Kementerian Pendidikan Dasar dan Menengah',
    scope:'inspirasi',
    verified:true,
    note:'Pemerintah menyediakan ATP sebagai INSPIRASI, bukan kewajiban. Satuan pendidikan tetap menyusun TP-nya sendiri.',
    year:2026,
    url:'https://guru.kemendikdasmen.go.id/kurikulum/referensi-penerapan/capaian-pembelajaran/',
  }),
  /* Koding dan Kecerdasan Artifisial tidak ditetapkan lewat keputusan CP umum, melainkan lewat
     panduan mata pelajarannya sendiri. Karena itu ia diberi sumber terpisah: memaksakan
     046/H/KR/2025 kepadanya akan menyebut regulasi yang bukan sumbernya. */
  cp_koding_ka:Object.freeze({
    id:'cp_koding_ka',
    title:'Panduan Mata Pelajaran Koding dan Kecerdasan Artifisial',
    decision:'Panduan Mata Pelajaran Koding dan Kecerdasan Artifisial (Pusat Kurikulum dan Pembelajaran, 2025)',
    authority:'Pusat Kurikulum dan Pembelajaran, Kementerian Pendidikan Dasar dan Menengah',
    scope:'nasional',
    verified:true,
    note:'Pada jenjang SD, Koding dan Kecerdasan Artifisial dimulai pada Fase C (kelas 5-6). Fase A dan Fase B tidak memiliki CP mata pelajaran ini.',
    year:2025,
    url:'https://kurikulum.kemendikdasmen.go.id/file/panduan/dokumen/33.%20Final%20Panduan%20Mata%20Pelajaran%20Panduan%20Mata%20Pelajaran%20Koding%20dan%20Kecerdasan%20Artifisial_12_Sep_2025_revisi%203.pdf',
  }),
  /* Bahasa Sunda adalah MUATAN LOKAL Jawa Barat, bukan mata pelajaran nasional: kewenangan
     penetapan CP-nya ada pada Dinas Pendidikan Provinsi Jawa Barat, bukan Kemendikdasmen.

     Identitas regulasinya kini diketahui dari dokumen resminya sendiri - Buku Saku Kurikulum
     Merdeka Bahasa Sunda, yang memuat Keputusan Kepala Dinas Pendidikan Provinsi Jawa Barat
     Nomor 32817/Pk.05.02/Sekre/2022 - sehingga `verified` berubah menjadi true. Yang masih
     kosong adalah NASKAH capaiannya: berkas PDF-nya belum ada di workspace, dan naskah CP
     tidak boleh diambil dari sumber lain. */
  cp_mulok_jabar:Object.freeze({
    id:'cp_mulok_jabar',
    title:'Capaian Pembelajaran Muatan Lokal Bahasa Sunda',
    decision:'Keputusan Kepala Dinas Pendidikan Provinsi Jawa Barat Nomor 32817/Pk.05.02/Sekre/2022',
    decisionNumber:'32817/Pk.05.02/Sekre/2022',
    authority:'Dinas Pendidikan Provinsi Jawa Barat',
    document:'Buku Saku Kurikulum Merdeka Bahasa Sunda',
    scope:'muatan_lokal',
    verified:true,
    note:'Ditetapkan Pemerintah Provinsi Jawa Barat, bukan Kemendikdasmen. Bahasa Sunda tidak tercantum sebagai CP nasional pada Keputusan Kepala BSKAP Nomor 046/H/KR/2025. Naskah capaiannya diambil dari Lampiran II dokumen tersebut, khusus jenjang SD (Fase A, B, dan C).',
    year:2022,
    url:null,
  }),
});

/* Setiap butir: [kode, deskripsi]. Deskripsi ditulis operasional dan ringkas supaya langsung
   dapat dipakai sebagai acuan penilaian sekaligus bahan deskripsi rapor. */
const CATALOGUE={
  agama:{source:'cp_pabp',phases:{
    A:[['TP-1','mengenal dan melafalkan bacaan pendek dengan benar serta membiasakan adab yang baik'],
       ['TP-2','membiasakan perilaku jujur, hormat kepada orang tua dan guru, serta santun kepada teman'],
       ['TP-3','mengenal rukun iman dan rukun Islam melalui contoh sederhana dalam kehidupan sehari-hari'],
       ['TP-4','membiasakan bersuci dan tata cara ibadah dasar dengan tertib']],
    B:[['TP-1','membaca dan menulis bacaan pilihan dengan tartil serta memahami pesan pokoknya'],
       ['TP-2','menerapkan akhlak terpuji seperti amanah, disiplin, dan peduli di rumah dan sekolah'],
       ['TP-3','memahami tata cara ibadah wajib dan mempraktikkannya dengan tertib'],
       ['TP-4','meneladani kisah keteladanan tokoh dan menerapkannya dalam perilaku sehari-hari']],
    C:[['TP-1','membaca, menulis, dan menjelaskan makna bacaan pilihan sesuai kaidah'],
       ['TP-2','menerapkan akhlak terpuji serta menjaga kerukunan dalam keberagaman'],
       ['TP-3','memahami dan mempraktikkan ibadah wajib beserta hikmahnya'],
       ['TP-4','meneladani kisah keteladanan dan menerapkan nilainya sebagai warga sekolah dan masyarakat']]}},

  agama_kristen:{source:'cp_pabp',phases:{
    A:[['TP-1','mengenal Allah sebagai pencipta dan mensyukuri ciptaan-Nya'],
       ['TP-2','membiasakan berdoa, jujur, dan menyayangi sesama'],
       ['TP-3','mengenal cerita Alkitab sederhana dan pesan moralnya']],
    B:[['TP-1','memahami karya Allah dalam kehidupan dan mensyukurinya melalui perbuatan'],
       ['TP-2','menerapkan sikap kasih, jujur, dan tanggung jawab di rumah dan sekolah'],
       ['TP-3','memahami cerita Alkitab dan menerapkan nilainya dalam kehidupan sehari-hari']],
    C:[['TP-1','memahami karya penyelamatan Allah dan meresponsnya dengan hidup yang bertanggung jawab'],
       ['TP-2','menerapkan nilai kasih, keadilan, dan kejujuran dalam relasi dengan sesama'],
       ['TP-3','menjelaskan pesan Alkitab dan mengaitkannya dengan peran sebagai warga masyarakat']]}},

  pancasila:{source:'cp_umum',phases:{
    A:[['TP-1','mengenal dan melafalkan sila-sila Pancasila serta contoh penerapannya di rumah dan sekolah'],
       ['TP-2','membiasakan sikap taat aturan, jujur, dan mau bekerja sama'],
       ['TP-3','mengenal identitas diri, keluarga, dan lingkungan terdekat'],
       ['TP-4','menghargai perbedaan sederhana di antara teman']],
    B:[['TP-1','menjelaskan makna sila Pancasila dan menerapkannya dalam kehidupan sehari-hari'],
       ['TP-2','memahami hak dan kewajiban sebagai anggota keluarga, sekolah, dan masyarakat'],
       ['TP-3','menghargai keberagaman suku, budaya, dan agama di lingkungan sekitar'],
       ['TP-4','menerapkan musyawarah sederhana untuk mengambil keputusan bersama']],
    C:[['TP-1','menganalisis penerapan nilai Pancasila dalam kehidupan bermasyarakat dan bernegara'],
       ['TP-2','menjelaskan hak dan kewajiban warga negara serta menerapkannya secara bertanggung jawab'],
       ['TP-3','menghargai keberagaman sebagai kekuatan persatuan bangsa'],
       ['TP-4','berperan aktif dalam kegiatan bersama melalui musyawarah dan gotong royong']]}},

  bindo:{source:'cp_umum',phases:{
    A:[['TP-1','menyimak dan memahami informasi dari teks lisan sederhana'],
       ['TP-2','membaca kata dan kalimat sederhana dengan lafal yang tepat'],
       ['TP-3','menuliskan kata dan kalimat sederhana sesuai kaidah dasar'],
       ['TP-4','menyampaikan gagasan sederhana secara lisan dengan percaya diri']],
    B:[['TP-1','menemukan ide pokok dan informasi rinci dalam teks yang dibaca atau disimak'],
       ['TP-2','membaca berbagai jenis teks dengan lancar dan memahami isinya'],
       ['TP-3','menulis teks sederhana yang runtut sesuai ejaan dan tanda baca'],
       ['TP-4','menyampaikan kembali isi teks secara lisan dengan bahasa sendiri']],
    C:[['TP-1','menyimpulkan dan membandingkan informasi dari beberapa teks'],
       ['TP-2','membaca teks informasi dan sastra secara kritis serta menilai isinya'],
       ['TP-3','menulis teks yang runtut, padu, dan sesuai kaidah bahasa Indonesia'],
       ['TP-4','mempresentasikan gagasan secara runtut, santun, dan percaya diri']]}},

  mtk:{source:'cp_umum',phases:{
    A:[['TP-1','membilang, membaca, menulis, dan membandingkan bilangan cacah sampai 100'],
       ['TP-2','menyelesaikan penjumlahan dan pengurangan dalam situasi sehari-hari'],
       ['TP-3','mengenal bangun datar dan bangun ruang sederhana beserta cirinya'],
       ['TP-4','melakukan pengukuran sederhana menggunakan satuan tidak baku dan baku']],
    B:[['TP-1','menggunakan operasi hitung bilangan cacah untuk memecahkan masalah'],
       ['TP-2','memahami pecahan sederhana dan menggunakannya dalam situasi nyata'],
       ['TP-3','menentukan keliling dan luas bangun datar sederhana'],
       ['TP-4','menyajikan dan membaca data dalam bentuk tabel dan diagram sederhana']],
    C:[['TP-1','menyelesaikan masalah yang melibatkan pecahan, desimal, dan persen'],
       ['TP-2','menggunakan operasi hitung campuran untuk memecahkan masalah kontekstual'],
       ['TP-3','menghitung volume dan luas permukaan bangun ruang sederhana'],
       ['TP-4','mengumpulkan, menyajikan, dan menafsirkan data untuk menarik kesimpulan']]}},

  /* IPAS berdiri sebagai mata pelajaran tersendiri mulai Fase B. Pada Fase A muatannya
     terintegrasi pada mata pelajaran lain, sehingga di sini sengaja tidak diisi. */
  ipas:{source:'cp_umum',phases:{
    B:[['TP-1','melakukan pengamatan sederhana dan mencatat hasilnya secara jujur'],
       ['TP-2','menjelaskan ciri makhluk hidup dan hubungannya dengan lingkungan'],
       ['TP-3','mengenal bentuk energi dan pemanfaatannya dalam kehidupan sehari-hari'],
       ['TP-4','mengenal lingkungan sosial, budaya, dan kenampakan alam di daerahnya']],
    C:[['TP-1','merancang penyelidikan sederhana, mengolah data, dan menarik kesimpulan'],
       ['TP-2','menjelaskan sistem organ tubuh manusia dan cara memeliharanya'],
       ['TP-3','menganalisis perubahan energi serta upaya pelestarian sumber daya alam'],
       ['TP-4','menjelaskan keragaman sosial budaya Indonesia dan peran daerahnya']]}},

  pjok:{source:'cp_umum',phases:{
    A:[['TP-1','mempraktikkan gerak dasar lokomotor, non-lokomotor, dan manipulatif'],
       ['TP-2','membiasakan perilaku hidup bersih dan sehat'],
       ['TP-3','mengikuti permainan sederhana dengan sportif dan tertib']],
    B:[['TP-1','mempraktikkan variasi gerak dasar dalam permainan dan aktivitas jasmani'],
       ['TP-2','menerapkan pola hidup sehat, bugar, dan aman'],
       ['TP-3','bekerja sama dan menjunjung sportivitas dalam permainan beregu']],
    C:[['TP-1','mempraktikkan kombinasi gerak dasar dalam berbagai aktivitas dan permainan'],
       ['TP-2','menerapkan kebugaran jasmani serta menjaga kesehatan diri'],
       ['TP-3','menunjukkan sportivitas, kerja sama, dan kepemimpinan dalam aktivitas beregu']]}},

  seni:{source:'cp_umum',phases:{
    A:[['TP-1','mengenal unsur seni melalui kegiatan bernyanyi, bergerak, dan berkarya sederhana'],
       ['TP-2','mengekspresikan gagasan dan perasaan melalui karya seni sederhana']],
    B:[['TP-1','menciptakan karya seni sederhana sesuai gagasan dan pengalamannya'],
       ['TP-2','menampilkan karya seni secara percaya diri dan menghargai karya orang lain']],
    C:[['TP-1','merancang dan membuat karya seni dengan teknik yang sesuai'],
       ['TP-2','menampilkan dan mengapresiasi karya seni dengan menghargai keberagaman budaya']]}},

  seni_rupa:{source:'cp_umum',phases:{
    A:[['TP-1','mengenal garis, bentuk, dan warna melalui karya gambar sederhana'],
       ['TP-2','membuat karya rupa sederhana sesuai pengalaman dan imajinasinya']],
    B:[['TP-1','menggunakan unsur rupa untuk membuat karya dua atau tiga dimensi'],
       ['TP-2','menjelaskan gagasan di balik karyanya dan menghargai karya temannya']],
    C:[['TP-1','merancang karya rupa dengan mempertimbangkan unsur dan prinsip seni rupa'],
       ['TP-2','menyajikan karya rupa serta mengapresiasi karya orang lain secara santun']]}},

  bing:{source:'cp_umum',phases:{
    A:[['TP-1','mengenal dan menggunakan kosakata bahasa Inggris yang sangat sederhana'],
       ['TP-2','merespons sapaan dan instruksi sederhana dalam bahasa Inggris']],
    B:[['TP-1','memahami kosakata dan ungkapan sederhana dalam konteks sehari-hari'],
       ['TP-2','melakukan percakapan sangat sederhana dengan percaya diri']],
    C:[['TP-1','memahami teks lisan dan tulis sangat sederhana serta informasi pokoknya'],
       ['TP-2','menyampaikan informasi sederhana secara lisan maupun tulis dengan percaya diri']]}},

  /* Muatan Lokal Jawa Barat: sumbernya bukan keputusan CP nasional. */
  sunda:{source:'cp_mulok_jabar',phases:{
    A:[['TP-1','mengenal kosakata basa Sunda sederhana dalam kehidupan sehari-hari'],
       ['TP-2','menggunakan ungkapan santun sesuai undak usuk basa yang sederhana']],
    B:[['TP-1','memahami dan menggunakan basa Sunda dalam percakapan sehari-hari'],
       ['TP-2','memahami isi teks sederhana berbahasa Sunda dan nilai budayanya']],
    C:[['TP-1','menggunakan basa Sunda secara santun sesuai tingkatannya'],
       ['TP-2','memahami dan menyajikan kembali teks berbahasa Sunda serta nilai budayanya']]}},

  /* Fase A dan Fase B sengaja TIDAK ADA. Pada jenjang SD, Koding dan Kecerdasan Artifisial
     dimulai pada Fase C, sehingga TP untuk kelas 1-4 akan menjadi turunan dari CP yang tidak
     pernah ditetapkan. Katalog kosong lebih jujur daripada katalog yang tampak lengkap. */
  koding:{source:'cp_koding_ka',phases:{
    C:[['TP-1','merancang algoritma dan menguji langkah penyelesaian masalah secara bertahap'],
       ['TP-2','memanfaatkan teknologi digital secara aman serta menjaga data pribadi'],
       ['TP-3','menjelaskan pemanfaatan kecerdasan artifisial secara bijak, aman, dan beretika']]}},
};

function gradeOf(classId){const grade=Number.parseInt(String(classId||'').trim(),10);return Number.isInteger(grade)?grade:null;}

export function phaseForClassId(classId){
  const grade=gradeOf(classId);
  if(!grade)return null;
  if(grade<=2)return 'A';
  if(grade<=4)return 'B';
  if(grade<=6)return 'C';
  return null;
}

/* Mengembalikan TP inspiratif untuk satu mapel pada satu rombel. Daftar kosong berarti
   pemerintah memang tidak menempatkan mapel itu pada fase tersebut — IPAS di Fase A. */
export function defaultLearningObjectives(classId,subjectId){
  const phase=phaseForClassId(classId);
  const entry=CATALOGUE[subjectId];
  if(!phase||!entry)return [];
  const butir=entry.phases[phase]||[];
  const source=TP_SOURCES[entry.source];
  return butir.map(([code,description],index)=>({
    id:`tp-default-${subjectId}-${phase}-${index+1}`,
    code,description,phase,subjectId,
    order:index+1,
    active:true,
    status:OBJECTIVE_STATUS,
    editable:true,
    isDefault:true,
    source:{id:source.id,title:source.title,decision:source.decision,authority:source.authority,
      scope:source.scope,verified:source.verified,year:source.year,url:source.url},
  }));
}

export function subjectsWithDefaults(){return Object.keys(CATALOGUE);}
export function hasDefaultsFor(classId,subjectId){return defaultLearningObjectives(classId,subjectId).length>0;}
