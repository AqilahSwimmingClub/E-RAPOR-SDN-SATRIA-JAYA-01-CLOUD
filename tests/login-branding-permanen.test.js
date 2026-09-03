import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Kontrak permanen halaman Masuk: seluruh branding adalah lapisan HTML/CSS tersendiri
   di atas foto. Berkas assets/login-background.jpg dipakai murni sebagai gambar latar,
   sehingga menimpanya dengan foto lain tidak menghilangkan logo maupun teks apa pun
   dan tidak menuntut satu baris kode pun diubah. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const login=()=>read('src/pages/login.js');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
function rule(selector){
  const cocok=css().match(new RegExp(`(^|[;}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`));
  return cocok?cocok[2]:'';
}
/* Blok penanda kolom foto pada berkas halaman Masuk. */
function bagianFoto(){
  const source=login();
  const mulai=source.indexOf('<section class="login-photo">');
  const akhir=source.indexOf('<section class="login-panel">');
  assert.ok(mulai>-1&&akhir>mulai,'kolom foto dan kolom form tetap terpisah');
  return source.slice(mulai,akhir);
}

test('Berkas latar hanya dipakai sebagai gambar latar CSS, bukan pembawa teks',()=>{
  const t=css(),source=login();
  /* Satu-satunya penyebutan berada pada background .login-photo. */
  assert.equal((t.match(/login-background\.jpg/g)||[]).length,1,'berkas latar disebut tepat sekali di CSS');
  assert.equal(source.includes('login-background.jpg'),false,'berkas latar tidak pernah dipasang sebagai elemen gambar');
  const foto=rule('.login-photo');
  assert.match(foto,/url\('\.\.\/\.\.\/assets\/login-background\.jpg'\)/,'jalur berkas tetap dan dapat ditimpa manual');
  assert.match(foto,/cover/,'gambar apa pun akan menutup kolom secara utuh');
  assert.match(foto,/no-repeat/,'gambar tidak diubin bila rasionya berbeda');
  /* Bila berkas hilang atau rusak, kolom tetap berwarna dan branding tetap terbaca. */
  assert.match(foto,/linear-gradient\(160deg,#1f4f7d,#2f6fa8\)/,'ada gradasi cadangan di belakang gambar');
});

test('Branding adalah lapisan HTML tersendiri di atas foto',()=>{
  const foto=bagianFoto();
  /* Urutan lapisan: gambar latar pada .login-photo, lalu overlay, lalu isi branding. */
  const iOverlay=foto.indexOf('class="login-photo-overlay"');
  const iIsi=foto.indexOf('class="login-photo-content"');
  assert.ok(iOverlay>-1,'ada lapisan overlay tersendiri');
  assert.ok(iIsi>iOverlay,'isi branding berada di atas overlay');
  for(const teks of ['login-logo','e-Rapor','schoolLabel.toUpperCase()','Cerdas • Berkarakter • Berprestasi',
    'DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT'])
    assert.ok(foto.indexOf(teks)>iIsi,`${teks} berada di dalam lapisan branding, bukan di gambar`);
  /* Logo sekolah adalah gambar tersendiri milik sekolah pengguna, terpisah dari foto latar. */
  assert.match(foto,/<img class="login-logo" src="\$\{escapeHtml\(crest\)\}"/,'logo memakai sumber gambarnya sendiri');
  assert.match(login(),/const crest=schoolLogo\|\|'\.\/assets\/app-icon-192\.png'/,'tanpa logo sekolah dipakai lambang netral aplikasi');
});

test('Overlay hanya gradasi tembus pandang, tanpa gambar dan tanpa teks tertanam',()=>{
  const overlay=rule('.login-photo-overlay');
  assert.doesNotMatch(overlay,/url\(/,'overlay tidak membawa gambar');
  assert.match(overlay,/position:absolute/,'overlay menutupi kolom foto');
  assert.match(overlay,/inset:0/,'overlay menutupi seluruh kolom foto');
  const alfa=[...overlay.matchAll(/rgba\(\d+,\s*\d+,\s*\d+,\s*(\.\d+|0?\.\d+|1)\)/g)].map(m=>Number(m[1]));
  assert.ok(alfa.length>=2,'overlay memakai beberapa perhentian gradasi');
  assert.ok(alfa.every(a=>a<1),'overlay tetap tembus pandang sehingga foto masih terlihat');
  /* Branding menempel di tepi atas dan bawah, jadi dua ujung gradasi harus cukup gelap
     agar foto secerah apa pun tetap menyisakan kontras untuk teks putih. */
  const atas=overlay.match(/rgba\([^)]*,\s*(\.\d+)\)\s*0%/);
  const bawah=overlay.match(/rgba\([^)]*,\s*(\.\d+)\)\s*100%/);
  assert.ok(atas&&Number(atas[1])>=0.55,`ujung atas gelap ${atas?atas[1]:'?'} untuk blok identitas sekolah`);
  assert.ok(bawah&&Number(bawah[1])>=0.72,`ujung bawah gelap ${bawah?bawah[1]:'?'} untuk blok identitas pengembang`);
  /* Tidak ada teks yang ditempel lewat pseudo-element ke atas foto. */
  for(const selector of ['.login-photo::before','.login-photo::after'])
    assert.equal(rule(selector),'',`${selector} tidak dipakai menempelkan apa pun ke foto`);
});

test('Urutan lapisan dikunci lewat susun tumpuk yang eksplisit',()=>{
  const overlay=rule('.login-photo-overlay'),isi=rule('.login-photo-content');
  const zOverlay=overlay.match(/z-index:(\d+)/),zIsi=isi.match(/z-index:(\d+)/);
  assert.ok(zOverlay,'overlay punya z-index tetap');
  assert.ok(zIsi,'lapisan branding punya z-index tetap');
  assert.ok(Number(zIsi[1])>Number(zOverlay[1]),'branding selalu berada di atas overlay dan foto');
  assert.match(isi,/position:relative/,'lapisan branding membentuk konteks tumpuknya sendiri');
});

test('Logo memakai gambar tersendiri, bukan bagian dari foto latar',()=>{
  /* Logo sekolah berasal dari masterData.school.schoolLogo yang diunggah Admin. */
  assert.match(login(),/const schoolLogo=String\(school\.schoolLogo\|\|''\)\.trim\(\)/,'logo dibaca dari identitas sekolah');
  const logo=rule('.login-logo');
  assert.match(logo,/object-fit:contain/,'rasio asli logo dijaga');
  assert.doesNotMatch(logo,/(^|;)\s*background(-color)?:/,'logo tanpa kotak di belakangnya');
  assert.doesNotMatch(rule('.login-brand-mark'),/(^|;)\s*background(-color)?:/,'wadah logo tanpa kotak');
});

test('Teks lama sudah tidak ada di mana pun pada halaman Masuk',()=>{
  const source=login();
  for(const teks of ['KABUPATEN BEKASI','WELCOME','SDN SATRIA JAYA 01','SDN Satria Jaya 01'])
    assert.equal(source.includes(teks),false,`${teks} sudah dihapus`);
  assert.doesNotMatch(css(),/\.login-photo-caption h1\{/,'gaya sambutan lama ikut dibersihkan');
  assert.doesNotMatch(css(),/\.login-brand-region\{/,'gaya baris kabupaten ikut dibersihkan');
});

test('Mengganti berkas latar tidak menuntut kode diubah',()=>{
  const t=css(),source=login();
  /* Tidak ada gambar yang ditanam di dalam kode, sehingga satu berkas saja yang perlu ditimpa. */
  assert.doesNotMatch(t,/url\(["']?data:image/,'tidak ada base64 pada CSS');
  assert.doesNotMatch(source,/data:image\/(png|jpe?g|webp);base64/,'tidak ada base64 pada halaman');
  /* Posisi tampilan gambar diatur lewat variabel, bukan ditulis ulang per gambar. */
  assert.match(rule('.login-photo'),/var\(--login-bg-pos/,'posisi gambar diambil dari satu variabel tema');
  /* Cache tidak boleh menahan gambar lama setelah berkas ditimpa. */
  const sw=read('sw.js');
  assert.match(sw,/SWAPPABLE_ASSETS/,'ada daftar aset yang dapat ditimpa');
  assert.match(sw,/login-background\.jpg/,'latar termasuk aset yang dapat ditimpa');
});
