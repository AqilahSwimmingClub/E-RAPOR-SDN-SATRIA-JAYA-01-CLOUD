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
});

/* Mata pelajaran yang memakai CP Pendidikan Agama dan Budi Pekerti. Regulasi 2026 hanya
   mengubah kelompok ini; mata pelajaran lain tetap memakai regulasi 2025. */
const PABP=new Set(['agama','agama_kristen','agama_katolik','agama_hindu','agama_buddha','agama_khonghucu']);

export function elementIdOf(subjectId,name){
  return `${subjectId}:${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
}

export function cpElements(subjectId){
  return (ELEMENTS[subjectId]||[]).map((name,index)=>Object.freeze({
    id:elementIdOf(subjectId,name),name,order:index+1,subjectId,
  }));
}

export function cpRegulationFor(subjectId){
  return TP_SOURCES[PABP.has(subjectId)?'cp_pabp':'cp_umum'];
}

/* Rujukan CP untuk satu mata pelajaran pada satu fase. Fase TIDAK PERNAH dipilih manual:
   pemanggil menyerahkan rombel, dan fase dihitung dari tingkat kelasnya. */
export function capaianPembelajaran(classId,subjectId){
  const phase=phaseForClassId(classId);
  if(!phase||!subjectId)return null;
  const regulation=cpRegulationFor(subjectId);
  return {
    subjectId,phase,
    grade:Number.parseInt(String(classId||'').trim(),10)||null,
    status:CP_STATUS,
    elements:cpElements(subjectId),
    naskah:null,
    regulation:{
      id:regulation.id,title:regulation.title,decision:regulation.decision,
      year:regulation.year,url:regulation.url,note:regulation.note,
    },
  };
}

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
});

/* Elemen CP untuk TP referensi ke-`order` (mulai 1) pada satu mapel dan fase. */
export function cpElementForObjective(subjectId,phase,order){
  const nama=OBJECTIVE_ELEMENTS[`${subjectId}|${phase}`]?.[Number(order)-1];
  if(!nama)return null;
  return cpElementById(subjectId,elementIdOf(subjectId,nama));
}

/* Mata pelajaran dan fase yang naskah CP resminya belum dimuat.

   Dipakai untuk melaporkan sisa pekerjaan secara jujur: selama daftar ini tidak kosong,
   aplikasi menampilkan elemen CP beserta kutipan regulasinya, bukan naskah karangan. */
export function cpNaskahGaps(subjectIds=Object.keys(ELEMENTS)){
  const contoh={A:'1A',B:'3A',C:'5A'};
  const kurang=[];
  for(const subjectId of subjectIds)
    for(const phase of ['A','B','C']){
      const cp=capaianPembelajaran(contoh[phase],subjectId);
      if(cp&&cp.naskah===null)
        kurang.push({subjectId,phase,decision:cp.regulation.decision});
    }
  return kurang;
}
