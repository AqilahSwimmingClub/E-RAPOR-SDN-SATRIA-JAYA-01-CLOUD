import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const login=()=>read('src/pages/login.js');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
function rule(selector){
  const cocok=css().match(new RegExp(`(^|[;}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`));
  return cocok?cocok[2]:'';
}

test('Header Login memakai berkas logo sekolah, bukan ikon generik',()=>{
  const source=login();
  assert.match(source,/class="login-logo"/,'ada elemen logo');
  assert.match(source,/src="\.\/assets\/logo-sekolah\.png"/,'memakai berkas logo sekolah pada jalur tetap');
  assert.match(source,/alt="Logo SDN Satria Jaya 01"/,'logo punya teks alternatif');
  /* Bila berkas logo belum ada, ikon sekolah lama dipakai sebagai cadangan supaya
     header tidak pernah menampilkan gambar rusak. */
  assert.match(source,/login-logo-fallback/,'ada cadangan saat berkas logo belum tersedia');
});

test('Ukuran logo sedang, rasio asli dipertahankan, dan responsif',()=>{
  const t=css(),logo=rule('.login-logo');
  assert.match(logo,/object-fit:contain/,'rasio asli dipertahankan');
  const ukuran=logo.match(/width:(\d+)px/);
  assert.ok(ukuran,'lebar logo ditetapkan');
  const px=Number(ukuran[1]);
  assert.ok(px>=55&&px<=65,`lebar desktop ${px}px berada pada 55-65px`);
  assert.match(logo,/height:(\d+)px/,'tinggi logo ditetapkan');
  assert.match(logo,/flex:none/,'logo tidak ikut menyusut oleh teks di sebelahnya');
  assert.match(t,/@media\(max-width:767px\)[^@]*\.login-logo\{[^}]*width:/,'logo mengecil di ponsel');
});

test('Logo sejajar dengan blok identitas dan diberi jarak rapi',()=>{
  const brand=rule('.login-photo .login-brand');
  assert.match(brand,/align-items:center/,'logo sejajar vertikal dengan teks');
  assert.match(brand,/gap:/,'ada jarak antara logo dan teks');
});

test('Sambutan dihapus, tagline bertitik pemisah tetap tampil',()=>{
  const source=login();
  assert.doesNotMatch(source,/WELCOME/i,'tulisan besar WELCOME sudah dihapus');
  assert.ok(source.includes('Cerdas • Berkarakter • Berprestasi'),'tagline memakai titik pemisah');
  assert.equal(source.includes('>Cerdas Berkarakter Berprestasi<'),false,'tagline lama tanpa pemisah sudah diganti');
});

test('Latar Login diambil dari satu berkas tetap yang dapat ditimpa manual',()=>{
  const t=css(),foto=rule('.login-photo');
  assert.match(foto,/url\('\.\.\/\.\.\/assets\/login-background\.jpg'\)/,'jalur dan nama berkas tetap');
  assert.match(foto,/cover/,'memakai background-size cover');
  /* Tidak boleh ada gambar yang ditanam langsung di kode. */
  assert.doesNotMatch(t,/url\(["']?data:image/,'tidak ada base64 pada CSS');
  assert.doesNotMatch(login(),/data:image\/(png|jpe?g);base64/,'tidak ada base64 pada halaman');
  /* Hanya satu penyebutan berkas latar, sehingga menggantinya cukup menimpa satu berkas. */
  assert.equal((t.match(/login-background\.jpg/g)||[]).length,1,'berkas latar hanya disebut sekali');
});

test('Aset yang boleh diganti manual tidak tersangkut cache lama',()=>{
  const sw=read('sw.js');
  assert.match(sw,/SWAPPABLE_ASSETS/,'ada daftar aset yang dapat ditimpa');
  assert.match(sw,/login-background\.jpg/,'latar termasuk aset yang dapat ditimpa');
  assert.match(sw,/logo-sekolah\.png/,'logo termasuk aset yang dapat ditimpa');
  assert.match(sw,/isSwappableAsset\(event\.request\.url\)\?networkFirst/,'aset itu diambil dari jaringan lebih dulu');
  /* Tetap ada cadangan cache sehingga aplikasi tidak kosong saat offline. */
  assert.match(sw,/async function networkFirst\(request\)\{try\{const response=await fetch\(request\)/);
  assert.doesNotMatch(sw,/'\.\/assets\/login-background\.jpg'/,'latar tidak ikut di-precache agar tidak tertahan versi lama');
});

test('Panel form, tema, dan identitas pengembang tidak ikut berubah',()=>{
  const source=login(),t=css();
  for(const teks of ['Masuk ke e-Rapor','Admin','Guru / Wali Kelas','MASUK','Lupa Password?','Aktivasi Admin Pertama','FAHMI DJAWAS, S.Pd.'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
  assert.match(source,/v\$\{escapeHtml\(APP_VERSION\)\}/,'nomor versi tetap otomatis');
  assert.match(t,/\.login-stage\{[^}]*grid-template-columns:1\.05fr \.95fr/,'tata letak dua kolom tetap');
  assert.match(t,/\.login-submit\{[^}]*var\(--cyan\)/,'warna tombol tetap');
});
