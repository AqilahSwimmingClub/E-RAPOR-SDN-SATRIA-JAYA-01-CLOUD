import { INSTALLATION_STORAGE_KEY } from '../data/license-config.js';

/* Installation ID: identitas satu pemasangan aplikasi.

   Dibuat dari acak kriptografis, bukan diturunkan dari nama sekolah, NPSN, IMEI, atau nomor
   telepon, sehingga aplikasi tidak perlu meminta izin perangkat apa pun. Disimpan pada kunci
   penyimpanan tersendiri di luar database sekolah, sehingga tidak pernah ikut ke berkas
   backup dan tidak berpindah ketika data sekolah direstore di perangkat lain. */

function acakHex(bytes){
  const buf=new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function isInstallationId(value){return /^inst_[0-9a-f]{32}$/.test(String(value||''));}

export function getInstallationId(){
  const tersimpan=globalThis.localStorage?.getItem(INSTALLATION_STORAGE_KEY);
  if(isInstallationId(tersimpan))return tersimpan;
  const baru=`inst_${acakHex(16)}`;
  globalThis.localStorage?.setItem(INSTALLATION_STORAGE_KEY,baru);
  return baru;
}

/* Dipakai test dan pemulihan darurat saja; tidak pernah dipanggil oleh alur normal. */
export function resetInstallationId(){globalThis.localStorage?.removeItem(INSTALLATION_STORAGE_KEY);}
