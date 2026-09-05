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

/* ------------------------------------------------ BENTUK FRASA KOMPETENSI YANG NATURAL

   Butir CP menuliskan substansinya dalam dua bentuk yang berbeda, dan bedanya penting:

     teori    FRASA BENDA      "bilangan cacah sampai 1.000.000 beserta nilai tempatnya"
     praktik  FRASA KERJA      "melafalkan Surah al-Fatihah dan beberapa surah pendek"

   Kalimat yang kita susun kadang menuntut frasa kerja ("... yang baik dalam MEMAHAMI x") dan
   kadang menuntut frasa benda ("... pemahaman mengenai X"). Dua fungsi di bawah mengubah
   bentuknya seperlunya - dan hanya seperlunya.

   YANG DIJAGA: tidak pernah menempelkan kata kerja di depan frasa yang SUDAH dibuka kata kerja.
   Tanpa penjagaan itu lahir "dalam memahami memahami ..." dan "mengenai memahami ..." - kalimat
   rusak yang justru paling mudah lolos karena datanya tetap terlihat benar. */

/* Kata yang berawalan me- tetapi bukan kata kerja. Tanpa daftar ini "melalui" dan "mengenai"
   akan disangka kata kerja dan frasanya dibiarkan tanpa kata kerja pembuka. */
const BUKAN_KERJA=new Set(['melalui','mengenai','menurut','memang','meski','meskipun','melainkan','menuju']);
function berawalanKerja(teks){
  const kata=String(teks||'').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g,'')||'';
  if(!kata||BUKAN_KERJA.has(kata))return false;
  return /^me[a-z]{4,}$/.test(kata);
}
/* Bentuk yang wajar dibaca SESUDAH kata depan "dalam": frasa kerja. */
function frasaKerja(teks,kerja='memahami'){
  const isi=String(teks||'').trim();
  if(!isi)return '';
  return berawalanKerja(isi)?isi:`${kerja} ${isi}`;
}
/* Bentuk yang wajar dibaca SESUDAH kata depan "mengenai" atau "terhadap": frasa benda.
   Frasa yang sudah dibuka kata kerja dibiarkan apa adanya - membuang kata kerjanya berarti
   mengubah substansi Butir CP, dan itu tidak boleh. */
function frasaBenda(teks){return String(teks||'').trim();}

/* Pilihan redaksi yang TETAP untuk masukan yang sama. Variasi ada supaya satu rombel tidak
   berbunyi seragam kata demi kata, tetapi ia tidak boleh acak: kalimat yang sama harus lahir
   lagi ketika guru menekan Generate untuk kedua kalinya. Karena itu indeksnya diturunkan dari
   isi masukannya sendiri, bukan dari Math.random. */
function indeksVariasi(kunci,jumlah){
  if(jumlah<=1)return 0;
  const teks=String(kunci||'');
  let angka=0;
  for(let i=0;i<teks.length;i+=1)angka=(angka*31+teks.charCodeAt(i))>>>0;
  return angka%jumlah;
}

/* ---------------------------------------------------- 1. GENERATOR INTRAKURIKULER

   SUMBERNYA PERSIS EMPAT HAL, dan tidak ada yang kelima:

     1. NAMA MURID. Kalimat Intrakurikuler dibaca orang tua dan dibuka dengan "Ananda ...".
     2. BUTIR CP AKTIF YANG BENAR-BENAR DIPILIH GURU. Butir yang tidak dipilih tidak pernah
        masuk; butir nonaktif tidak pernah sampai ke sini karena tidak pernah ditawarkan.
     3. JENIS penilaian - Teori atau Praktik.
     4. PREDIKAT yang dipilih guru UNTUK MURID ITU. Generator tidak pernah menebaknya dan
        tidak pernah memakai "Baik" sebagai pengganti diam-diam.

   TEORI berbicara tentang PEMAHAMAN. PRAKTIK berbicara tentang KETERAMPILAN - tetapi hanya
   untuk butir yang memang menuliskan rumusan keterampilan. Butir yang substansinya hanya
   pengetahuan tidak diberi kalimat keterampilan yang dikarang; ia tetap dilaporkan sebagai
   pemahaman, di dalam kalimat yang sama.

   BEBERAPA BUTIR DIRINGKAS MENJADI SATU KALIMAT, bukan disalin menjadi tiga paragraf. */

const PREDIKAT_INTRA=Object.freeze(['Sangat Baik','Baik','Cukup','Perlu Bimbingan']);
function predikatBersih(nilai){
  const teks=String(nilai||'').trim();
  return PREDIKAT_INTRA.find(item=>item.toLowerCase()===teks.toLowerCase())||null;
}

/* Redaksi Teori: berorientasi pemahaman dan pengetahuan. */
const REDAKSI_TEORI=Object.freeze({
  'Sangat Baik':[
    f=>`menunjukkan pemahaman yang sangat baik mengenai ${frasaBenda(f)}`,
    f=>`menunjukkan kemampuan yang sangat baik dalam ${frasaKerja(f)}`,
    f=>`menunjukkan penguasaan yang sangat baik terhadap ${frasaBenda(f)}`,
  ],
  'Baik':[
    f=>`menunjukkan pemahaman yang baik mengenai ${frasaBenda(f)}`,
    f=>`mampu ${frasaKerja(f)} dengan baik`,
    f=>`menunjukkan penguasaan yang baik terhadap ${frasaBenda(f)}`,
    f=>`telah ${frasaKerja(f)} dengan baik`,
  ],
  'Cukup':[
    f=>`cukup mampu ${frasaKerja(f)}`,
    f=>`menunjukkan pemahaman yang cukup mengenai ${frasaBenda(f)}`,
  ],
  'Perlu Bimbingan':[
    f=>`masih memerlukan bimbingan dalam ${frasaKerja(f)}`,
    f=>`perlu bimbingan untuk ${frasaKerja(f)}`,
  ],
});
/* Redaksi Praktik: berorientasi keterampilan dan penerapan. Frasanya SUDAH berupa frasa kerja
   pada katalog Butir CP, jadi tidak ada kata kerja yang ditambahkan di depannya. */
const REDAKSI_PRAKTIK=Object.freeze({
  'Sangat Baik':[
    f=>`menunjukkan keterampilan yang sangat baik dalam ${frasaKerja(f)}`,
    f=>`sangat terampil dalam ${frasaKerja(f)}`,
  ],
  'Baik':[
    f=>`menunjukkan keterampilan yang baik dalam ${frasaKerja(f)}`,
    f=>`terampil dalam ${frasaKerja(f)}`,
    f=>`mampu ${frasaKerja(f)} dengan baik`,
  ],
  'Cukup':[
    f=>`cukup terampil dalam ${frasaKerja(f)}`,
    f=>`cukup mampu ${frasaKerja(f)}`,
  ],
  'Perlu Bimbingan':[
    f=>`masih memerlukan bimbingan dalam ${frasaKerja(f)}`,
  ],
});
/* Tambahan untuk butir yang TIDAK punya rumusan keterampilan ketika penilaiannya Praktik.
   Kompetensinya tetap dilaporkan, tetapi sebagai pemahaman - bukan sebagai keterampilan yang
   tidak pernah tertulis pada butirnya. */
const LANJUTAN_PEMAHAMAN=Object.freeze({
  'Sangat Baik':f=>`serta menunjukkan pemahaman yang sangat baik mengenai ${frasaBenda(f)}`,
  'Baik':f=>`serta memahami ${frasaBenda(f)} dengan baik`,
  'Cukup':f=>`serta cukup memahami ${frasaBenda(f)}`,
  'Perlu Bimbingan':f=>`serta masih memerlukan bimbingan dalam ${frasaKerja(f)}`,
});


export function composeIntracurricularButirDescription({studentName='',butir=[],jenis='teori',
  predicate='Baik'}={}){
  const daftar=(Array.isArray(butir)?butir:[]).filter(Boolean);
  if(!daftar.length)return null;
  const nama=String(studentName||'').trim();
  const predikat=predikatBersih(predicate);
  if(!predikat)return null;
  const praktik=jenis==='praktik';

  /* Butir dipisah menurut apa yang BENAR-BENAR tertulis padanya, bukan menurut jenis yang
     diminta. Inilah yang menahan generator dari mengarang keterampilan. */
  const berketerampilan=[],berpengetahuan=[];
  for(const item of daftar){
    const rumusanPraktik=String(item?.praktikTeks??item?.praktik??'').trim();
    const rumusanTeori=String(item?.teoriTeks??item?.teori??'').trim();
    if(praktik&&rumusanPraktik)berketerampilan.push(rumusanPraktik);
    else if(rumusanTeori)berpengetahuan.push(rumusanTeori);
    else if(rumusanPraktik)berketerampilan.push(rumusanPraktik);
  }
  if(!berketerampilan.length&&!berpengetahuan.length)return null;

  const utama=praktik&&berketerampilan.length?berketerampilan:berpengetahuan.length?berpengetahuan:berketerampilan;
  const pilihan=(praktik&&utama===berketerampilan?REDAKSI_PRAKTIK:REDAKSI_TEORI)[predikat];
  const kunci=`${nama}|${jenis}|${predikat}|${utama.join('|')}`;
  const bagian=[pilihan[indeksVariasi(kunci,pilihan.length)](rangkai(utama))];

  /* Sisa butir yang hanya punya rumusan pengetahuan pada penilaian Praktik. */
  const sisa=praktik&&utama===berketerampilan?berpengetahuan:[];
  if(sisa.length)bagian.push(LANJUTAN_PEMAHAMAN[predikat](rangkai(sisa)));

  /* TANPA NAMA MURID TIDAK ADA KALIMAT. Deskripsi Intrakurikuler dibaca orang tua dan selalu
     dibuka "Ananda ..."; bentuk tanpa nama hanya akan menjadi kalimat setengah jadi yang lolos
     ke rapor. Sama seperti penyusun rapor, lebih baik tidak menghasilkan apa-apa. */
  if(!nama)return null;
  return `Ananda ${nama} ${bagian.join(' ')}.`;
}

/* ------------------------------------------- 2. GENERATOR CAPAIAN KOMPETENSI RAPOR

   SUMBERNYA BERBEDA DARI INTRAKURIKULER, dan itulah yang membuat kalimatnya berbeda meskipun
   kompetensinya sama:

     - tingkat capaiannya berasal dari NILAI AKHIR mata pelajaran terhadap RUBRIK mata pelajaran
       itu - bukan dari predikat kegiatan yang dipilih guru;
     - bahasanya adalah bahasa LAPORAN HASIL BELAJAR satu semester, bukan bahasa satu kegiatan
       penilaian;
     - redaksinya TIDAK BERVARIASI. Rapor adalah dokumen; empat rujukan di bawah adalah bentuk
       finalnya, dan variasi redaksi justru membuat dokumen resmi tampak tidak konsisten.

   Kompetensi yang disebut adalah BUTIR CP AKTIF mata pelajaran itu, diringkas seperlunya. */

export { REPORT_CATEGORIES as KATEGORI_RAPOR };

export function kategoriRapor(finalScore,rubric){
  return categoryForScore(finalScore,rubric);
}

/* EMPAT RUJUKAN FINAL DESKRIPSI RAPOR. Bentuknya tidak diubah-ubah dan tidak diacak. */
const KALIMAT_RAPOR=Object.freeze({
  'SANGAT BAIK':(nama,f)=>`Ananda ${nama} menunjukkan capaian penguasaan yang sangat baik dalam ${frasaKerja(f)}.`,
  'BAIK':(nama,f)=>`Ananda ${nama} menunjukkan capaian yang baik dalam ${frasaKerja(f)}.`,
  'CUKUP':(nama,f)=>`Ananda ${nama} telah menunjukkan capaian pemahaman yang cukup mengenai ${frasaBenda(f)}.`,
  'PERLU BIMBINGAN':(nama,f)=>`Ananda ${nama} perlu meningkatkan pemahaman mengenai ${frasaBenda(f)} melalui pendampingan dan latihan lebih lanjut.`,
});

export function kalimatRapor(kategori,fokus,studentName=''){
  const isi=String(fokus||'').trim();
  const nama=String(studentName||'').trim();
  if(!isi||!nama)return null;
  const susun=KALIMAT_RAPOR[kategori];
  /* Belum ada Nilai Akhir: kategorinya memang belum ada. Yang dilaporkan adalah kompetensi
     yang ditempuh, bukan tingkat capaian yang dikarang. */
  if(!susun)return `Ananda ${nama} menempuh pembelajaran pada kompetensi ${frasaBenda(isi)}.`;
  return susun(nama,isi);
}

/* Berapa kompetensi yang wajar disebut satu kalimat rapor. Rapor MERANGKUM satu semester,
   jadi batasnya lebih ketat daripada Intrakurikuler yang menceritakan satu kegiatan: lebih dari
   dua kompetensi dalam satu kalimat berhenti dapat dibaca orang tua. */
const MAKS_KOMPETENSI_RAPOR=2;

/* Kompetensi rapor berasal dari BUTIR CP AKTIF MATA PELAJARAN ITU SENDIRI - butir yang dikirim
   pemanggil setelah disaring menurut mapel dan semester berjalan. Yang tidak pernah masuk ke
   dalam kalimat: nama mata pelajaran, fase, kode CP, naskah CP resmi, Tujuan Pembelajaran, dan
   kompetensi mata pelajaran lain. */
export function composeReportButirDescription({studentName='',butir=[],finalScore=null,
  rubric=null}={}){
  const daftar=(Array.isArray(butir)?butir:[]).filter(Boolean);
  if(!daftar.length)return null;
  /* Rapor memakai rumusan PENGETAHUAN sebagai bahasa dasarnya - inilah bahasa capaian
     kompetensi satu semester - lalu meringkasnya. */
  const isi=daftar.slice(0,MAKS_KOMPETENSI_RAPOR)
    .map(item=>substansiButir(item,'teori')).filter(Boolean);
  if(!isi.length)return null;
  return kalimatRapor(kategoriRapor(finalScore,rubric),rangkai(isi),studentName);
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
