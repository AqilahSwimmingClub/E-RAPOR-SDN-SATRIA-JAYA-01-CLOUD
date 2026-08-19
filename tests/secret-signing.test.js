import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const skrip=path.join(root,'scripts','tampilkan-secret-signing.mjs');
const read=berkas=>readFileSync(path.join(root,berkas),'utf8');

/* Keystore contoh sekali pakai. Password sengaja memuat karakter yang menyulitkan format
   Java Properties supaya terbukti dibaca kembali apa adanya. */
const STORE_PASSWORD='Pw\\Sto:re=123 x';
const KEY_PASSWORD='Pw\\Ku:nci=456 y';
function siapkan(){
  const folder=mkdtempSync(path.join(tmpdir(),'erapor-signing-'));
  const keystore=path.join(folder,'erapor-release.jks');
  execFileSync('keytool',['-genkeypair','-keystore',keystore,'-storetype','JKS','-alias','erapor-release',
    '-keyalg','RSA','-keysize','2048','-validity','30','-storepass',STORE_PASSWORD,'-keypass',KEY_PASSWORD,
    '-dname','CN=Uji, O=Test, C=ID'],{stdio:'ignore'});
  const properties=path.join(folder,'signing.properties');
  const escape=nilai=>nilai.replace(/\\/g,'\\\\');
  writeFileSync(properties,`storeFile=${keystore.replace(/\\/g,'/')}\nstorePassword=${escape(STORE_PASSWORD)}\nkeyAlias=erapor-release\nkeyPassword=${escape(KEY_PASSWORD)}\n`,'utf8');
  return {folder,keystore,properties};
}
const jalankan=(args,properties)=>execFileSync('node',[skrip,...args,'--properties',properties],{encoding:'utf8'});

test('1. Perintah signing:secrets terdaftar dan ikut diperiksa npm run check',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['signing:secrets'],'node scripts/tampilkan-secret-signing.mjs');
  assert.match(pkg.scripts.check,/node --check scripts\/tampilkan-secret-signing\.mjs/);
});

test('2. Base64 yang dihasilkan benar-benar keystore yang sama',()=>{
  const {folder,keystore,properties}=siapkan();
  try{
    const keluaran=jalankan(['base64','--tampilkan'],properties);
    assert.match(keluaran,/Secret {4}: ANDROID_KEYSTORE_BASE64/);
    const base64=keluaran.trim().split('\n').at(-1).trim();
    assert.deepEqual(Buffer.from(base64,'base64'),readFileSync(keystore),'decode kembali menjadi keystore asli');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('3. Password dengan garis miring, titik dua, dan spasi dibaca apa adanya',()=>{
  const {folder,properties}=siapkan();
  try{
    for(const [bagian,nilai,nama] of [['storePassword',STORE_PASSWORD,'ANDROID_KEYSTORE_PASSWORD'],['keyPassword',KEY_PASSWORD,'ANDROID_KEY_PASSWORD']]){
      const keluaran=jalankan([bagian,'--tampilkan'],properties);
      assert.match(keluaran,new RegExp(`Secret {4}: ${nama}`),`${bagian} dipetakan ke ${nama}`);
      assert.equal(keluaran.trim().split('\n').at(-1),nilai,`${bagian} utuh termasuk karakter khususnya`);
    }
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('4. Nama alias ditampilkan apa adanya karena bukan rahasia',()=>{
  const {folder,properties}=siapkan();
  try{
    const keluaran=jalankan(['keyAlias'],properties);
    assert.match(keluaran,/Secret {4}: ANDROID_KEY_ALIAS/);
    assert.match(keluaran,/Nilai {5}: erapor-release/,'alias langsung terbaca tanpa perlu --tampilkan');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('5. Nilai rahasia tidak pernah tercetak penuh tanpa diminta',()=>{
  const {folder,properties}=siapkan();
  try{
    for(const [bagian,nilai] of [['storePassword',STORE_PASSWORD],['keyPassword',KEY_PASSWORD]]){
      const keluaran=jalankan([bagian],properties);
      assert.equal(keluaran.includes(nilai),false,`${bagian} tersamar bila --tampilkan tidak dipakai`);
      assert.match(keluaran,/\*{3,}/,'ditampilkan dalam bentuk tersamar');
      assert.match(keluaran,/\(15 karakter\)/,'panjangnya tetap terlihat untuk memastikan salinan utuh');
    }
    assert.equal(jalankan(['base64'],properties).includes('MII'),false,'base64 juga tidak dicetak penuh');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('6. Nilai --properties tidak terbaca sebagai nama bagian',()=>{
  const {folder,properties}=siapkan();
  try{
    /* Tanpa argumen bagian, skrip harus memilih base64, bukan menganggap path sebagai bagian. */
    assert.match(jalankan([],properties),/Secret {4}: ANDROID_KEYSTORE_BASE64/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('7. Pesan gagal menuntun bila berkas tidak ditemukan',()=>{
  const folder=mkdtempSync(path.join(tmpdir(),'erapor-signing-'));
  try{
    const gagal=perintah=>{try{perintah();return '';}catch(error){return String(error.stderr||error.message);}};

    const tanpaProperties=gagal(()=>jalankan([],path.join(folder,'tidak-ada.properties')));
    assert.match(tanpaProperties,/tidak ditemukan/);
    assert.match(tanpaProperties,/erapor-release\.jks dan KEYSTORE-CREDENTIALS\.txt/,'menunjuk berkas yang harus dicari');
    assert.match(tanpaProperties,/docs\/BUILD-OTOMATIS\.md/,'mengarahkan ke panduan');

    mkdirSync(path.join(folder,'isi'),{recursive:true});
    const rusak=path.join(folder,'isi','signing.properties');
    writeFileSync(rusak,`storeFile=${path.join(folder,'hilang.jks').replace(/\\/g,'/')}\nstorePassword=a\nkeyAlias=b\nkeyPassword=c\n`,'utf8');
    assert.match(gagal(()=>jalankan([],rusak)),/Berkas keystore tidak ada di/,'menyebut lokasi keystore yang dituju');

    const kosong=path.join(folder,'isi','kosong.properties');
    writeFileSync(kosong,'storeFile=\nstorePassword=\nkeyAlias=\nkeyPassword=\n','utf8');
    assert.match(gagal(()=>jalankan([],kosong)),/Baris berikut kosong.*storeFile, storePassword, keyAlias, keyPassword/s);

    assert.match(gagal(()=>jalankan(['salahketik'],rusak)),/Bagian "salahketik" tidak dikenal/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('8. Mode "semua" menuntun keempat secret berurutan tanpa ada yang terlewat',()=>{
  const {folder,properties}=siapkan();
  try{
    const keluaran=jalankan(['semua'],properties);
    /* Tanpa TTY, urutannya dicetak semua sekaligus sehingga tetap dapat diperiksa. */
    for(const [urutan,nama] of [[1,'ANDROID_KEYSTORE_BASE64'],[2,'ANDROID_KEYSTORE_PASSWORD'],[3,'ANDROID_KEY_ALIAS'],[4,'ANDROID_KEY_PASSWORD']])
      assert.match(keluaran,new RegExp(`Secret ${urutan} dari 4 : ${nama}`),`${nama} muncul pada urutan ${urutan}`);
    assert.match(keluaran,/settings\/secrets\/actions/,'alamat halaman secret ikut ditunjukkan');
    assert.match(keluaran,/harus ada tepat empat baris/,'cara memastikan sudah lengkap');
    /* Nilai rahasia tetap tersamar walaupun keempatnya ditampilkan sekaligus. */
    assert.equal(keluaran.includes(STORE_PASSWORD),false);
    assert.equal(keluaran.includes(KEY_PASSWORD),false);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('9. Skrip aman dijalankan di Windows',()=>{
  const isi=read('scripts/tampilkan-secret-signing.mjs');
  /* URL.pathname pada Windows berbentuk "/C:/..." yang tidak dikenali path.resolve. */
  assert.match(isi,/fileURLToPath\(import\.meta\.url\)/,'lokasi proyek dihitung dengan fileURLToPath');
  assert.equal(/new URL\(import\.meta\.url\)\.pathname/.test(isi),false);
  /* spawn pada Windows tidak menambahkan ekstensi dari PATHEXT, jadi "clip" saja selalu ENOENT. */
  assert.match(isi,/\['clip\.exe',\[\]\]/,'clipboard Windows memakai clip.exe lengkap dengan ekstensinya');
  assert.equal(/\['clip'\]/.test(isi),false,'nama tanpa ekstensi tidak dipakai lagi');
  assert.match(isi,/powershell\.exe.*Set-Clipboard/,'PowerShell disiapkan sebagai cadangan');
  assert.match(isi,/for\(const \[perintah,args\] of kandidatClipboard\(\)\)if\(await coba\(/,'kandidat dicoba berurutan sampai ada yang berhasil');
  /* Skrip hanya membaca berkas lokal dan menyalin ke clipboard komputer sendiri: tidak pernah
     menghubungi jaringan, tidak menulis berkas, dan tidak menghapus apa pun. */
  for(const berbahaya of ['fetch(','node:http','node:https','node:net','XMLHttpRequest','writeFileSync','unlinkSync','rmSync'])
    assert.equal(isi.includes(berbahaya),false,`skrip tidak boleh memakai ${berbahaya}`);
  /* Satu-satunya alamat yang muncul hanyalah halaman secret yang ditunjukkan kepada pengguna. */
  const alamat=[...isi.matchAll(/https?:\/\/\S+/g)].map(item=>item[0]);
  assert.deepEqual(alamat,['https://github.com/AqilahSwimmingClub/E-RAPOR-SDN-SATRIA-JAYA-01-CLOUD/settings/secrets/actions\');'],'hanya alamat halaman secret yang dicetak');
});
