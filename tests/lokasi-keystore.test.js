import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const skrip=path.join(root,'scripts','perbaiki-lokasi-keystore.mjs');
const read=berkas=>readFileSync(path.join(root,berkas),'utf8');
const PASSWORD='Rahasia123';

/* Meniru keadaan nyata: folder proyek diunduh ulang, sedangkan keystore masih berada di folder
   proyek yang lama, sehingga baris storeFile menunjuk ke alamat yang sudah tidak ada. */
function siapkan(){
  const folder=mkdtempSync(path.join(tmpdir(),'erapor-lokasi-'));
  const rumah=path.join(folder,'rumah','Downloads','proyek-lama','release-signing');
  mkdirSync(rumah,{recursive:true});
  mkdirSync(path.join(folder,'proyek','android'),{recursive:true});
  const keystore=path.join(rumah,'erapor-release.jks');
  execFileSync('keytool',['-genkeypair','-keystore',keystore,'-storetype','JKS','-alias','erapor-release',
    '-keyalg','RSA','-keysize','2048','-validity','30','-storepass',PASSWORD,'-keypass',PASSWORD,
    '-dname','CN=e-Rapor, O=SDN, C=ID'],{stdio:'ignore'});
  writeFileSync(path.join(rumah,'KEYSTORE-CREDENTIALS.txt'),'RELEASE SIGNING\nAlias: erapor-release\n','utf8');
  const properties=path.join(folder,'proyek','android','signing.properties');
  const alamatLama=path.join(folder,'proyek-lama-hilang','erapor-release.jks').replace(/\\/g,'/');
  writeFileSync(properties,`storeFile=${alamatLama}\nstorePassword=${PASSWORD}\nkeyAlias=erapor-release\nkeyPassword=${PASSWORD}\n`,'utf8');
  return {folder,rumah:path.join(folder,'rumah'),keystore,properties,alamatLama};
}
const jalankan=(args,properties,tambahan=[])=>execFileSync('node',[skrip,...args,'--properties',properties,...tambahan],{encoding:'utf8'});
const gagal=perintah=>{try{perintah();return '';}catch(error){return String(error.stderr||error.message);}};
const isiBerkas=berkas=>createHash('sha256').update(readFileSync(berkas)).digest('hex');

test('1. Perintah signing:lokasi terdaftar dan ikut diperiksa npm run check',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['signing:lokasi'],'node scripts/perbaiki-lokasi-keystore.mjs');
  assert.match(pkg.scripts.check,/node --check scripts\/perbaiki-lokasi-keystore\.mjs/);
});

test('2. Keystore di folder proyek lama ditemukan dan storeFile dibetulkan',()=>{
  const {folder,rumah,keystore,properties,alamatLama}=siapkan();
  try{
    const keluaran=jalankan([],properties,['--cari-di',rumah]);
    assert.match(keluaran,/Keystore ditemukan/);
    assert.ok(keluaran.includes(keystore),'alamat sebenarnya ditampilkan');
    assert.match(keluaran,/SHA256|Sidik jari {2}: [0-9A-F:]{20,}/i,'sidik jari sertifikat ikut ditampilkan');
    const isi=readFileSync(properties,'utf8');
    assert.match(isi,new RegExp(`^storeFile=${keystore.replace(/\\/g,'/').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'m'),'storeFile menunjuk alamat baru');
    assert.equal(isi.includes(alamatLama),false,'alamat lama tidak tersisa');
    assert.match(isi,/^storePassword=Rahasia123$/m,'password tidak diubah');
    assert.match(isi,/^keyAlias=erapor-release$/m,'alias tidak diubah');
    assert.equal(existsSync(`${properties}.sementara`),false,'berkas sementara tidak tertinggal');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('3. Berkas keystore tidak pernah diubah oleh perintah ini',()=>{
  const {folder,rumah,keystore,properties}=siapkan();
  try{
    const sebelum=isiBerkas(keystore);
    jalankan([],properties,['--cari-di',rumah]);
    assert.equal(isiBerkas(keystore),sebelum,'isi keystore sama persis');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('4. Alamat keystore boleh disebutkan langsung',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    const keluaran=jalankan([keystore],properties);
    assert.match(keluaran,/Alamat baru : /);
    assert.ok(readFileSync(properties,'utf8').includes(keystore.replace(/\\/g,'/')));
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('5. Dijalankan lagi saat alamat sudah benar tidak mengubah apa pun',()=>{
  const {folder,rumah,properties}=siapkan();
  try{
    jalankan([],properties,['--cari-di',rumah]);
    const sebelum=readFileSync(properties,'utf8');
    assert.match(jalankan([],properties,['--cari-di',rumah]),/Alamat keystore sudah benar/);
    assert.equal(readFileSync(properties,'utf8'),sebelum);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('6. Keystore milik proyek lain ditolak, catatan tidak ikut berubah',()=>{
  const {folder,properties}=siapkan();
  try{
    const asing=path.join(folder,'erapor-release.jks');
    execFileSync('keytool',['-genkeypair','-keystore',asing,'-storetype','JKS','-alias','erapor-release',
      '-keyalg','RSA','-keysize','2048','-validity','30','-storepass','PasswordLain999','-keypass','PasswordLain999',
      '-dname','CN=Lain, O=X, C=ID'],{stdio:'ignore'});
    const sebelum=readFileSync(properties,'utf8');
    assert.match(gagal(()=>jalankan([asing],properties)),/tidak cocok dengan password atau alias[\s\S]*KEYSTORE-CREDENTIALS\.txt/);
    assert.equal(readFileSync(properties,'utf8'),sebelum,'signing.properties tidak disentuh');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('7. Bila keystore memang tidak ada, pesannya menuntun ke panduan',()=>{
  const {folder,properties}=siapkan();
  try{
    const kosong=path.join(folder,'kosong');mkdirSync(kosong,{recursive:true});
    const pesan=gagal(()=>jalankan([],properties,['--cari-di',kosong]));
    assert.match(pesan,/erapor-release\.jks tidak ditemukan/);
    assert.match(pesan,/flashdisk, hard disk lain, atau folder cadangan/);
    assert.match(pesan,/docs\/BUILD-OTOMATIS\.md/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('8. Catatan credential yang ditemukan ikut ditunjukkan',()=>{
  const {folder,rumah,properties}=siapkan();
  try{
    const keluaran=jalankan([],properties,['--cari-di',rumah]);
    assert.match(keluaran,/Catatan credential ditemukan/);
    assert.ok(keluaran.includes('KEYSTORE-CREDENTIALS.txt'),'berkas berisi alias dan password ikut disebut');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('9. Skrip aman di Windows dan tidak menyentuh berkas lain',()=>{
  const isi=read('scripts/perbaiki-lokasi-keystore.mjs');
  assert.match(isi,/fileURLToPath\(import\.meta\.url\)/,'lokasi proyek dihitung dengan fileURLToPath');
  assert.equal(/new URL\(import\.meta\.url\)\.pathname/.test(isi),false);
  assert.ok(isi.includes(String.raw`keystore.replace(/\\/g,'/')`),'alamat ditulis dengan garis miring untuk Gradle');
  /* Penelusuran dibatasi supaya tidak menyisir seluruh disk dan tidak menggantung. */
  assert.match(isi,/batasWaktu=25000/,'ada batas waktu penelusuran');
  assert.match(isi,/kedalaman=6/,'ada batas kedalaman folder');
  assert.match(isi,/LEWATI=new Set\(\[[^\]]*'node_modules'/,'folder besar dilewati');
  for(const berbahaya of ['fetch(','https:','unlinkSync','rmSync','copyFileSync'])
    assert.equal(isi.includes(berbahaya),false,`skrip tidak boleh memakai ${berbahaya}`);
});
