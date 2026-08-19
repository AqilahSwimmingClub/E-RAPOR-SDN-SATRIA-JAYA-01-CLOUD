import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const skrip=path.join(root,'scripts','ubah-password-signing.mjs');
const read=berkas=>readFileSync(path.join(root,berkas),'utf8');

const STORE_LAMA='Pw\\Sto:re=123 x';
const KEY_LAMA='Pw\\Ku:nci=456 y';
const escape=nilai=>nilai.replace(/\\/g,'\\\\');

function siapkan(){
  const folder=mkdtempSync(path.join(tmpdir(),'erapor-ganti-'));
  const keystore=path.join(folder,'erapor-release.jks');
  execFileSync('keytool',['-genkeypair','-keystore',keystore,'-storetype','JKS','-alias','erapor-release',
    '-keyalg','RSA','-keysize','2048','-validity','30','-storepass',STORE_LAMA,'-keypass',KEY_LAMA,
    '-dname','CN=e-Rapor, O=SDN, C=ID'],{stdio:'ignore'});
  const properties=path.join(folder,'signing.properties');
  writeFileSync(properties,`storeFile=${keystore.replace(/\\/g,'/')}\nstorePassword=${escape(STORE_LAMA)}\nkeyAlias=erapor-release\nkeyPassword=${escape(KEY_LAMA)}\n`,'utf8');
  return {folder,keystore,properties};
}
const jalankan=(args,properties,tambahan=[])=>execFileSync('node',[skrip,...args,'--properties',properties,...tambahan],{encoding:'utf8'});
const gagal=perintah=>{try{perintah();return '';}catch(error){return String(error.stderr||error.message);}};
const sidikJari=(keystore,storePassword)=>execFileSync('keytool',['-list','-v','-keystore',keystore,'-storepass',storePassword,'-alias','erapor-release'],{encoding:'utf8'}).match(/SHA256:\s*([0-9A-F:]+)/i)?.[1];
const isiBerkas=berkas=>createHash('sha256').update(readFileSync(berkas)).digest('hex');

test('1. Perintah signing:ganti-password terdaftar dan ikut diperiksa npm run check',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['signing:ganti-password'],'node scripts/ubah-password-signing.mjs');
  assert.match(pkg.scripts.check,/node --check scripts\/ubah-password-signing\.mjs/);
});

test('2. Kunci penandatanganan tidak berubah, hanya passwordnya',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    /* Inilah jaminan terpenting: sidik jari sertifikat harus sama persis sebelum dan sesudah,
       karena itulah yang menentukan APK baru masih dianggap aplikasi yang sama oleh Android. */
    const sebelum=sidikJari(keystore,STORE_LAMA);
    jalankan(['230191'],properties);
    const sesudah=sidikJari(keystore,'230191');
    assert.equal(sesudah,sebelum,'sidik jari sertifikat tidak boleh berubah');
    assert.ok(sebelum,'sidik jari terbaca');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('3. Kunci privat tetap dapat dipakai dengan password baru',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    jalankan(['230191'],properties);
    const permintaan=execFileSync('keytool',['-certreq','-alias','erapor-release','-keystore',keystore,'-storepass','230191','-keypass','230191'],{encoding:'utf8'});
    assert.match(permintaan,/BEGIN NEW CERTIFICATE REQUEST/,'kunci privat terbuka dengan password baru');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('4. Catatan signing.properties ikut diperbarui dan tetap terbaca Gradle',()=>{
  const {folder,properties}=siapkan();
  try{
    jalankan(['230191'],properties);
    const isi=readFileSync(properties,'utf8');
    assert.match(isi,/^storePassword=230191$/m);
    assert.match(isi,/^keyPassword=230191$/m);
    assert.match(isi,/^keyAlias=erapor-release$/m,'alias tidak ikut berubah');
    assert.match(isi,/^storeFile=.+erapor-release\.jks$/m,'lokasi keystore tetap');
    assert.equal(existsSync(`${properties}.sementara`),false,'berkas sementara tidak tertinggal');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('5. Salinan keystore lama dibuat sebelum berkasnya ditulis ulang',()=>{
  const {folder,properties}=siapkan();
  try{
    const keluaran=jalankan(['230191'],properties);
    assert.match(keluaran,/Cadangan {2}: .+\.cadangan-/,'lokasi cadangan disebutkan');
    const cadangan=readdirSync(folder).filter(nama=>nama.includes('.cadangan-'));
    assert.equal(cadangan.length,1,'ada satu berkas cadangan');
    assert.equal(sidikJari(path.join(folder,cadangan[0]),STORE_LAMA),sidikJari(path.join(folder,'erapor-release.jks'),'230191'),
      'cadangan memuat kunci yang sama, hanya passwordnya yang lama');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('6. Dijalankan dua kali tidak mengubah apa pun',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    jalankan(['230191'],properties);
    const sebelum=isiBerkas(keystore);
    const keluaran=jalankan(['230191'],properties);
    assert.match(keluaran,/sudah sama dengan yang diminta\. Tidak ada yang diubah/);
    assert.equal(isiBerkas(keystore),sebelum,'keystore tidak disentuh pada percobaan kedua');
    assert.equal(readdirSync(folder).filter(nama=>nama.includes('.cadangan-')).length,1,'tidak menumpuk cadangan baru');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('7. Password terlalu pendek dan password kosong ditolak sebelum apa pun diubah',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    const sebelum=isiBerkas(keystore);
    assert.match(gagal(()=>jalankan(['12345'],properties)),/hanya 5 karakter[\s\S]*minimal 6 karakter/,'password pendek ditolak');
    assert.match(gagal(()=>jalankan([],properties)),/Password baru belum disebutkan/);
    assert.equal(isiBerkas(keystore),sebelum,'keystore tidak tersentuh');
    assert.match(readFileSync(properties,'utf8'),/storePassword=Pw\\\\Sto:re=123 x/,'catatan lama tetap');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('8. Password lama yang salah dihentikan sebelum keystore disentuh',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    const sebelum=isiBerkas(keystore);
    const salah=path.join(folder,'salah.properties');
    writeFileSync(salah,readFileSync(properties,'utf8').replace(/storePassword=.*/,'storePassword=salahsekali'),'utf8');
    assert.match(gagal(()=>jalankan(['230191'],salah)),/Password keystore yang tercatat[\s\S]*KEYSTORE-CREDENTIALS\.txt/);
    assert.equal(isiBerkas(keystore),sebelum,'keystore tidak tersentuh');
    assert.equal(readdirSync(folder).some(nama=>nama.includes('.cadangan-')),false,'cadangan belum sempat dibuat');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('9. Keystore dikembalikan utuh bila keytool gagal di tengah jalan',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    /* keytool tiruan: pemeriksaan lolos, tetapi -storepasswd merusak berkas lalu gagal. */
    const tiruan=path.join(folder,'keytool-gagal');
    writeFileSync(tiruan,`#!/bin/bash\nfor arg in "$@"; do\n  if [ "$arg" = "-storepasswd" ]; then\n    for ((i=1;i<=$#;i++)); do if [ "\${!i}" = "-keystore" ]; then j=$((i+1)); printf 'RUSAK' > "\${!j}"; fi; done\n    echo "keytool error: sengaja gagal untuk uji" >&2; exit 1\n  fi\ndone\nexec keytool "$@"\n`,'utf8');
    chmodSync(tiruan,0o755);
    const sebelum=isiBerkas(keystore);
    const pesan=gagal(()=>jalankan(['999999'],properties,['--keytool',tiruan]));
    assert.match(pesan,/keytool gagal mengganti password keystore/);
    assert.match(pesan,/Keystore sudah dikembalikan dari/,'menyebutkan pemulihan');
    assert.equal(isiBerkas(keystore),sebelum,'keystore kembali persis seperti semula');
    assert.match(readFileSync(properties,'utf8'),/storePassword=Pw\\\\Sto:re=123 x/,'catatan tidak ikut berubah');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('10. Skrip menuntun langkah berikutnya dan aman di Windows',()=>{
  const isi=read('scripts/ubah-password-signing.mjs');
  assert.match(isi,/fileURLToPath\(import\.meta\.url\)/,'lokasi proyek dihitung dengan fileURLToPath');
  assert.equal(/new URL\(import\.meta\.url\)\.pathname/.test(isi),false);
  /* Ketiga secret wajib diperbarui karena isi berkas keystore ikut berubah. */
  for(const secret of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_PASSWORD'])
    assert.ok(isi.includes(secret),`pesan penutup menyebut ${secret}`);
  assert.match(isi,/ANDROID_KEY_ALIAS tidak berubah/);
  /* Password baru tidak pernah dicetak apa adanya ke layar. */
  assert.match(isi,/'\*'\.repeat\(passwordBaru\.length\)/,'password baru ditampilkan tersamar');
  for(const berbahaya of ['fetch(','https:','unlinkSync','rmSync'])
    assert.equal(isi.includes(berbahaya),false,`skrip tidak boleh memakai ${berbahaya}`);
});
