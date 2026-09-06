import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { flattenNavigation } from '../src/data/navigation.js';
import { getManualAttendance, saveManualAttendance } from '../src/services/attendance.js';
import { getSubjectMapping, saveSubjectMapping } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping as siapkanMapel } from './helpers/penugasan.js';

/* PERBAIKAN UI/UX 1.3.1 - HASIL PENGUJIAN FISIK APK 1.3.0.

   Lima keluhan nyata dari perangkat sungguhan, dan apa yang dikunci suite ini:

     A. Absensi Manual - kotak angka terlihat terpotong dan tertutup tombol Simpan.
     B. Mapping Mata Pelajaran - nama mapel bertabrakan dengan kontrol di sebelah kiri.
     C-E. Kartu, panel, form, tabel, sidebar, topbar, footer terlalu putih dan terbaca
          sebagai lembar yang ditempel di atas latar global.
     F-L. Halaman Masuk - identitas dua sudut kurang terbaca, dan kartunya terlalu putih.

   Latar global maupun latar Masuk TIDAK disentuh sama sekali; keduanya tetap berkas acuan
   asli. Logika akademik, penyimpanan, dan otorisasi juga tidak diubah. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css');
/* Mengambil aturan CSS untuk sebuah selektor.

   Dua hal yang harus benar supaya pembacaannya jujur:

     1. Selektornya DIPATOK pada batas yang sebenarnya - awal baris, koma, atau tutup kurung -
        sehingga `.login-field-icon` tidak ikut terjaring oleh
        `.login-field:focus-within .login-field-icon`, dan `.subject-row` tidak terjaring oleh
        `.subject-row .switch`.
     2. Pemanggilnya memilih sendiri aturan mana yang dimaksud: `aturan()` mengambil yang
        TERAKHIR mendeklarasikan properti itu (pemenang cascade, termasuk penimpaan di dalam
        media query), sedangkan `aturanDasar()` mengambil yang PERTAMA - dipakai ketika yang
        diuji memang aturan dasar untuk layar lebar, bukan penimpaannya di layar sempit. */
function semuaAturan(teks,selektor,properti){
  const lolos=selektor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pola=new RegExp('(?:^|[,}])\\s*'+lolos+'\\{[^}]*\\}','gm');
  return [...teks.matchAll(pola)].map(m=>m[0].replace(/^[,}]\s*/,''))
    .filter(m=>m.includes(properti));
}
function aturan(teks,selektor,properti){return semuaAturan(teks,selektor,properti).at(-1)||'';}
function aturanDasar(teks,selektor,properti){return semuaAturan(teks,selektor,properti)[0]||'';}
/* Angka pertama sebuah properti di dalam satu aturan, apa pun spasi dan baris barunya. */
function angka(aturanTeks,properti){
  const cocok=aturanTeks.match(new RegExp('(?:^|[;{]\\s*)'+properti+':(\\d+(?:\\.\\d+)?)px'));
  assert.ok(cocok,`${properti} ditemukan pada: ${aturanTeks.slice(0,90)}`);
  return Number(cocok[1]);
}
function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
const admin=()=>({role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`,userName:'Admin'});

/* ================================================ A. ABSENSI MANUAL - KOTAK ANGKA */

test('1. Kotak angka Absensi manual punya lebar dan tinggi sentuh yang layak',()=>{
  const t=css();
  const kotak=aturan(t,'.attendance-manual .attendance-manual-input','width');
  assert.ok(kotak,'aturan kotak angka ditemukan');
  const lebar=angka(kotak,'width'),lebarMin=angka(kotak,'min-width');
  assert.ok(lebar>=80,`lebar ${lebar}px cukup untuk angka tiga digit`);
  assert.ok(lebarMin>=80,`lebar minimum ${lebarMin}px menjaga kotak tidak pernah menyusut`);
  const tinggi=angka(kotak,'min-height');
  assert.ok(tinggi>=44,`tinggi ${tinggi}px memenuhi sasaran sentuh`);
});

test('2. Angka 0, 10, dan 99 terbaca utuh: rata tengah dan ruangnya cukup',()=>{
  const t=css();
  const kotak=aturan(t,'.attendance-manual .attendance-manual-input','text-align');
  assert.match(kotak,/text-align:center/,'angka rata tengah secara mendatar');
  assert.match(kotak,/font-variant-numeric:tabular-nums/,'lebar tiap digit sama sehingga tidak bergeser');
  /* Ruang isi = lebar - padding kiri/kanan - garis tepi. Tiga digit pada 13px butuh ~24px;
     yang tersedia harus jauh lebih lega daripada itu. */
  const lebar=angka(kotak,'width');
  const padding=Number(kotak.match(/padding:\d+px (\d+)px/)[1]);
  assert.ok(lebar-padding*2-2>=60,`ruang angka ${lebar-padding*2-2}px, cukup untuk tiga digit`);
  /* Bingkai dan sudutnya tetap utuh, tidak terpotong. */
  assert.match(kotak,/border-radius:10px/,'sudut membulat tetap terlihat utuh');
  /* Panah putar bawaan dimatikan supaya tidak memakan lebar yang sudah dijatah untuk angka. */
  assert.match(t,/\.attendance-manual \.attendance-manual-input\{-moz-appearance:textfield;appearance:textfield\}/);
  assert.match(t,/\.attendance-manual \.attendance-manual-input::-webkit-inner-spin-button\{-webkit-appearance:none/);
});

test('3. Kotak angka tidak pernah tertindih tombol Simpan',()=>{
  const t=css();
  /* AKAR MASALAHNYA: kolom Aksi memakai position:sticky right:0 sementara tabelnya lebih lebar
     daripada kartu yang memuatnya, sehingga tombol Simpan mengambang di atas kolom angka.
     Pada tabel INI kolomnya dikembalikan statis, jadi tombolnya ikut mengalir dalam baris. */
  const aksi=aturan(t,'.attendance-manual .cell-actions','position');
  assert.match(aksi,/position:static/,'kolom Aksi tidak lagi menempel di atas isian');
  assert.match(aksi,/padding-left:1[0-9]px/,'ada jarak antara kolom angka dan tombol');
  /* Tabel lain TIDAK ikut berubah: kolom aksinya tetap menempel seperti sebelumnya. */
  assert.match(aturanDasar(t,'.data-table .cell-actions','position'),/position:sticky/,
    'tabel lain tetap memakai kolom aksi yang menempel');
  /* Tombolnya sendiri tetap nyaman disentuh dan tidak menyusut. */
  const tombol=aturan(t,'.attendance-manual .cell-actions .btn-small','min-height');
  assert.match(tombol,/min-height:44px/,'tombol Simpan tetap setinggi sasaran sentuh');
  assert.match(tombol,/white-space:nowrap/,'label Simpan tidak pernah terpotong dua baris');
});

test('4. Input dan tombol sejajar, dan penanda kolomnya dipasang di markup',()=>{
  const halaman=read('src/pages/attendance.js');
  /* Ketiga kolom angka ditandai supaya gayanya dapat dituju tanpa nth-child yang rapuh. */
  assert.equal((halaman.match(/class="attendance-manual-cell"/g)||[]).length,6,
    'tiga kolom kepala dan tiga kolom isi ditandai');
  assert.equal((halaman.match(/class="input attendance-manual-input"/g)||[]).length,3,
    'ketiga kotak angka memakai kelas yang sama');
  assert.match(css(),/\.attendance-manual td\.attendance-manual-cell[^{]*\{[^}]*vertical-align:middle/,
    'isi kolom rata tengah secara tegak sehingga sejajar dengan tombol');
  /* NAMA KELASNYA TIDAK BOLEH BERTABRAKAN dengan lencana angka .attendance-number yang sudah
     ada - lencana itu memakai display:grid dan lebar 28px, dan sempat membuat seluruh kolom
     angka runtuh menjadi satu tumpukan saat namanya masih sama. */
  const tabelManual=halaman.slice(halaman.indexOf('class="data-table attendance-manual"'),
    halaman.indexOf('data-manual-clear'));
  assert.equal(tabelManual.includes('class="attendance-number"'),false,
    'tabel manual tidak memakai nama kelas milik lencana angka');
  assert.match(css(),/\.attendance-number\{width:28px;height:28px[^}]*display:grid/,
    'lencana angka lama tetap utuh dan tidak tersentuh');
  /* Dan lencana itu MASIH dipakai di tempat aslinya: daftar absensi harian. */
  const daftarHarian=halaman.slice(halaman.indexOf('class="attendance-list"'),
    halaman.indexOf('function manualTable'));
  assert.match(daftarHarian,/<div class="attendance-number">\$\{index\+1\}<\/div>/,
    'lencana angka absensi harian tidak ikut terbawa penggantian nama');
});

test('5. Logika Absensi, perhitungan hari, dan penyimpanannya tidak berubah',()=>{
  useMemoryStorage();
  const sesi=guru();
  siapkanMapel(sesi,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  const siswa=createStudent(sesi,{classId:'5B',nis:'5B-1',nisn:'4411000001',
    name:'Adwa Habibi Rizky',gender:'L',photo:''});
  saveManualAttendance(sesi,siswa.id,{Sakit:2,Izin:1,Alpa:3});
  invalidateDbCache();
  const rekap=getManualAttendance(sesi,siswa.id,{classId:'5B'});
  assert.deepEqual({Sakit:rekap.Sakit,Izin:rekap.Izin,Alpa:rekap.Alpa},{Sakit:2,Izin:1,Alpa:3},
    'angka manual tersimpan dan terbaca kembali apa adanya');
  assert.ok(Object.hasOwn(loadDb(),'manualAttendance'),'koleksi penyimpanannya tetap ada');
  /* Batas nilai pada markup tidak diubah. */
  const halaman=read('src/pages/attendance.js');
  assert.equal((halaman.match(/type="number" min="0" max="250" step="1"/g)||[]).length,3);
});

/* ============================================ B. MAPPING - LIMA AREA TERPISAH */

test('6. Baris Mapping punya lima area terpisah: urutan, nomor, nama, kelompok, aktif',()=>{
  const t=css();
  const baris=aturanDasar(t,'.subject-row','grid-template-areas');
  assert.match(baris,/grid-template-areas:"urut nomor nama kelompok aktif"/,
    'kelima bagian berdiri pada areanya masing-masing');
  assert.match(baris,/grid-template-columns:auto auto minmax\(0,1fr\) auto auto/,
    'hanya kolom nama yang melar; empat lainnya selebar isinya');
  for(const [selektor,area] of [['.order-actions','urut'],['.subject-order','nomor'],
    ['.subject-text','nama'],['.mapping-group-select','kelompok'],['.subject-row .switch','aktif']])
    assert.match(aturanDasar(t,selektor,'grid-area'),new RegExp(`grid-area:${area}`),
      `${selektor} menempati area ${area}`);
});

test('7. Nomor urut bukan lagi elemen yang dapat bertumpuk dengan nama mapel',()=>{
  const halaman=read('src/pages/settings.js');
  /* AKAR MASALAHNYA: nomor dulu ditulis sebagai <span> DI DALAM blok nama, sehingga keduanya
     berbagi satu kotak dan nama panjang menabraknya saat membungkus baris. */
  assert.equal(/<span class="muted" style="margin-right:7px">\$\{item\.order\}\.<\/span>/.test(halaman),false,
    'nomor tidak lagi ditempel di dalam blok nama');
  assert.match(halaman,/<div class="subject-order" aria-hidden="true">\$\{item\.order\}\.<\/div>/,
    'nomor berdiri sebagai elemennya sendiri');
  assert.match(halaman,/<div class="subject-text"><div class="subject-name">\$\{escapeHtml\(item\.name\)\}<\/div>/,
    'nama mapel punya kotaknya sendiri, tanpa nomor di dalamnya');
  /* Nomor tidak dibacakan dua kali oleh pembaca layar: urutannya sudah tersirat dari daftarnya. */
  assert.match(halaman,/class="subject-order" aria-hidden="true"/);
});

test('8. Nama mapel punya ruang sendiri dan boleh membungkus baris secara alami',()=>{
  const t=css();
  assert.match(aturanDasar(t,'.subject-text','grid-area'),/min-width:0/,
    'kotak nama boleh menyempit tanpa mendorong tetangganya');
  const nama=aturanDasar(t,'.subject-name','overflow-wrap');
  assert.match(nama,/overflow-wrap:anywhere/,'nama panjang membungkus, bukan meluber');
  assert.match(nama,/line-height:1\.4/,'antarbarisnya tetap terbaca saat membungkus');
  /* Setiap anak baris dijaga agar tidak pernah meluber melewati jatah kolomnya. */
  assert.match(t,/\.subject-row>\*\{min-width:0\}/,'tidak ada anak baris yang meluber');
});

test('9. Tombol urutan tidak lagi menyusut sampai di bawah sasaran sentuh',()=>{
  const t=css();
  /* Dulu dua tombol dijejalkan ke kolom selebar 42px dan terukur menyusut sampai 20px. */
  const tombol=aturanDasar(t,'.order-actions .btn-icon','min-width');
  assert.match(tombol,/width:40px;min-width:40px/,'lebarnya tidak lagi dapat ditekan');
  assert.match(tombol,/flex:none/,'tombol tidak ikut menyusut oleh tetangganya');
  const ponsel=t.slice(t.indexOf('@media(max-width:767px)',t.indexOf('B. MAPPING MATA PELAJARAN')));
  assert.match(ponsel,/\.order-actions \.btn-icon\{width:44px;min-width:44px;height:44px;min-height:44px\}/,
    'di ponsel tombolnya justru dibesarkan menjadi 44px');
});

test('10. Mapping tetap rapi pada tablet dan ponsel',()=>{
  const t=css();
  const blok=t.slice(t.indexOf('B. MAPPING MATA PELAJARAN'));
  /* Tablet: kelompok dan aktif turun ke baris sendiri, nama tetap utuh di baris pertama. */
  assert.match(blok,/@media\(max-width:1050px\)[^@]*grid-template-areas:"urut nomor nama" "\.  \.    kelompok" "\.  \.    aktif"/s);
  /* Ponsel: nomor dan nama di baris pertama, sisanya menumpuk penuh selebar kartu. */
  assert.match(blok,/@media\(max-width:767px\)[^@]*grid-template-areas:"nomor nama" "urut urut" "kelompok kelompok" "aktif aktif"/s);
  assert.match(blok,/@media\(max-width:767px\)[^@]*\.mapping-group-select\{max-width:none\}/s,
    'dropdown kelompok memakai selebar kartu di ponsel');
});

test('11. Seluruh fungsi Mapping tetap utuh',()=>{
  const halaman=read('src/pages/settings.js');
  for(const bagian of ['data-up','data-down','data-group','data-active','data-reset','data-save',
    'reorderWithinGroup','moveSubjectToGroup','resetSubjectMapping','saveSubjectMapping',
    'Reset Default','Simpan Mapping','canReorderWithinGroup'])
    assert.ok(halaman.includes(bagian),`${bagian} tetap ada`);
  /* Dan mapping yang tersimpan tetap terbaca apa adanya. */
  useMemoryStorage();
  const sesi=admin();
  const awal=getSubjectMapping(sesi);
  const diubah=awal.map((item,index)=>({...item,active:index%2===0,order:index+1}));
  saveSubjectMapping(sesi,diubah);
  invalidateDbCache();
  const kembali=getSubjectMapping(sesi);
  assert.deepEqual(kembali.map(x=>x.active),diubah.map(x=>x.active),'status aktif tersimpan');
  assert.deepEqual(kembali.map(x=>x.id),diubah.map(x=>x.id),'urutannya tersimpan');
});

/* ================================= C-E. TEMA GLOBAL: KACA MINT, BUKAN PUTIH SOLID */

test('12. Permukaan kartu, panel, form, dan tabel memakai kaca mint - bukan putih solid',()=>{
  const t=css();
  for(const [nama,nilai] of [['--kaca-1','rgba(245,255,252,.84)'],['--kaca-2','rgba(226,250,250,.8)'],
    ['--kaca-3','rgba(214,243,255,.82)'],['--kaca-tepi','rgba(70,210,220,.24)']])
    assert.ok(t.includes(`${nama}:${nilai}`),`${nama} memakai ${nilai}`);
  const permukaan=[...t.matchAll(/[^{}]*\.dash-stat,\.dash-panel\{[^}]*\}/g)]
    .map(m=>m[0]).filter(x=>x.includes('--kaca-1')).at(-1)||'';
  assert.ok(permukaan,'aturan permukaan bersama ditemukan');
  /* Aturan itu memang mencakup kartu, modal, tabel, dan panel di SELURUH aplikasi. */
  for(const selektor of ['.card','.modal-card','.student-table-card','.users-table-card',
    '.leger-table-card','.reference-subject-card','.objective-card','.wide-table-card',
    '.admin-status-detail','.import-preview-table','.dash-stat','.dash-panel'])
    assert.ok(permukaan.includes(selektor+',')||permukaan.includes(selektor+'{'),
      `${selektor} ikut memakai permukaan kaca`);
  assert.match(permukaan,/background:linear-gradient\(150deg,var\(--kaca-1\) 0%,var\(--kaca-2\) 55%,var\(--kaca-3\) 100%\)/);
  assert.match(permukaan,/border:1px solid var\(--kaca-tepi\)/,'tepi tosca sangat lembut');
  assert.match(permukaan,/backdrop-filter:blur\(10px\)/,'kaca ringan');
  /* Dan tidak ada lagi putih pekat sebagai warna dominan permukaan. */
  assert.equal(/rgba\(255,255,255,\.9[0-9]?\)/.test(permukaan),false,'bukan putih solid');
});

test('13. Isian form dan tabel ikut berwarna, tetapi teksnya tetap gelap dan kontras',()=>{
  const t=css();
  assert.match(aturan(t,'.input,.tab','background'),/rgba\(250,255,254,\.9\)/,'isian mint sangat muda');
  assert.match(aturan(t,'.data-table th','background'),/rgba\(214,243,255,\.62\)/,'kepala tabel biru langit muda');
  /* KONTRAS: permukaan terang tetap memakai tinta gelapnya sendiri, tidak pernah teks pucat. */
  assert.match(t,/\.card,\.modal-card,[^{]*\{color:var\(--light-ink\)\}/,'permukaan terang memakai tinta gelap');
  assert.match(t,/--light-ink:#241d19/,'tinta isi tetap gelap');
  assert.match(aturan(t,'.data-table th','color'),/color:#215f70/,'kepala tabel teal gelap');
  assert.match(t,/--teks-utama:#0b3b48/,'judul memakai teal gelap');
  /* Tidak ada teks putih yang ditempel pada permukaan mint terang. */
  const blok=t.slice(t.indexOf('PERBAIKAN 1.3.1'));
  assert.equal(/\.(card|data-table|input|dash-stat|dash-panel)[^{]*\{[^}]*color:#fff/.test(blok),false,
    'tidak ada teks putih di atas permukaan terang');
});

test('14. Sidebar, topbar, dan footer menyatu dengan latar dan tidak kembali navy',()=>{
  const t=css();
  assert.match(aturan(t,'.sidebar','background'),/rgba\(236,253,250,\.9\)/,'sidebar kaca mint');
  assert.match(aturan(t,'.topbar','background'),/rgba\(240,254,251,\.88\)/,'topbar kaca mint');
  assert.match(aturan(t,'.footer','color'),/color:#1f6b7c/,'footer teal, bukan navy');
  for(const warna of ['#0b1a2f','#0f2745','#132f52'])
    assert.equal(t.includes(warna),false,`warna navy ${warna} tidak kembali`);
  /* Menu terpilih tetap memakai gradasi tosca ke biru langit. */
  assert.match(aturan(t,'.nav-group-toggle.active,.nav-item.active','background'),
    /linear-gradient\(135deg,#5de4e0 0%,#2fa8ff 100%\)/);
  /* Struktur, foto profil, dan jumlah menu tidak diubah. */
  const layout=read('src/ui/layout.js');
  assert.match(layout,/class="brand-photo" src="\$\{BRAND_PHOTO\}"/,'foto profil tetap ada');
  assert.ok(flattenNavigation('admin').length>=25&&flattenNavigation('teacher').length>=15);
});

/* ============================== F-L. HALAMAN MASUK: KETERBACAAN DAN WARNA KARTU */

test('15. Latar Masuk dan latar aplikasi tetap berkas asli, tidak digambar ulang',()=>{
  const t=css();
  assert.ok(existsSync(new URL('assets/login-background.webp',root)));
  assert.ok(existsSync(new URL('assets/app-background.webp',root)));
  for(const lama of ['assets/login-background.svg','assets/dashboard-background.svg',
    'assets/login-background.jpg'])
    assert.equal(existsSync(new URL(lama,root)),false,`${lama} tidak dihidupkan kembali`);
  assert.equal((t.match(/login-background\.webp/g)||[]).length,1);
  assert.equal((t.match(/app-background\.webp/g)||[]).length,1);
  assert.equal((t.match(/login-background\.(svg|jpg)|dashboard-background/g)||[]).length,0,
    'tidak ada SVG pengganti');
  assert.match(aturan(t,'.login-stage','login-background'),/\/cover/,'tetap cover, tidak diregangkan');
  assert.match(aturan(t,'.app-shell','app-background'),/cover/);
});

test('16. Halaman Masuk tetap satu latar penuh tanpa sekat kanan-kiri',()=>{
  const t=css(),halaman=read('src/pages/login.js');
  assert.equal(/grid-template-columns:1\.05fr \.95fr/.test(t),false,'tidak ada kisi dua kolom');
  assert.equal(/^\.login-photo\{|^\.login-panel\{/m.test(t),false,'tidak ada kolom berlatar sendiri');
  assert.equal(/login-photo|<section class="login-panel">/.test(halaman),false);
  assert.match(aturan(t,'.login-stage','display'),/display:block/,'satu bidang utuh');
  assert.match(aturan(t,'.login-layout','grid-template-areas'),
    /grid-template-areas:"brand kartu" "\. kartu" "kredit kartu"/,'susunannya tidak berubah');
  /* Kredit pengembang tetap di kiri bawah, di luar kartu. */
  assert.match(aturan(t,'.login-credit','align-self'),/align-self:end/);
  assert.ok(halaman.indexOf('class="login-credit"')<halaman.indexOf('<div class="login-card-slot">'));
});

test('17. Identitas sekolah di kiri atas dinaikkan keterbacaannya',()=>{
  const t=css();
  /* Warna teal/biru gelap yang diminta, bukan tosca muda yang menyatu dengan latar terang. */
  assert.match(aturan(t,'.login-brand-text strong','color'),/color:#073B5C/,'nama sekolah teal gelap');
  assert.match(aturan(t,'.login-brand-app','color'),/color:#075985/,'baris e-Rapor biru gelap');
  const tagline=aturan(t,'.login-brand-tagline','color');
  assert.match(tagline,/color:#064E63/,'tagline teal gelap, tidak pudar');
  const berat=Number(tagline.match(/font-weight:(\d+)/)[1]);
  assert.ok(berat>=600&&berat<=700,`tagline berbobot ${berat}, sesuai rentang yang diminta`);
  assert.match(tagline,/font-size:10\.5px/,'ukurannya tidak dibesarkan berlebihan');
  /* Halo putih tipis supaya tetap terbaca di bagian gambar yang paling terang. */
  for(const selektor of ['.login-brand-text strong','.login-brand-tagline','.login-brand-app'])
    assert.match(aturan(t,selektor,'text-shadow'),/text-shadow:0 1px [36]px rgba\(255,255,255,\.9/,
      `${selektor} punya halo lembut`);
  /* Logo sekolah tetap dinamis dari master. */
  const halaman=read('src/pages/login.js');
  assert.match(halaman,/const crest=schoolLogo\|\|'\.\/assets\/app-icon-192\.png'/);
});

test('18. Identitas pengembang di kiri bawah dinaikkan keterbacaannya dengan hierarki',()=>{
  const t=css();
  const berat=nama=>Number(aturan(t,`.${nama}`,'font-weight').match(/font-weight:(\d+)/)[1]);
  /* Nama pengembang paling kuat; tiga baris lain medium/semibold. */
  assert.equal(berat('login-credit-name'),900,'nama paling tebal');
  assert.equal(berat('login-credit-lead'),800);
  assert.ok(berat('login-credit-role')>=600&&berat('login-credit-role')<berat('login-credit-name'));
  assert.ok(berat('login-credit-copy')>=600&&berat('login-credit-copy')<berat('login-credit-name'));
  /* Keempatnya teal/biru gelap dengan halo, bukan kotak besar di belakangnya. */
  for(const nama of ['login-credit-lead','login-credit-name','login-credit-role','login-credit-copy']){
    assert.match(aturan(t,`.${nama}`,'color'),/color:#(073B5C|064E63|075985)/,`${nama} teal/biru gelap`);
    assert.match(aturan(t,`.${nama}`,'text-shadow'),/rgba\(255,255,255,\.95\)/,`${nama} punya halo`);
    assert.equal(/background(-color)?:/.test(aturan(t,`.${nama}`,'color')),false,
      `${nama} tidak memakai kotak sendiri`);
  }
  /* Jarak rapat yang sudah diperbaiki sebelumnya tetap dipertahankan. */
  for(const nama of ['login-credit-name','login-credit-role','login-credit-copy']){
    const cocok=aturan(t,`.${nama}`,'margin-top').match(/margin-top:([\d.]+)(?:px)?[;}]/);
    assert.ok(cocok&&Number(cocok[1])<=2,`jarak .${nama} tetap rapat`);
  }
});

test('19. Kartu dan isian Masuk mengambil warna dari gambar latarnya',()=>{
  const t=css();
  const kartu=aturan(t,'.login-shell','background:linear-gradient');
  /* Mint - aqua - biru langit muda, bukan putih susu yang tertempel. */
  assert.match(kartu,/rgba\(235,255,247,\.88\)/,'berpangkal mint');
  assert.match(kartu,/rgba\(210,250,247,\.84\)/,'melewati aqua');
  assert.match(kartu,/rgba\(204,242,255,\.86\)/,'berujung biru langit muda');
  assert.equal(/rgba\(255,\s*255,\s*255,\s*\.[89]/.test(kartu),false,'bukan putih dominan');
  /* Kartunya TETAP berupa kotak: tepi, bayangan, dan sudutnya masih ada. */
  assert.match(kartu,/border:1px solid rgba\(38,170,190,\.34\)/,'tepi tosca tipis');
  assert.match(kartu,/box-shadow:0 20px 44px/,'bayangan lembut');
  assert.match(kartu,/backdrop-filter:blur\(16px\)/,'kaca ringan');
  /* Isiannya juga mint/aqua muda, bukan putih pekat, dan tetap jelas. */
  const isian=aturan(t,'.login-field','background');
  assert.match(isian,/rgba\(240,255,251,\.86\)/,'isian mint muda');
  assert.match(aturan(t,'.login-field:focus-within','border-color'),/border-color:#0f8fbd/,'fokus jelas');
  assert.match(aturan(t,'.login-shell .input','color'),/color:#073B5C/,'teks isian gelap');
  assert.match(aturan(t,'.login-shell .input::placeholder','color'),/color:#4d8a99/,'placeholder terbaca');
  assert.match(aturan(t,'.login-field-icon','color'),/color:#0f7d92/,'ikon terbaca');
});

test('20. Tombol Masuk dan pilihan peran tetap memakai gradasi tema',()=>{
  const t=css();
  assert.match(aturan(t,'.login-submit','background'),
    /linear-gradient\(100deg,#e8f7e8 0%,#5de4e0 46%,#2fa8ff 100%\)/,'cream-mint ke tosca ke biru langit');
  assert.match(aturan(t,'.login-shell .role-btn.active','background'),
    /linear-gradient\(135deg,#5de4e0,#2fa8ff\)/,'peran terpilih memakai bahasa visual yang sama');
  assert.equal(/\.login-submit\{[^}]*var\(--navy\)|#0b1a2f/.test(t),false,'tidak kembali navy');
  /* Tiga logo tetap dinamis dan urutannya tidak berubah. */
  const halaman=read('src/pages/login.js');
  const baris=halaman.slice(halaman.indexOf('class="login-crest-row"'),halaman.indexOf('<h2>'));
  assert.deepEqual([...baris.matchAll(/data-crest="(\w+)"/g)].map(m=>m[1]),['ministry','region','school']);
  assert.doesNotMatch(baris,/src="\.\/assets\//,'tidak ada lambang yang ditulis mati');
  for(const mati of ['Kabupaten Bekasi','SDN SATRIA JAYA 01'])
    assert.equal(halaman.includes(mati),false,`"${mati}" tidak ditulis mati`);
});

/* ============================================== N. CETAK DAN LEMBAR A4 TIDAK BERUBAH */

test('21. Cetak tetap putih, bebas latar aplikasi, dan tata letak A4 tidak berubah',()=>{
  const t=css();
  /* Permukaan kaca hanya untuk layar; saat mencetak semuanya kembali putih polos. */
  const cetak=t.slice(t.indexOf('N. CETAK TETAP BERSIH'));
  assert.match(cetak,/@media print\{[\s\S]*background:#fff!important/,'permukaan kembali putih saat cetak');
  assert.match(cetak,/backdrop-filter:none!important/,'kaca dimatikan saat cetak');
  assert.match(cetak,/\.data-table th,\.data-table td,\.data-table \.cell-actions\{background:#fff!important\}/);
  /* Latar aplikasi dan kerangka tetap tidak ikut tercetak. */
  assert.match(t,/@media print\{\.app-shell\{background:#fff!important\}\}/);
  assert.match(t,/@media print\{[^}]*\.sidebar,\.topbar,\.footer/);
  /* Lembar A4, Cover, dan slot logonya tidak disentuh sama sekali. */
  assert.match(t,/\.print-workspace \.report-a4,\.print-workspace \.report-cover-a4\{background:#fff/);
  assert.match(t,/\.report-cover-a4>\.cover-logo-custom\{overflow:visible;width:189px;height:189px\}/);
  assert.equal((t.match(/\.report-cover-a4>\.cover-logo-custom>img\{width:100%;height:100%;object-fit:contain;margin:0\}/g)||[]).length,2);
  assert.match(t,/@media print\{@page\{size:A4 portrait/);
});
