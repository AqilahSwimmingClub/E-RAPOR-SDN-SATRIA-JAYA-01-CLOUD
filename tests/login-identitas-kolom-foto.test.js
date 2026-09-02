import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Kolom foto Login membawa dua blok teks: identitas sekolah di kiri atas dan
   identitas pembuat aplikasi di kiri bawah. Keduanya berdiri langsung di atas
   foto, tanpa kartu atau kotak besar yang menutupi gambar. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const login=()=>read('src/pages/login.js');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
function rule(selector){
  const cocok=css().match(new RegExp(`(^|[;}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`));
  return cocok?cocok[2]:'';
}
/* Ukuran huruf dibaca sebagai satu angka pembanding; clamp diwakili nilai idealnya
   yang paling besar sehingga perbandingan tetap konservatif. */
function fontPx(selector){
  const isi=rule(selector),cocok=isi.match(/font-size:([^;}]+)/);
  assert.ok(cocok,`${selector} menetapkan ukuran huruf`);
  const nilai=cocok[1].trim();
  const clamp=nilai.match(/^clamp\(([\d.]+)px,[^,]+,([\d.]+)px\)$/);
  if(clamp)return Number(clamp[2]);
  const px=nilai.match(/^([\d.]+)px$/);
  assert.ok(px,`${selector} memakai satuan px atau clamp px: ${nilai}`);
  return Number(px[1]);
}

test('Kiri atas: logo, E-RAPOR, nama sekolah, lalu slogan menggantikan kabupaten',()=>{
  const source=login();
  assert.match(source,/<span class="login-brand-app">e-Rapor<\/span>/,'baris e-Rapor tetap');
  assert.match(source,/<strong>\$\{escapeHtml\(schoolLabel\.toUpperCase\(\)\)\}<\/strong>/,'nama sekolah mengikuti identitas sekolah pengguna');
  assert.match(source,/<span class="login-brand-tagline">Cerdas • Berkarakter • Berprestasi<\/span>/,'slogan naik ke blok identitas sekolah');
  assert.equal(source.includes('KABUPATEN BEKASI'),false,'baris kabupaten sudah dihapus');
  /* Slogan berada di blok kiri atas, bukan lagi di bagian bawah kolom foto. */
  const brand=source.match(/<div class="login-brand-text">[\s\S]*?<\/div>/);
  assert.ok(brand&&brand[0].includes('Cerdas • Berkarakter • Berprestasi'),'slogan berada di dalam blok identitas sekolah');
});

test('Kiri bawah: identitas pembuat aplikasi lengkap dan berurutan',()=>{
  const source=login();
  const blok=source.match(/<div class="login-photo-caption">([\s\S]*?)<\/div>/);
  assert.ok(blok,'blok bawah kolom foto tetap ada dan tidak dikosongkan');
  const isi=blok[1];
  const urut=['DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT'];
  let posisi=-1;
  for(const teks of urut){
    const kini=isi.indexOf(teks);
    assert.ok(kini>-1,`${teks} tampil di kolom foto`);
    assert.ok(kini>posisi,`${teks} berada pada urutan yang benar`);
    posisi=kini;
  }
  assert.match(isi,/class="login-credit-name"/,'nama pengembang memakai elemen tersendiri');
  assert.equal(isi.includes('WELCOME'),false,'sambutan lama tidak kembali');
});

test('Nama pengembang jadi fokus utama tanpa berlebihan',()=>{
  const nama=fontPx('.login-credit-name');
  assert.ok(nama>=16&&nama<=24,`nama tampil ${nama}px, cukup menonjol tetapi tidak terlalu besar`);
  for(const selector of ['.login-credit-lead','.login-credit-role','.login-credit-copy'])
    assert.ok(fontPx(selector)<nama,`${selector} lebih kecil daripada nama pengembang`);
  assert.match(rule('.login-credit-name'),/font-weight:8/,'nama memakai bobot tebal');
});

test('Teks putih lembut, aksen cyan tipis, tanpa kotak besar menutupi foto',()=>{
  for(const selector of ['.login-credit-name','.login-credit-lead','.login-credit-role','.login-credit-copy']){
    const isi=rule(selector);
    assert.match(isi,/color:#[0-9a-f]{3,6}/i,`${selector} punya warna eksplisit`);
    assert.match(isi,/text-shadow:/,`${selector} tetap terbaca di atas foto`);
    assert.doesNotMatch(isi,/(^|;)\s*background(-color)?:/,`${selector} tidak memakai kotak sendiri`);
  }
  const wadah=rule('.login-photo-caption');
  assert.doesNotMatch(wadah,/(^|;)\s*background(-color)?:/,'blok identitas tidak menutupi foto dengan kotak');
  assert.doesNotMatch(wadah,/backdrop-filter:/,'tidak ada panel kaca besar di atas foto');
  const aksen=rule('.login-photo-caption::before');
  assert.match(aksen,/var\(--cyan\)/,'garis aksen memakai warna cyan tema');
  const lebar=aksen.match(/width:([\d.]+)px/);
  assert.ok(lebar&&Number(lebar[1])<=3,`garis aksen tipis (${lebar?lebar[1]:'?'}px)`);
});

test('Tata letak foto kiri dan form kanan tidak ikut berubah',()=>{
  const t=css(),source=login();
  assert.match(t,/\.login-stage\{[^}]*grid-template-columns:1\.05fr \.95fr/,'dua kolom tetap');
  /* Identitas pengembang kini hanya di kiri bawah; panel kanan berakhir di nomor versi. */
  assert.doesNotMatch(source,/login-footer/,'footer kolom kanan sudah dihapus');
  assert.match(source,/<span class="login-version">/,'nomor versi menjadi elemen terakhir panel kanan');
  for(const teks of ['Masuk ke e-Rapor','MASUK','Lupa Password?','Aktivasi Admin Pertama'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
});
