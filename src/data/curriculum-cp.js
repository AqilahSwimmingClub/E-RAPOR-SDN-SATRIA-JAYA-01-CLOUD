import { TP_SOURCES, phaseForClassId } from './learning-objective-defaults.js';

/* CAPAIAN PEMBELAJARAN (CP) — entitas tersendiri, BUKAN daftar TP.

   Pembagian tugasnya tegas:

     CP  ditetapkan pemerintah, berlaku per MATA PELAJARAN dan FASE, dan tersusun atas
         ELEMEN-elemen kompetensi.
     TP  disusun satuan pendidikan/guru dengan menurunkannya dari CP, lalu dipakai untuk
         mengelola pembelajaran dan menyusun deskripsi rapor.

   Karena itu berkas ini hanya memuat RUJUKAN CP: mata pelajaran, fase, elemen CP, dan
   regulasi yang menetapkannya. Naskah CP lengkap TIDAK disalin ke dalam aplikasi — dokumen
   resminya yang berlaku, dan aplikasi tidak boleh menjadi sumber kedua yang bisa berbeda.

   Kolom `naskah` sengaja dibiarkan null. Ia disediakan supaya naskah resmi dapat dimuat
   kemudian sebagai perubahan data saja, tanpa menyentuh kode. Selama masih null, antarmuka
   menampilkan elemen CP beserta kutipan regulasinya — bukan teks karangan aplikasi. */

export const CP_STATUS='rujukan';

/* Elemen CP per mata pelajaran. Nama elemen bersifat struktural dan sama untuk seluruh fase
   pada jenjang SD; yang berbeda antar-fase adalah rumusan capaiannya, dan rumusan itu ada di
   dokumen resmi. Mata pelajaran yang elemennya tidak dicantumkan di sini hanya menampilkan
   kutipan regulasi, bukan elemen yang tidak dapat dipertanggungjawabkan. */
const ELEMENTS=Object.freeze({
  agama:['Al-Qur\'an dan Hadis','Akidah','Akhlak','Fikih','Sejarah Peradaban Islam'],
  agama_kristen:['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Gereja dan Masyarakat Majemuk','Alam dan Lingkungan'],
  pancasila:['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Bhinneka Tunggal Ika','Negara Kesatuan Republik Indonesia'],
  bindo:['Menyimak','Membaca dan Memirsa','Berbicara dan Mempresentasikan','Menulis'],
  mtk:['Bilangan','Aljabar','Pengukuran','Geometri','Analisis Data dan Peluang'],
  ipas:['Pemahaman IPAS','Keterampilan Proses'],
  pjok:['Keterampilan Gerak','Pengetahuan Gerak','Pemanfaatan Gerak','Pengembangan Karakter dan Internalisasi Nilai-nilai Gerak'],
  seni:['Mengalami','Menciptakan','Merefleksikan','Berpikir dan Bekerja Artistik','Berdampak'],
  seni_rupa:['Mengalami','Menciptakan','Merefleksikan','Berpikir dan Bekerja Artistik','Berdampak'],
  bing:['Menyimak – Berbicara','Membaca – Memirsa','Menulis – Mempresentasikan'],
  /* Elemen Koding dan Kecerdasan Artifisial mengikuti Panduan Mata Pelajaran Koding dan
     Kecerdasan Artifisial (Pusat Kurikulum dan Pembelajaran, 2025). Yang dicantumkan hanya
     NAMA elemen; rumusan capaian tiap elemen tetap milik dokumen resmi. */
  koding:['Berpikir Komputasional','Literasi Digital','Literasi dan Etika Kecerdasan Artifisial','Pemanfaatan dan Pengembangan Kecerdasan Artifisial'],
  /* Bahasa Sunda sengaja tidak punya entri: elemen CP Muatan Lokal Jawa Barat belum dapat
     diverifikasi dari dokumen resmi provinsi. Menuliskan elemen tebakan sama saja dengan
     mengarang CP, hanya pada tingkat yang lebih halus. */
});

/* Fase tempat sebuah mata pelajaran benar-benar mempunyai CP pada jenjang SD. Mata pelajaran
   yang tidak terdaftar di sini berlaku pada seluruh fase (A, B, C).

   Ini bukan preferensi aplikasi melainkan konsekuensi dokumen: Koding dan Kecerdasan
   Artifisial baru dimulai pada Fase C, dan IPAS baru berdiri sendiri mulai Fase B. Menyediakan
   CP di luar fase tersebut berarti menampilkan capaian yang tidak pernah ditetapkan. */
const PHASES_BY_SUBJECT=Object.freeze({
  koding:Object.freeze(['C']),
  ipas:Object.freeze(['B','C']),
});

/* Alasan sebuah mata pelajaran tidak berlaku pada suatu fase — ditampilkan apa adanya kepada
   guru, supaya kolom kosong tidak disalahartikan sebagai data yang hilang. */
const ALASAN_DI_LUAR_FASE=Object.freeze({
  koding:'Pada jenjang SD, Koding dan Kecerdasan Artifisial dimulai pada Fase C (kelas 5-6).',
  ipas:'IPAS berdiri sebagai mata pelajaran tersendiri mulai Fase B (kelas 3-4).',
});

export function cpPhasesFor(subjectId){
  return [...(PHASES_BY_SUBJECT[subjectId]||['A','B','C'])];
}

export function cpBerlaku(subjectId,phase){
  return cpPhasesFor(subjectId).includes(phase);
}

/* Mata pelajaran yang memakai CP Pendidikan Agama dan Budi Pekerti. Regulasi 2026 hanya
   mengubah kelompok ini; mata pelajaran lain tetap memakai regulasi 2025. */
const PABP=new Set(['agama','agama_kristen','agama_katolik','agama_hindu','agama_buddha','agama_khonghucu']);

export function elementIdOf(subjectId,name){
  return `${subjectId}:${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
}

/* Elemen CP selalu membawa kolom `naskah` sendiri. Struktur resmi CP memang berlapis — CP fase
   terdiri atas capaian per elemen — sehingga naskahnya tidak boleh diratakan menjadi satu
   string ketika dokumen resminya nanti dimuat. */
export function cpElements(subjectId,phase){
  if(phase&&!cpBerlaku(subjectId,phase))return [];
  return (ELEMENTS[subjectId]||[]).map((name,index)=>Object.freeze({
    id:elementIdOf(subjectId,name),name,order:index+1,subjectId,naskah:null,
  }));
}

/* Mata pelajaran yang CP-nya TIDAK ditetapkan oleh keputusan CP nasional umum. Memaksakan
   046/H/KR/2025 kepada keduanya akan mengutip regulasi yang bukan sumbernya. */
const REGULASI_KHUSUS=Object.freeze({koding:'cp_koding_ka',sunda:'cp_mulok_jabar'});

export function cpRegulationFor(subjectId){
  if(Object.hasOwn(REGULASI_KHUSUS,subjectId))return TP_SOURCES[REGULASI_KHUSUS[subjectId]];
  return TP_SOURCES[PABP.has(subjectId)?'cp_pabp':'cp_umum'];
}

/* Rujukan CP untuk satu mata pelajaran pada satu fase. Fase TIDAK PERNAH dipilih manual:
   pemanggil menyerahkan rombel, dan fase dihitung dari tingkat kelasnya. */
export function capaianPembelajaran(classId,subjectId){
  const phase=phaseForClassId(classId);
  if(!phase||!subjectId)return null;
  const regulation=cpRegulationFor(subjectId);
  const berlaku=cpBerlaku(subjectId,phase);
  return {
    subjectId,phase,
    grade:Number.parseInt(String(classId||'').trim(),10)||null,
    status:CP_STATUS,
    available:berlaku,
    elements:cpElements(subjectId,phase),
    naskah:null,
    naskahReason:alasanNaskahKosong(subjectId,phase,regulation,berlaku),
    regulation:{
      id:regulation.id,title:regulation.title,decision:regulation.decision,
      authority:regulation.authority,scope:regulation.scope,verified:regulation.verified,
      year:regulation.year,url:regulation.url,note:regulation.note,
    },
  };
}

/* Mengapa naskah CP ini kosong. Jawabannya selalu salah satu dari tiga hal, dan ketiganya
   ditulis apa adanya: mata pelajarannya memang belum ada pada fase itu, regulasinya sendiri
   belum terverifikasi, atau naskah resminya belum dimuat ke dataset. Tidak ada kemungkinan
   keempat berupa "diisi seadanya". */
function alasanNaskahKosong(subjectId,phase,regulation,berlaku){
  if(!berlaku)
    return ALASAN_DI_LUAR_FASE[subjectId]
      ||`Mata pelajaran ini tidak mempunyai CP pada Fase ${phase} untuk jenjang SD.`;
  if(regulation.verified===false)
    return `Sumber resmi CP belum berhasil diverifikasi. Kewenangan penetapannya ada pada ${regulation.authority}.`;
  return `Naskah resmi ${regulation.decision} belum dimuat ke dataset aplikasi.`;
}

/* Seluruh mata pelajaran yang wajib diaudit CP-nya. Daftar ini sengaja eksplisit dan tidak
   diturunkan dari ELEMENTS: mata pelajaran yang elemennya belum diketahui (Bahasa Sunda) justru
   yang paling perlu muncul di laporan, bukan yang paling mudah hilang darinya. */
export const CP_SUBJECTS=Object.freeze(['agama','agama_kristen','pancasila','bindo','mtk','ipas',
  'pjok','seni','seni_rupa','bing','sunda','koding']);

export function cpElementById(subjectId,elementId){
  return cpElements(subjectId).find(item=>item.id===elementId)||null;
}

/* Kaitan TP referensi bawaan ke elemen CP.

   Ini yang membuat pertanyaan "TP ini menurunkan CP yang mana?" dapat dijawab: setiap butir
   TP referensi ditautkan ke satu elemen CP pada mata pelajaran dan fasenya. Kaitannya bersifat
   penggolongan operasional oleh aplikasi, bukan kutipan regulasi; TP buatan guru boleh
   ditautkan sendiri atau dibiarkan kosong. Urutan nilainya mengikuti urutan TP pada katalog. */
const OBJECTIVE_ELEMENTS=Object.freeze({
  'agama|A':['Al-Qur\'an dan Hadis','Akhlak','Akidah','Fikih'],
  'agama|B':['Al-Qur\'an dan Hadis','Akhlak','Fikih','Sejarah Peradaban Islam'],
  'agama|C':['Al-Qur\'an dan Hadis','Akhlak','Fikih','Sejarah Peradaban Islam'],
  'agama_kristen|A':['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Allah Berkarya'],
  'agama_kristen|B':['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Manusia dan Nilai-nilai Kristiani'],
  'agama_kristen|C':['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Gereja dan Masyarakat Majemuk'],
  'pancasila|A':['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Negara Kesatuan Republik Indonesia','Bhinneka Tunggal Ika'],
  'pancasila|B':['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Bhinneka Tunggal Ika','Negara Kesatuan Republik Indonesia'],
  'pancasila|C':['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Bhinneka Tunggal Ika','Negara Kesatuan Republik Indonesia'],
  'bindo|A':['Menyimak','Membaca dan Memirsa','Menulis','Berbicara dan Mempresentasikan'],
  'bindo|B':['Menyimak','Membaca dan Memirsa','Menulis','Berbicara dan Mempresentasikan'],
  'bindo|C':['Menyimak','Membaca dan Memirsa','Menulis','Berbicara dan Mempresentasikan'],
  'mtk|A':['Bilangan','Bilangan','Geometri','Pengukuran'],
  'mtk|B':['Bilangan','Bilangan','Pengukuran','Analisis Data dan Peluang'],
  'mtk|C':['Bilangan','Bilangan','Pengukuran','Analisis Data dan Peluang'],
  'ipas|B':['Keterampilan Proses','Pemahaman IPAS','Pemahaman IPAS','Pemahaman IPAS'],
  'ipas|C':['Keterampilan Proses','Pemahaman IPAS','Pemahaman IPAS','Pemahaman IPAS'],
  'pjok|A':['Keterampilan Gerak','Pemanfaatan Gerak','Pengembangan Karakter dan Internalisasi Nilai-nilai Gerak'],
  'pjok|B':['Keterampilan Gerak','Pemanfaatan Gerak','Pengembangan Karakter dan Internalisasi Nilai-nilai Gerak'],
  'pjok|C':['Keterampilan Gerak','Pemanfaatan Gerak','Pengembangan Karakter dan Internalisasi Nilai-nilai Gerak'],
  'seni|A':['Mengalami','Menciptakan'],
  'seni|B':['Menciptakan','Berdampak'],
  'seni|C':['Menciptakan','Berdampak'],
  'seni_rupa|A':['Mengalami','Menciptakan'],
  'seni_rupa|B':['Menciptakan','Merefleksikan'],
  'seni_rupa|C':['Menciptakan','Berdampak'],
  'bing|A':['Menyimak – Berbicara','Menyimak – Berbicara'],
  'bing|B':['Membaca – Memirsa','Menyimak – Berbicara'],
  'bing|C':['Membaca – Memirsa','Menulis – Mempresentasikan'],
  'koding|C':['Berpikir Komputasional','Literasi Digital','Literasi dan Etika Kecerdasan Artifisial'],
});

/* Elemen CP untuk TP referensi ke-`order` (mulai 1) pada satu mapel dan fase. */
export function cpElementForObjective(subjectId,phase,order){
  const nama=OBJECTIVE_ELEMENTS[`${subjectId}|${phase}`]?.[Number(order)-1];
  if(!nama)return null;
  return cpElementById(subjectId,elementIdOf(subjectId,nama));
}

/* Laporan CP yang naskah resminya belum ada — dipakai untuk menjawab "apa yang masih kurang"
   tanpa harus membaca kode.

   Laporannya dihitung, bukan ditulis tangan: selama satu kombinasi mapel x fase masih
   mengembalikan naskah null, ia muncul di sini lengkap dengan regulasi yang diharapkan dan
   alasan kekosongannya. Tidak ada cara membuat daftar ini tampak pendek selain benar-benar
   memuat naskah resminya. */
export function cpNaskahGaps(subjectIds=CP_SUBJECTS){
  const contoh={A:'1A',B:'3A',C:'5A'};
  const kurang=[];
  for(const subjectId of subjectIds)
    for(const phase of ['A','B','C']){
      const cp=capaianPembelajaran(contoh[phase],subjectId);
      if(cp&&cp.naskah===null)
        kurang.push({
          subjectId,phase,
          decision:cp.regulation.decision,
          authority:cp.regulation.authority,
          verified:cp.regulation.verified,
          available:cp.available,
          naskah:null,
          reason:cp.naskahReason,
        });
    }
  return kurang;
}

/* Ringkasan per status, supaya laporan audit tidak perlu menghitung ulang di banyak tempat. */
export function cpNaskahReport(subjectIds=CP_SUBJECTS){
  const gaps=cpNaskahGaps(subjectIds);
  const total=subjectIds.length*3;
  return {
    total,
    kosong:gaps.length,
    terisi:total-gaps.length,
    diLuarFase:gaps.filter(item=>!item.available).length,
    sumberBelumTerverifikasi:gaps.filter(item=>item.available&&item.verified===false).length,
    menungguNaskah:gaps.filter(item=>item.available&&item.verified!==false).length,
    gaps,
  };
}
