import { nowIso } from './db.js';
import { LicenseError, logEvent } from './licenses.js';

/* TAUTAN UNDUHAN RESMI.

   Berkas pemasang e-Rapor tidak disimpan di repositori dan tidak dilayani oleh server ini.
   Yang disimpan hanyalah ALAMATNYA, satu baris per platform, dan hanya Pemilik yang boleh
   mengubahnya lewat sesi Owner.

   Alamatnya sengaja dibuat dapat diatur, bukan ditanam di kode: penyimpanan berkas dapat
   berpindah (MediaFire, Google Drive, atau lainnya) tanpa perlu merilis ulang aplikasi
   maupun halaman pembelian.

   Bila sebuah platform belum punya alamat, ia TIDAK dikarang: halaman pembelian menampilkan
   "Belum tersedia" apa adanya. */

export const DOWNLOAD_PLATFORMS=Object.freeze(['android','windows']);

function bersih(nilai,batas=300){return String(nilai??'').replace(/\s+/g,' ').trim().slice(0,batas);}

/* Hanya http/https yang diterima. Skema lain - terutama javascript: dan data: - tidak pernah
   boleh sampai ke atribut href halaman publik. */
export function normalizeDownloadUrl(nilai){
  const teks=bersih(nilai,600);
  if(!teks)return '';
  let url;
  try{url=new URL(teks);}catch{throw new LicenseError('URL_TIDAK_VALID','Alamat unduhan harus berupa URL lengkap yang diawali https://.',400);}
  if(!['http:','https:'].includes(url.protocol))
    throw new LicenseError('URL_TIDAK_VALID','Alamat unduhan hanya boleh memakai http atau https.',400);
  return url.toString();
}

export function normalizePlatform(nilai){
  const platform=bersih(nilai,20).toLowerCase();
  if(!DOWNLOAD_PLATFORMS.includes(platform))
    throw new LicenseError('PLATFORM_TIDAK_DIKENAL','Platform unduhan hanya android atau windows.',400);
  return platform;
}

export async function listDownloads(store){
  const hasil=await store.query('SELECT * FROM release_downloads ORDER BY platform ASC');
  const tersimpan=new Map(hasil.rows.map(baris=>[baris.platform,baris]));
  /* Kedua platform SELALU dikembalikan, termasuk yang belum diisi. Halaman pembelian
     memerlukan barisnya untuk menampilkan "Belum tersedia" secara jujur, bukan
     menyembunyikan platformnya seolah-olah tidak pernah ada. */
  return DOWNLOAD_PLATFORMS.map(platform=>{
    const baris=tersimpan.get(platform);
    return {
      platform,
      url:baris?.url||'',
      version:baris?.version||'',
      size_text:baris?.size_text||'',
      notes:baris?.notes||'',
      available:Boolean(baris?.url),
      updated_at:baris?.updated_at||null,
    };
  });
}

export async function setDownload(store,input={},{actor='owner'}={}){
  const platform=normalizePlatform(input?.platform);
  const url=normalizeDownloadUrl(input?.url);
  const version=bersih(input?.version,40);
  const ukuran=bersih(input?.sizeText??input?.size_text,40);
  const catatan=bersih(input?.notes,400);
  const waktu=nowIso();
  const ada=await store.one('SELECT platform FROM release_downloads WHERE platform=$1',[platform]);
  if(ada)
    await store.run(`UPDATE release_downloads SET url=$1,version=$2,size_text=$3,notes=$4,
      updated_at=$5,updated_by=$6 WHERE platform=$7`,[url||null,version||null,ukuran||null,catatan||null,waktu,actor,platform]);
  else
    await store.run(`INSERT INTO release_downloads(platform,url,version,size_text,notes,updated_at,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[platform,url||null,version||null,ukuran||null,catatan||null,waktu,actor]);
  await logEvent(store,{type:url?'DOWNLOAD_LINK_SET':'DOWNLOAD_LINK_CLEARED',actor,detail:{platform,version}});
  return (await listDownloads(store)).find(item=>item.platform===platform);
}
