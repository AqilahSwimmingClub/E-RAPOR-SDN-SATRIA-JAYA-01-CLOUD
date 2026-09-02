import { APP_VERSION } from '../data/version.js';
import { LICENSE_API_BASE } from '../data/license-config.js';
import { compareVersions, isValidVersion } from '../data/version-compare.js';
import { isOfficialDownloadUrl, isSupportedPlatform, UPDATE_CHECK_INTERVAL_HOURS,
  UPDATE_STATUS, UPDATE_STATUS_LABEL, UPDATE_STORAGE_KEY } from '../data/update-config.js';

/* Pembaruan resmi e-Rapor, sisi aplikasi sekolah.

   Tiga janji yang dijaga berkas ini:

   1. Kegagalan memeriksa pembaruan BUKAN masalah lisensi. Tidak ada satu baris pun di sini yang
      menyentuh lisensi, ikatan perangkat, atau database sekolah. Offline hanya berarti status
      pembaruan tidak diketahui, aplikasi tetap dipakai seperti biasa.
   2. Aplikasi tidak pernah mengeksekusi apa pun dari alamat unduhan. Alamat hanya dibuka bila
      berasal dari host resmi, dan pemasangannya tetap keputusan pengguna serta sistem operasi.
   3. Hasil pemeriksaan disimpan di kunci sendiri, di luar DB_KEY, sehingga tidak pernah ikut ke
      berkas backup akademik dan tidak mengubah data sekolah sama sekali. */

const JAM=3600000;

export const UPDATE_MESSAGES=Object.freeze({
  OFFLINE:'Tidak dapat memeriksa pembaruan. Aplikasi tetap dapat digunakan secara offline.',
  NOT_CONFIGURED:'Server pembaruan belum dikonfigurasi pada aplikasi ini.',
  UNSUPPORTED:'Pembaruan otomatis belum tersedia untuk platform ini. Aplikasi tetap dapat digunakan.',
});

export function installedVersion(){return APP_VERSION;}

/* Platform ditentukan dari lingkungan tempat aplikasi berjalan, bukan dari nilai yang boleh
   diketik pengguna. Di luar Android dan Windows, pembaruan otomatis memang belum tersedia. */
export function detectPlatform(env=globalThis){
  if(env?.Capacitor?.getPlatform)return env.Capacitor.getPlatform()==='android'?'android':'';
  const userAgent=String(env?.navigator?.userAgent||'');
  if(/Android/i.test(userAgent))return 'android';
  if(env?.process?.versions?.electron||/Electron/i.test(userAgent))return 'windows';
  if(/Windows NT/i.test(userAgent))return 'windows';
  return '';
}

function baca(){
  try{return JSON.parse(globalThis.localStorage?.getItem(UPDATE_STORAGE_KEY)||'null');}catch{return null;}
}
function tulis(record){
  try{globalThis.localStorage?.setItem(UPDATE_STORAGE_KEY,JSON.stringify(record));}catch{}
  return record;
}
export function getCachedUpdate(){return baca();}
export function clearUpdateCache(){try{globalThis.localStorage?.removeItem(UPDATE_STORAGE_KEY);}catch{}}

export function shouldCheckNow({now=Date.now()}={}){
  const cache=baca();
  if(!cache?.checkedAt)return true;
  return now-new Date(cache.checkedAt).getTime()>=UPDATE_CHECK_INTERVAL_HOURS*JAM;
}

/* Jawaban server dibersihkan sebelum dipakai. Alamat unduhan yang bukan host resmi dibuang,
   bukan sekadar disembunyikan, sehingga tidak mungkin ikut tersimpan lalu dibuka nanti. */
export function sanitizeUpdatePayload(payload,{platform='',version=APP_VERSION}={}){
  if(!payload||typeof payload!=='object')return null;
  const latest=String(payload.latestVersion??'').trim();
  const minimum=String(payload.minimumSupportedVersion??'').trim();
  const url=String(payload.downloadUrl??'').trim();
  const bersih={
    platform:isSupportedPlatform(payload.platform)?String(payload.platform).toLowerCase():platform,
    installedVersion:version,
    latestVersion:isValidVersion(latest)?latest:null,
    minimumSupportedVersion:isValidVersion(minimum)?minimum:null,
    releasedAt:typeof payload.releasedAt==='string'?payload.releasedAt:null,
    notes:String(payload.notes??'').slice(0,4000),
    downloadUrl:isOfficialDownloadUrl(url)?url:null,
    message:String(payload.message??'').slice(0,300),
  };
  /* Keputusan pembaruan dihitung ulang di sini dari angka versi, tidak diambil mentah dari
     server. Server dan aplikasi memakai comparator yang sama, jadi hasilnya konsisten. */
  bersih.updateAvailable=bersih.latestVersion?compareVersions(version,bersih.latestVersion)===-1:false;
  bersih.mandatory=bersih.minimumSupportedVersion?compareVersions(version,bersih.minimumSupportedVersion)===-1:false;
  return bersih;
}

/* Memeriksa pembaruan. Tidak pernah melempar keluar: kegagalan jaringan dilaporkan sebagai
   status, bukan sebagai kesalahan yang menghentikan aplikasi. */
export async function checkForUpdates({force=false,now=Date.now(),fetchImpl=globalThis.fetch,
  apiBase=LICENSE_API_BASE,platform=detectPlatform(),version=APP_VERSION}={}){
  const cache=baca();
  if(!force&&!shouldCheckNow({now}))return statusDari(cache,{platform,version});

  if(!apiBase)return {...statusDari(cache,{platform,version}),status:UPDATE_STATUS.UNKNOWN,message:UPDATE_MESSAGES.NOT_CONFIGURED};
  if(!isSupportedPlatform(platform))
    return {...statusDari(cache,{platform,version}),status:UPDATE_STATUS.UNKNOWN,message:UPDATE_MESSAGES.UNSUPPORTED};
  if(globalThis.navigator&&globalThis.navigator.onLine===false)
    return {...statusDari(cache,{platform,version}),status:UPDATE_STATUS.OFFLINE,message:UPDATE_MESSAGES.OFFLINE};

  try{
    const alamat=`${String(apiBase).replace(/\/+$/,'')}/api/v1/updates/latest`
      +`?platform=${encodeURIComponent(platform)}&version=${encodeURIComponent(version)}`;
    const res=await fetchImpl(alamat,{method:'GET',headers:{accept:'application/json'}});
    if(!res?.ok)throw new Error('Server pembaruan menolak permintaan.');
    const data=await res.json();
    const bersih=sanitizeUpdatePayload(data,{platform,version});
    if(!bersih)throw new Error('Jawaban server pembaruan tidak dikenali.');
    return statusDari(tulis({...bersih,checkedAt:new Date(now).toISOString()}),{platform,version});
  }catch{
    /* Sengaja TIDAK menghapus cache: informasi terakhir yang diketahui tetap berguna, dan
       kegagalan jaringan tidak boleh terlihat seperti masalah lisensi. */
    return {...statusDari(cache,{platform,version}),status:UPDATE_STATUS.OFFLINE,message:UPDATE_MESSAGES.OFFLINE};
  }
}

/* Menerjemahkan catatan tersimpan menjadi satu status yang siap ditampilkan. */
export function statusDari(cache,{platform=detectPlatform(),version=APP_VERSION}={}){
  const dasar={
    platform,installedVersion:version,
    latestVersion:cache?.latestVersion||null,
    minimumSupportedVersion:cache?.minimumSupportedVersion||null,
    releasedAt:cache?.releasedAt||null,
    notes:cache?.notes||'',
    downloadUrl:isOfficialDownloadUrl(cache?.downloadUrl)?cache.downloadUrl:null,
    checkedAt:cache?.checkedAt||null,
    message:'',
  };
  if(!cache?.latestVersion)return {...dasar,status:UPDATE_STATUS.UNKNOWN,label:UPDATE_STATUS_LABEL.UNKNOWN};
  const mandatory=dasar.minimumSupportedVersion?compareVersions(version,dasar.minimumSupportedVersion)===-1:false;
  const tersedia=compareVersions(version,dasar.latestVersion)===-1;
  const status=mandatory?UPDATE_STATUS.MANDATORY:tersedia?UPDATE_STATUS.AVAILABLE:UPDATE_STATUS.LATEST;
  return {...dasar,updateAvailable:tersedia,mandatory,status,label:UPDATE_STATUS_LABEL[status]};
}

export function getUpdateStatus({platform=detectPlatform(),version=APP_VERSION}={}){
  return statusDari(baca(),{platform,version});
}

export function statusLabel(status){return UPDATE_STATUS_LABEL[status]||UPDATE_STATUS_LABEL.UNKNOWN;}
