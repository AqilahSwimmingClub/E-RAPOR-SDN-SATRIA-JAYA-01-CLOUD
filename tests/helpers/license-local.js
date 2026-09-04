/* Lisensi lokal palsu untuk test.

   Gerbang login membaca catatan lisensi pada localStorage, sehingga test yang memanggil
   authenticate() perlu menyatakan keadaan lisensi perangkatnya secara eksplisit. Helper ini
   hanya menulis catatan lokal - tidak menyentuh server, kunci, maupun ikatan perangkat. */

import { getInstallationId } from '../../src/services/installation.js';

const KUNCI='erapor_license_v1';
const JAM=60*60*1000;
const HARI=24*JAM;

/* `jamLalu` adalah umur verifikasi server terakhir yang berhasil - titik nol masa tenggang
   offline 72 jam. Bawaannya 0: perangkat baru saja diverifikasi. */
export function aktifkanLisensiLokal({status='ACTIVE',hariLagi=30,jamLalu=0,clockSeenAt=null}={}){
  const sekarang=Date.now();
  const diverifikasi=new Date(sekarang-jamLalu*JAM).toISOString();
  globalThis.localStorage.setItem(KUNCI,JSON.stringify({
    activation_token:'token-uji',license_id:'lic-uji',status,
    /* Installation ID diambil dari perangkat uji yang sedang berjalan, bukan nilai karangan.
       Catatan lisensi memang hanya berlaku pada perangkat yang menerimanya, jadi memakai nilai
       tetap di sini akan menguji keadaan yang tidak pernah ada di aplikasi sungguhan. */
    installation_id:getInstallationId(),school_name:'SD Uji',npsn:'12345678',
    issued_at:diverifikasi,last_successful_check_at:diverifikasi,last_verified_at:diverifikasi,
    ...(clockSeenAt?{clock_seen_at:clockSeenAt}:{}),
    next_check_at:new Date(sekarang+hariLagi*HARI).toISOString(),
    updated_at:new Date(sekarang).toISOString(),
  }));
}

/* Menggeser catatan waktu lisensi tanpa menyentuh apa pun yang lain, seolah perangkat dibiarkan
   offline selama sekian jam. */
export function geserVerifikasiLisensi(jamLalu){
  const record=JSON.parse(globalThis.localStorage.getItem(KUNCI)||'null');
  if(!record)return null;
  const diverifikasi=new Date(Date.now()-jamLalu*JAM).toISOString();
  const next={...record,issued_at:diverifikasi,last_successful_check_at:diverifikasi,last_verified_at:diverifikasi};
  globalThis.localStorage.setItem(KUNCI,JSON.stringify(next));
  return next;
}

export function bacaLisensiLokal(){return JSON.parse(globalThis.localStorage.getItem(KUNCI)||'null');}

/* Owner mencabut lisensi: statusnya berubah, catatan akademiknya tidak disentuh sama sekali. */
export function cabutLisensiLokal(status='REVOKED'){
  const record=JSON.parse(globalThis.localStorage.getItem(KUNCI)||'null');
  if(!record)return null;
  const next={...record,status,updated_at:new Date().toISOString()};
  globalThis.localStorage.setItem(KUNCI,JSON.stringify(next));
  return next;
}

export function hapusLisensiLokal(){globalThis.localStorage.removeItem(KUNCI);}
