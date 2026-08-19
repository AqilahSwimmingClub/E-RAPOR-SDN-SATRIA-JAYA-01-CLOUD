import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const skrip=path.join(root,'scripts','buat-keystore-baru.mjs');
const read=berkas=>readFileSync(path.join(root,berkas),'utf8');

function siapkan(){
  const folder=mkdtempSync(path.join(tmpdir(),'erapor-baru-'));
  for(const sub of ['rumah','kosong','simpan','proyek/android'])mkdirSync(path.join(folder,sub),{recursive:true});
  return {folder,properties:path.join(folder,'proyek','android','signing.properties'),
    simpan:path.join(folder,'simpan'),rumah:path.join(folder,'rumah'),kosong:path.join(folder,'kosong')};
}
function buatKeystoreLama(tujuan){
  mkdirSync(path.dirname(tujuan),{recursive:true});
  execFileSync('keytool',['-genkeypair','-keystore',tujuan,'-storetype','JKS','-alias','erapor-release',
    '-keyalg','RSA','-keysize','2048','-validity','30','-storepass','Lama12345','-keypass','Lama12345',
    '-dname','CN=Lama, O=SDN, C=ID'],{stdio:'ignore'});
}
const jalankan=(args,{properties,simpan,cari})=>execFileSync('node',
  [skrip,...args,'--properties',properties,'--output',simpan,'--cari-di',cari],{encoding:'utf8'});
const gagal=perintah=>{try{perintah();return '';}catch(error){return String(error.stderr||error.message);}};

test('1. Perintah signing:baru terdaftar dan ikut diperiksa npm run check',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['signing:baru'],'node scripts/buat-keystore-baru.mjs');
  assert.match(pkg.scripts.check,/node --check scripts\/buat-keystore-baru\.mjs/);
});

test('2. Keystore lama yang masih ada menghentikan pembuatan yang baru',()=>{
  const {folder,properties,simpan,rumah}=siapkan();
  try{
    const lama=path.join(rumah,'Downloads','proyek-lama','release-signing','erapor-release.jks');
    buatKeystoreLama(lama);
    /* Keystore lama jauh lebih berharga: memakainya berarti perangkat tidak perlu dipasang ulang. */
    const pesan=gagal(()=>jalankan(['230191'],{properties,simpan,cari:rumah}));
    assert.match(pesan,/Pembuatan keystore baru dibatalkan/);
    assert.ok(pesan.includes('npm run signing:lokasi'),'diarahkan memakai keystore lama');
    assert.equal(existsSync(path.join(simpan,'erapor-release.jks')),false,'tidak ada keystore baru yang dibuat');
    assert.equal(existsSync(properties),false,'signing.properties tidak ditulis');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('3. Keystore lama tetap dapat diabaikan bila memang disengaja',()=>{
  const {folder,properties,simpan,rumah}=siapkan();
  try{
    buatKeystoreLama(path.join(rumah,'lama','erapor-release.jks'));
    const keluaran=jalankan(['230191','--tetap-buat-baru'],{properties,simpan,cari:rumah});
    assert.match(keluaran,/Keystore baru : /);
    assert.ok(existsSync(path.join(simpan,'erapor-release.jks')));
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('4. Keystore baru dapat dibuka dan kunci privatnya terpakai',()=>{
  const {folder,properties,simpan,kosong}=siapkan();
  try{
    jalankan(['230191'],{properties,simpan,cari:kosong});
    const keystore=path.join(simpan,'erapor-release.jks');
    const permintaan=execFileSync('keytool',['-certreq','-alias','erapor-release','-keystore',keystore,
      '-storepass','230191','-keypass','230191'],{encoding:'utf8'});
    assert.match(permintaan,/BEGIN NEW CERTIFICATE REQUEST/,'kunci privat terpakai dengan password yang diminta');
    const rinci=execFileSync('keytool',['-list','-v','-keystore',keystore,'-storepass','230191','-alias','erapor-release'],{encoding:'utf8'});
    assert.match(rinci,/4096-bit RSA key/,'kunci 4096 bit');
    assert.match(rinci,/Alias name: erapor-release/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('5. signing.properties dan catatan credential ikut ditulis',()=>{
  const {folder,properties,simpan,kosong}=siapkan();
  try{
    jalankan(['230191'],{properties,simpan,cari:kosong});
    const isi=readFileSync(properties,'utf8');
    assert.match(isi,/^storePassword=230191$/m);
    assert.match(isi,/^keyPassword=230191$/m);
    assert.match(isi,/^keyAlias=erapor-release$/m);
    assert.match(isi,/^storeFile=.+erapor-release\.jks$/m);
    assert.equal(existsSync(`${properties}.sementara`),false,'berkas sementara tidak tertinggal');
    const catatan=readFileSync(path.join(simpan,'KEYSTORE-CREDENTIALS.txt'),'utf8');
    assert.match(catatan,/Alias: erapor-release/);
    assert.match(catatan,/Sidik jari SHA256: [0-9A-F:]{20,}/i,'sidik jari ikut dicatat untuk pembanding');
    assert.match(catatan,/dua tempat terpisah/,'catatan mengingatkan menyimpan salinan');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('6. Keystore disimpan di luar folder proyek',()=>{
  const isi=read('scripts/buat-keystore-baru.mjs');
  /* Keystore lama hilang justru karena berada di dalam folder proyek yang diunduh ulang. */
  assert.match(isi,/path\.join\(homedir\(\),'e-Rapor-Keystore'\)/,'lokasi bawaan di folder pengguna, bukan folder proyek');
  assert.match(read('.gitignore'),/\*\.jks/,'berkas keystore tidak pernah ikut ter-commit');
});

test('7. Keystore di folder tujuan tidak pernah ditimpa',()=>{
  const {folder,properties,simpan,kosong}=siapkan();
  try{
    jalankan(['230191'],{properties,simpan,cari:kosong});
    const sebelum=readFileSync(path.join(simpan,'erapor-release.jks'));
    const pesan=gagal(()=>jalankan(['999999'],{properties,simpan,cari:kosong}));
    assert.match(pesan,/Sudah ada keystore di/);
    assert.deepEqual(readFileSync(path.join(simpan,'erapor-release.jks')),sebelum,'berkas lama utuh');
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('8. Password kosong dan terlalu pendek ditolak sebelum menelusuri',()=>{
  const {folder,properties,simpan,kosong}=siapkan();
  try{
    assert.match(gagal(()=>jalankan([],{properties,simpan,cari:kosong})),/Password belum disebutkan/);
    assert.match(gagal(()=>jalankan(['12345'],{properties,simpan,cari:kosong})),/hanya 5 karakter[\s\S]*minimal 6 karakter/);
    assert.equal(existsSync(path.join(simpan,'erapor-release.jks')),false);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('9. Pengguna diingatkan bahwa perangkat harus dipasang ulang',()=>{
  const {folder,properties,simpan,kosong}=siapkan();
  try{
    const keluaran=jalankan(['230191'],{properties,simpan,cari:kosong});
    assert.match(keluaran,/BERBEDA dari yang dipakai APK yang sekarang terpasang/);
    assert.match(keluaran,/Backup, uninstall aplikasi lama/,'urutan aman disebutkan');
    for(const secret of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'])
      assert.ok(keluaran.includes(secret),`keempat secret disebut, termasuk ${secret}`);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('10. Skrip aman di Windows dan tidak menghapus berkas',()=>{
  const isi=read('scripts/buat-keystore-baru.mjs');
  assert.match(isi,/fileURLToPath\(import\.meta\.url\)/);
  assert.equal(/new URL\(import\.meta\.url\)\.pathname/.test(isi),false);
  assert.ok(isi.includes(String.raw`keystore.replace(/\\/g,'/')`),'alamat ditulis dengan garis miring untuk Gradle');
  for(const berbahaya of ['fetch(','https:','unlinkSync','rmSync'])
    assert.equal(isi.includes(berbahaya),false,`skrip tidak boleh memakai ${berbahaya}`);
});
