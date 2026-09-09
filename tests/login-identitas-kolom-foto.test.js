import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Sisi kiri halaman Masuk membawa dua blok teks: identitas sekolah di kiri atas dan
   identitas pembuat aplikasi di kiri bawah. Keduanya berdiri langsung di atas latar,
   tanpa kartu atau kotak besar yang menutupi gambar.

   REVISI 1.3.0: kontraknya tidak berubah, wadahnya berubah. Latar tidak lagi terkurung di
   kolom kiri - ia satu bidang penuh layar - sehingga blok identitas pengembang berganti nama
   dari .login-photo-caption menjadi .login-credit dan berdiri pada kisi .login-layout. */

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
  const blok=source.match(/<div class="login-credit">([\s\S]*?)<\/div>/);
  assert.ok(blok,'blok kiri bawah tetap ada dan tidak dikosongkan');
  const isi=blok[1];
  const urut=['DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT'];
  let posisi=-1;
  for(const teks of urut){
    const kini=isi.indexOf(teks);
    assert.ok(kini>-1,`${teks} tampil di kiri bawah`);
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

test('Teks berwarna tegas, aksen tosca tipis, tanpa kotak besar menutupi latar',()=>{
  for(const selector of ['.login-credit-name','.login-credit-lead','.login-credit-role','.login-credit-copy']){
    const isi=rule(selector);
    assert.match(isi,/color:#[0-9a-f]{3,6}/i,`${selector} punya warna eksplisit`);
    assert.match(isi,/text-shadow:/,`${selector} tetap terbaca di atas foto`);
    assert.doesNotMatch(isi,/(^|;)\s*background(-color)?:/,`${selector} tidak memakai kotak sendiri`);
  }
  const wadah=rule('.login-credit');
  assert.doesNotMatch(wadah,/(^|;)\s*background(-color)?:/,'blok identitas tidak menutupi latar dengan kotak');
  assert.doesNotMatch(wadah,/backdrop-filter:/,'tidak ada panel kaca besar di atas latar');
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA: latar sekarang terang, sehingga garis
     aksen memakai tosca pekat yang terlihat di atasnya - bukan cyan terang untuk latar navy. */
  const aksen=rule('.login-credit::before');
  assert.match(aksen,/#0f9fb4/,'garis aksen memakai tosca tema terang');
  const lebar=aksen.match(/width:([\d.]+)px/);
  assert.ok(lebar&&Number(lebar[1])<=3,`garis aksen tipis (${lebar?lebar[1]:'?'}px)`);
});

test('Identitas di kiri, kartu Masuk di kanan, di atas satu latar yang sama',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA: kisi 1.05fr/.95fr dibuang karena pengguna
     melarang sekat antara kanan dan kiri. Penempatan kiri/kanannya sendiri tetap. */
  const t=css(),source=login();
  assert.equal(/grid-template-columns:1\.05fr \.95fr/.test(t),false,'kisi dua kolom lama dibuang');
  assert.match(t,/\.login-layout\{[^}]*grid-template-areas:"brand kartu" "\. kartu" "kredit kartu"/s,
    'identitas di kiri, kartu di kanan');
  /* Identitas pengembang kini hanya di kiri bawah; kartu berakhir di nomor versi. */
  assert.doesNotMatch(source,/login-footer/,'footer kartu sudah dihapus');
  assert.match(source,/<span class="login-version">/,'nomor versi menjadi elemen terakhir kartu');
  for(const teks of ['Masuk ke e-Rapor','MASUK','Lupa Password?','Buat Password Admin Pertama'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
});
