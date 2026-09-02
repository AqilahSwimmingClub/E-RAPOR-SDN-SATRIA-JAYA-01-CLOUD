/* Aturan pembaruan resmi e-Rapor.

   Dipakai bersama oleh aplikasi sekolah dan server update, supaya "sumber resmi" berarti hal
   yang sama persis di kedua sisi. Berkas ini tidak memuat rahasia apa pun: hanya daftar
   platform yang didukung dan daftar host tempat berkas rilis resmi boleh berada.

   Aplikasi TIDAK PERNAH mengeksekusi apa pun dari alamat unduhan. Alamat itu hanya dibuka di
   peramban/pengelola paket sistem, dan hanya bila host-nya lolos daftar di bawah. */

export const UPDATE_PLATFORMS=Object.freeze(['android','windows']);

/* Host resmi tempat berkas rilis e-Rapor diterbitkan. Sengaja daftar-putih, bukan daftar-hitam:
   alamat di luar daftar ini ditolak server saat Pemilik menyimpannya, dan ditolak lagi oleh
   aplikasi sebelum tombol unduh ditampilkan. */
export const OFFICIAL_DOWNLOAD_HOSTS=Object.freeze([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

export const UPDATE_STATUS=Object.freeze({
  LATEST:'LATEST',
  AVAILABLE:'AVAILABLE',
  MANDATORY:'MANDATORY',
  UNKNOWN:'UNKNOWN',
  OFFLINE:'OFFLINE',
});

export const UPDATE_STATUS_LABEL=Object.freeze({
  LATEST:'Versi Terbaru',
  AVAILABLE:'Pembaruan Tersedia',
  MANDATORY:'Pembaruan Wajib',
  UNKNOWN:'Tidak Dapat Memeriksa Pembaruan',
  OFFLINE:'Sedang Offline',
});

/* Pemeriksaan otomatis dibatasi supaya aplikasi tidak terus-menerus menghubungi server.
   Tombol Periksa Pembaruan tetap dapat dipakai kapan saja tanpa menunggu jeda ini. */
export const UPDATE_CHECK_INTERVAL_HOURS=12;

/* Disimpan di luar DB_KEY, sama seperti lisensi, sehingga hasil pemeriksaan pembaruan tidak
   pernah ikut ke berkas backup akademik. */
export const UPDATE_STORAGE_KEY='erapor_update_v1';

export function isSupportedPlatform(value){
  return UPDATE_PLATFORMS.includes(String(value??'').trim().toLowerCase());
}

/* Alamat unduhan wajib https dan berada pada host resmi. Subdomain sembarang TIDAK diterima:
   host harus sama persis dengan salah satu entri daftar, agar nama seperti
   "github.com.contoh.id" tidak lolos. */
export function isOfficialDownloadUrl(value,hosts=OFFICIAL_DOWNLOAD_HOSTS){
  const teks=String(value??'').trim();
  if(!teks)return false;
  let url;
  try{url=new URL(teks);}catch{return false;}
  if(url.protocol!=='https:')return false;
  if(url.username||url.password)return false;
  return hosts.includes(url.hostname.toLowerCase());
}
