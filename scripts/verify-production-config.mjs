import { LICENSE_API_BASE, LICENSE_PUBLIC_JWK } from '../src/data/license-config.js';

/* Penjaga build produksi.

   Build produksi HARUS gagal terang-terangan bila aplikasi tidak membawa alamat server lisensi
   atau kunci verifikasi publik. Tanpa penjaga ini, APK dapat terkirim ke sekolah dalam keadaan
   tidak dapat diaktivasi sama sekali — persis kegagalan yang pernah terjadi. */

const masalah=[];

const base=String(LICENSE_API_BASE||'').trim();
if(!base)masalah.push('LICENSE_API_BASE kosong.');
else if(!/^https:\/\/[^\s]+$/.test(base))masalah.push(`LICENSE_API_BASE bukan alamat https yang sah: ${base}`);

const jwk=LICENSE_PUBLIC_JWK;
if(!jwk)masalah.push('LICENSE_PUBLIC_JWK kosong.');
else{
  for(const wajib of ['kty','crv','x','y'])
    if(!jwk[wajib])masalah.push(`LICENSE_PUBLIC_JWK tidak lengkap: ${wajib} kosong.`);
  if(jwk.kty&&jwk.kty!=='EC')masalah.push('LICENSE_PUBLIC_JWK wajib kunci EC.');
  if(jwk.crv&&jwk.crv!=='P-256')masalah.push('LICENSE_PUBLIC_JWK wajib kurva P-256.');
  /* Komponen privat tidak boleh pernah ikut ke aplikasi. */
  if(jwk.d)masalah.push('LICENSE_PUBLIC_JWK memuat komponen PRIVAT (d). Hentikan build.');
}

if(masalah.length){
  console.error('Build produksi dihentikan. Konfigurasi lisensi belum siap:');
  for(const baris of masalah)console.error(`  - ${baris}`);
  console.error('\nIsi environment LICENSE_API_BASE dan LICENSE_PUBLIC_JWK lalu jalankan:');
  console.error('  node scripts/set-license-config.mjs');
  process.exit(1);
}
console.log(`Konfigurasi lisensi produksi siap: ${base}`);
