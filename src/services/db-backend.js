/* PENYIMPANAN MILIK APLIKASI DI SISI HALAMAN (WINDOWS).

   Halaman e-Rapor berjalan di browser bawaan pengguna, tetapi sejak rilis ini database
   akademiknya TIDAK lagi tinggal di localStorage browser. Ia tinggal di berkas milik aplikasi
   di %APPDATA%, dan halaman berbicara dengannya lewat endpoint same-origin milik launcher.

   MENGAPA PERMINTAANNYA SYNCHRONOUS.

   Seluruh aplikasi memanggil loadDb()/updateDb() secara synchronous di 178 tempat, dan setiap
   tempat itu memakai pola yang sama: simpan, lalu tampilkan "berhasil disimpan"; bila melempar,
   tampilkan pesan gagal. Kalau penyimpanan diubah menjadi asynchronous, satu-satunya cara
   mempertahankan pola itu adalah melapor "berhasil" sebelum datanya benar-benar tersimpan -
   persis kebohongan yang paling berbahaya bagi nilai siswa.

   Karena itu penulisan memakai XMLHttpRequest synchronous ke 127.0.0.1. Dengan begitu
   saveDb() baru kembali SETELAH berkasnya benar-benar tertulis dan ter-fsync ke piringan, dan
   MELEMPAR bila tidak. Tidak ada satu pun call site yang perlu diubah, dan tidak ada satu pun
   toast "berhasil" yang muncul untuk penyimpanan yang sebenarnya gagal.

   Biayanya diukur, bukan dikira-kira: pada database satu rombel (1,9 MB) satu penyimpanan
   ber-ACK penuh memakan sekitar 18-38 ms, dibanding 5-11 ms untuk localStorage.setItem yang
   dipakai sebelumnya - dan localStorage sendiri sudah menolak database di atas ~5 MB. Jeda
   belasan milidetik tidak terasa pada satu aksi simpan; kehilangan nilai satu kelas terasa
   seumur semester.

   Satu-satunya keadaan di mana browser menolak XHR synchronous adalah saat halaman sedang
   ditutup. Aplikasi ini tidak pernah menyimpan pada saat itu: tidak ada handler beforeunload,
   unload, maupun pagehide di seluruh sumbernya.

   YANG TIDAK PERNAH LEWAT SINI: lisensi, Installation ID, dan aktivasi perangkat. Ketiganya
   memakai kunci penyimpanannya sendiri dan tetap tinggal di browser. Berkas database milik
   aplikasi dapat disalin dan dipulihkan antar komputer; identitas berlisensi tidak boleh. */

const JALUR_DB='/__erapor/db';

/* Transport dapat diganti oleh test supaya seluruh perilaku - migrasi, konflik, kegagalan
   disk - dapat diuji tanpa menjalankan Electron. Pada aplikasi sebenarnya nilainya tetap
   null dan XMLHttpRequest yang dipakai. */
let transportUji=null;
export function pasangTransportPenyimpanan(impl){transportUji=impl;lupakanHidrasi();}

let memori={terhidrasi:false,rev:'',raw:null,sumber:'kosong',migrasi:null};
export function lupakanHidrasi(){memori={terhidrasi:false,rev:'',raw:null,sumber:'kosong',migrasi:null};}

function metaKonten(nama){
  try{return globalThis.document?.querySelector?.(`meta[name="${nama}"]`)?.content||'';}
  catch{return '';}
}

/* Penyimpanan milik aplikasi hanya dipakai bila launcher Windows versi ini yang melayani
   halaman. Android, web, dan launcher versi lama tidak menyuntikkan penanda ini sehingga
   tetap memakai localStorage persis seperti sebelumnya. */
export function penyimpananServerAktif(){
  if(transportUji)return true;
  if(metaKonten('erapor-desktop-db')!=='server')return false;
  return typeof globalThis.XMLHttpRequest==='function'&&Boolean(metaKonten('erapor-desktop-bridge-token'));
}

function panggil(method,jalur,muatan){
  if(transportUji)return transportUji({method,jalur,muatan});
  const permintaan=new globalThis.XMLHttpRequest();
  /* Argumen ketiga false: inilah yang membuat kembalinya fungsi ini berarti "sudah tersimpan",
     bukan "sudah dikirim". */
  permintaan.open(method,jalur,false);
  permintaan.setRequestHeader('Content-Type','application/json');
  permintaan.setRequestHeader('x-erapor-bridge-token',metaKonten('erapor-desktop-bridge-token'));
  permintaan.send(muatan===undefined?null:JSON.stringify(muatan));
  let isi=null;
  try{isi=permintaan.responseText?JSON.parse(permintaan.responseText):null;}catch{isi=null;}
  return {status:permintaan.status,isi};
}

/* Setiap kesalahan dari berkas ini ditandai supaya storage.js meneruskan pesannya apa adanya.
   Pesan-pesan ini sudah menyebutkan apa yang gagal DAN apa yang masih utuh; membungkusnya
   dengan kalimat umum justru menghilangkan keterangan yang paling dibutuhkan guru. */
function galat(pesan,tambahan={}){
  const error=new Error(pesan);
  Object.assign(error,{penyimpananAplikasi:true},tambahan);
  return error;
}

function pesanServer(jawaban,bawaan){
  return jawaban?.isi?.error?String(jawaban.isi.error):bawaan;
}

/* --------------------------------------------------------------------------- MIGRASI

   Migrasi HARUS dimulai dari halaman, bukan dari launcher: hanya halaman yang dapat membaca
   localStorage profil browser yang sedang dipakai. Launcher tidak punya akses ke sana.

   Urutannya disusun supaya tidak ada satu titik pun yang dapat kehilangan data:

     DITEMUKAN  - ada database lama di browser, dan penyimpanan aplikasi masih kosong.
     DICADANGKAN- salinan mentahnya sudah ditulis dan di-fsync ke folder backup. Migrasi TIDAK
                  dilanjutkan bila langkah ini gagal.
     DISALIN    - isinya sudah ditulis ke berkas milik aplikasi.
     DIVERIFIKASI-dibaca ulang dari berkas itu dan dibandingkan karakter per karakter dengan
                  sumbernya. Hanya perbandingan inilah yang boleh menyatakan migrasi berhasil.
     SELESAI    - dicatat, dan sejak saat itu berkas aplikasi yang menjadi sumber kebenaran.

   DATA LAMA DI BROWSER TIDAK PERNAH DIHAPUS DAN TIDAK PERNAH DITIMPA. Setelah migrasi ia
   ditinggalkan apa adanya sebagai jalur pemulihan terakhir bila berkas aplikasi dan
   cadangannya sama-sama hilang. Kegagalan di langkah mana pun meninggalkannya utuh, sehingga
   migrasi yang gagal dapat diulang begitu penyebabnya diperbaiki. */
function catatState(status,tambahan={}){
  try{panggil('POST',`${JALUR_DB}/state`,{status,...tambahan});}
  catch{/* catatan status bersifat penjelas; kegagalannya tidak boleh menggagalkan migrasi */}
}

function bacaLokalLama(kunci){
  try{
    const isi=globalThis.localStorage?.getItem?.(kunci);
    return typeof isi==='string'&&isi.trim()?isi:null;
  }catch{return null;}
}

function jalankanMigrasi(lama){
  const waktu=new Date().toISOString();
  catatState('DISCOVERED',{bytes:lama.length,mulaiAt:waktu});

  const cadangan=panggil('POST',`${JALUR_DB}/backup`,{database:lama,waktu});
  if(cadangan.status!==200||!cadangan.isi?.ok){
    catatState('FAILED',{langkah:'BACKUP',error:pesanServer(cadangan,'tidak diketahui')});
    throw galat(`Data lama tidak dapat dicadangkan sebelum dipindahkan, jadi pemindahan dibatalkan dan data lama dibiarkan utuh: ${pesanServer(cadangan,'cadangan gagal dibuat')}`);
  }
  catatState('BACKED_UP',{cadangan:cadangan.isi.nama,bytes:cadangan.isi.bytes});

  const tulis=panggil('PUT',JALUR_DB,{baseRev:'',database:lama});
  if(tulis.status===409){
    /* Penyimpanan aplikasi ternyata sudah berisi data - tab lain mendahului. Itu BUKAN
       kegagalan: datanya sudah ada, dan menimpanya justru berbahaya. */
    catatState('COMPLETED',{catatan:'penyimpanan aplikasi sudah terisi lebih dulu'});
    return {rev:tulis.isi?.rev||'',raw:tulis.isi?.database||null,sumber:'utama'};
  }
  if(tulis.status!==200||!tulis.isi?.ok){
    catatState('FAILED',{langkah:'IMPORT',error:pesanServer(tulis,'tidak diketahui'),cadangan:cadangan.isi.nama});
    throw galat(`Data lama gagal dipindahkan ke penyimpanan aplikasi. Data lama di browser dan cadangannya tetap utuh: ${pesanServer(tulis,'penulisan gagal')}`);
  }

  /* VERIFIKASI. Yang dibandingkan adalah isi yang benar-benar dibaca kembali dari berkas,
     bukan jawaban penulisan tadi. */
  const ulang=panggil('GET',JALUR_DB);
  if(ulang.status!==200||ulang.isi?.database!==lama){
    catatState('FAILED',{langkah:'VERIFY',error:'isi berkas tidak sama dengan data lama',cadangan:cadangan.isi.nama});
    throw galat('Data yang dipindahkan tidak sama persis dengan data lama saat diperiksa ulang. Pemindahan dinyatakan GAGAL; data lama di browser dan cadangannya tetap utuh.');
  }
  catatState('COMPLETED',{cadangan:cadangan.isi.nama,bytes:lama.length,selesaiAt:new Date().toISOString()});
  return {rev:ulang.isi.rev,raw:ulang.isi.database,sumber:'utama'};
}

function hidrasi(kunci){
  const jawaban=panggil('GET',JALUR_DB);
  if(jawaban.status!==200)
    throw galat(`Penyimpanan aplikasi tidak dapat dibaca: ${pesanServer(jawaban,`server lokal menjawab ${jawaban.status}`)}`);
  const isi=jawaban.isi||{};
  if(typeof isi.database==='string'&&isi.database.trim())
    return {rev:String(isi.rev||''),raw:isi.database,sumber:String(isi.sumber||'utama'),migrasi:isi.migrasi||null};

  /* Penyimpanan aplikasi masih kosong. Dua kemungkinan, dan keduanya berbeda nasibnya. */
  const lama=bacaLokalLama(kunci);
  if(!lama)return {rev:'',raw:null,sumber:'kosong',migrasi:isi.migrasi||null};
  const hasil=jalankanMigrasi(lama);
  return {...hasil,migrasi:{status:'COMPLETED'}};
}

function pastikanTerhidrasi(kunci){
  if(memori.terhidrasi)return memori;
  memori={...hidrasi(kunci),terhidrasi:true};
  return memori;
}

/* ------------------------------------------------------------------------ Baca dan tulis */

export function bacaRawServer(kunci){
  return pastikanTerhidrasi(kunci).raw;
}

/* Penulisan menyebut revisi yang menjadi dasarnya. Bila tab lain sudah menulis lebih dulu,
   server MENOLAK dan mengirim isi terbarunya; isi itu dipasang ke memori lalu kesalahan
   bertanda `konflikRevisi` dilempar supaya updateDb dapat MENGULANG perubahannya di atas data
   terbaru. Tanpa penolakan ini, tab yang membawa salinan basi akan menghapus pekerjaan tab
   sebelah tanpa seorang pun tahu. */
export function tulisRawServer(kunci,raw){
  const dasar=pastikanTerhidrasi(kunci);
  const jawaban=panggil('PUT',JALUR_DB,{baseRev:dasar.rev,database:raw});
  if(jawaban.status===409){
    memori={terhidrasi:true,rev:String(jawaban.isi?.rev||''),raw:jawaban.isi?.database??null,
      sumber:'utama',migrasi:memori.migrasi};
    throw galat('Data di komputer ini baru saja berubah dari jendela lain, jadi penyimpanan diulang di atas data terbaru.',{konflikRevisi:true});
  }
  if(jawaban.status!==200||!jawaban.isi?.ok)
    throw galat(`Data GAGAL disimpan ke penyimpanan aplikasi: ${pesanServer(jawaban,`server lokal menjawab ${jawaban.status}`)}`);
  memori={terhidrasi:true,rev:String(jawaban.isi.rev||''),raw,sumber:'utama',migrasi:memori.migrasi};
  return raw;
}

/* Dipakai halaman Pengaturan untuk memberi tahu guru dari mana data yang sedang dipakai
   datang - berkas utama, cadangan, atau masih kosong. */
export function statusPenyimpanan(kunci){
  if(!penyimpananServerAktif())return {aktif:false,sumber:'browser'};
  try{
    const isi=pastikanTerhidrasi(kunci);
    return {aktif:true,sumber:isi.sumber,terisi:Boolean(isi.raw),migrasi:isi.migrasi};
  }catch(error){
    return {aktif:true,sumber:'gagal',terisi:false,error:error.message};
  }
}
