import { LICENSE_API_BASE, LICENSE_CLOCK_TOLERANCE_MINUTES, LICENSE_OFFLINE_GRACE_HOURS,
  LICENSE_PUBLIC_JWK, LICENSE_STORAGE_KEY } from '../data/license-config.js';
import { ensureInstallationId, getInstallationId } from './installation.js';
import { detectPlatform as deteksiPlatformPerangkat } from './device-identity.js';
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
  /* ALREADY_ACTIVATED adalah kode server versi lama - satu lisensi satu perangkat. Kodenya
     dipertahankan supaya aplikasi yang sudah terpasang tetap menampilkan pesan yang benar bila
     menghubungi server lama. Server sekarang menjawab SLOT_TAKEN atau DEVICE_BOUND_ELSEWHERE. */
  ALREADY_ACTIVATED:'License Key ini sudah terikat pada perangkat lain. Hubungi penyedia e-Rapor.',
  SLOT_TAKEN:'Slot perangkat untuk jenis perangkat ini sudah dipakai. Satu License Key melayani satu perangkat Android dan satu perangkat Windows. Minta Admin Lisensi melakukan Reset perangkat.',
  DEVICE_BOUND_ELSEWHERE:'Perangkat ini masih terikat pada License Key lain. Minta Admin Lisensi melakukan Reset perangkat lebih dulu.',
  SUSPENDED:'Lisensi sedang ditangguhkan. Hubungi penyedia e-Rapor.',
  REVOKED:'Lisensi telah dicabut. Hubungi penyedia e-Rapor.',
  NOT_BOUND:'Perangkat ini tidak lagi terdaftar pada lisensi tersebut. Hubungi penyedia e-Rapor.',
  NETWORK:'Tidak dapat menghubungi server lisensi. Periksa koneksi internet.',
  RATE_LIMITED:'Terlalu banyak percobaan aktivasi. Coba lagi beberapa menit lagi.',
  /* Pesan ini BUKAN pertanda lisensinya bermasalah. Ia berarti berkas aplikasi yang terpasang
     dibangun tanpa alamat server dan kunci verifikasi publik - kesalahan pada proses BUILD,
     bukan pada License Key. Karena itu pesannya menyebut apa yang sebenarnya terjadi dan apa
     yang harus dilakukan, alih-alih membuat sekolah mengira kuncinya salah. */
  NOT_CONFIGURED:'Aplikasi ini dipasang dari paket yang dibangun tanpa konfigurasi server lisensi, '
    +'sehingga aktivasi belum dapat dilakukan. License Key Anda tidak bermasalah. '
    +'Unduh ulang aplikasi versi rilis resmi dari penyedia e-Rapor.',
});

const JAM=3600000;
const TENGGANG_OFFLINE_MS=LICENSE_OFFLINE_GRACE_HOURS*JAM;
const TOLERANSI_JAM_MS=LICENSE_CLOCK_TOLERANCE_MINUTES*60000;

/* Jawaban server yang berarti "lisensi ini memang tidak boleh dipakai". Semuanya MENGALAHKAN
   masa tenggang offline: server berhasil dihubungi dan menjawab, jadi jawabannya adalah
   sumber kebenaran. Kegagalan konektivitas TIDAK ada dalam daftar ini. */
const STATUS_DITOLAK_SERVER=Object.freeze({
  SUSPENDED:'SUSPENDED',REVOKED:'REVOKED',NOT_BOUND:'NOT_BOUND',INVALID_KEY:'INVALID',
});
const STATUS_MEMBLOKIR=Object.freeze({
  REVOKED:LICENSE_MESSAGES.REVOKED,
  NOT_BOUND:LICENSE_MESSAGES.NOT_BOUND,
  SUSPENDED:LICENSE_MESSAGES.SUSPENDED,
  INVALID:LICENSE_MESSAGES.INVALID_KEY,
});

const PESAN_PERLU_VERIFIKASI='Lisensi perlu diverifikasi. Hubungkan perangkat ke internet untuk melanjutkan.';

function waktu(nilai){const angka=Date.parse(String(nilai||''));return Number.isNaN(angka)?null:angka;}
const iso=ms=>new Date(ms).toISOString();

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

/* Platform yang dilaporkan bersama aktivasi. Sinyal yang benar-benar milik lingkungan -
   Capacitor dan meta tag peluncur Windows - selalu didahulukan; user-agent hanya cadangan
   terakhir karena nilainya dapat diubah siapa saja.

   Nilai ini TIDAK menentukan hak apa pun. Server memutuskan sendiri slot mana yang dipakai, dan
   berbohong tentang platform paling jauh hanya memindahkan perangkat itu ke slot seberang milik
   lisensinya sendiri - tidak pernah menambah jumlah perangkat yang boleh aktif. */
export function detectPlatform(){
  const nyata=deteksiPlatformPerangkat();
  if(nyata!=='web')return nyata;
  const ua=String(globalThis.navigator?.userAgent||'').toLowerCase();
  if(ua.includes('android'))return 'android';
  if(globalThis.eraporDesktop||ua.includes('electron'))return 'windows';
  return 'web';
}

/* Catatan lisensi ditulis ulang setiap kali server memberi token baru yang tandanya sah.

   `last_verified_at` adalah TITIK NOL masa tenggang offline: waktu terakhir server benar-benar
   menyatakan lisensi ini masih boleh dipakai. Nilainya diambil dari `issued_at` di dalam KLAIM
   TOKEN - waktu server, bukan jam perangkat - sehingga memundurkan jam perangkat tidak
   menggesernya. Jam perangkat hanya dipakai bila token tidak memuat `issued_at`.

   `clock_seen_at` tidak pernah turun: ia mencatat waktu tertinggi yang pernah dilihat aplikasi,
   dan itulah yang membuat pemunduran jam tidak memperpanjang masa tenggang. */
function simpanDariToken(token,claims,{now=Date.now()}={}){
  const sebelumnya=baca();
  const status=claims.status||'ACTIVE';
  const diverifikasi=STATUS_DITOLAK_SERVER[status]||STATUS_MEMBLOKIR[status]
    ? waktu(sebelumnya?.last_verified_at)
    : (waktu(claims.issued_at)??now);
  return tulis({
    schema:1,
    activation_token:token,
    license_id:claims.license_id,
    license_hint:claims.license_hint,
    installation_id:claims.installation_id,
    status,
    issued_at:claims.issued_at,
    next_check_at:claims.next_check_at,
    last_successful_check_at:claims.issued_at,
    last_verified_at:diverifikasi===null?null:iso(diverifikasi),
    last_check_at:iso(now),
    last_check_error:null,
    clock_seen_at:iso(Math.max(now,waktu(sebelumnya?.clock_seen_at)??0)),
    updated_at:iso(now),
  });
}

/* ------------------------------------------------------- Masa tenggang offline 72 jam */

/* Waktu verifikasi server terakhir yang berhasil. Instalasi lama belum menyimpan
   `last_verified_at`, jadi nilai lama dipakai sebagai gantinya - termasuk `issued_at` yang
   terbaca dari badan token. Sekolah yang sudah berjalan tidak pernah tiba-tiba kehilangan
   titik nolnya hanya karena aplikasinya diperbarui. */
export function licenseVerifiedAt(record=baca()){
  return waktu(record?.last_verified_at)
    ??waktu(record?.last_successful_check_at)
    ??waktu(record?.issued_at)
    ??waktu(bacaKlaimToken(record)?.issued_at)
    ??null;
}

/* Badan token dibaca tanpa memverifikasi tanda tangannya - ini hanya cadangan pembacaan waktu,
   bukan keputusan sah/tidak sah. Keputusan itu tetap milik server, dan token yang diubah
   isinya akan gagal pada pemeriksaan berikutnya karena tandanya tidak lagi cocok. */
function bacaKlaimToken(record){
  const body=String(record?.activation_token||'').split('.')[0];
  if(!body)return null;
  try{return JSON.parse(new TextDecoder().decode(b64uToBytes(body)));}catch{return null;}
}

/* PENJAGAAN JAM MUNDUR.

   Jam perangkat dapat diputar mundur untuk memperpanjang masa tenggang. Karena itu aplikasi
   mencatat waktu tertinggi yang pernah dilihatnya; bila jam sekarang lebih awal dari itu di
   luar batas toleransi, perhitungan tetap memakai waktu tertinggi tadi. Masa tenggang jadi
   tidak pernah bertambah karena tanggal dimundurkan.

   Koreksi waktu yang wajar tetap diterima apa adanya, sehingga penggunaan normal tidak rusak. */
export function effectiveNow(record=baca(),now=Date.now()){
  const tertinggi=waktu(record?.clock_seen_at);
  if(tertinggi!==null&&now<tertinggi-TOLERANSI_JAM_MS)return tertinggi;
  return now;
}

/* Mencatat waktu yang sedang dilihat aplikasi. Tidak pernah menurunkan nilai yang sudah ada. */
export function noteClockObservation(now=Date.now()){
  const record=baca();
  if(!record)return null;
  const tertinggi=waktu(record.clock_seen_at);
  if(tertinggi!==null&&tertinggi>=now)return record;
  return tulis({...record,clock_seen_at:iso(now)});
}

/* Sisa masa tenggang offline. `expired` hanya benar bila selisihnya LEBIH DARI 72 jam - tepat
   72 jam masih diizinkan, sesuai batas yang ditetapkan di license-config.js. */
export function offlineGraceStatus(record=baca(),now=Date.now()){
  const titikNol=licenseVerifiedAt(record);
  if(titikNol===null)
    return {verifiedAt:null,elapsedMs:0,remainingMs:TENGGANG_OFFLINE_MS,expired:false,limitMs:TENGGANG_OFFLINE_MS};
  const berlalu=Math.max(0,effectiveNow(record,now)-titikNol);
  return {verifiedAt:titikNol,elapsedMs:berlalu,remainingMs:Math.max(0,TENGGANG_OFFLINE_MS-berlalu),
    expired:berlalu>TENGGANG_OFFLINE_MS,limitMs:TENGGANG_OFFLINE_MS};
}

export async function activateLicense({licenseKey,school={},deviceLabel=''}={}){
  /* Identitas perangkat diturunkan lebih dulu, sehingga yang dikirim ke server benar-benar
     identitas perangkat ini - bukan nilai yang kebetulan tersimpan di storage. */
  await ensureInstallationId();
  const data=await panggil('/activate',buildActivationPayload({licenseKey,school,deviceLabel}));
  const claims=await verifyActivationToken(data.activation_token);
  if(!claims){const error=new Error('Activation Token dari server tidak dapat diverifikasi.');error.code='INVALID_TOKEN';throw error;}
  if(claims.installation_id!==getInstallationId()){
    const error=new Error('Activation Token bukan untuk perangkat ini.');error.code='INVALID_TOKEN';throw error;
  }
  return simpanDariToken(data.activation_token,claims);
}

/* Pemeriksaan berkala.

   DUA KEGAGALAN YANG SAMA SEKALI BERBEDA dibedakan di sini, dan pembedaan itulah yang membuat
   masa tenggang offline aman:

     A. SERVER MENJAWAB bahwa lisensi tidak boleh dipakai (SUSPENDED, REVOKED, NOT_BOUND,
        INVALID_KEY). Jawaban server adalah sumber kebenaran: statusnya disimpan dan akses
        langsung terputus, betapa pun barunya verifikasi ACTIVE sebelumnya.

     B. SERVER TIDAK DAPAT DIHUBUNGI (fetch gagal -> kode NETWORK). Hanya inilah yang memenuhi
        syarat masa tenggang: status terakhir dipertahankan dan hitungan 72 jam berjalan dari
        verifikasi ACTIVE terakhir.

   Kegagalan lain - rate limit, server 5xx, konfigurasi belum diisi, token yang tandanya tidak
   cocok - tidak pernah dianggap verifikasi berhasil. `last_verified_at` tidak diperbarui,
   sehingga hitungan 72 jam tetap berjalan dan tidak ada fallback "gagal berarti boleh offline". */
export async function checkLicense({force=false,now=Date.now()}={}){
  const record=noteClockObservation(now)||baca();
  if(!record)return null;
  if(!force&&!isCheckDue(record,now))return record;
  try{
    await ensureInstallationId();
    const data=await panggil('/check',{installation_id:getInstallationId(),license_id:record.license_id});
    const claims=await verifyActivationToken(data.activation_token);
    if(!claims)return tulis({...record,last_check_at:iso(now),last_check_error:'INVALID_TOKEN'});
    return simpanDariToken(data.activation_token,claims,{now});
  }catch(error){
    const ditolak=STATUS_DITOLAK_SERVER[error.code];
    if(ditolak)
      return tulis({...record,status:ditolak,last_check_at:iso(now),last_check_error:error.code,
        updated_at:iso(now)});
    /* Konektivitas bermasalah: status terakhir dipertahankan, masa tenggang berjalan. Tidak ada
       satu pun data yang disentuh, dan lisensi TIDAK pernah dianggap dicabut karena ini. */
    return tulis({...record,last_check_at:iso(now),last_check_error:error.code||'NETWORK',
      last_offline_at:error.code==='NETWORK'?iso(now):record.last_offline_at||null});
  }
}

/* Pemeriksaan dianggap perlu bila jadwal server sudah lewat, ATAU bila separuh masa tenggang
   offline sudah terpakai. Yang kedua penting: jadwal server berjarak dua pekan, jadi tanpa itu
   perangkat baru mencoba menghubungi server ketika 72 jamnya sudah habis. */
export function isCheckDue(record=baca(),now=Date.now()){
  if(!record)return true;
  const sekarang=effectiveNow(record,now);
  const titikNol=licenseVerifiedAt(record);
  if(titikNol!==null&&sekarang-titikNol>=TENGGANG_OFFLINE_MS/2)return true;
  if(!record.next_check_at)return true;
  return sekarang>=new Date(record.next_check_at).getTime();
}

/* ------------------------------------------------------------------ Status aplikasi */

/* Nilai kembalian dipakai router untuk memutuskan apakah aplikasi berjalan penuh, terbatas,
   atau harus meminta aktivasi. Tidak ada satu pun cabang yang menghapus data.

   URUTANNYA DISENGAJA: jawaban server diperiksa LEBIH DULU, baru masa tenggang offline.
   Lisensi yang baru dua jam lalu diverifikasi ACTIVE lalu dicabut Owner tetap langsung
   terblokir begitu server menjawab REVOKED - masa tenggang tidak pernah menutupinya. Masa
   tenggang hanya berlaku ketika server benar-benar TIDAK DAPAT dihubungi. */
export function getLicenseState({now=Date.now()}={}){
  const record=baca();
  if(!record?.activation_token)return {state:'UNLICENSED',canUseApp:false,canEditData:false,record:null};

  /* 0. CATATAN LISENSI HANYA BERLAKU DI PERANGKAT YANG MENERIMANYA.

     Menyalin isi localStorage dari perangkat A ke perangkat B memindahkan Activation Token
     berikut seluruh catatan masa tenggangnya. Yang TIDAK ikut berpindah adalah identitas
     perangkat: pada Android dan Windows nilainya diturunkan dari perangkat itu sendiri dan
     ditulis ulang setiap kali aplikasi dijalankan. Karena itu catatan yang membawa
     installation_id perangkat lain ditolak di sini, sebelum masa tenggang apa pun dihitung.

     Yang diputus hanyalah HAK AKSES. Tidak satu pun data akademik disentuh atau dihapus. */
  if(record.installation_id&&record.installation_id!==getInstallationId())
    return {state:'UNLICENSED',canUseApp:false,canEditData:false,record,
      message:'Catatan lisensi ini milik perangkat lain. Lakukan Aktivasi Lisensi pada perangkat ini.'};

  /* 1. JAWABAN SERVER MENGALAHKAN SEGALANYA.

     Dicabut, ditangguhkan, tidak lagi terikat, dan kunci tidak valid semuanya mengembalikan
     perangkat ke halaman Aktivasi Lisensi. Data akademik lokal TIDAK dihapus sama sekali oleh
     keadaan ini - yang diputus hanyalah hak aksesnya sampai lisensi dipulihkan. */
  const pesanBlokir=STATUS_MEMBLOKIR[record.status];
  if(pesanBlokir)
    return {state:record.status,canUseApp:false,canEditData:false,record,message:pesanBlokir,
      offline:offlineGraceStatus(record,now)};

  /* 2. BARU MASA TENGGANG OFFLINE. */
  const tenggang=offlineGraceStatus(record,now);
  if(tenggang.expired)
    /* Lewat 72 jam tanpa verifikasi. Pesannya sengaja TIDAK menyatakan lisensi dicabut, karena
       server memang belum pernah berhasil dihubungi; pengguna cukup menyambungkan internet. */
    return {state:'GRACE_EXPIRED',canUseApp:false,canEditData:false,record,offline:tenggang,
      message:PESAN_PERLU_VERIFIKASI,needsVerification:true};

  if(isCheckDue(record,now)){
    const sisaJam=Math.max(1,Math.ceil(tenggang.remainingMs/JAM));
    return {state:'GRACE',canUseApp:true,canEditData:true,record,offline:tenggang,
      message:`Aplikasi sedang memakai verifikasi lisensi offline. Sambungkan internet dalam ${sisaJam} jam agar lisensi dapat diperiksa ulang.`};
  }
  return {state:'ACTIVE',canUseApp:true,canEditData:true,record,offline:tenggang};
}

/* GERBANG LOGIN.

   Dipanggil dari authenticate() sehingga TIDAK ADA jalur masuk yang dapat melewatinya - baik
   Admin maupun Guru, baik lewat halaman Login maupun pemanggil lain. Yang diputus hanyalah HAK
   AKSES; tidak satu pun data akademik disentuh, dihapus, atau direset oleh fungsi ini.

   Statusnya dibaca dari catatan lokal yang sudah disegarkan `checkLicense()` sesaat sebelum
   login, sehingga pencabutan oleh Owner benar-benar terbaca pada percobaan masuk berikutnya. */
export function assertLicenseAllowsLogin({now=Date.now()}={}){
  /* Setiap percobaan masuk ikut mencatat waktu yang sedang dilihat aplikasi, sehingga jam yang
     dimundurkan setelah pemakaian terakhir tidak dapat memperpanjang masa tenggang. */
  noteClockObservation(now);
  const state=getLicenseState({now});
  if(state.canUseApp)return state;
  const pesan=state.message
    ||(state.state==='UNLICENSED'
      ? 'Perangkat ini belum memiliki lisensi yang sah. Masukkan License Key untuk mengaktifkan aplikasi.'
      : 'Lisensi perangkat ini tidak berlaku. Masukkan License Key yang sah untuk melanjutkan.');
  const error=new Error(pesan);
  error.code='LICENSE_BLOCKED';
  error.licenseState=state.state;
  /* Masa tenggang habis BUKAN pencabutan: pengguna cukup menyambungkan internet. Penanda ini
     dipakai halaman Aktivasi Lisensi untuk menawarkan pemeriksaan ulang, bukan kunci baru. */
  error.needsVerification=Boolean(state.needsVerification);
  throw error;
}

/* Menyegarkan status lisensi ke server sebelum sesi baru dibuat. Kegagalan jaringan sengaja
   tidak dianggap sebagai pencabutan - `checkLicense` sudah memutuskan itu - sehingga sekolah
   yang sedang offline tidak terkunci hanya karena internetnya mati. */
export async function refreshLicenseForLogin(){
  try{await checkLicense({force:true});}catch{}
  return getLicenseState();
}

export function isLicenseActivated(){return Boolean(baca()?.activation_token);}
export function getLicenseRecord(){return baca();}

/* Yang boleh dilihat halaman Admin Sekolah hanyalah bentuk tersamar. Tidak ada tombol apa pun
   di aplikasi sekolah untuk menampilkan kunci utuh atau mengambilnya dari server. */
export function getLicenseDisplay(){
  const record=baca();
  if(!record)return null;
  return {hint:record.license_hint||maskLicenseKey(''),status:record.status,
    installation_id:record.installation_id,last_check:record.last_successful_check_at,
    last_verified_at:record.last_verified_at||record.last_successful_check_at||null};
}
