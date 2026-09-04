import { capaianPembelajaranFor } from './learning-objectives.js';

/* SATU CP, DUA KONTEKS DESKRIPSI.

   Capaian Pembelajaran adalah acuan kompetensi resmi per mata pelajaran dan fase. Dua fitur
   membacanya, dan keduanya WAJIB menghasilkan kalimat yang berbeda:

     INTRAKURIKULER  menceritakan keikutsertaan dan pencapaian murid pada kegiatan pembelajaran
                     intrakurikuler mata pelajaran itu. Predikat kegiatan yang menjadi nadanya.
     NILAI RAPOR     menceritakan CAPAIAN AKADEMIK berdasarkan Nilai Akhir dan KKTP murid.

   Karena itu berkas ini memuat DUA penyusun kalimat yang terpisah, bukan satu yang dipakai
   bergantian. Menyatukannya akan membuat kolom Intrakurikuler dan kolom Capaian Kompetensi di
   rapor berbunyi sama persis, dan pembaca rapor kehilangan dua informasi yang berbeda.

   YANG DIPAKAI DARI CP adalah NAMA ELEMEN-nya - kompetensi resmi yang menyusun CP fase itu.
   Naskah CP lengkap tidak pernah ditempel ke rapor: ia panjang, dan rapor bukan tempatnya.
   Tidak ada satu kata pun kompetensi yang dikarang di sini; bila CP tidak tersedia untuk
   kombinasi mata pelajaran dan fase tertentu, penyusun mengembalikan null dan pemanggil wajib
   menyatakannya apa adanya. */

/* Merangkai daftar elemen menjadi frasa Indonesia yang wajar: "A, B, dan C". */
function rangkai(daftar){
  const isi=daftar.map(item=>String(item||'').trim()).filter(Boolean);
  if(!isi.length)return '';
  if(isi.length===1)return isi[0];
  return `${isi.slice(0,-1).join(', ')}, dan ${isi.at(-1)}`;
}

/* Nama elemen ditulis PERSIS seperti pada dokumen resmi, termasuk kapitalisasinya. Menurunkan
   huruf pertamanya agar "mengalir" di tengah kalimat justru merusak nama yang berkapital di
   tengah - "Analisis Data dan Peluang" menjadi "analisis Data dan Peluang". Nama kompetensi
   resmi diperlakukan sebagai nama, bukan kata biasa. */
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
  if(!cp.available)return cp.naskahReason||`Mata pelajaran ini belum berlaku pada Fase ${cp.phase}.`;
  if(!(cp.elements||[]).length)
    return `Elemen CP resmi untuk mata pelajaran ini pada Fase ${cp.phase} belum tersedia pada dataset aplikasi.`;
  return null;
}

/* ------------------------------------------------------- 1. GENERATOR INTRAKURIKULER */

/* Nada kalimat Intrakurikuler mengikuti PREDIKAT kegiatan, bukan angka. Yang diceritakan adalah
   keterlibatan murid pada pembelajaran intrakurikuler mata pelajaran tersebut. */
const NADA_INTRA=Object.freeze({
  'Sangat Baik':'mengikuti kegiatan pembelajaran intrakurikuler dengan sangat baik dan konsisten',
  'Baik':'mengikuti kegiatan pembelajaran intrakurikuler dengan baik',
  'Cukup':'mengikuti kegiatan pembelajaran intrakurikuler dengan cukup baik',
  'Perlu Bimbingan':'mengikuti kegiatan pembelajaran intrakurikuler dan masih memerlukan bimbingan',
});

export function composeIntracurricularCpDescription({studentName='',subjectName='',cp=null,predicate='Baik'}={}){
  if(!cp||!cp.elements?.length)return null;
  const nama=String(studentName||'').trim()||'Ananda';
  const mapel=String(subjectName||'').trim();
  const nada=NADA_INTRA[predicate]||NADA_INTRA.Baik;
  const fokus=rangkai(cp.elements.map(namaElemen));
  const bagianMapel=mapel?` pada mata pelajaran ${mapel}`:'';
  /* Bentuk kalimat Intrakurikuler: keikutsertaan lebih dulu, lalu lingkup kompetensi Fase-nya. */
  return `Ananda ${nama} ${nada}${bagianMapel}, dengan lingkup capaian Fase ${cp.phase} yang meliputi ${fokus}.`;
}

/* ------------------------------------------------- 2. GENERATOR CAPAIAN KOMPETENSI RAPOR */

/* Nada kalimat Nilai Rapor mengikuti NILAI AKHIR terhadap KKTP - bukan predikat kegiatan.
   Inilah yang membuat kalimatnya berbeda dari Intrakurikuler meskipun CP-nya sama. */
function tingkatAkademik(finalScore,kktp){
  if(finalScore===null||finalScore===undefined)return null;
  if(finalScore>=90)return 'sangat baik';
  if(finalScore>=Number(kktp||75))return 'baik';
  return 'perlu bimbingan';
}

export function composeReportCpDescription({studentName='',subjectName='',cp=null,finalScore=null,kktp=75}={}){
  if(!cp||!cp.elements?.length)return null;
  const nama=String(studentName||'').trim()||'Ananda';
  const fokus=rangkai(cp.elements.map(namaElemen));
  const tingkat=tingkatAkademik(finalScore,kktp);
  /* Tanpa Nilai Akhir tidak ada capaian akademik yang dapat dinyatakan; kalimatnya berhenti
     pada lingkup kompetensinya saja, bukan menebak tingkat capaian. */
  if(tingkat===null)
    return `Ananda ${nama} menempuh capaian pembelajaran Fase ${cp.phase} yang meliputi ${fokus}.`;
  if(tingkat==='perlu bimbingan')
    return `Ananda ${nama} menunjukkan penguasaan kompetensi ${fokus} yang masih memerlukan bimbingan dan penguatan agar mencapai ketuntasan.`;
  return `Ananda ${nama} menunjukkan penguasaan ${tingkat} pada kompetensi ${fokus}.`;
}
