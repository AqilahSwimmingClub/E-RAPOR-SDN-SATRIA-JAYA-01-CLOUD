import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Memeriksa aset yang benar-benar dikemas, bukan berkas sumbernya.

   Sebuah APK dapat lolos pemeriksaan sumber tetapi tetap membawa konfigurasi lama bila
   `cap sync` belum dijalankan; installer Windows dapat mengemas dist/ yang dibangun sebelum
   konfigurasi disuntikkan. Karena itu yang dibaca di sini adalah berkas hasil pengemasan.

   Tanpa argumen, yang diperiksa adalah aset Android. Argumen pertama boleh menunjuk folder aset
   lain - dipakai job Windows untuk memeriksa dist/ yang benar-benar masuk ke installer. */

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const AKAR_ANDROID='android/app/src/main/assets/public';
const akar=process.argv[2]?String(process.argv[2]):AKAR_ANDROID;
const label=akar===AKAR_ANDROID?'Aset Android':`Aset ${akar}`;
const berkas=resolve(projectRoot,akar,'src/data/license-config.js');

if(!existsSync(berkas)){
  console.error(`${label} belum ada: ${berkas}`);
  console.error(akar===AKAR_ANDROID
    ?'Jalankan "npm run build && npx cap sync android" lebih dulu.'
    :'Jalankan "npm run build:production" lebih dulu.');
  process.exit(1);
}

const isi=readFileSync(berkas,'utf8');
const masalah=[];
const base=isi.match(/export const LICENSE_API_BASE='([^']*)';/)?.[1]??'';
if(!base)masalah.push(`LICENSE_API_BASE kosong di ${label}.`);
else if(!/^https:\/\//.test(base))masalah.push(`LICENSE_API_BASE bukan https: ${base}`);

const jwk=isi.match(/export const LICENSE_PUBLIC_JWK=([^;]*);/)?.[1]?.trim()??'';
if(!jwk||jwk==='null')masalah.push(`LICENSE_PUBLIC_JWK kosong di ${label}.`);
else{
  for(const wajib of ['"kty"','"crv"','"x"','"y"'])
    if(!jwk.includes(wajib))masalah.push(`LICENSE_PUBLIC_JWK tidak lengkap: ${wajib} tidak ada.`);
  if(/"d"\s*:/.test(jwk))masalah.push(`${label} memuat komponen PRIVAT (d). Hentikan build.`);
}

/* Tidak boleh ada bahan rahasia server yang ikut terbawa ke aset aplikasi. */
for(const rahasia of ['BEGIN PRIVATE KEY','LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY','OWNER_PASSWORD'])
  if(isi.includes(rahasia))masalah.push(`${label} memuat rahasia server: ${rahasia}`);

if(masalah.length){
  console.error(`${label} belum siap produksi:`);
  for(const baris of masalah)console.error(`  - ${baris}`);
  process.exit(1);
}
console.log(`${label} membawa konfigurasi produksi: ${base}`);
