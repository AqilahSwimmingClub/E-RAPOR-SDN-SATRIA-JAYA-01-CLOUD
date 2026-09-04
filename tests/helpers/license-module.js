import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Memuat src/services/license.js APA ADANYA, tetapi dengan konfigurasi lisensi yang menunjuk
   ke server uji.

   LICENSE_PUBLIC_JWK di repo sengaja null - kunci publik produksi baru ditanam saat build oleh
   scripts/set-license-config.mjs. Akibatnya seluruh jalur jaringan layanan lisensi (aktivasi,
   pemeriksaan berkala, pembedaan REVOKED dengan gagal-jaringan) tidak pernah dapat dijalankan
   oleh test biasa: panggil() berhenti lebih dulu dengan NOT_CONFIGURED.

   Karena itu berkas sumbernya disalin ke berkas sementara dengan TIGA specifier import yang
   diubah - isinya tidak disentuh sama sekali - lalu diarahkan ke konfigurasi uji yang memuat
   kunci publik server uji. Yang diuji tetap kode sungguhan, bukan tiruan. */

const root=new URL('../../',import.meta.url);
const tmpDir=new URL('../.tmp/',import.meta.url);

export async function loadLicenseService({publicJwk,apiBase}){
  mkdirSync(fileURLToPath(tmpDir),{recursive:true});
  const id=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const configPath=new URL(`license-config-${id}.js`,tmpDir);
  const servicePath=new URL(`license-${id}.js`,tmpDir);

  /* Nilai yang tidak ditimpa tetap diambil dari konfigurasi sungguhan, sehingga batas 72 jam
     dan toleransi jam yang diuji benar-benar nilai yang dipakai aplikasi. */
  writeFileSync(fileURLToPath(configPath),
    `export * from '${new URL('src/data/license-config.js',root).href}';\n`
    +`export const LICENSE_PUBLIC_JWK=${JSON.stringify(publicJwk)};\n`
    +`export const LICENSE_API_BASE=${JSON.stringify(apiBase)};\n`);

  const sumber=readFileSync(fileURLToPath(new URL('src/services/license.js',root)),'utf8')
    .replace("'../data/license-config.js'",JSON.stringify(configPath.href))
    .replace("'./installation.js'",JSON.stringify(new URL('src/services/installation.js',root).href))
    .replace("'../data/version.js'",JSON.stringify(new URL('src/data/version.js',root).href));
  writeFileSync(fileURLToPath(servicePath),sumber);

  const modul=await import(servicePath.href);
  return {modul,cleanup(){for(const berkas of [configPath,servicePath])rmSync(fileURLToPath(berkas),{force:true});}};
}
