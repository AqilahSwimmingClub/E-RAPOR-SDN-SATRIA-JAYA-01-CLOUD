import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Kontrak permanen halaman Masuk: seluruh branding adalah lapisan HTML/CSS tersendiri
   di atas latar. Berkas assets/login-background.webp dipakai murni sebagai gambar latar,
   sehingga menimpanya dengan gambar lain tidak menghilangkan logo maupun teks apa pun
   dan tidak menuntut satu baris kode pun diubah.

   REVISI 1.3.0: kontraknya tidak berubah, tetapi wadahnya berubah. Sampai 1.2.9 latar hanya
   menutupi kolom kiri (.login-photo) dan kolom kanan (.login-panel) punya latar sendiri.
   Pengguna melarang sekat itu, jadi latar kini satu bidang utuh pada .login-stage, peredupnya
   bernama .login-veil, dan isinya berdiri pada kisi .login-layout. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const login=()=>read('src/pages/login.js');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
function rule(selector){
  const cocok=css().match(new RegExp(`(^|[;}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`));
  return cocok?cocok[2]:'';
}
/* Bagian halaman yang berdiri langsung di atas latar, di luar kartu Masuk. */
function bagianLatar(){
  const source=login();
  const mulai=source.indexOf('<main class="login-stage">');
  const akhir=source.indexOf('<div class="login-card-slot">');
  assert.ok(mulai>-1&&akhir>mulai,'latar dan kartu berdiri pada satu bidang yang sama');
  return source.slice(mulai,akhir);
}

test('Berkas latar hanya dipakai sebagai gambar latar CSS, bukan pembawa teks',()=>{
  const t=css(),source=login();
  /* Satu-satunya penyebutan berada pada background .login-stage.

     PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA: berkasnya kembali ke gambar ASLI acuan
     (webp), bukan hasil gambar ulang ke SVG, dan wadahnya kini seluruh layar - bukan kolom
     kiri. Yang dijaga tetap sama persis: satu penyebutan, dipakai hanya sebagai gambar latar
     CSS, dan tetap dapat ditimpa sekolah dengan menimpa satu berkas. */
  assert.equal((t.match(/login-background\.webp/g)||[]).length,1,'berkas latar disebut tepat sekali di CSS');
  assert.equal((t.match(/login-background\.(jpg|svg)/g)||[]).length,0,'berkas latar lama tidak dipakai lagi');
  assert.equal(source.includes('login-background'),false,'berkas latar tidak pernah dipasang sebagai elemen gambar');
  const foto=rule('.login-stage');
  assert.match(foto,/url\('\.\.\/\.\.\/assets\/login-background\.webp'\)/,'jalur berkas tetap dan dapat ditimpa manual');
  assert.match(foto,/cover/,'gambar apa pun akan menutup layar secara utuh');
  assert.match(foto,/no-repeat/,'gambar tidak diubin bila rasionya berbeda');
  /* Bila berkas hilang atau rusak, kolom tetap berwarna dan branding tetap terbaca. */
  assert.match(foto,/linear-gradient\(150deg,#eefaf3,#bfeaf6\)/,'ada gradasi cadangan di belakang gambar');
  /* Satu bidang, bukan dua: tidak ada kolom kedua yang membawa latarnya sendiri. */
  assert.equal(/^\.login-photo\{|^\.login-panel\{/m.test(t),false,'kolom latar terpisah dibubarkan');
});

test('Branding adalah lapisan HTML tersendiri di atas latar',()=>{
  const foto=bagianLatar();
  /* Urutan lapisan: gambar latar pada .login-stage, lalu peredup, lalu isi branding. */
  const iOverlay=foto.indexOf('class="login-veil"');
  const iIsi=foto.indexOf('class="login-layout"');
  assert.ok(iOverlay>-1,'ada lapisan peredup tersendiri');
  assert.ok(iIsi>iOverlay,'isi branding berada di atas peredup');
  for(const teks of ['login-logo','e-Rapor','schoolLabel.toUpperCase()','Cerdas • Berkarakter • Berprestasi',
    'DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT'])
    assert.ok(foto.indexOf(teks)>iIsi,`${teks} berada di dalam lapisan branding, bukan di gambar`);
  /* Logo sekolah adalah gambar tersendiri milik sekolah pengguna, terpisah dari foto latar. */
  assert.match(foto,/<img class="login-logo" src="\$\{escapeHtml\(crest\)\}"/,'logo memakai sumber gambarnya sendiri');
  assert.match(login(),/const crest=schoolLogo\|\|'\.\/assets\/app-icon-192\.png'/,'tanpa logo sekolah dipakai lambang netral aplikasi');
});

test('Peredup hanya gradasi tembus pandang, tanpa gambar dan tanpa teks tertanam',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA: arah peredupnya dibalik.

     Dulu tulisan di atas latar berwarna putih, sehingga peredupnya harus GELAP di kedua ujung
     agar teks tetap terbaca. Acuan final memakai latar terang dengan tulisan gelap, jadi
     peredup gelap justru akan mengotori gambar dan melanggar larangan mengubah warnanya.
     Yang dijaga sekarang: peredupnya terang, sangat tipis, dan tetap tembus pandang. */
  const overlay=rule('.login-veil');
  assert.doesNotMatch(overlay,/url\(/,'peredup tidak membawa gambar');
  assert.match(overlay,/position:absolute/,'peredup menutupi seluruh layar');
  assert.match(overlay,/inset:0/);
  assert.match(overlay,/pointer-events:none/,'peredup tidak menghalangi kendali di bawahnya');
  const alfa=[...overlay.matchAll(/rgba\(\d+,\s*\d+,\s*\d+,\s*(0|1|0?\.\d+)\)/g)].map(m=>Number(m[1]));
  assert.ok(alfa.length>=2,'peredup memakai beberapa perhentian gradasi');
  assert.ok(alfa.every(a=>a<=0.55),`peredup tetap tipis sehingga gambar tidak berubah (${alfa.join(', ')})`);
  /* Sisi kanan dibiarkan bening: di situ kartu Masuk berdiri dan gambarnya harus utuh. */
  assert.ok(alfa.some(a=>a<=0.15),'ada ujung yang nyaris bening');
  /* Tidak ada teks yang ditempel lewat pseudo-element ke atas latar. */
  for(const selector of ['.login-stage::before','.login-stage::after'])
    assert.equal(rule(selector),'',`${selector} tidak dipakai menempelkan apa pun ke latar`);
});

test('Urutan lapisan dikunci lewat susun tumpuk yang eksplisit',()=>{
  const overlay=rule('.login-veil'),isi=rule('.login-layout');
  const zOverlay=overlay.match(/z-index:(\d+)/),zIsi=isi.match(/z-index:(\d+)/);
  assert.ok(zOverlay,'peredup punya z-index tetap');
  assert.ok(zIsi,'lapisan branding punya z-index tetap');
  assert.ok(Number(zIsi[1])>Number(zOverlay[1]),'branding selalu berada di atas peredup dan latar');
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
  assert.doesNotMatch(css(),/\.login-photo-caption/,'gaya sambutan lama ikut dibersihkan');
  assert.doesNotMatch(css(),/\.login-brand-region\{/,'gaya baris kabupaten ikut dibersihkan');
});

test('Mengganti berkas latar tidak menuntut kode diubah',()=>{
  const t=css(),source=login();
  /* Tidak ada gambar yang ditanam di dalam kode, sehingga satu berkas saja yang perlu ditimpa. */
  assert.doesNotMatch(t,/url\(["']?data:image/,'tidak ada base64 pada CSS');
  assert.doesNotMatch(source,/data:image\/(png|jpe?g|webp);base64/,'tidak ada base64 pada halaman');
  /* Posisi tampilan gambar diatur lewat variabel, bukan ditulis ulang per gambar. */
  assert.match(rule('.login-stage'),/var\(--login-bg-pos/,'posisi gambar diambil dari satu variabel tema');
  /* Cache tidak boleh menahan gambar lama setelah berkas ditimpa. */
  const sw=read('sw.js');
  assert.match(sw,/SWAPPABLE_ASSETS/,'ada daftar aset yang dapat ditimpa');
  assert.match(sw,/login-background\.webp/,'latar Masuk termasuk aset yang dapat ditimpa');
  assert.match(sw,/app-background\.webp/,'latar aplikasi juga dapat ditimpa');
});
