import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Menyuntikkan konfigurasi lisensi produksi ke src/data/license-config.js sebelum build.

   Keduanya BUKAN rahasia: alamat server hanyalah URL, dan kunci verifikasi memang kunci PUBLIK.
   Kunci PRIVAT penandatangan tidak pernah dibaca skrip ini dan tidak pernah masuk ke aplikasi.

   Dipakai oleh GitHub Actions supaya APK produksi membawa alamat server dan kunci publik yang
   benar tanpa perlu berkas rahasia apa pun di runner. */

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(projectRoot,'src/data/license-config.js');

function jwkDariEnv(nilai){
  const teks=String(nilai??'').trim();
  if(!teks)return null;
  let jwk;
  try{jwk=JSON.parse(teks);}
  catch{throw new Error('LICENSE_PUBLIC_JWK bukan JSON yang sah.');}
  for(const wajib of ['kty','crv','x','y'])
    if(!jwk?.[wajib])throw new Error(`LICENSE_PUBLIC_JWK tidak lengkap: ${wajib} kosong.`);
  if(jwk.kty!=='EC'||jwk.crv!=='P-256')
    throw new Error('LICENSE_PUBLIC_JWK wajib kunci EC P-256.');
  if(jwk.d)throw new Error('LICENSE_PUBLIC_JWK memuat komponen privat (d). Gunakan kunci PUBLIK saja.');
  return {kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y};
}

export function terapkanKonfigurasi(env=process.env,berkas=target){
  const isi=readFileSync(berkas,'utf8');
  const base=String(env.LICENSE_API_BASE??'').trim().replace(/\/+$/,'');
  const jwk=jwkDariEnv(env.LICENSE_PUBLIC_JWK);
  let hasil=isi;
  if(base){
    if(!/^https:\/\//.test(base))throw new Error('LICENSE_API_BASE wajib memakai https.');
    hasil=hasil.replace(/export const LICENSE_API_BASE='[^']*';/,`export const LICENSE_API_BASE='${base}';`);
  }
  if(jwk){
    hasil=hasil.replace(/export const LICENSE_PUBLIC_JWK=[^;]*;/,
      `export const LICENSE_PUBLIC_JWK=Object.freeze(${JSON.stringify(jwk)});`);
  }
  if(hasil!==isi)writeFileSync(berkas,hasil);
  return {base:base||null,jwk:jwk?'terpasang':'tidak diubah'};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const hasil=terapkanKonfigurasi();
  console.log(`Konfigurasi lisensi: base=${hasil.base||'(tidak diubah)'} kunci publik=${hasil.jwk}`);
}
