import { jenisPenilaian } from '../data/cp-butir-defaults.js';
import { capaianPembelajaranFor } from './learning-objectives.js';

/* SATU CP, DUA KONTEKS DESKRIPSI.

   Capaian Pembelajaran adalah acuan kompetensi resmi per mata pelajaran dan fase. Dua fitur
   membacanya, dan keduanya WAJIB menghasilkan kalimat yang berbeda:

     INTRAKURIKULER  menceritakan keikutsertaan murid pada pembelajaran mata pelajaran itu
                     beserta kemampuan yang ditunjukkannya.
     NILAI RAPOR     menceritakan CAPAIAN AKADEMIK murid terhadap kompetensi yang dinilai.

   Karena itu berkas ini memuat penyusun kalimat yang TERPISAH untuk masing-masing, bukan satu
   yang dipakai bergantian. Menyatukannya akan membuat kolom Intrakurikuler dan kolom Capaian
   Kompetensi di rapor berbunyi sama persis.

   SUMBER KALIMAT ADALAH BUTIR CP YANG DINILAI - bukan naskah CP resmi, dan bukan nama elemen
   saja. Setiap butir membawa dua rumusan substansi: satu untuk pengetahuan, satu untuk
   keterampilan. Penyusun memilih rumusan yang sesuai JENIS PENILAIAN butir itu, lalu memberi
   kata kerja yang sesuai tingkat capaian murid. Itulah sebabnya kalimatnya tidak lahir dari
   penggantian kata secara buta: substansinya memang ditulis berbeda untuk kedua jenis.

   FASE TIDAK PERNAH MASUK KE KALIMAT. Fase A/B/C tetap dipakai sebagai metadata pemetaan kelas,
   mata pelajaran, dan CP, tetapi rapor dibaca orang tua: yang dibicarakan adalah kemampuan
   anaknya, bukan kode administratif kurikulum. Nomor butir dan kode CP juga tidak pernah
   ditulis ke dalam deskripsi. */

/* Merangkai daftar menjadi frasa Indonesia yang wajar: "A, B, dan C". */
function rangkai(daftar){
  const isi=daftar.map(item=>String(item||'').trim()).filter(Boolean);
  if(!isi.length)return '';
  if(isi.length===1)return isi[0];
  return `${isi.slice(0,-1).join(', ')}, dan ${isi.at(-1)}`;
}

/* Nama elemen ditulis PERSIS seperti pada dokumen resmi, termasuk kapitalisasinya. Menurunkan
   huruf pertamanya agar "mengalir" di tengah kalimat justru merusak nama yang berkapital di
   tengah - "Analisis Data dan Peluang" menjadi "analisis Data dan Peluang". */
function namaElemen(teks){return String(teks||'').trim();}

const KKTP_BAWAAN=75;

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

/* ------------------------------------------------------- TINGKAT CAPAIAN DAN KATA KERJANYA */

/* Tingkat capaian satu butir, dibaca dari nilai butir terhadap KKTP. */
export function tingkatButir(nilai,kktp=KKTP_BAWAAN){
  if(nilai===null||nilai===undefined)return null;
  if(nilai>=90)return 'tinggi';
  if(nilai>=Number(kktp||KKTP_BAWAAN))return 'cukup';
  return 'bimbingan';
}

/* Kata kerja PENGETAHUAN dan KETERAMPILAN sengaja dipisahkan, dan tiap tingkat punya kata
   kerjanya sendiri. Ini yang membuat butir Praktik tidak pernah berbunyi "memahami" dan butir
   Teori tidak pernah berbunyi "terampil". */
const KERJA_TEORI=Object.freeze({tinggi:'menguasai',cukup:'memahami',bimbingan:'memahami'});
/* Pada tingkat bimbingan, kata kerja keterampilan sengaja DIKOSONGKAN. Rumusan praktik memang
   sudah ditulis sebagai frasa kerja ("menyelesaikan ...", "mempraktikkan ..."), sedangkan
   bingkai kalimatnya sudah menyediakan "memerlukan bimbingan untuk" dan "penguatan pada
   kemampuan". Menambahkan kata kerja lagi menghasilkan "mempraktikkan menyelesaikan ..." -
   dua kata kerja berderet yang salah. */
const KERJA_PRAKTIK=Object.freeze({tinggi:'terampil',cukup:'mampu',bimbingan:''});

/* Satu butir Teori + Praktik boleh memakai objek yang sama pada kedua sisinya. Bila begitu,
   merangkai keduanya menghasilkan pengulangan yang janggal - "memahami X serta mampu
   menyelesaikan X". Dalam keadaan itu sisi keterampilan saja yang dipakai, karena ia sudah
   memuat objek yang sama sekaligus tindakannya. */
function objekBerulang(teori,praktik){
  if(!teori||!praktik)return false;
  const a=teori.toLowerCase(),c=praktik.toLowerCase();
  return c.includes(a)||a.includes(c);
}
function gabung(bagian){
  const isi=bagian.map(item=>String(item||'').trim()).filter(Boolean);
  return isi.join(' serta ');
}

/* Frasa satu butir menurut jenis penilaian dan tingkat capaiannya. Butir Teori + Praktik
   menghasilkan dua sisi yang dirangkai menjadi satu frasa yang wajar dibaca. */
export function frasaButir(butir,tingkat){
  if(!butir)return '';
  const info=jenisPenilaian(butir.jenis)||jenisPenilaian('teori');
  const level=tingkat||'cukup';
  const teks=t=>String(t||'').trim();
  const isiTeori=teks(butir.teoriTeks||butir.teori);
  const isiPraktik=teks(butir.praktikTeks||butir.praktik);
  const pakaiTeori=info.teori&&Boolean(isiTeori);
  const pakaiPraktik=info.praktik&&Boolean(isiPraktik);
  const frasaTeori=pakaiTeori?`${KERJA_TEORI[level]} ${isiTeori}`:'';
  const frasaPraktik=pakaiPraktik?`${KERJA_PRAKTIK[level]} ${isiPraktik}`.trim():'';
  if(pakaiTeori&&pakaiPraktik)
    return objekBerulang(isiTeori,isiPraktik)?frasaPraktik:gabung([frasaTeori,frasaPraktik]);
  if(pakaiTeori||pakaiPraktik)return gabung([frasaTeori,frasaPraktik]);
  /* Butir yang rumusannya hanya tersedia pada sisi lain tetap dapat dibaca: yang dipakai adalah
     rumusan yang ada, bukan kalimat kosong. */
  const sisa=isiTeori||isiPraktik;
  if(!sisa)return '';
  return `${(isiTeori?KERJA_TEORI:KERJA_PRAKTIK)[level]} ${sisa}`.trim();
}

/* Membagi capaian butir menjadi yang sudah tercapai dan yang masih memerlukan bimbingan.
   Batas jumlah menjaga kalimat rapor tetap terbaca; butir dengan nilai tertinggi mewakili sisi
   unggul dan yang terendah mewakili sisi yang perlu dikuatkan. */
function bagiCapaian(capaian,kktp,{maksUnggul=3,maksBimbingan=2}={}){
  const dinilai=(capaian||[]).filter(item=>item&&item.nilai!==null&&item.nilai!==undefined);
  const unggul=dinilai.filter(item=>tingkatButir(item.nilai,kktp)!=='bimbingan')
    .sort((a,b)=>b.nilai-a.nilai);
  const bimbingan=dinilai.filter(item=>tingkatButir(item.nilai,kktp)==='bimbingan')
    .sort((a,b)=>a.nilai-b.nilai);
  return {
    dinilai,
    unggul:unggul.slice(0,maksUnggul),
    bimbingan:bimbingan.slice(0,maksBimbingan),
    tertinggi:unggul[0]||null,
  };
}

/* ------------------------------------------------------- 1. GENERATOR INTRAKURIKULER */

/* Nada kalimat Intrakurikuler mengikuti PREDIKAT kegiatan, bukan angka. Yang diceritakan lebih
   dulu adalah keterlibatan murid pada pembelajaran, baru kemampuan yang ditunjukkannya. */
const NADA_INTRA=Object.freeze({
  'Sangat Baik':'mengikuti kegiatan pembelajaran intrakurikuler dengan sangat baik dan konsisten',
  'Baik':'mengikuti kegiatan pembelajaran intrakurikuler dengan baik',
  'Cukup':'mengikuti kegiatan pembelajaran intrakurikuler dengan cukup baik',
  'Perlu Bimbingan':'mengikuti kegiatan pembelajaran intrakurikuler dan masih memerlukan bimbingan',
});

/* Deskripsi Intrakurikuler dari BUTIR CP yang dinilai. */
export function composeIntracurricularButirDescription({studentName='',subjectName='',capaian=[],
  predicate='Baik',kktp=KKTP_BAWAAN}={}){
  const {dinilai,unggul,bimbingan}=bagiCapaian(capaian,kktp);
  if(!dinilai.length)return null;
  const nama=String(studentName||'').trim()||'Ananda';
  const mapel=String(subjectName||'').trim();
  const nada=NADA_INTRA[predicate]||NADA_INTRA.Baik;
  const bagianMapel=mapel?` pada mata pelajaran ${mapel}`:'';
  const kalimat=[`Ananda ${nama} ${nada}${bagianMapel}.`];
  const kuat=unggul.map(item=>frasaButir(item,tingkatButir(item.nilai,kktp))).filter(Boolean);
  if(kuat.length)kalimat.push(`Ananda menunjukkan kemampuan ${rangkai(kuat)}.`);
  const lemah=bimbingan.map(item=>frasaButir(item,'bimbingan')).filter(Boolean);
  if(lemah.length)kalimat.push(`Ananda masih memerlukan bimbingan untuk ${rangkai(lemah)}.`);
  return kalimat.join(' ');
}

/* Bentuk lama tanpa nilai butir: dipakai bila belum ada satu pun butir yang dinilai, sehingga
   guru tetap mendapat kalimat yang benar alih-alih kolom kosong. Lingkup kompetensinya diambil
   dari nama elemen CP resmi, dan FASE tidak pernah disebut. */
export function composeIntracurricularCpDescription({studentName='',subjectName='',cp=null,predicate='Baik'}={}){
  if(!cp||!cp.elements?.length)return null;
  const nama=String(studentName||'').trim()||'Ananda';
  const mapel=String(subjectName||'').trim();
  const nada=NADA_INTRA[predicate]||NADA_INTRA.Baik;
  const fokus=rangkai(cp.elements.map(namaElemen));
  const bagianMapel=mapel?` pada mata pelajaran ${mapel}`:'';
  return `Ananda ${nama} ${nada}${bagianMapel}, dengan lingkup kompetensi yang meliputi ${fokus}.`;
}

/* ------------------------------------------------- 2. GENERATOR CAPAIAN KOMPETENSI RAPOR */

/* Nada kalimat Nilai Rapor mengikuti CAPAIAN AKADEMIK - nilai butir dan Nilai Akhir terhadap
   KKTP - bukan predikat kegiatan. Inilah yang membuat kalimatnya berbeda dari Intrakurikuler
   meskipun butir CP-nya sama. */
function tingkatAkademik(finalScore,kktp){
  if(finalScore===null||finalScore===undefined)return null;
  if(finalScore>=90)return 'sangat baik';
  if(finalScore>=Number(kktp||KKTP_BAWAAN))return 'baik';
  return 'perlu bimbingan';
}

/* Deskripsi Capaian Kompetensi rapor dari BUTIR CP yang dinilai. */
export function composeReportButirDescription({studentName='',capaian=[],finalScore=null,
  kktp=KKTP_BAWAAN}={}){
  const {dinilai,unggul,bimbingan}=bagiCapaian(capaian,kktp);
  if(!dinilai.length)return null;
  const nama=String(studentName||'').trim()||'Ananda';
  /* Tingkat keseluruhan diambil dari Nilai Akhir bila ada; bila belum, dari rata-rata nilai
     butir yang sudah dinilai. Keduanya angka capaian murid, bukan tebakan. */
  const rerata=Math.round((dinilai.reduce((total,item)=>total+item.nilai,0)/dinilai.length)*100)/100;
  const acuan=finalScore===null||finalScore===undefined?rerata:finalScore;
  const tingkat=tingkatAkademik(acuan,kktp)||'baik';
  const kuat=unggul.map(item=>frasaButir(item,tingkatButir(item.nilai,kktp))).filter(Boolean);
  const lemah=bimbingan.map(item=>frasaButir(item,'bimbingan')).filter(Boolean);
  const kalimat=[];
  if(kuat.length)kalimat.push(`Ananda ${nama} menunjukkan capaian ${tingkat} dalam ${rangkai(kuat)}.`);
  else kalimat.push(`Ananda ${nama} menunjukkan capaian ${tingkat} pada kompetensi yang dinilai.`);
  if(lemah.length)kalimat.push(`Perlu penguatan pada kemampuan ${rangkai(lemah)}.`);
  return kalimat.join(' ');
}

/* Bentuk lama tanpa nilai butir, memakai nama elemen CP. Tetap dipertahankan supaya mata
   pelajaran yang butirnya belum dinilai tidak kehilangan deskripsi rapornya. FASE tidak
   pernah disebut di sini. */
export function composeReportCpDescription({studentName='',subjectName='',cp=null,finalScore=null,kktp=KKTP_BAWAAN}={}){
  if(!cp||!cp.elements?.length)return null;
  const nama=String(studentName||'').trim()||'Ananda';
  const fokus=rangkai(cp.elements.map(namaElemen));
  const tingkat=tingkatAkademik(finalScore,kktp);
  if(tingkat===null)
    return `Ananda ${nama} menempuh pembelajaran pada lingkup kompetensi ${fokus}.`;
  if(tingkat==='perlu bimbingan')
    return `Ananda ${nama} menunjukkan penguasaan kompetensi ${fokus} yang masih memerlukan bimbingan dan penguatan agar mencapai ketuntasan.`;
  return `Ananda ${nama} menunjukkan penguasaan ${tingkat} pada kompetensi ${fokus}.`;
}

/* --------------------------------------------------------------------- PENJAGA KEBOCORAN */

/* Satu tempat untuk memeriksa bahwa kalimat yang keluar tidak memuat bahasa administratif
   kurikulum. Dipakai penyusun deskripsi dan test regresi. */
const POLA_TERLARANG=/\bfase\s*[abc]\b|\bpada akhir fase\b|\bcp\s*fase\b|\belemen cp\b/i;
export function deskripsiBocorFase(teks){return POLA_TERLARANG.test(String(teks||''));}
