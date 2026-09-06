import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';

/* ACUAN VISUAL FINAL 1.3.0.

   Tiga gambar acuan yang dilampirkan pengguna, dan apa yang dikunci suite ini:

     GAMBAR 1 - berkas latar halaman Masuk. Dipakai APA ADANYA. Tidak digambar ulang menjadi
       SVG, tidak diganti ilustrasi pengganti, tidak diubah komposisi maupun warnanya, dan
       papan tulis beserta tulisan yang memang bagian dari gambar tidak dihapus.
     GAMBAR 2 - berkas latar SELURUH aplikasi sesudah masuk. Bukan hanya Dashboard. Tidak
       pernah ikut masuk ke dokumen cetak.
     GAMBAR 3 - acuan susunan halaman Masuk, bukan berkas latar. Yang diambil darinya hanya
       tata letaknya: identitas sekolah kiri atas, identitas pengembang kiri bawah, kartu
       Masuk mengambang di kanan - SEMUANYA di atas satu latar yang sama, tanpa sekat.

   Instruksi ini menggantikan keputusan 1.2.9 yang bertentangan dengannya. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const ada=path=>existsSync(new URL(path,root));
const css=()=>read('src/styles/app.css');
const login=()=>read('src/pages/login.js');
/* Aturan yang BERLAKU untuk sebuah properti: satu selektor bisa muncul beberapa kali, dan
   yang menang adalah yang terakhir mendeklarasikannya - persis seperti urutan cascade. */
function aturan(teks,selektor,properti){
  const pola=new RegExp(`\\${selektor}\\{[^}]*\\}`,'g');
  return [...teks.matchAll(pola)].map(item=>item[0]).filter(item=>item.includes(properti)).at(-1)||'';
}

/* =========================================== §1. GAMBAR 1 SEBAGAI LATAR HALAMAN MASUK */

test('1. Latar Masuk adalah berkas asli, bukan gambar ulang atau ilustrasi pengganti',()=>{
  assert.ok(ada('assets/login-background.webp'),'berkas asli dipaketkan');
  const berkas=readFileSync(new URL('assets/login-background.webp',root));
  assert.equal(berkas.slice(0,4).toString('latin1'),'RIFF','berkas raster asli');
  assert.equal(berkas.slice(8,12).toString('latin1'),'WEBP');
  /* Tidak ada sisa berkas gambar ulang mana pun. */
  for(const lama of ['assets/login-background.svg','assets/login-background.jpg',
    'assets/dashboard-background.svg'])
    assert.equal(ada(lama),false,`${lama} tidak lagi dipaketkan`);
  const t=css();
  assert.equal((t.match(/login-background\.(svg|jpg)/g)||[]).length,0);
  assert.equal((t.match(/dashboard-background/g)||[]).length,0);
});

test('2. Latar dipotong dengan cover, tidak pernah diregangkan atau didistorsi',()=>{
  const t=css();
  const panggung=aturan(t,'.login-stage','login-background');
  assert.match(panggung,/\/cover/,'background-size cover: dipotong, bukan digepengkan');
  assert.match(panggung,/no-repeat/,'tidak diubin');
  assert.doesNotMatch(t,/background-size:100% 100%/,'tidak ada peregangan di mana pun');
  assert.doesNotMatch(t,/\.login-stage\{[^}]*object-fit:fill/,'tidak ada distorsi');
  /* Yang bergeser per lebar layar hanya titik potongnya, bukan perbandingan gambarnya. */
  assert.match(t,/--login-bg-pos:/,'titik fokus tersedia sebagai satu variabel');
  assert.match(t,/@media\(max-width:1200px\)[^@]*--login-bg-pos/s,'titik fokus digeser saat layar menyempit');
  assert.match(t,/@media\(max-width:900px\)[^@]*--login-bg-pos/s,'begitu pula pada tablet dan ponsel');
});

test('3. Tulisan yang memang bagian dari gambar tidak ditulis ulang sebagai elemen',()=>{
  const source=login(),t=css();
  /* Papan tulis ada DI DALAM berkas latar. Menuliskannya lagi akan membuatnya muncul dua kali. */
  assert.equal(source.includes('Administrasi Kelas yang Tertata'),false,
    'slogan papan tulis tidak ditulis ulang di halaman');
  assert.equal(/login-chalkboard/.test(source+t),false,'elemen papan tulis buatan dibuang');
  /* Dan tidak ada pseudo-element yang menempelkan apa pun ke atas gambar. */
  for(const selektor of ['\\.login-stage::before','\\.login-stage::after'])
    assert.equal(new RegExp(selektor+'\\{').test(t),false,`${selektor} tidak dipakai`);
});

/* ================================= §2. GAMBAR 2 SEBAGAI LATAR GLOBAL SESUDAH MASUK */

test('4. Latar aplikasi melekat pada shell, sehingga SELURUH halaman memakainya',()=>{
  const t=css();
  const shell=aturan(t,'.app-shell','app-background');
  assert.match(shell,/url\('\.\.\/\.\.\/assets\/app-background\.webp'\)/,'latar melekat pada .app-shell');
  assert.match(shell,/cover/);
  assert.match(shell,/no-repeat/);
  assert.match(shell,/linear-gradient/,'ada gradasi cadangan bila berkasnya belum ada');
  assert.equal((t.match(/app-background\.webp/g)||[]).length,1,'disebut tepat sekali');
  /* Karena latarnya melekat pada shell, tidak ada satu pun halaman yang perlu - atau boleh -
     menyebutnya sendiri. Itulah yang membuatnya berlaku untuk SEMUA menu, bukan Dashboard saja. */
  assert.equal(/dashboard-page/.test(read('src/pages/dashboard.js')),false,
    'Dashboard tidak lagi punya kait latar sendiri');
  const layout=read('src/ui/layout.js');
  assert.match(layout,/<div class="app-shell">/,'seluruh halaman dibungkus shell yang sama');
  /* Seluruh rute kedua peran dirender ke dalam shell itu. */
  const rute=[...new Set([...flattenNavigation('admin'),...flattenNavigation('teacher')].map(item=>item.route))];
  assert.ok(rute.length>=25,`ada ${rute.length} menu, semuanya berbagi shell yang sama`);
  assert.match(layout,/class="content" data-content/,'satu wadah isi untuk setiap rute');
});

test('5. Latar aplikasi TIDAK pernah ikut ke dokumen cetak',()=>{
  const t=css();
  assert.match(t,/@media print\{\.app-shell\{background:#fff!important\}\}/,
    'saat mencetak, shell kembali putih polos');
  /* Di LAYAR, halaman Rapor dan Leger justru MEMAKAI latar ini - keduanya disebut sendiri
     oleh pengguna sebagai halaman yang harus ikut. Yang putih di sana hanya lembar
     dokumennya, lewat aturan yang sudah ada sejak sebelumnya. */
  assert.match(t,/\.content:has\(\.print-workspace\)\{background:transparent\}/,
    'ruang kerja Rapor dan Leger ikut memperlihatkan latar aplikasi');
  assert.match(t,/\.print-workspace \.report-a4,\.print-workspace \.report-cover-a4\{background:#fff/,
    'lembar kertasnya sendiri tetap putih');
  /* Sidebar, topbar, dan footer tetap disembunyikan saat mencetak seperti sebelumnya. */
  assert.match(t,/@media print\{[^}]*\.sidebar,\.topbar,\.footer/);
  /* Lembar dokumen tetap putih dengan warnanya sendiri. */
  assert.match(t,/@media print\{@page\{size:A4 portrait/);
});

/* ================================================= §3. TEMA NAVY DIBUANG SELURUHNYA */

test('6. Tidak ada lagi blok navy pada sidebar, topbar, footer, menu, dan wadah utama',()=>{
  const t=css();
  for(const warna of ['#0b1a2f','#0f2745','#132f52'])
    assert.equal(t.includes(warna),false,`warna navy ${warna} tidak tertulis lagi di mana pun`);
  /* Token lama tetap bernama sama supaya aturan lama ikut berubah sekaligus, tetapi nilainya
     kini terang dan diambil dari palet latar aplikasi. */
  assert.match(t,/--navy:var\(--sky-mint\);--navy-2:var\(--sky-aqua\);--navy-3:var\(--sky-cream\)/);
  assert.match(t,/--dark-ink:var\(--sky-ink\);--dark-muted:var\(--sky-muted\)/);
  assert.match(t,/--sky-ink:#0d3b47/,'teks kerangka menjadi tinta gelap, bukan putih');
  const blok=t.slice(t.indexOf('TEMA 1.3.0'));
  for(const [selektor,warna] of [['.sidebar','rgba(255,255,255,.78)'],['.topbar','rgba(255,255,255,.7)']])
    assert.ok(blok.includes(`${selektor}{`)&&blok.includes(warna),
      `${selektor} menjadi kaca terang (${warna})`);
  assert.match(blok,/\.footer\{color:#25707f\}/,'footer memakai warna teks terang tema');
});

test('7. Struktur dan navigasi tidak berubah: tidak ada menu yang hilang',()=>{
  const layout=read('src/ui/layout.js');
  for(const bagian of ['<aside class="sidebar"','class="nav"','sidebar-footer','data-logout',
    'class="topbar"','page-title','semester-chip','data-profile-mini','class="footer"'])
    assert.ok(layout.includes(bagian),`${bagian} tetap ada`);
  /* Jumlah dan isi menu kedua peran tidak disentuh. */
  const admin=flattenNavigation('admin').map(item=>item.route);
  const guru=flattenNavigation('teacher').map(item=>item.route);
  assert.ok(admin.length>=25&&guru.length>=15);
  for(const rute of ['dashboard','profile','dapodik-pull','reference-school','reference-mapping',
    'reference-branding','objectives','attendance','assessment','attitudes','intracurricular-input',
    'cocurricular-input','extra-input','print-report','print-ledger','account-settings'])
    assert.ok(admin.includes(rute)||guru.includes(rute),`menu ${rute} tetap ada`);
  assert.ok(admin.includes('reference-students')&&!guru.includes('reference-students'),
    'pembatasan hak akses tidak berubah');
});

test('8. Menu terpilih tetap ditandai jelas dengan aksen tosca/biru',()=>{
  const t=css();
  const aktif=aturan(t,'.nav-group-toggle.active,.nav-item.active','background');
  assert.match(aktif,/linear-gradient\(135deg,#5de4e0 0%,#2fa8ff 100%\)/,'aksen tosca ke biru langit');
  assert.match(aktif,/font-weight:800/,'ditebalkan sehingga terbaca sekilas');
  assert.match(aktif,/box-shadow:/,'diberi bayangan supaya menonjol dari menu lain');
  /* Menu biasa dan menu terpilih memakai latar yang jelas berbeda. */
  assert.doesNotMatch(aturan(t,'.nav-group-toggle,.nav-item','color'),/linear-gradient/);
});

test('9. Kartu tetap cukup pekat untuk dibaca di atas latar bergambar',()=>{
  const t=css();
  const blok=t.slice(t.indexOf('TEMA 1.3.0'));
  const kartu=blok.match(/\.card,\.modal-card,[^{]*\{[^}]*\}/);
  assert.ok(kartu,'aturan permukaan kartu ditemukan');
  assert.match(kartu[0],/rgba\(255,255,255,\.94\)/,'hampir pekat, bukan kaca tipis');
  assert.match(kartu[0],/border:1px solid/);
  /* Permukaan terang tetap menetapkan warna teksnya sendiri, sehingga tidak pernah
     mewarisi teks terang dan berubah menjadi putih di atas putih. */
  assert.match(t,/\.card,\.modal-card,[^{]*\{color:var\(--light-ink\)\}/);
});

/* ======================================== §4-§5. SUSUNAN HALAMAN MASUK TANPA SEKAT */

test('10. Satu latar utuh dari tepi kiri sampai tepi kanan, tanpa sekat',()=>{
  const t=css(),source=login();
  /* Tidak ada kolom kedua, tidak ada panel kanan berlatar sendiri, tidak ada garis pemisah. */
  assert.equal(/grid-template-columns:1\.05fr \.95fr/.test(t),false,'kisi dua kolom dibuang');
  assert.equal(/^\.login-photo\{|^\.login-panel\{/m.test(t),false,'gaya kolom foto dan panel dibuang');
  assert.equal(/login-photo|<section class="login-panel">/.test(source),false,'markupnya ikut dibuang');
  const panggung=aturan(t,'.login-stage','display');
  assert.match(panggung,/display:block/,'satu bidang, bukan kisi dua kolom');
  assert.match(panggung,/login-background\.webp/,'latarnya sendiri yang menutupi seluruh layar');
  /* Tidak ada garis tegak pemisah kanan-kiri di mana pun pada halaman Masuk. */
  for(const selektor of ['.login-layout','.login-card-slot','.login-veil'])
    assert.doesNotMatch(aturan(t,selektor,'{'),/border-left|border-right/,
      `${selektor} tidak menggambar garis pemisah`);
});

test('11. Susunan GAMBAR 3: identitas kiri atas, kredit kiri bawah, kartu kanan',()=>{
  const t=css();
  const kisi=aturan(t,'.login-layout','grid-template-areas');
  assert.match(kisi,/grid-template-areas:"brand kartu" "\. kartu" "kredit kartu"/,
    'kartu memanjang di kanan, identitas dan kredit di kiri');
  assert.match(kisi,/grid-template-rows:auto 1fr auto/,'kredit terdorong ke baris terbawah');
  assert.match(aturan(t,'.login-brand','align-self'),/align-self:start/,'identitas sekolah di atas');
  assert.match(aturan(t,'.login-credit','align-self'),/align-self:end/,'identitas pengembang di bawah');
  const kartu=aturan(t,'.login-card-slot','align-self');
  assert.match(kartu,/align-self:center/,'kartu mengambang di tengah tinggi layar');
  assert.match(kartu,/justify-self:end/,'kartu berada di sisi kanan');
});

test('12. Kartu Masuk membulat, ringkas, kaca pastel - bukan putih polos, bukan navy',()=>{
  const t=css();
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA (1.3.1): setelah diuji pada APK sungguhan,
     pengguna menyatakan kartu ini masih terlalu putih dan meminta warnanya diambil dari gambar
     Login. Pangkalnya kini mint, bukan putih - larangan "putih polos" justru makin ketat. */
  const kartu=aturan(t,'.login-shell','background:linear-gradient');
  assert.match(kartu,/rgba\(235,255,247,\.88\)/,'berpangkal mint');
  assert.match(kartu,/rgba\(204,242,255,\.86\)/,'berujung biru langit muda, bukan putih polos');
  assert.equal(/rgba\(255,\s*255,\s*255,\s*\.[89]/.test(kartu),false,'tidak putih dominan');
  assert.match(kartu,/backdrop-filter:blur/,'berkesan kaca');
  /* Tepi dan bayangannya ikut dipindah ke keluarga tosca pada 1.3.1. */
  assert.match(kartu,/border:1px solid rgba\(38,170,190,\.34\)/,'batas tosca lembut, bukan garis keras');
  assert.match(kartu,/box-shadow:0 20px 44px/,'bayangan lembut');
  assert.match(aturan(t,'.login-shell','border-radius'),/border-radius:(20|18)px/,'sudutnya membulat');
  /* Tidak ada satu pun warna navy tersisa pada kartu. */
  assert.doesNotMatch(kartu,/#0b1a2f|#0f2745|var\(--navy\)/);
});

test('13. Seluruh kendali dan logika masuk tidak diubah',()=>{
  const source=login();
  for(const id of ['loginSchool','semester','username','password','loginForm','loginError',
    'forgot','loginHelp'])
    assert.match(source,new RegExp(`id="${id}"`),`kontrol ${id} tetap ada`);
  for(const teks of ['Masuk ke e-Rapor','Admin','Guru / Wali Kelas','MASUK','Lupa Password?',
    'Aktivasi Admin Pertama','password-toggle','login-version'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
  for(const fungsi of ['authenticate(','saveSession(','recoverAdmin','ensureSecurityBootstrap',
    'getSecurityStatus','refreshLicenseForLogin','onLicenseBlocked'])
    assert.ok(source.includes(fungsi),`${fungsi} tidak diubah`);
});

/* ======================================= §6-§7. BRANDING DINAMIS DAN KREDIT PENGEMBANG */

test('14. Identitas sekolah dan ketiga logo tetap dibaca dari master Admin',()=>{
  const source=login();
  /* TIDAK ADA identitas yang ditulis mati. */
  for(const mati of ['SDN SATRIA JAYA 01','SDN Satria Jaya 01','KABUPATEN BEKASI','Kabupaten Bekasi'])
    assert.equal(source.includes(mati),false,`"${mati}" tidak ditulis mati`);
  assert.match(source,/const school=getSchoolMaster\(\)/,'identitas dibaca dari master');
  assert.match(source,/schoolLabel=schoolName\|\|SCHOOL_PLACEHOLDER/,'label netral sebelum Setup Awal');
  assert.match(source,/<strong>\$\{escapeHtml\(schoolLabel\.toUpperCase\(\)\)\}<\/strong>/);
  assert.match(source,/<span class="login-brand-app">e-Rapor<\/span>/);
  assert.match(source,/Cerdas • Berkarakter • Berprestasi/);
  /* Tiga logo, urutan Tut Wuri → Daerah → Sekolah, ketiganya dari master. */
  const baris=source.slice(source.indexOf('class="login-crest-row"'),source.indexOf('<h2>'));
  assert.deepEqual([...baris.matchAll(/data-crest="(\w+)"/g)].map(item=>item[1]),
    ['ministry','region','school']);
  assert.equal((baris.match(/<img/g)||[]).length,3,'tepat tiga logo');
  assert.doesNotMatch(baris,/src="\.\/assets\//,'tidak ada berkas lambang yang ditulis mati');
  assert.match(source,/alt="Logo Kabupaten\/Kota\/Provinsi"/,'label lambang daerah tetap netral');
});

test('15. Kredit pengembang tetap di kiri bawah, rapat, dan di luar kartu',()=>{
  const source=login(),t=css();
  assert.ok(source.indexOf('class="login-credit"')<source.indexOf('<div class="login-card-slot">'),
    'berdiri di luar dan sebelum kartu');
  const kartu=source.slice(source.indexOf('<div class="login-card-slot">'));
  assert.equal(/login-credit|DEVELOPER_NAME/.test(kartu),false,'tidak pernah masuk ke dalam kartu');
  /* Empat barisnya berurutan dan jaraknya rapat. */
  const blok=source.match(/<div class="login-credit">([\s\S]*?)<\/div>/)[1];
  let posisi=-1;
  for(const teks of ['DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT']){
    const kini=blok.indexOf(teks);
    assert.ok(kini>posisi,`${teks} berurutan`);
    posisi=kini;
  }
  for(const nama of ['login-credit-name','login-credit-role','login-credit-copy']){
    const cocok=aturan(t,`.${nama}`,'margin-top').match(/margin-top:([\d.]+)(?:px)?[;}]/);
    assert.ok(cocok&&Number(cocok[1])<=2,`jarak .${nama} rapat (${cocok?cocok[1]:'?'})`);
  }
});

/* =============================================================== §8. TANGGAPAN LAYAR */

test('16. Kedua latar tetap rapi pada ponsel, tablet, dan laptop',()=>{
  const t=css();
  /* Ponsel dan tablet potret: isi menumpuk, kartu melebar, kredit tetap di kaki layar. */
  assert.match(t,/@media\(max-width:900px\)[^@]*\.login-layout\{[^}]*grid-template-areas:"brand" "kartu" "kredit"/s);
  assert.match(t,/@media\(max-width:900px\)[^@]*\.login-card-slot\{[^}]*width:min\(392px,100%\)/s,
    'kartu tidak terpotong pada layar sempit');
  /* Lanskap pendek: kisi kembali dua kolom supaya kartu tidak memakan seluruh tinggi, dan
     halaman boleh digulir bila kartunya masih lebih tinggi daripada layar. */
  assert.match(t,/@media\(max-height:560px\) and \(orientation:landscape\)[^@]*\.login-stage\{overflow-y:auto\}/s);
  assert.match(t,/@media\(max-height:560px\) and \(orientation:landscape\)[^@]*grid-template-areas:"brand kartu"/s);
  /* Tiga logo mengecil bersama-sama sehingga tidak pernah bertindihan. */
  const tinggi=[...t.matchAll(/\.login-crest\{height:(\d+)px/g)].map(item=>Number(item[1]));
  assert.ok(tinggi.length>=4,`ada ${tinggi.length} ukuran lambang untuk berbagai layar`);
  for(const px of tinggi)
    assert.match(t,new RegExp(`\\.login-crest-upload\\{width:${px}px;height:${px}px`),
      `kotak unggahan ikut ${px}px sehingga barisnya tetap rapi`);
  /* Aman dari area sistem, dan tidak pernah meluber ke samping. */
  assert.match(t,/\.login-layout\{[^}]*env\(safe-area-inset-bottom\)/s);
  assert.doesNotMatch(t,/\.login-stage\{[^}]*overflow-x:(scroll|auto)/);
});

/* ================================================ §9. FITUR LAIN TIDAK IKUT BERUBAH */

test('17. Perbaikan deskripsi anti-pengulangan kata dari 1.2.9 tetap dipertahankan',()=>{
  const layanan=read('src/services/cp-descriptions.js');
  assert.match(layanan,/function pilihTanpaUlangan\(/,'pemilih kalimat tanpa ulangan tetap ada');
  assert.match(layanan,/function kataIsi\(/);
  assert.match(layanan,/const KATA_TUGAS=new Set\(/,'kata tugas tetap dikecualikan');
  /* Penutup kalimat tetap berupa beberapa pilihan per predikat, bukan satu kalimat tetap. */
  for(const nama of ['PENUTUP_TEORI','PENUTUP_PRAKTIK','LANJUTAN_PEMAHAMAN'])
    assert.match(layanan,new RegExp(`const ${nama}=`),`${nama} tetap ada`);
});

test('18. Berkas cetak, Cover, dan Leger tidak tersentuh perubahan tema',()=>{
  const t=css();
  /* Slot Cover dan perilaku logo unggahannya tidak berubah sedikit pun. */
  assert.match(t,/\.report-cover-a4>\.cover-logo-custom\{overflow:visible;width:189px;height:189px\}/);
  assert.equal((t.match(/\.report-cover-a4>\.cover-logo-custom>img\{width:100%;height:100%;object-fit:contain;margin:0\}/g)||[]).length,2);
  /* Lembar dokumen tetap putih dan tidak mewarisi latar aplikasi. */
  assert.match(t,/html\[data-route="print"\][^{]*\.content,html\[data-route="print"\] \.footer\{background:#fff\}/);
  assert.match(t,/\.print-workspace \.report-a4,\.print-workspace \.report-cover-a4\{background:#fff/);
});
