import { newId } from './crypto.js';
import { LicenseError } from './licenses.js';
import { compareVersions, isValidVersion } from '../../src/data/version-compare.js';
import { isOfficialDownloadUrl, isSupportedPlatform, OFFICIAL_DOWNLOAD_HOSTS,
  UPDATE_PLATFORMS } from '../../src/data/update-config.js';

/* Katalog pembaruan resmi e-Rapor.

   Modul ini HANYA melayani metadata rilis. Ia tidak pernah mengunduh, memasang, menjalankan,
   atau mengeksekusi apa pun, dan tidak pernah menyentuh tabel lisensi maupun perangkat. Karena
   itu kegagalan di sini tidak dapat mencabut lisensi, melepas ikatan perangkat, atau menghapus
   data sekolah.

   Perbandingan versi memakai comparator yang sama persis dengan aplikasi sekolah
   (src/data/version-compare.js), sehingga keputusan "sudah terbaru" atau "wajib update" tidak
   pernah berbeda antara server dan klien.

   Data dari client TIDAK dipercaya: platform wajib ada di daftar yang didukung dan versi
   terpasang wajib berbentuk angka yang sah. Selebihnya seluruh jawaban berasal dari baris yang
   memang disimpan Pemilik. */

const BATAS_CATATAN=4000;

/* Host resmi dapat ditambah lewat environment server bila kelak rilis dipindahkan, tanpa perlu
   mengubah kode maupun membangun ulang aplikasi sekolah. Tetap daftar-putih, tetap server-side. */
export function officialHosts(env=process.env){
  const tambahan=String(env?.UPDATE_DOWNLOAD_HOSTS||'')
    .split(',').map(item=>item.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...OFFICIAL_DOWNLOAD_HOSTS,...tambahan])];
}

function teks(value,batas){return String(value??'').trim().slice(0,batas);}
function bool(value){return value===true||value===1||value==='1'||value==='true';}

/* ----------------------------------------------------------------- Validasi masukan Pemilik */

export function normalizeVersionInput(input,{hosts=officialHosts()}={}){
  const platform=teks(input?.platform,20).toLowerCase();
  if(!isSupportedPlatform(platform))
    throw new LicenseError('INVALID_PLATFORM',`Platform wajib salah satu dari: ${UPDATE_PLATFORMS.join(', ')}.`,400);

  const version=teks(input?.version,20);
  if(!isValidVersion(version))
    throw new LicenseError('INVALID_VERSION','Versi wajib berbentuk angka seperti 1.2.2.',400);

  const minSupported=teks(input?.min_supported_version??input?.minSupportedVersion,20);
  if(minSupported&&!isValidVersion(minSupported))
    throw new LicenseError('INVALID_VERSION','Versi minimum yang didukung wajib berbentuk angka seperti 1.2.0.',400);
  if(minSupported&&compareVersions(minSupported,version)===1)
    throw new LicenseError('INVALID_VERSION','Versi minimum yang didukung tidak boleh lebih baru daripada versi rilis.',400);

  const kodeMentah=input?.version_code??input?.versionCode;
  let versionCode=null;
  if(kodeMentah!==null&&kodeMentah!==undefined&&String(kodeMentah).trim()!==''){
    versionCode=Number(kodeMentah);
    if(!Number.isInteger(versionCode)||versionCode<0)
      throw new LicenseError('INVALID_VERSION_CODE','Version code wajib bilangan bulat tidak negatif.',400);
  }

  const downloadUrl=teks(input?.download_url??input?.downloadUrl,500);
  if(downloadUrl&&!isOfficialDownloadUrl(downloadUrl,hosts))
    throw new LicenseError('INVALID_DOWNLOAD_URL',
      `Alamat unduhan wajib https dan berada pada host resmi: ${hosts.join(', ')}.`,400);

  const releasedAtMentah=teks(input?.released_at??input?.releasedAt,40);
  let releasedAt=new Date().toISOString();
  if(releasedAtMentah){
    const waktu=new Date(releasedAtMentah);
    if(Number.isNaN(waktu.getTime()))
      throw new LicenseError('INVALID_RELEASED_AT','Tanggal rilis tidak dapat dibaca.',400);
    releasedAt=waktu.toISOString();
  }

  return {
    platform,version,versionCode,
    minSupportedVersion:minSupported||null,
    notes:teks(input?.notes,BATAS_CATATAN)||null,
    downloadUrl:downloadUrl||null,
    releasedAt,
    published:bool(input?.published),
  };
}

/* --------------------------------------------------------------------- Pengelolaan Pemilik */

export async function createAppVersion(store,input,{actor='owner',hosts=officialHosts()}={}){
  const nilai=normalizeVersionInput(input,{hosts});
  const kembar=await store.one('SELECT id FROM app_versions WHERE platform=$1 AND version=$2',
    [nilai.platform,nilai.version]);
  if(kembar)throw new LicenseError('VERSION_EXISTS',`Versi ${nilai.version} untuk ${nilai.platform} sudah terdaftar.`,409);
  const id=newId('ver');
  await store.run(`INSERT INTO app_versions
      (id,platform,version,version_code,min_supported_version,notes,released_at,download_url,published,created_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id,nilai.platform,nilai.version,nilai.versionCode,nilai.minSupportedVersion,nilai.notes,
      nilai.releasedAt,nilai.downloadUrl,nilai.published,new Date().toISOString(),String(actor).slice(0,80)]);
  return appVersionById(store,id);
}

export async function appVersionById(store,id){
  const baris=await store.one('SELECT * FROM app_versions WHERE id=$1',[String(id)]);
  return baris?bentuk(baris):null;
}

export async function listAppVersions(store,{platform=null}={}){
  const hasil=platform
    ? await store.query('SELECT * FROM app_versions WHERE platform=$1',[String(platform).toLowerCase()])
    : await store.query('SELECT * FROM app_versions',[]);
  return hasil.rows.map(bentuk).sort(urutTerbaruDulu);
}

export async function setAppVersionPublished(store,id,published,{actor='owner'}={}){
  const ada=await appVersionById(store,id);
  if(!ada)throw new LicenseError('NOT_FOUND','Versi aplikasi tidak ditemukan.',404);
  /* Versi hanya boleh diterbitkan bila alamat unduhannya sudah ada, supaya sekolah tidak pernah
     melihat "Pembaruan Tersedia" tanpa cara mendapatkannya. */
  if(published&&!ada.downloadUrl)
    throw new LicenseError('DOWNLOAD_URL_REQUIRED','Isi alamat unduhan resmi sebelum menerbitkan versi ini.',400);
  await store.run('UPDATE app_versions SET published=$1 WHERE id=$2',[Boolean(published),String(id)]);
  return {...await appVersionById(store,id),actor};
}

export async function deleteAppVersion(store,id){
  const ada=await appVersionById(store,id);
  if(!ada)throw new LicenseError('NOT_FOUND','Versi aplikasi tidak ditemukan.',404);
  await store.run('DELETE FROM app_versions WHERE id=$1',[String(id)]);
  return ada;
}

function bentuk(baris){
  return {
    id:baris.id,
    platform:baris.platform,
    version:baris.version,
    versionCode:baris.version_code===null||baris.version_code===undefined?null:Number(baris.version_code),
    minSupportedVersion:baris.min_supported_version||null,
    notes:baris.notes||'',
    downloadUrl:baris.download_url||null,
    releasedAt:baris.released_at instanceof Date?baris.released_at.toISOString():(baris.released_at||null),
    published:bool(baris.published),
    createdAt:baris.created_at instanceof Date?baris.created_at.toISOString():(baris.created_at||null),
    createdBy:baris.created_by||null,
  };
}

/* Urutan ditentukan oleh perbandingan angka versi, bukan oleh ORDER BY teks: pada SQL biasa
   '1.9.9' terurut setelah '1.10.0', dan itu keliru. */
function urutTerbaruDulu(a,b){
  if(a.platform!==b.platform)return a.platform.localeCompare(b.platform);
  return (compareVersions(b.version,a.version)??0)||String(b.releasedAt||'').localeCompare(String(a.releasedAt||''));
}

/* -------------------------------------------------------------- Jawaban untuk aplikasi sekolah */

export async function latestUpdate(store,{platform,version=''}={}){
  const platformBersih=String(platform??'').trim().toLowerCase();
  if(!isSupportedPlatform(platformBersih))
    throw new LicenseError('INVALID_PLATFORM',`Platform wajib salah satu dari: ${UPDATE_PLATFORMS.join(', ')}.`,400);

  const terpasang=String(version??'').trim();
  if(terpasang&&!isValidVersion(terpasang))
    throw new LicenseError('INVALID_VERSION','Versi terpasang yang dikirim aplikasi tidak dikenali.',400);

  const daftar=(await listAppVersions(store,{platform:platformBersih})).filter(item=>item.published);
  const terbaru=daftar[0]||null;

  if(!terbaru){
    return {
      implemented:true,platform:platformBersih,
      installedVersion:terpasang||null,
      latestVersion:null,minimumSupportedVersion:null,
      updateAvailable:false,mandatory:false,
      releasedAt:null,notes:'',downloadUrl:null,
      message:'Belum ada rilis resmi yang diterbitkan untuk platform ini.',
    };
  }

  /* Tanpa versi terpasang yang sah, server hanya melaporkan rilis terbaru apa adanya dan TIDAK
     mengarang keputusan pembaruan. */
  const bandingTerbaru=terpasang?compareVersions(terpasang,terbaru.version):null;
  const minimum=terbaru.minSupportedVersion;
  const bandingMinimum=terpasang&&minimum?compareVersions(terpasang,minimum):null;

  return {
    implemented:true,platform:platformBersih,
    installedVersion:terpasang||null,
    latestVersion:terbaru.version,
    latestVersionCode:terbaru.versionCode,
    minimumSupportedVersion:minimum,
    updateAvailable:bandingTerbaru===-1,
    mandatory:bandingMinimum===-1,
    releasedAt:terbaru.releasedAt,
    notes:terbaru.notes,
    downloadUrl:terbaru.downloadUrl,
  };
}
