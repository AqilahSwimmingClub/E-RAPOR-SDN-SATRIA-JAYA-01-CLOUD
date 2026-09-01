import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const raw=()=>read('src/styles/app.css');
const css=()=>raw().replace(/\/\*[\s\S]*?\*\//g,'');
/* Ambil isi satu aturan CSS berdasarkan selektor persis. */
function rule(selector){
  const pola=new RegExp(`(^|[;}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`);
  const cocok=css().match(pola);
  return cocok?cocok[2]:'';
}

/* ---------------------------------------------- 1. Kontras teks pada permukaan terang */

test('Permukaan terang menetapkan warna teks gelap sendiri, tidak mewarisi teks terang',()=>{
  const t=css();
  assert.match(t,/--light-ink\s*:/,'token teks permukaan terang tersedia');
  assert.match(t,/--light-muted\s*:/,'token teks sekunder permukaan terang tersedia');
  /* Kontrak dituliskan sekali sebagai daftar selektor, bukan tambalan tersebar. */
  assert.match(raw(),/LIGHT SURFACE CONTRACT/,'ada blok kontrak permukaan terang');
  for(const selector of ['.card','.modal-card','.data-table td','.input'])
    assert.match(t,new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[^{]*\\{[^}]*color:var\\(--light-ink\\)`),`${selector} memakai teks gelap`);
});

function colorFor(selector){
  const aturan=[...css().matchAll(/([^{}]+)\{([^}]*)\}/g)];
  let warna=null;
  for(const [,daftar,isi] of aturan){
    if(!daftar.split(',').some(bagian=>bagian.trim()===selector))continue;
    const cocok=[...isi.matchAll(/(?:^|;)\s*color:([^;]*)/g)].pop();
    if(cocok)warna=cocok[1].trim();
  }
  return warna;
}

test('Kartu putih tidak boleh memakai teks putih atau abu sangat muda',()=>{
  const terang=/#f[0-9a-f]{5}\b|#fff\b|rgba\(255,255,255|var\(--dark-ink\)|var\(--dark-muted\)/i;
  for(const selector of ['.card','.modal-card','.data-table td','.input']){
    const warna=colorFor(selector);
    assert.ok(warna,`${selector} menetapkan color secara eksplisit`);
    assert.doesNotMatch(warna,terang,`${selector} tidak memakai teks terang`);
    assert.match(warna,/var\(--light-(ink|muted)\)/,`${selector} memakai token teks gelap`);
  }
});

test('Label, keterangan, dropdown, dan placeholder pada permukaan terang tetap terbaca',()=>{
  const t=css();
  assert.match(t,/\.card .muted,[^{]*\{[^}]*color:var\(--light-muted\)/,'teks sekunder di kartu dipaksa gelap');
  assert.match(t,/\.input::placeholder[^{]*\{[^}]*color:/,'placeholder punya warna sendiri');
  assert.match(t,/select\.input option[^{]*\{[^}]*color:var\(--light-ink\)/,'opsi dropdown terbaca');
  assert.match(t,/\.field label[^{]*\{[^}]*color:/,'label form punya warna eksplisit');
});

test('Permukaan gelap Dashboard dan Login tidak ikut dipaksa gelap',()=>{
  const t=css();
  /* Selektor gelap memakai kekhususan lebih tinggi sehingga tetap menang. */
  assert.match(t,/\.login-shell \.input\{[^}]*color:var\(--dark-ink\)/);
  assert.match(t,/\.dash-stat-value\{[^}]*color:var\(--dark-ink\)/);
  assert.doesNotMatch(rule('.dash-panel'),/color:var\(--light-ink\)/);
});

/* ---------------------------------------------- 2. Sidebar diam, hanya konten yang bergulir */

test('Kerangka aplikasi setinggi viewport dan tidak menggulirkan seluruh body',()=>{
  const shell=rule('.app-shell');
  assert.match(shell,/height:100dvh/,'shell setinggi viewport dinamis');
  assert.match(shell,/overflow:hidden/,'body tidak ikut bergulir');
});

test('Sidebar desktop tetap pada viewport dengan scroll internal sendiri',()=>{
  const sidebar=rule('.sidebar');
  assert.match(sidebar,/height:100dvh/,'sidebar setinggi layar');
  assert.match(sidebar,/overflow-y:auto/,'menu panjang bergulir di dalam sidebar');
  assert.match(sidebar,/position:sticky|position:fixed/,'sidebar tidak ikut naik turun');
  assert.match(css(),/\.nav\{[^}]*overflow-y:auto/,'daftar menu punya gulir sendiri');
});

test('Hanya area konten kanan yang bergulir vertikal',()=>{
  const main=rule('.main'),content=rule('.content');
  assert.match(main,/height:100dvh/,'kolom kanan setinggi layar');
  assert.match(main,/overflow:hidden/,'kolom kanan tidak bergulir sebagai satu kesatuan');
  assert.match(content,/overflow-y:auto/,'konten kanan yang bergulir');
  assert.match(css(),/\.topbar\{[^}]*flex:none/,'topbar tetap stabil di atas');
});

test('Mode ponsel tetap memakai drawer dan gulir halaman biasa',()=>{
  const t=css();
  const ponsel=t.match(/@media\(max-width:767px\)\{[\s\S]*?\n/);
  assert.ok(ponsel,'blok ponsel ada');
  assert.match(t,/@media\(max-width:767px\)\{[^@]*\.app-shell\{[^}]*display:block/,'drawer: shell kembali blok');
  assert.match(t,/@media\(max-width:767px\)\{[^@]*\.sidebar\{[^}]*position:fixed/,'sidebar menjadi drawer');
  assert.match(t,/\.sidebar\.open\{[^}]*transform:translateX\(0\)/,'drawer dapat dibuka');
  assert.match(raw(),/MOBILE SCROLL RESET/,'ada penyetelan ulang gulir untuk ponsel');
  assert.match(t,/@media\(max-width:767px\)[^@]*\.content\{[^}]*overflow:visible/,'konten ponsel ikut gulir halaman');
});

/* ---------------------------------------------- 3. Latar Login dan form yang dibuka */

test('Latar Login memakai gambar dengan cadangan gradasi',()=>{
  const t=css(),stage=rule('.login-stage');
  assert.match(stage,/url\(/,'memakai gambar latar');
  assert.match(stage,/linear-gradient|radial-gradient/,'tetap ada gradasi sebagai cadangan dan peredup');
  assert.match(t,/\.login-scrim\{/,'lapisan peredup agar teks tetap terbaca di atas foto');
});

test('Form Login baru muncul setelah tombol Login ditekan',()=>{
  const source=read('src/pages/login.js'),t=css();
  assert.match(source,/data-open-login/,'ada tombol pembuka di bilah atas');
  assert.match(source,/data-close-login/,'form dapat ditutup kembali');
  assert.match(source,/login-open/,'kelas penanda form terbuka');
  assert.match(t,/\.login-shell\{[^}]*opacity:0/,'form tersembunyi sebelum dibuka');
  assert.match(t,/\.login-stage\.login-open .login-shell\{[^}]*opacity:1/,'form tampil setelah dibuka');
  assert.match(t,/@keyframes loginCaseOpen/,'animasi buka tetap ringan');
});

test('Seluruh kendali dan logika login tetap utuh',()=>{
  const source=read('src/pages/login.js');
  for(const id of ['semester','username','password','loginForm','loginError','forgot','loginHelp'])
    assert.match(source,new RegExp(`id="${id}"`),`kontrol ${id} tetap ada`);
  for(const teks of ['Admin','Guru / Wali Kelas','Sekolah','Semester Aktif','Masuk','Aktivasi Admin Pertama','Lupa Password'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
  assert.match(source,/authenticate\(\{role,username:/);
  assert.match(source,/saveSession\(session\)/);
  assert.match(source,/ensureSecurityBootstrap/);
});

test('Mencetak melepas tinggi tetap sehingga dokumen tidak terpotong satu layar',()=>{
  const t=css();
  const cetak=t.match(/@media print\{[^@]*\}/)[0];
  for(const selector of ['.app-shell','.main','.content'])
    assert.match(cetak,new RegExp(`\\${selector}[^{]*\\{[^}]*height:auto!important[^}]*overflow:visible!important`),`${selector} dilepas saat cetak`);
  /* Lembar dokumen tetap putih dan geometrinya tidak berubah. */
  assert.match(t,/\.document-a4\{[^}]*background:#fff/);
  assert.match(t,/\.report-a4\{padding:14mm 13mm\}/);
});

test('Latar Login memakai cover dengan posisi yang menyesuaikan lebar layar',()=>{
  const t=css();
  const stage=rule('.login-stage');
  /* Gambar tidak pernah dipotong permanen: cover plus titik fokus yang dapat digeser. */
  assert.match(stage,/url\(/,'memakai berkas gambar');
  assert.match(stage,/cover/,'memakai background-size cover');
  assert.match(stage,/var\(--login-bg-pos/,'titik fokus dikendalikan satu variabel');
  assert.match(t,/--login-bg-pos\s*:/,'variabel titik fokus tersedia');
  /* Tiga kelas layar punya titik fokus sendiri agar bagian penting tetap terlihat. */
  assert.match(t,/@media\(max-width:1024px\)[^@]*--login-bg-pos/,'penyesuaian tablet');
  assert.match(t,/@media\(max-width:767px\)[^@]*--login-bg-pos/,'penyesuaian ponsel');
  assert.match(t,/@media\(max-height:560px\)[^@]*--login-bg-pos/,'penyesuaian layar pendek dan lanskap');
  /* Gradasi tetap menjadi cadangan bila berkas gambar belum tersedia. */
  assert.match(stage,/linear-gradient\(165deg,var\(--navy\)/,'ada cadangan gradasi');
});
