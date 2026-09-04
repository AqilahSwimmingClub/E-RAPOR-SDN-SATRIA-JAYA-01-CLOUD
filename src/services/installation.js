import { INSTALLATION_STORAGE_KEY } from '../data/license-config.js';
import { DEVICE_SOURCES, isInstallationId, resolveDeviceIdentity } from './device-identity.js';

/* Installation ID: identitas satu pemasangan aplikasi pada satu perangkat.

   Nilainya DITURUNKAN dari sinyal perangkat bila platformnya menyediakannya - lihat
   device-identity.js - dan hanya jatuh ke nilai acak kriptografis ketika tidak ada sinyal sama
   sekali, yaitu ketika aplikasi berjalan di browser biasa.

   MENYALIN STORAGE TIDAK CUKUP. Pada Android dan Windows, nilai hasil turunan perangkat SELALU
   menang atas apa pun yang tersimpan: ensureInstallationId() menimpanya setiap kali aplikasi
   dijalankan. Karena itu memindahkan isi localStorage dari perangkat A ke perangkat B hanya
   menghasilkan Installation ID milik B, yang tidak cocok dengan Activation Token bawaan A,
   sehingga B tetap tidak dianggap berlisensi.

   Disimpan pada kunci penyimpanan tersendiri di luar database sekolah, sehingga tidak pernah
   ikut ke berkas backup dan tidak berpindah ketika data sekolah direstore di perangkat lain. */

function acakHex(bytes){
  const buf=new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export { isInstallationId };

/* Sumber identitas yang sedang dipakai. Hanya untuk ditampilkan apa adanya di layar Aktivasi
   Lisensi; tidak pernah ikut menentukan apakah sebuah lisensi sah. */
let sumberTerakhir=DEVICE_SOURCES.BROWSER;
export function getInstallationSource(){return sumberTerakhir;}

function baca(){
  const tersimpan=globalThis.localStorage?.getItem(INSTALLATION_STORAGE_KEY);
  return isInstallationId(tersimpan)?tersimpan:null;
}
function tulis(nilai){globalThis.localStorage?.setItem(INSTALLATION_STORAGE_KEY,nilai);}

/* Pembacaan serentak (sinkron). Dipakai di jalur yang tidak dapat menunggu, misalnya saat
   membandingkan klaim token. Nilai turunan perangkat sudah dipasang lebih dulu oleh
   ensureInstallationId() pada saat aplikasi dimulai, jadi yang dikembalikan di sini adalah
   nilai yang sama. */
export function getInstallationId(){
  const ada=baca();
  if(ada)return ada;
  const baru=`inst_${acakHex(16)}`;
  tulis(baru);
  return baru;
}

/* Dipanggil sekali sebelum aplikasi memakai lisensi. Menurunkan identitas dari perangkat bila
   platformnya menyediakannya, lalu MENGUNCINYA ke storage sehingga getInstallationId() yang
   sinkron mengembalikan nilai yang sama.

   Kegagalan menurunkan identitas tidak pernah dijadikan alasan menolak aplikasi berjalan: ia
   hanya berarti perangkat ini memang tidak punya sinyal, dan nilai acak dipakai seperti biasa. */
export async function ensureInstallationId(){
  let identitas=null;
  try{identitas=await resolveDeviceIdentity();}
  catch{identitas=null;}
  if(identitas?.installationId){
    sumberTerakhir=identitas.source;
    /* Nilai turunan perangkat menimpa apa pun yang tersimpan - termasuk nilai hasil menyalin
       storage dari perangkat lain. */
    if(baca()!==identitas.installationId)tulis(identitas.installationId);
    return identitas.installationId;
  }
  sumberTerakhir=DEVICE_SOURCES.BROWSER;
  return getInstallationId();
}

/* Dipakai test dan pemulihan darurat saja; tidak pernah dipanggil oleh alur normal. */
export function resetInstallationId(){globalThis.localStorage?.removeItem(INSTALLATION_STORAGE_KEY);}
