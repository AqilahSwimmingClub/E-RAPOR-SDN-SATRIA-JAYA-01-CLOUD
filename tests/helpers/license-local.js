/* Lisensi lokal palsu untuk test.

   Gerbang login membaca catatan lisensi pada localStorage, sehingga test yang memanggil
   authenticate() perlu menyatakan keadaan lisensi perangkatnya secara eksplisit. Helper ini
   hanya menulis catatan lokal - tidak menyentuh server, kunci, maupun ikatan perangkat. */

const KUNCI='erapor_license_v1';
const HARI=24*60*60*1000;

export function aktifkanLisensiLokal({status='ACTIVE',hariLagi=30}={}){
  globalThis.localStorage.setItem(KUNCI,JSON.stringify({
    activation_token:'token-uji',license_id:'lic-uji',status,
    installation_id:'inst-uji',school_name:'SD Uji',npsn:'12345678',
    next_check_at:new Date(Date.now()+hariLagi*HARI).toISOString(),
    updated_at:new Date().toISOString(),
  }));
}

/* Owner mencabut lisensi: statusnya berubah, catatan akademiknya tidak disentuh sama sekali. */
export function cabutLisensiLokal(status='REVOKED'){
  const record=JSON.parse(globalThis.localStorage.getItem(KUNCI)||'null');
  if(!record)return null;
  const next={...record,status,updated_at:new Date().toISOString()};
  globalThis.localStorage.setItem(KUNCI,JSON.stringify(next));
  return next;
}

export function hapusLisensiLokal(){globalThis.localStorage.removeItem(KUNCI);}
