import { LICENSE_API_BASE, LICENSE_CHECK_INTERVAL_DAYS, LICENSE_GRACE_PERIOD_DAYS,
  LICENSE_PUBLIC_JWK, LICENSE_STORAGE_KEY } from '../data/license-config.js';
import { getInstallationId } from './installation.js';
import { APP_VERSION } from '../data/version.js';

/* Lisensi sisi aplikasi sekolah.

   Aplikasi tidak pernah memutuskan sendiri bahwa sebuah kunci sah. Keputusan itu milik server
   lisensi; yang dilakukan di sini hanyalah memverifikasi tanda tangan Activation Token dengan
   kunci PUBLIK, lalu menyimpan hasilnya agar aplikasi tetap dapat dipakai tanpa internet.

   Tidak ada jalur pintas apa pun di berkas ini: tidak ada kunci universal, tidak ada
   pengecualian berdasarkan nama sekolah atau NPSN, dan tidak ada pengecualian untuk siapa pun. */

export const LICENSE_MESSAGES=Object.freeze({
  OK:'Aktivasi berhasil. Perangkat ini telah terdaftar.',
  INVALID_KEY:'License Key tidak valid.',
  ALREADY_ACTIVATED:'License Key ini sudah terikat pada perangkat lain. Hubungi penyedia e-Rapor.',
  SUSPENDED:'Lisensi sedang ditangguhkan. Hubungi penyedia e-Rapor.',
  REVOKED:'Lisensi telah dicabut. Hubungi penyedia e-Rapor.',
  NOT_BOUND:'Perangkat ini tidak lagi terdaftar pada lisensi tersebut. Hubungi penyedia e-Rapor.',
  NETWORK:'Tidak dapat menghubungi server lisensi. Periksa koneksi internet.',
  RATE_LIMITED:'Terlalu banyak percobaan aktivasi. Coba lagi beberapa menit lagi.',
  NOT_CONFIGURED:'Server lisensi belum dikonfigurasi pada aplikasi ini.',
});

const HARI=86400000;

/* Kunci hanya ditampilkan tersamar, baik di layar maupun di log. */
export function maskLicenseKey(value){
  const bersih=String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const inti=bersih.startsWith('ERAPOR')?bersih.slice(6):bersih;
  const ekor=inti.slice(-4);
  return `ERAPOR-••••-••••-${ekor||'••••'}`;
}

export function formatLicenseKeyInput(value){
  const bersih=String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^ERAPOR/,'').slice(0,12);
  const grup=bersih.match(/.{1,4}/g)||[];
  return `ERAPOR${grup.length?`-${grup.join('-')}`:''}`;
}

function baca(){
  try{return JSON.parse(globalThis.localStorage?.getItem(LICENSE_STORAGE_KEY)||'null');}catch{return null;}
}
function tulis(record){
  globalThis.localStorage?.setItem(LICENSE_STORAGE_KEY,JSON.stringify(record));
  return record;
}
export function clearLicense(){globalThis.localStorage?.removeItem(LICENSE_STORAGE_KEY);}

/* -------------------------------------------------------------- Verifikasi token */

const b64uToBytes=value=>{
  const b64=String(value).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(String(value).length/4)*4,'=');
  const bin=atob(b64);
  return Uint8Array.from(bin,ch=>ch.charCodeAt(0));
};

/* Tanda tangan ECDSA P-256 diperiksa dengan WebCrypto memakai kunci publik yang ditanam di
   aplikasi. Token yang tandanya tidak cocok diperlakukan seolah tidak ada. */
export async function verifyActivationToken(token,publicJwk=LICENSE_PUBLIC_JWK){
  if(!token||!publicJwk)return null;
  const [body,signature]=String(token).split('.');
  if(!body||!signature)return null;
  try{
    const key=await globalThis.crypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const ok=await globalThis.crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,
      b64uToBytes(signature),new TextEncoder().encode(body));
    if(!ok)return null;
    return JSON.parse(new TextDecoder().decode(b64uToBytes(body)));
  }catch{return null;}
}

/* --------------------------------------------------------------- Panggilan server */

function endpoint(path){
  const base=String(LICENSE_API_BASE||'').replace(/\/+$/,'');
  return `${base}/api/v1${path}`;
}

async function panggil(path,payload){
  if(!LICENSE_API_BASE||!LICENSE_PUBLIC_JWK){const error=new Error(LICENSE_MESSAGES.NOT_CONFIGURED);error.code='NOT_CONFIGURED';throw error;}
  let response;
  try{
    response=await globalThis.fetch(endpoint(path),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  }catch{const error=new Error(LICENSE_MESSAGES.NETWORK);error.code='NETWORK';throw error;}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const kode=data?.error?.code||'NETWORK';
    const error=new Error(LICENSE_MESSAGES[kode]||data?.error?.message||LICENSE_MESSAGES.NETWORK);
    error.code=kode;
    throw error;
  }
  return data;
}

/* Data yang dikirim sengaja seminimal mungkin. Tidak ada data siswa, nilai, absensi, atau
   isi rapor yang pernah dikirim ke server lisensi. */
export function buildActivationPayload({licenseKey,school={},platform=detectPlatform(),deviceLabel=''}={}){
  return {
    license_key:String(licenseKey||'').trim(),
    installation_id:getInstallationId(),
    school_name:String(school.name||'').slice(0,150),
    npsn:String(school.npsn||'').slice(0,40),
    app_version:APP_VERSION,
    platform,
    device_label:String(deviceLabel||'').slice(0,120),
  };
}

export function detectPlatform(){
  const ua=String(globalThis.navigator?.userAgent||'').toLowerCase();
  if(globalThis.Capacitor?.isNativePlatform?.()||ua.includes('android'))return 'android';
  if(globalThis.eraporDesktop||ua.includes('electron'))return 'windows';
  return 'web';
}

function simpanDariToken(token,claims){
  return tulis({
    schema:1,
    activation_token:token,
    license_id:claims.license_id,
    license_hint:claims.license_hint,
    installation_id:claims.installation_id,
    status:claims.status,
    issued_at:claims.issued_at,
    next_check_at:claims.next_check_at,
    last_successful_check_at:claims.issued_at,
    updated_at:new Date().toISOString(),
  });
}

export async function activateLicense({licenseKey,school={},deviceLabel=''}={}){
  const data=await panggil('/activate',buildActivationPayload({licenseKey,school,deviceLabel}));
  const claims=await verifyActivationToken(data.activation_token);
  if(!claims){const error=new Error('Activation Token dari server tidak dapat diverifikasi.');error.code='INVALID_TOKEN';throw error;}
  if(claims.installation_id!==getInstallationId()){
    const error=new Error('Activation Token bukan untuk perangkat ini.');error.code='INVALID_TOKEN';throw error;
  }
  return simpanDariToken(data.activation_token,claims);
}

/* Pemeriksaan berkala. Kegagalan jaringan TIDAK PERNAH dianggap lisensi dicabut. */
export async function checkLicense({force=false}={}){
  const record=baca();
  if(!record)return null;
  if(!force&&!isCheckDue(record))return record;
  try{
    const data=await panggil('/check',{installation_id:getInstallationId(),license_id:record.license_id});
    const claims=await verifyActivationToken(data.activation_token);
    if(!claims)return record;
    return simpanDariToken(data.activation_token,claims);
  }catch(error){
    if(error.code==='SUSPENDED'||error.code==='REVOKED'||error.code==='NOT_BOUND'){
      return tulis({...record,status:error.code==='NOT_BOUND'?'NOT_BOUND':error.code,updated_at:new Date().toISOString()});
    }
    /* Jaringan bermasalah: status terakhir dipertahankan, masa tenggang berjalan. */
    return record;
  }
}

export function isCheckDue(record=baca(),now=Date.now()){
  if(!record?.next_check_at)return true;
  return now>=new Date(record.next_check_at).getTime();
}

/* ------------------------------------------------------------------ Status aplikasi */

/* Nilai kembalian dipakai router untuk memutuskan apakah aplikasi berjalan penuh, terbatas,
   atau harus meminta aktivasi. Tidak ada satu pun cabang yang menghapus data. */
export function getLicenseState({now=Date.now()}={}){
  const record=baca();
  if(!record?.activation_token)return {state:'UNLICENSED',canUseApp:false,canEditData:false,record:null};
  /* Lisensi yang dicabut atau perangkat yang tidak lagi terikat mengembalikan aplikasi ke
     halaman Aktivasi: perangkat ini memang tidak berlisensi lagi, jadi ia harus memasukkan
     License Key yang sah. Data akademik lokal TIDAK dihapus sama sekali oleh keadaan ini. */
  if(record.status==='REVOKED')
    return {state:'REVOKED',canUseApp:false,canEditData:false,record,message:LICENSE_MESSAGES.REVOKED};
  if(record.status==='NOT_BOUND')
    return {state:'NOT_BOUND',canUseApp:false,canEditData:false,record,message:LICENSE_MESSAGES.NOT_BOUND};
  /* Ditangguhkan bersifat sementara, jadi aplikasi tetap terbuka dalam mode terbatas beserta
     keterangannya; sekolah tetap dapat melihat data dan membuat backup. */
  if(record.status==='SUSPENDED')
    return {state:'SUSPENDED',canUseApp:true,canEditData:false,record,message:LICENSE_MESSAGES.SUSPENDED};

  const jatuhTempo=record.next_check_at?new Date(record.next_check_at).getTime():now;
  const batasTenggang=jatuhTempo+LICENSE_GRACE_PERIOD_DAYS*HARI;
  if(now>batasTenggang){
    /* Masa tenggang habis tanpa pernah berhasil menghubungi server. Aplikasi masuk mode
       terbatas, TETAPI seluruh data tetap utuh dan tetap dapat dibaca serta dibackup. */
    return {state:'GRACE_EXPIRED',canUseApp:true,canEditData:false,record,
      message:'Aplikasi belum dapat memeriksa lisensi lebih dari '+(LICENSE_CHECK_INTERVAL_DAYS+LICENSE_GRACE_PERIOD_DAYS)+' hari. Sambungkan internet sekali untuk melanjutkan.'};
  }
  if(now>jatuhTempo){
    const sisa=Math.max(0,Math.ceil((batasTenggang-now)/HARI));
    return {state:'GRACE',canUseApp:true,canEditData:true,record,
      message:`Pemeriksaan lisensi tertunda. Sambungkan internet dalam ${sisa} hari.`};
  }
  return {state:'ACTIVE',canUseApp:true,canEditData:true,record};
}

export function isLicenseActivated(){return Boolean(baca()?.activation_token);}
export function getLicenseRecord(){return baca();}

/* Yang boleh dilihat halaman Admin Sekolah hanyalah bentuk tersamar. Tidak ada tombol apa pun
   di aplikasi sekolah untuk menampilkan kunci utuh atau mengambilnya dari server. */
export function getLicenseDisplay(){
  const record=baca();
  if(!record)return null;
  return {hint:record.license_hint||maskLicenseKey(''),status:record.status,
    installation_id:record.installation_id,last_check:record.last_successful_check_at};
}
