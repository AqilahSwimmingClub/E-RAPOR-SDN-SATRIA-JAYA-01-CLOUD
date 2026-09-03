import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Memeriksa aset yang benar-benar disalin ke proyek Android, bukan berkas sumbernya.

   Sebuah APK dapat lolos pemeriksaan sumber tetapi tetap membawa konfigurasi lama bila
   `cap sync` belum dijalankan. Karena itu yang dibaca di sini adalah berkas di dalam
   android/app/src/main/assets/public. */

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const berkas=resolve(projectRoot,'android/app/src/main/assets/public/src/data/license-config.js');

if(!existsSync(berkas)){
  console.error(`Aset Android belum ada: ${berkas}`);
  console.error('Jalankan "npm run build && npx cap sync android" lebih dulu.');
  process.exit(1);
}

const isi=readFileSync(berkas,'utf8');
const masalah=[];
const base=isi.match(/export const LICENSE_API_BASE='([^']*)';/)?.[1]??'';
if(!base)masalah.push('LICENSE_API_BASE kosong di aset Android.');
else if(!/^https:\/\//.test(base))masalah.push(`LICENSE_API_BASE bukan https: ${base}`);

const jwk=isi.match(/export const LICENSE_PUBLIC_JWK=([^;]*);/)?.[1]?.trim()??'';
if(!jwk||jwk==='null')masalah.push('LICENSE_PUBLIC_JWK kosong di aset Android.');
else{
  for(const wajib of ['"kty"','"crv"','"x"','"y"'])
    if(!jwk.includes(wajib))masalah.push(`LICENSE_PUBLIC_JWK tidak lengkap: ${wajib} tidak ada.`);
  if(/"d"\s*:/.test(jwk))masalah.push('Aset Android memuat komponen PRIVAT (d). Hentikan build.');
}

/* Tidak boleh ada bahan rahasia server yang ikut terbawa ke aset aplikasi. */
for(const rahasia of ['BEGIN PRIVATE KEY','LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY','OWNER_PASSWORD'])
  if(isi.includes(rahasia))masalah.push(`Aset Android memuat rahasia server: ${rahasia}`);

if(masalah.length){
  console.error('Aset Android belum siap produksi:');
  for(const baris of masalah)console.error(`  - ${baris}`);
  process.exit(1);
}
console.log(`Aset Android membawa konfigurasi produksi: ${base}`);
