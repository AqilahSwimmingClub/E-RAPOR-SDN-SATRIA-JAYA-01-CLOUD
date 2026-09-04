import { categoryForScore, REPORT_CATEGORIES } from './report-rubric.js';
import { capaianPembelajaranFor } from './learning-objectives.js';

/* SATU CP, DUA KONTEKS DESKRIPSI YANG WAJIB BERBEDA.

   Capaian Pembelajaran adalah acuan kompetensi resmi per mata pelajaran dan fase. Dua fitur
   membacanya, dan keduanya menghasilkan kalimat yang berbeda karena menjawab pertanyaan yang
   berbeda:

     INTRAKURIKULER  "pada kegiatan penilaian ini, kompetensi apa yang ditunjukkan anak, dan
                     seberapa baik?" -> BUTIR CP YANG DIPILIH GURU + jenis TEORI/PRAKTIK +
                     PREDIKAT kegiatan.
     NILAI RAPOR     "sepanjang semester, bagaimana capaian kompetensi anak?" -> kompetensi
                     mata pelajaran + NILAI AKHIR terhadap KKTP.

   Karena itu berkas ini memuat penyusun kalimat yang TERPISAH untuk masing-masing, bukan satu
   yang dipakai bergantian. Menyatukannya akan membuat kolom Intrakurikuler dan kolom Capaian
   Kompetensi di rapor berbunyi sama persis.

   TIGA HAL YANG TIDAK PERNAH MASUK KE KALIMAT:

   - FASE A/B/C. Fase tetap dipakai sebagai metadata pemetaan kelas dan CP, tetapi rapor dibaca
     orang tua: yang dibicarakan kemampuan anaknya, bukan kode administratif kurikulum.
   - KODE CP dan nomor butir. Sama alasannya.
   - NAMA MATA PELAJARAN. Nama mapel sudah tercetak pada kolom rapor dan pada layar aplikasi.
     Mengulangnya di dalam kalimat menghasilkan "menunjukkan kemampuan yang baik dalam mata
     pelajaran IPAS" - kalimat yang tidak menerangkan satu kompetensi pun. Deskripsi langsung
     menyebut KOMPETENSINYA. */

/* Merangkai daftar menjadi frasa Indonesia yang wajar: "A", "A dan B", "A, B, serta C".

   Dua butir dirangkai TANPA koma - "A, dan B" bukan bahasa Indonesia yang benar - dan tiga
   butir atau lebih ditutup dengan "serta" supaya kalimatnya tidak berbunyi seperti daftar. */
function rangkai(daftar){
  const isi=[...new Set(daftar.map(item=>String(item||'').trim()).filter(Boolean))];
  if(!isi.length)return '';
  if(isi.length===1)return isi[0];
  /* Bila salah satu bagian sudah memuat "dan" di dalamnya, penghubungnya memakai "serta"
     supaya kalimatnya tidak berbunyi "... dan ... dan ...". */
  if(isi.length===2)
    return `${isi[0]} ${isi.some(item=>/\sdan\s/i.test(item))?'serta':'dan'} ${isi[1]}`;
  return `${isi.slice(0,-1).join(', ')}, serta ${isi.at(-1)}`;
}

/* Nama elemen ditulis PERSIS seperti pada dokumen resmi, termasuk kapitalisasinya. Menurunkan
   huruf pertamanya agar "mengalir" di tengah kalimat justru merusak nama yang berkapital di
   tengah - "Analisis Data dan Peluang" menjadi "analisis Data dan Peluang". */
function namaElemen(teks){return String(teks||'').trim();}

/* Acuan CP satu mata pelajaran untuk rombel pada sesi berjalan. Mengembalikan null bila mata
   pelajaran itu memang belum berlaku pada fase tersebut, atau elemennya belum diketahui. */
export function cpAcuanFor(session,subjectId){
  const cp=capaianPembelajaranFor(session,subjectId);
  if(!cp||!cp.available)return null;
  const elemen=(cp.elements||[]).map(item=>item.name).filter(Boolean);
  if(!elemen.length)return null;
  return {phase:cp.phase,grade:cp.grade,elements:elemen,regulation:cp.regulation,naskah:cp.naskah};
}

/* Alasan CP tidak dapat dipakai, untuk ditampilkan apa adanya kepada guru. */
export function cpAlasanTidakTersedia(session,subjectId){
  const cp=capaianPembelajaranFor(session,subjectId);
  if(!cp)return 'Fase tidak dapat ditentukan dari rombel aktif.';
  if(!cp.available)return cp.naskahReason||'Mata pelajaran ini belum berlaku pada fase rombel aktif.';
  if(!(cp.elements||[]).length)
    return 'Elemen CP resmi untuk mata pelajaran ini belum tersedia pada dataset aplikasi.';
  return null;
}

/* ------------------------------------------------------------------- JENIS PENILAIAN

   HANYA ADA DUA, dan keduanya milik INTRAKURIKULER - bukan milik Butir CP dan bukan milik
   Rapor. "Teori + Praktik" dihapus: satu kegiatan penilaian menilai satu sisi, dan guru yang
   ingin menilai keduanya cukup mencatat dua penilaian. */
export const JENIS_INTRAKURIKULER=Object.freeze([
  Object.freeze({id:'teori',label:'Teori',singkat:'Teori'}),
  Object.freeze({id:'praktik',label:'Praktik',singkat:'Praktik'}),
]);
export const JENIS_INTRAKURIKULER_IDS=Object.freeze(JENIS_INTRAKURIKULER.map(item=>item.id));
export function jenisIntrakurikuler(id){
  return JENIS_INTRAKURIKULER.find(item=>item.id===String(id||''))||null;
}
export function jenisIntrakurikulerValid(id){return JENIS_INTRAKURIKULER_IDS.includes(String(id||''));}

/* ------------------------------------------------ SUBSTANSI SATU BUTIR MENURUT JENISNYA

   Setiap butir membawa DUA rumusan substansi yang ditulis terpisah sejak awal: satu wajar
   dibaca setelah kata kerja pengetahuan, satu setelah kata kerja keterampilan. Itulah yang
   membuat kalimat Teori dan Praktik tidak lahir dari pertukaran kata secara buta.

   BILA RUMUSAN YANG DIMINTA TIDAK ADA, rumusan yang tersedia dipakai apa adanya. Generator
   TIDAK PERNAH mengarang kompetensi praktik untuk butir yang substansinya memang hanya
   pengetahuan - ia hanya menyusun ulang substansi yang sudah tertulis pada butir itu. */
export function substansiButir(butir,jenis='teori'){
  const teori=String(butir?.teoriTeks??butir?.teori??'').trim();
  const praktik=String(butir?.praktikTeks??butir?.praktik??'').trim();
  if(jenis==='praktik')return praktik||teori||'';
  return teori||praktik||'';
}

/* Kata kerja pembuka. Dipisah per jenis DAN per tingkat, sehingga penilaian Praktik tidak
   pernah berbunyi "memahami" dan penilaian Teori tidak pernah berbunyi "terampil".

   Rumusan keterampilan pada katalog sudah ditulis sebagai frasa kerja ("menyajikan ...",
   "mempraktikkan ..."), jadi kata kerja pembukanya adalah kata sifat kemampuan - bukan kata
   kerja kedua yang akan berderet salah. */
const KERJA_TEORI=Object.freeze({
  'Sangat Baik':'menguasai',
  'Baik':'memahami',
  'Cukup':'memahami',
  'Perlu Bimbingan':'mulai memahami',
});
const KERJA_PRAKTIK=Object.freeze({
  'Sangat Baik':'sangat terampil',
  'Baik':'terampil',
  'Cukup':'mampu',
  'Perlu Bimbingan':'mulai mampu',
});

export function kataKerjaIntrakurikuler(jenis,predikat){
  const tabel=jenis==='praktik'?KERJA_PRAKTIK:KERJA_TEORI;
  return tabel[predikat]||tabel.Baik;
}

/* ---------------------------------------------------- 1. GENERATOR INTRAKURIKULER

   SUMBERNYA PERSIS TIGA HAL, dan tidak ada yang keempat:

     1. BUTIR CP YANG BENAR-BENAR DIPILIH GURU. Butir yang tidak dipilih tidak pernah masuk;
        butir nonaktif tidak pernah sampai ke sini karena tidak ditawarkan.
     2. JENIS penilaian - Teori atau Praktik - yang menentukan rumusan substansi mana yang
        dibaca dan kata kerja mana yang dipakai.
     3. PREDIKAT kegiatan, yang menentukan seberapa kuat kata kerjanya.

   BEBERAPA BUTIR DIRINGKAS MENJADI SATU KALIMAT, bukan disalin menjadi tiga paragraf. Guru yang
   memilih tiga butir mendapat satu kalimat yang mencakup ketiga substansinya. */
export function composeIntracurricularButirDescription({butir=[],jenis='teori',predicate='Baik'}={}){
  const daftar=(Array.isArray(butir)?butir:[]).filter(Boolean);
  if(!daftar.length)return null;
  const isi=daftar.map(item=>substansiButir(item,jenis)).filter(Boolean);
  if(!isi.length)return null;
  const kerja=kataKerjaIntrakurikuler(jenis,predicate);
  const penutup=predicate==='Perlu Bimbingan'
    ? ' Masih memerlukan bimbingan agar capaian tersebut mantap.'
    : '';
  return `${kerja[0].toUpperCase()}${kerja.slice(1)} ${rangkai(isi)}.${penutup}`.trim();
}

/* Bentuk cadangan: guru belum memilih satu butir pun. Lingkup kompetensinya diambil dari nama
   elemen CP resmi supaya kalimatnya tetap benar, bukan kolom kosong. Nama mata pelajaran dan
   fase tetap tidak pernah disebut. */
export function composeIntracurricularCpDescription({cp=null,jenis='teori',predicate='Baik'}={}){
  if(!cp||!cp.elements?.length)return null;
  const kerja=kataKerjaIntrakurikuler(jenis,predicate);
  const fokus=rangkai(cp.elements.map(namaElemen));
  return `${kerja[0].toUpperCase()}${kerja.slice(1)} lingkup kompetensi ${fokus}.`;
}

/* ------------------------------------------- 2. GENERATOR CAPAIAN KOMPETENSI RAPOR

   SUMBERNYA BERBEDA DARI INTRAKURIKULER, dan itulah yang membuat kalimatnya berbeda meskipun
   kompetensinya sama:

     - tingkat capaiannya berasal dari NILAI AKHIR mata pelajaran terhadap KKTP - angka yang
       sudah dihitung lima komponen penilaian yang berjalan - bukan dari predikat kegiatan;
     - bahasanya adalah bahasa LAPORAN HASIL BELAJAR satu semester, bukan bahasa satu kegiatan
       penilaian;
     - kalimatnya lebih ringkas: rapor merangkum, tidak merinci.

   Kompetensi yang disebut adalah BUTIR CP AKTIF mata pelajaran itu, diringkas seperlunya. */
/* KATEGORI CAPAIAN RAPOR DITETAPKAN OLEH RUBRIK MATA PELAJARAN, BUKAN OLEH RUMUS.

   Tidak ada satu pun ambang yang ditulis di sini. Kategori satu Nilai Akhir dibaca dari rentang
   yang ditetapkan guru pada Pengaturan Bobot Penilaian mata pelajaran itu, dan modul ini hanya
   menerjemahkan kategori menjadi kalimat.

   Yang dibuang dengan sengaja: aturan turunan KKTP - "KKTP + 15" untuk Sangat Baik dan
   "KKTP - 10" untuk Cukup. Selisih itu buatan aplikasi, tidak berdasar aturan mana pun, dan
   tidak dapat diubah guru. KKTP sendiri tidak disentuh: ia tetap menentukan status ketuntasan.

   Nilai Akhir tidak diubah, tidak dihitung ulang, dan tidak dibulatkan lagi di sini. Ia hanya
   dicari letaknya pada rentang rubrik. */
export { REPORT_CATEGORIES as KATEGORI_RAPOR };

export function kategoriRapor(finalScore,rubric){
  return categoryForScore(finalScore,rubric);
}

/* Kalimat rapor yang berlaku, satu bentuk baku per kategori.

   RINGKAS DAN SATU KALIMAT. Rapor merangkum satu semester, dan orang tua membacanya sekali:
   "Mencapai kompetensi dengan sangat baik dalam hal menganalisis pelaksanaan kewajiban, hak,
   dan tanggung jawab sebagai warga negara."

   Kalimat ini SENGAJA berbeda dari kalimat Intrakurikuler. Keduanya boleh membaca Butir CP
   yang sama, tetapi yang satu berbicara tentang capaian satu semester menurut Nilai Akhir, dan
   yang lain tentang satu penilaian menurut predikat kegiatan. Menyamakannya membuat dua kolom
   rapor yang berbeda berbunyi persis sama. */
const KALIMAT_RAPOR=Object.freeze({
  'SANGAT BAIK':fokus=>`Mencapai kompetensi dengan sangat baik dalam hal ${fokus}.`,
  'BAIK':fokus=>`Mencapai kompetensi dengan baik dalam hal ${fokus}.`,
  'CUKUP':fokus=>`Cukup mencapai kompetensi dalam hal ${fokus}.`,
  'PERLU BIMBINGAN':fokus=>`Perlu meningkatkan kompetensi dalam hal ${fokus}.`,
});

export function kalimatRapor(kategori,fokus){
  const isi=String(fokus||'').trim();
  if(!isi)return null;
  const susun=KALIMAT_RAPOR[kategori];
  /* Belum ada Nilai Akhir: kategorinya memang belum ada. Yang dilaporkan adalah kompetensi
     yang ditempuh, bukan tingkat capaian yang dikarang. */
  if(!susun)return `Menempuh pembelajaran pada kompetensi ${isi}.`;
  return susun(isi);
}

/* Berapa kompetensi yang wajar disebut satu kalimat rapor. Rapor MERANGKUM satu semester,
   jadi batasnya lebih ketat daripada Intrakurikuler yang menceritakan satu kegiatan: lebih dari
   dua kompetensi dalam satu kalimat berhenti dapat dibaca orang tua. */
const MAKS_KOMPETENSI_RAPOR=2;

/* Kompetensi rapor berasal dari BUTIR CP MATA PELAJARAN ITU SENDIRI - butir yang dikirim
   pemanggil setelah disaring menurut mapel dan semester berjalan. Yang tidak pernah masuk ke
   dalam kalimat: nama mata pelajaran, fase, kode CP, naskah CP resmi, dan Tujuan Pembelajaran. */
export function composeReportButirDescription({butir=[],finalScore=null,rubric=null}={}){
  const daftar=(Array.isArray(butir)?butir:[]).filter(Boolean);
  if(!daftar.length)return null;
  /* Rapor memakai rumusan PENGETAHUAN sebagai bahasa dasarnya - inilah bahasa capaian
     kompetensi satu semester - lalu meringkasnya. */
  const isi=daftar.slice(0,MAKS_KOMPETENSI_RAPOR)
    .map(item=>substansiButir(item,'teori')).filter(Boolean);
  if(!isi.length)return null;
  return kalimatRapor(kategoriRapor(finalScore,rubric),rangkai(isi));
}

/* Bentuk cadangan tanpa Butir CP, memakai nama elemen CP. Dipertahankan supaya mata pelajaran
   yang butirnya belum tersedia tidak kehilangan deskripsi rapornya. */
export function composeReportCpDescription({cp=null,finalScore=null,rubric=null}={}){
  if(!cp||!cp.elements?.length)return null;
  return kalimatRapor(kategoriRapor(finalScore,rubric),rangkai(cp.elements.map(namaElemen)));
}

/* --------------------------------------------------------------------- PENJAGA KEBOCORAN */

/* Satu tempat untuk memeriksa bahwa kalimat yang keluar tidak memuat bahasa administratif
   kurikulum. Dipakai penyusun deskripsi dan test regresi. */
const POLA_TERLARANG=/\bfase\s*[abc]\b|\bpada akhir fase\b|\bcp\s*fase\b|\belemen cp\b|\btujuan pembelajaran\b/i;
export function deskripsiBocorFase(teks){return POLA_TERLARANG.test(String(teks||''));}

/* Nama mata pelajaran tidak boleh diulang di dalam kalimat deskripsi: ia sudah tercetak pada
   kolom rapor. Dipakai test regresi untuk membuktikannya, bukan sekadar dijanjikan komentar. */
export function deskripsiMengulangMapel(teks,subjectName){
  const nama=String(subjectName||'').trim();
  if(!nama)return false;
  const pola=new RegExp(`\\b(mata pelajaran|mapel|pelajaran)\\s+${nama.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')}\\b`,'i');
  return pola.test(String(teks||''));
}
