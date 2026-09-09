import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { flattenNavigation, navigationForRole } from '../src/data/navigation.js';
import { ASSESSMENT_TYPES, getAssessmentSettings, saveAssessmentScores,
  saveAssessmentSettings } from '../src/services/assessment.js';
import { ACTIVITY_PREDICATES, COCURRICULAR_PREDICATES } from '../src/services/completeness.js';
import { ATTITUDE_DEVELOPMENT_LEVELS, ATTITUDE_DIMENSIONS } from '../src/services/attitudes.js';
import { capaianButirSiswa } from '../src/services/cp-attainment.js';
import { composeIntracurricularButirDescription } from '../src/services/cp-descriptions.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { calculateReportScore } from '../src/services/report.js';
import { DEFAULT_REPORT_RUBRIC } from '../src/services/report-rubric.js';
import { getSchoolMaster, saveSchoolMaster } from '../src/services/master.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* TEMA TERANG HALAMAN MASUK DAN DASHBOARD, DAN PEMILIHAN KATA DESKRIPSI INTRAKURIKULER.

   Empat hal yang dijaga suite ini:

     1. Halaman Masuk berganti latar - dari foto kapal Phinisi ke gambar ruang administrasi
        kelas - tanpa kehilangan satu pun kendali masuk, dan tanpa satu pun slogan tampil dua
        kali. Slogan lama tidak boleh kembali dalam bentuk apa pun.
     2. Dashboard Admin dan Guru memakai latar baru yang MURNI latar: tidak ada logo, teks,
        peta, kartu, menu, foto sekolah, atau bayangan antarmuka apa pun di dalam berkasnya.
     3. Ketiga logo tetap dibaca dari master Admin, dengan urutan dan perilaku Cover yang tidak
        berubah sedikit pun.
     4. Deskripsi Intrakurikuler berhenti mengulang kata dalam satu kalimat - tanpa menyentuh
        nilai, Butir CP, KKTP, maupun Rubrik. */

/* Mengambil aturan CSS yang BERLAKU untuk sebuah properti. Satu selektor bisa muncul beberapa
   kali - aturan dasar, lalu penimpaan tema, lalu penimpaan di dalam media query - dan yang
   menang adalah yang terakhir mendeklarasikan properti itu, persis seperti urutan cascade. */
function aturanBerisi(teks,selektor,properti){
  const pola=new RegExp(`\\${selektor}\\{[^}]*\\}`,'g');
  const cocok=[...teks.matchAll(pola)].map(item=>item[0]).filter(item=>item.includes(properti));
  return cocok.at(-1)||'';
}
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css');
const login=()=>read('src/pages/login.js');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
const admin=()=>({role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`,userName:'Admin'});
function panggung(){
  useMemoryStorage();
  const sesi=guru();
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  const siswa=createStudent(sesi,{classId:'5B',nis:'5B-1',nisn:'4411000001',
    name:'Adwa Habibi Rizky',gender:'L',photo:''});
  return {sesi,siswa};
}
/* Kata tugas tidak dihitung sebagai pengulangan: bahasa Indonesia yang wajar memang
   mengulang "dan", "yang", dan "dalam". */
const KATA_TUGAS=new Set(['dan','yang','serta','dalam','untuk','pada','dengan','secara','di','ke',
  'dari','atas','terhadap','mengenai','tersebut','namun','sehingga','agar','itu','ini','lebih',
  'sudah','telah','akan','juga','oleh','antara','para','sebagai','maupun','atau','bagi','kembali',
  'beberapa','setiap','belum','tidak','ananda']);
function kataTerulang(teks){
  const kata=String(teks||'').toLowerCase().replace(/[^a-z\s-]/g,' ').split(/\s+/)
    .filter(item=>item.length>2&&!KATA_TUGAS.has(item));
  return [...new Set(kata.filter((item,index)=>kata.indexOf(item)!==index))];
}

/* ============================================================ A-C. HALAMAN MASUK */

test('1. Latar Masuk memakai BERKAS ASLI GAMBAR 1, bukan gambar ulang',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA (revisi final acuan visual).

     Rilis 1.2.9 mengunci latar Masuk sebagai berkas SVG yang digambar ulang menyerupai acuan.
     Pengguna menyatakan itu salah dan meminta BERKAS ASLI dipakai apa adanya: tidak digambar
     ulang menjadi SVG, tidak diganti ilustrasi pengganti, tidak diubah komposisi maupun
     warnanya. Karena itu harapan test dibalik: yang dikunci sekarang justru berkas aslinya. */
  const t=css();
  assert.ok(existsSync(new URL('assets/login-background.webp',root)),'berkas asli tersedia');
  assert.equal(existsSync(new URL('assets/login-background.svg',root)),false,
    'gambar ulang SVG tidak lagi dipaketkan');
  assert.equal(existsSync(new URL('assets/login-background.jpg',root)),false,
    'foto kapal Phinisi lama juga tidak dipaketkan');
  assert.equal((t.match(/login-background\.webp/g)||[]).length,1,'disebut tepat sekali');
  assert.equal((t.match(/login-background\.(svg|jpg)/g)||[]).length,0);
  const panggung=aturanBerisi(t,'.login-stage','login-background');
  assert.match(panggung,/url\('\.\.\/\.\.\/assets\/login-background\.webp'\)/);
  assert.match(panggung,/cover/,'menutup layar dengan cover');
  assert.match(panggung,/no-repeat/);
  assert.match(panggung,/linear-gradient/,'ada gradasi cadangan bila berkasnya belum ada');
});
test('2. Berkas latar dipakai utuh: dipotong cover, tidak pernah diregangkan',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA.

     Dulu berkas latar wajib bersih dari teks karena slogannya ditulis sebagai elemen halaman.
     Acuan final justru sebaliknya: papan tulis dan tulisan MEMANG bagian dari gambar, dan
     pengguna melarang keduanya dihapus. Yang dijaga sekarang bukan lagi "tidak ada teks",
     melainkan bahwa berkasnya tidak pernah diregangkan sehingga tulisan itu tetap terbaca. */
  const berkas=readFileSync(new URL('assets/login-background.webp',root));
  assert.equal(berkas.slice(0,4).toString('latin1'),'RIFF','berkas raster asli, bukan hasil gambar ulang');
  assert.equal(berkas.slice(8,12).toString('latin1'),'WEBP');
  assert.ok(berkas.length>100000,'berkas foto penuh, bukan ilustrasi pengganti yang ringan');
  const t=css();
  const panggung=aturanBerisi(t,'.login-stage','login-background');
  assert.match(panggung,/\/cover/,'cover: dipotong, bukan digepengkan');
  assert.doesNotMatch(panggung,/background-size:100% 100%/,'tidak pernah diregangkan');
  /* Titik potongnya boleh bergeser per lebar layar, tetapi perbandingan gambarnya tetap. */
  assert.match(t,/--login-bg-pos/,'titik fokus dapat digeser per ukuran layar');
});
test('3. Slogan papan tulis tidak ditulis ulang sebagai elemen halaman',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA.

     Pada 1.2.9 slogan sengaja diangkat menjadi elemen .login-chalkboard karena latar buatan
     saat itu memang tidak memuatnya. Berkas asli GAMBAR 1 sudah memuat papan tulis beserta
     tulisannya, sehingga menuliskannya lagi akan membuat slogan itu muncul DUA KALI. Karena
     itu elemen papan tulis dibuang, dan yang dikunci sekarang adalah ketiadaannya. */
  const source=login();
  const slogan='Administrasi Kelas yang Tertata untuk Generasi yang Lebih Baik';
  assert.equal((source.match(new RegExp(slogan,'g'))||[]).length,0,
    'tidak ditulis di halaman: slogan sudah menjadi bagian berkas latar');
  assert.equal(/login-chalkboard/.test(source),false,'elemen papan tulis dibuang');
  assert.equal(/login-chalkboard/.test(css()),false,'gayanya ikut dibuang, tidak menyisakan aturan mati');
});
test('4. Slogan lama tidak ada lagi di mana pun',()=>{
  const berkas=[login(),css(),read('src/data/app-identity.js')];
  for(const isi of berkas){
    assert.equal(/Data Akurat/i.test(isi),false,'"Data Akurat" tidak muncul');
    assert.equal(/Prestasi Nyata/i.test(isi),false,'"Prestasi Nyata" tidak muncul');
    assert.equal(/Anak Hebat/i.test(isi),false,'"Anak Hebat" tidak muncul');
  }
});
test('5. Kartu form mengambang di atas latar yang sama, tanpa panel terpisah',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA.

     Baseline 1.2.9 masih mengunci keberadaan .login-panel, yaitu kolom kanan yang punya latar
     sendiri. Pengguna menyatakan tegas: TIDAK BOLEH ADA SEKAT ATAU PEMISAH antara kanan dan
     kiri. Kolom itu dibubarkan, jadi yang dikunci sekarang adalah ketiadaannya. */
  const t=css();
  const kartu=aturanBerisi(t,'.login-shell','background:linear-gradient');
  assert.ok(kartu,'aturan kartu ditemukan');
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA (1.3.1).

     Baseline 1.3.0 mengunci putih 90% sebagai warna pangkal kartu. Setelah diuji pada APK
     sungguhan, pengguna menyatakan kartu itu masih terlihat "terlalu PUTIH dan seperti
     ditempel di atas background", dan meminta kartunya mengambil warna dari gambar Login:
     mint, aqua, tosca muda, cyan muda. Jadi yang dikunci sekarang kebalikannya - pangkalnya
     mint/aqua, bukan putih - sambil tetap cukup pekat untuk dibaca. */
  assert.match(kartu,/rgba\(235,255,247,\.88\)/,'berpangkal mint, bukan putih');
  assert.match(kartu,/rgba\(210,250,247,\.84\)/,'melewati aqua');
  assert.match(kartu,/rgba\(204,242,255,\.86\)/,'berujung biru langit muda');
  assert.equal(/rgba\(255,\s*255,\s*255,\s*\.[89]\d?\)/.test(kartu),false,
    'tidak ada lagi putih pekat sebagai warna dominan kartu');
  assert.match(kartu,/border:1px solid/,'batas kartu tetap terlihat');
  assert.match(kartu,/box-shadow:0 20px 44px/,'bayangan lembut');
  assert.match(kartu,/backdrop-filter:blur/,'tetap berkesan kaca');
  /* Tidak ada kolom kedua yang membawa latarnya sendiri. */
  const source=login();
  assert.equal(/login-panel|login-photo/.test(source),false,'markup dua kolom dibubarkan');
  /* Aturan kolom kiri/kanan halaman Masuk dibuang. (.login-page .login-panel yang tersisa
     milik halaman Aktivasi Pemilik - wadah tengah, bukan kolom - jadi tidak ikut terjaring.) */
  assert.equal(/^\.login-panel\{|^\.login-photo\{/m.test(t),false,'gaya dua kolom ikut dibuang');
  /* Satu latar untuk seluruh layar: .login-stage bukan lagi kisi dua kolom. */
  const panggung=aturanBerisi(t,'.login-stage','display');
  assert.match(panggung,/display:block/,'satu bidang, bukan kisi dua kolom');
  assert.equal(/grid-template-columns:1\.05fr \.95fr/.test(t),false,'kisi dua kolom lama dibuang');
});
test('6. Tombol Masuk memakai gradasi cream-mint → tosca → biru langit',()=>{
  const t=css();
  const tombol=aturanBerisi(t,'.login-submit','#e8f7e8');
  assert.match(tombol,/#e8f7e8/,'berangkat dari cream/mint sangat muda');
  assert.match(tombol,/#5de4e0/,'melewati tosca terang');
  assert.match(tombol,/#2fa8ff/,'berakhir di biru langit terang');
});

test('7. Seluruh kendali, teks, dan logika Masuk tidak berubah',()=>{
  const source=login();
  for(const id of ['semester','username','password','loginForm','loginError','forgot','loginHelp'])
    assert.match(source,new RegExp(`id="${id}"`),`kontrol ${id} tetap ada`);
  for(const teks of ['Masuk ke e-Rapor','Admin','Guru / Wali Kelas','MASUK','Lupa Password?',
    'Buat Password Admin Pertama','Cerdas • Berkarakter • Berprestasi'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
  for(const fungsi of ['authenticate(','saveSession(','recoverAdmin','ensureSecurityBootstrap',
    'getSecurityStatus','refreshLicenseForLogin'])
    assert.ok(source.includes(fungsi),`${fungsi} tidak diubah`);
  assert.match(source,/APP_VERSION/,'versi aplikasi tetap ditampilkan');
});

/* ==================================================== F-G. TAGLINE DAN IDENTITAS */

test('8. Tagline sekolah lebih tebal dan lebih kontras, tanpa diperbesar',()=>{
  const t=css();
  const tagline=aturanBerisi(t,'.login-brand-tagline','font-weight:650');
  assert.match(tagline,/font-weight:650/,'medium/semibold, bukan tipis');
  assert.match(tagline,/font-size:10\.5px/,'ukurannya tidak diperbesar');
  assert.match(tagline,/color:#0b6b7d/,'warnanya lebih tegas terhadap latar terang');
  assert.ok(login().includes('Cerdas • Berkarakter • Berprestasi'),'teksnya tidak diubah');
});

test('9. Identitas pengembang tetap di kiri bawah, di luar kartu Masuk',()=>{
  const source=login();
  /* Blok identitas berdiri langsung di atas latar, sebagai saudara kartu - bukan di dalamnya. */
  const kartu=source.slice(source.indexOf('<div class="login-card-slot">'));
  assert.equal(kartu.includes('login-credit'),false,'tidak dipindahkan ke bawah form');
  assert.equal(kartu.includes('DEVELOPER_NAME'),false,'tidak disalin ke dalam kartu form');
  assert.ok(source.indexOf('class="login-credit"')<source.indexOf('<div class="login-card-slot">'),
    'blok identitas berdiri di luar dan sebelum kartu');
  /* Kisi halaman menempatkannya pada baris terakhir kolom kiri. */
  const t=css();
  assert.match(aturanBerisi(t,'.login-credit','grid-area'),/grid-area:kredit/);
  assert.match(aturanBerisi(t,'.login-credit','align-self'),/align-self:end/,'merapat ke kaki layar');
  assert.match(aturanBerisi(t,'.login-layout','grid-template-areas'),/"kredit kartu"/,
    'kredit di kiri, kartu di kanan, pada baris yang sama');
  /* Keempat barisnya tetap ada, dengan hierarki yang sama. */
  for(const kelas of ['login-credit-lead','login-credit-name','login-credit-role','login-credit-copy'])
    assert.equal((source.match(new RegExp(kelas,'g'))||[]).length,1,`${kelas} tepat satu kali`);
});
test('10. Jarak antarbaris identitas pengembang dirapatkan',()=>{
  const t=css();
  const jarak=nama=>{
    const aturan=aturanBerisi(t,`.${nama}`,'margin-top');
    const cocok=aturan.match(/margin-top:([\d.]+)px/);
    return cocok?Number(cocok[1]):0;
  };
  for(const nama of ['login-credit-name','login-credit-role','login-credit-copy'])
    assert.ok(jarak(nama)<=2,`jarak ${nama} rapat (${jarak(nama)}px)`);
  /* Hierarkinya tetap: nama paling tegas, label dan hak cipta paling kecil. */
  assert.match(aturanBerisi(t,'.login-credit-lead','font-size'),/font-size:9\.5px/);
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA (1.3.1): nama pengembang dinaikkan dari
     850 ke 900 karena pada APK sungguhan blok ini terlalu menyatu dengan gambar latar.
     Hierarkinya tidak berubah - nama tetap yang paling kuat di antara keempat barisnya. */
  assert.match(aturanBerisi(t,'.login-credit-name','font-weight'),/font-weight:900/);
  assert.match(aturanBerisi(t,'.login-credit-role','font-size:11px'),/font-size:11px/);
  assert.match(aturanBerisi(t,'.login-credit-copy','font-size'),/font-size:9\.5px/);
});

/* ======================================================= D-E, H. LOGO DAN COVER */

test('11. Form Masuk tetap memuat tepat tiga logo dengan urutan yang sama',()=>{
  const source=login();
  const baris=source.slice(source.indexOf('class="login-crest-row"'),source.indexOf('<h2>Masuk ke e-Rapor</h2>'));
  assert.deepEqual([...baris.matchAll(/data-crest="(\w+)"/g)].map(item=>item[1]),
    ['ministry','region','school'],'Tut Wuri → Daerah → Sekolah');
  assert.equal((baris.match(/<img/g)||[]).length,3);
  /* Ketiganya membaca master Admin, dengan berkas bawaan sebagai cadangan. */
  assert.match(source,/const ministryLogo=ministryUpload\|\|'\.\/assets\/logo-tut-wuri-handayani\.png';/);
  assert.match(source,/const regionLogo=regionUpload\|\|'\.\/assets\/logo-kabupaten-bekasi\.png';/);
  assert.match(source,/const crest=schoolLogo\|\|'\.\/assets\/app-icon-192\.png';/);
  /* Rasio ekstrem tetap dipasang pada kotak berukuran tetap. */
  assert.equal((css().match(/\.login-crest-upload\{width:(\d+)px;height:\1px;margin:0\}/g)||[]).length,4);
});
test('12. Logo Sekolah dipakai kiri atas Masuk dan tidak pernah masuk Cover',()=>{
  const source=login();
  const brand=source.slice(source.indexOf('<div class="login-brand">'),source.indexOf('<div class="login-credit">'));
  assert.match(brand,/class="login-logo" src="\$\{escapeHtml\(crest\)\}"/,'kiri atas memakai Logo Sekolah');
  const cetak=read('src/pages/print.js');
  const cover=cetak.slice(cetak.indexOf('report-cover-a4'),cetak.indexOf('cover-ministry')+400);
  assert.equal(cover.includes('schoolLogo'),false,'Cover tidak pernah memakai Logo Sekolah');
  assert.match(cetak,/coverLogo\(school\.ministryLogo,COVER_LOGO_DEFAULTS\.ministry,'cover-logo-ministry'/);
  assert.match(cetak,/coverLogo\(school\.regionLogo,COVER_LOGO_DEFAULTS\.region,'cover-logo-region'/);
});
test('13. Slot Cover tidak bergeser oleh rasio berkas yang diunggah',()=>{
  const gaya=css();
  assert.match(gaya,/\.report-cover-a4>\.cover-logo-custom\{overflow:visible;width:189px;height:189px\}/);
  assert.match(gaya,/\.report-cover-a4>\.cover-logo-custom>img\{width:100%;height:100%;object-fit:contain;margin:0\}/);
  assert.equal((gaya.match(/\.report-cover-a4>\.cover-logo-custom>img\{width:100%;height:100%;object-fit:contain;margin:0\}/g)||[]).length,2,
    'ditegaskan juga pada layar sempit');
  assert.doesNotMatch(gaya,/\.cover-logo-custom>img\{[^}]*object-fit:(cover|fill)/,'tidak crop dan tidak stretch');
});

test('14. Master logo tetap milik Admin dan dibaca Guru apa adanya',()=>{
  useMemoryStorage();
  saveSchoolMaster(admin(),{...getSchoolMaster(),name:'SD NEGERI UJI',
    schoolLogo:'data:image/png;base64,AAA',ministryLogo:'data:image/png;base64,BBB',
    regionLogo:'data:image/png;base64,CCC'});
  invalidateDbCache();
  const master=getSchoolMaster();
  assert.equal(master.ministryLogo,'data:image/png;base64,BBB');
  assert.throws(()=>saveSchoolMaster(guru(),{...master,regionLogo:''}),/Hanya Admin/);
  assert.equal(getSchoolMaster.length,0,'tidak ada master logo terpisah per Guru');
  assert.equal(Object.keys(loadDb()).some(key=>/logo/i.test(key)),false,
    'logo hanya hidup di masterData.school');
});

/* ============================================================ I-K. DASHBOARD */

test('15. Latar GAMBAR 2 dipasang GLOBAL, bukan hanya Dashboard',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA.

     Rilis 1.2.9 sengaja membatasi latar ini ke halaman Dashboard saja, dan baseline lama
     mengunci kait .dashboard-page. Pengguna membalik keputusan itu: latar harus dipakai
     SELURUH halaman sesudah masuk - "BUKAN HANYA DASHBOARD". Karena latarnya kini melekat
     pada .app-shell, tidak ada satu pun halaman yang perlu menyebutnya sendiri. */
  const gaya=css();
  const shell=aturanBerisi(gaya,'.app-shell','app-background');
  assert.match(shell,/url\('\.\.\/\.\.\/assets\/app-background\.webp'\)/,'latar melekat pada shell aplikasi');
  assert.match(shell,/cover/,'menutup layar tanpa gepeng');
  assert.match(shell,/no-repeat/);
  /* Kait khusus Dashboard dibuang supaya tidak ada halaman yang berbeda sendiri. */
  const halaman=read('src/pages/dashboard.js');
  assert.equal(/dashboard-page/.test(halaman),false,'kait khusus Dashboard dibuang');
  assert.equal(/dashboard-page/.test(gaya),false,'gayanya ikut dibuang');
  assert.match(halaman,/el\(`<div class="dash">/,'satu kelas untuk kedua peran');
  /* Latar global tidak boleh ikut tercetak. */
  assert.match(gaya,/@media print\{\.app-shell\{background:#fff!important\}\}/,
    'dokumen cetak tetap bersih');
  assert.match(gaya,/\.print-workspace \.report-a4,\.print-workspace \.report-cover-a4\{background:#fff/,
    'lembar kertas tetap putih meski ruang kerjanya memperlihatkan latar');
});
test('16. Berkas latar aplikasi adalah BERKAS ASLI GAMBAR 2 dan murni latar',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA: berkas SVG gambar ulang diganti berkas asli. */
  assert.equal(existsSync(new URL('assets/dashboard-background.svg',root)),false,
    'gambar ulang SVG tidak lagi dipaketkan');
  const berkas=readFileSync(new URL('assets/app-background.webp',root));
  assert.equal(berkas.slice(0,4).toString('latin1'),'RIFF','berkas raster asli');
  assert.equal(berkas.slice(8,12).toString('latin1'),'WEBP');
  /* Murni latar: berkasnya jauh lebih ringan daripada latar Masuk yang penuh isi, karena
     memang hanya langit, awan, dan dedaunan - tanpa kartu, menu, teks, atau antarmuka. */
  const masuk=readFileSync(new URL('assets/login-background.webp',root));
  assert.ok(berkas.length<masuk.length/3,'jauh lebih ringan: hanya warna dan bentuk lembut');
  const gaya=css();
  assert.equal((gaya.match(/app-background\.webp/g)||[]).length,1,'disebut tepat sekali');
  assert.equal((gaya.match(/dashboard-background/g)||[]).length,0);
});
test('17. Struktur, menu, dan otorisasi Dashboard tidak berubah',()=>{
  /* Menu kedua peran tetap utuh dan tetap berbeda. */
  const menuAdmin=flattenNavigation('admin').map(item=>item.route);
  const menuGuru=flattenNavigation('teacher').map(item=>item.route);
  assert.ok(menuAdmin.length>=25&&menuGuru.length>=15);
  assert.ok(menuAdmin.includes('reference-students')&&!menuGuru.includes('reference-students'),
    'menu khusus Admin tetap khusus Admin');
  assert.ok(menuGuru.includes('assessment')&&menuGuru.includes('attitudes'));
  assert.ok(navigationForRole('admin').length>=5&&navigationForRole('teacher').length>=4);
  /* Kerangka halaman tidak ditambahi apa pun, termasuk foto sekolah pada sidebar. */
  const layout=read('src/ui/layout.js');
  const sidebar=layout.slice(layout.indexOf('<aside class="sidebar"'),layout.indexOf('<main class="main">'));
  assert.equal((sidebar.match(/<img/g)||[]).length,1,'sidebar tetap satu gambar: foto pembuat aplikasi');
  assert.match(sidebar,/class="brand-photo" src="\$\{BRAND_PHOTO\}"/);
  assert.equal(/school\.(photo|image|building)/.test(layout),false,'tidak ada foto sekolah yang ditambahkan');
  for(const bagian of ['semester-chip','profile-mini','page-title','data-nav','data-logout','global-back'])
    assert.ok(layout.includes(bagian),`${bagian} tetap ada`);
});

test('18. Kartu tetap terbaca, dan tema BARU memang menyentuh seluruh kerangka',()=>{
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA.

     Baseline 1.2.9 mengunci hal sebaliknya: tema TIDAK BOLEH menyentuh .app-shell, .sidebar,
     .topbar, dan .content, karena saat itu cakupannya sengaja dibatasi ke dua halaman.
     Pengguna mencabut batasan itu dan menyatakan penghapusan tema navy WAJIB. Jadi harapannya
     dibalik: sekarang kerangka justru HARUS ikut berubah. */
  const gaya=css();
  /* PERUBAHAN BASELINE YANG DISENGAJA DAN DIMINTA (1.3.1): permukaan kartu tidak lagi
     berpangkal putih 92%. Setelah pengujian APK, pengguna meminta seluruh kartu, panel, form,
     dan tabel memakai kaca mint/aqua yang menyatu dengan latar - bukan blok putih yang
     tertempel. Yang dijaga sekarang: pangkalnya mint, dan tetap cukup pekat untuk dibaca. */
  /* Permukaan kartu kini satu aturan bersama untuk seluruh aplikasi, jadi selektornya panjang;
     yang dicari adalah aturan yang memuat .dash-stat DAN .dash-panel sekaligus. */
  /* Aturan cetak juga menyebut kedua selektor itu; yang dicari adalah aturan LAYAR, yaitu
     yang memakai permukaan kaca bersama. */
  const kartu=[...gaya.matchAll(/[^{}]*\.dash-stat,\.dash-panel\{[^}]*\}/g)]
    .map(m=>m[0]).filter(x=>x.includes('--kaca-1')).at(-1)||'';
  assert.ok(kartu,'aturan permukaan kartu bersama ditemukan');
  assert.match(kartu,/var\(--kaca-1\)/,'memakai permukaan kaca bersama');
  assert.match(kartu,/border:1px solid var\(--kaca-tepi\)/);
  assert.match(kartu,/box-shadow:var\(--kaca-bayang\)/);
  assert.match(gaya,/--kaca-1:rgba\(245,255,252,\.84\)/,'pangkal mint, bukan putih pekat');
  for(const nada of ['cyan','teal','purple','amber'])
    assert.match(gaya,new RegExp(`\\.dash-stat-${nada}\\{`),`aksen ${nada} tetap ada`);
  /* Tema baru memang menyentuh kerangka: shell, sidebar, dan topbar semuanya diterangkan. */
  const blok=gaya.slice(gaya.indexOf('TEMA 1.3.0'));
  for(const selektor of ['.sidebar{','.topbar{'])
    assert.ok(blok.includes(selektor),`${selektor} ikut diterangkan tema baru`);
  assert.match(aturanBerisi(gaya,'.app-shell','app-background'),/app-background\.webp/,
    'wadah utama memakai latar baru, bukan gradasi navy');
  /* Tidak ada lagi blok navy besar di mana pun: ketiga warnanya tidak lagi tertulis dalam
     berkas gaya, termasuk sebagai nilai token. */
  for(const warna of ['#0b1a2f','#0f2745','#132f52'])
    assert.equal(gaya.includes(warna),false,`warna navy ${warna} tidak dipakai lagi`);
  for(const aturan of ['.sidebar','.topbar'])
    assert.doesNotMatch(aturanBerisi(gaya,aturan,'background'),/var\(--navy\)/,
      `${aturan} tidak lagi memakai gradasi navy`);
});
/* ==================================== M. PEMILIHAN KATA DESKRIPSI INTRAKURIKULER */

test('19. Kasus yang dilaporkan tidak lagi mengulang kata "baik"',()=>{
  const butir=[{teori:'iman kepada hari akhir serta qada dan qadar'}];
  const teks=composeIntracurricularButirDescription({studentName:'Adwa Habibi Rizky',butir,
    jenis:'teori',predicate:'Baik'});
  assert.equal((teks.toLowerCase().match(/\bbaik\b/g)||[]).length,1,`"baik" tepat sekali — ${teks}`);
  assert.deepEqual(kataTerulang(teks),[],teks);
  assert.ok(teks.includes('iman kepada hari akhir serta qada dan qadar'),'substansi CP utuh');
  assert.ok(teks.startsWith('Ananda Adwa Habibi Rizky ')&&teks.endsWith('.'));
});

test('20. Keempat predikat, Teori dan Praktik, bebas dari pengulangan kata',()=>{
  const kasus=[
    ['teori',[{teori:'konsep pecahan sederhana'}]],
    ['teori',[{teori:'bilangan cacah sampai 1.000'},{teori:'operasi penjumlahan dan pengurangan'}]],
    ['praktik',[{praktik:'menyelesaikan soal pecahan dalam kehidupan sehari-hari'}]],
    ['praktik',[{praktik:'mempraktikkan gerak dasar lokomotor'},{teori:'aturan permainan sederhana'}]],
  ];
  for(const [jenis,butir] of kasus)
    for(const predikat of ['Sangat Baik','Baik','Cukup','Perlu Bimbingan']){
      const teks=composeIntracurricularButirDescription({studentName:'Budi',butir,jenis,predicate:predikat});
      assert.deepEqual(kataTerulang(teks),[],`${jenis}/${predikat} — ${teks}`);
      for(const item of butir){
        const isi=item.praktik||item.teori;
        assert.ok(teks.includes(isi),`kompetensi "${isi}" tetap disebut — ${teks}`);
      }
    }
});

test('21. Penutup kalimat bervariasi menurut konteks, bukan satu kata yang ditukar tetap',()=>{
  const butir=[{teori:'konsep pecahan sederhana'}];
  const teori=['Sangat Baik','Baik','Cukup','Perlu Bimbingan'].map(predikat=>
    composeIntracurricularButirDescription({studentName:'Budi',butir,jenis:'teori',predicate:predikat}));
  assert.equal(new Set(teori).size,4,'empat predikat, empat kalimat berbeda');
  /* Penutupnya memang beragam bentuk, bukan satu pola yang ditempel ke semuanya. */
  const penutup=teori.map(teks=>teks.slice(teks.indexOf('konsep pecahan sederhana')+24).trim());
  assert.equal(new Set(penutup).size,4);
  /* Dan tetap sesuai tingkat capaiannya: yang rendah menyebut tindak lanjut, yang tinggi tidak
     pernah mengarang kekurangan. */
  assert.match(teori[3],/perlu|pendampingan|penguatan/,'Perlu Bimbingan menyebut tindak lanjut');
  assert.equal(/perlu bimbingan|memerlukan/i.test(teori[0]),false,
    'Sangat Baik tidak dibubuhi kekurangan yang dikarang');
});

test('22. Deskripsi tetap dapat diulang: masukan sama, kalimat sama',()=>{
  const butir=[{teori:'konsep pecahan sederhana'}];
  const sekali=composeIntracurricularButirDescription({studentName:'Budi',butir,jenis:'teori',predicate:'Baik'});
  const lagi=composeIntracurricularButirDescription({studentName:'Budi',butir,jenis:'teori',predicate:'Baik'});
  assert.equal(sekali,lagi,'Generate kedua kalinya menghasilkan kalimat yang sama');
  /* Nama berbeda tetap menghasilkan kalimat untuk nama itu sendiri. */
  const lain=composeIntracurricularButirDescription({studentName:'Citra',butir,jenis:'teori',predicate:'Baik'});
  assert.ok(lain.startsWith('Ananda Citra ')&&!lain.includes('Budi'));
});

/* ================================== O. FITUR 1.2.8 DAN NILAI AKADEMIK TIDAK BERUBAH */

test('23. Nilai Akhir, Butir CP, KKTP, dan Rubrik tidak tersentuh perbaikan bahasa',()=>{
  const {sesi,siswa}=panggung();
  saveAssessmentSettings(sesi,'mtk',{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(sesi,'mtk',jenis.id,{[siswa.id]:84});
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).finalScore,84,
    'lima komponen dan bobot menghasilkan Nilai Akhir yang sama');
  assert.equal(getAssessmentSettings(sesi,'mtk').kktp,75);
  /* Rubrik tetap diselaraskan dengan KKTP sekolah persis seperti rilis sebelumnya: batas
     kategori terendah bertemu KKTP, dan dua batas teratas tidak bergeser. */
  const rubrik=getAssessmentSettings(sesi,'mtk').rubric;
  assert.deepEqual(rubrik.map(item=>item.category),DEFAULT_REPORT_RUBRIC.map(item=>item.category));
  assert.deepEqual(rubrik.map(item=>item.min),[90,80,75,0],'rubrik mengikuti KKTP 75');
  /* Bukti Butir CP tetap dibaca terhadap KKTP dan Rubrik, bukan interval yang ditulis mati. */
  const butir=listCpButir(sesi,'mtk',{activeOnly:true})[0];
  for(const jenis of ASSESSMENT_TYPES)
    saveAssessmentScores(sesi,'mtk',jenis.id,{[siswa.id]:88},{cpButirId:butir.id});
  const capaian=capaianButirSiswa(sesi,'mtk',siswa.id).find(item=>item.cpButirId===butir.id);
  assert.equal(capaian.capaian,88);
  assert.equal(capaian.kktp,75);
  assert.equal(capaian.mencapai,true);
});

test('24. Domain Kokurikuler dan Sikap versi 1.2.8 tetap utuh',()=>{
  assert.deepEqual(COCURRICULAR_PREDICATES,
    ['Sangat Berkembang','Berkembang Sesuai Harapan','Mulai Berkembang','Belum Berkembang'],
    'BB/MB/BSH/SB tidak diubah menjadi istilah lain');
  assert.deepEqual(ACTIVITY_PREDICATES,['Sangat Baik','Baik','Cukup','Perlu Bimbingan'],
    'predikat Intrakurikuler dan Ekstrakurikuler tidak ikut berubah');
  assert.deepEqual(ATTITUDE_DEVELOPMENT_LEVELS.map(item=>item.code),['MB','SB','BSH','BSB']);
  assert.equal(ATTITUDE_DIMENSIONS.length,6);
  /* Rapor tetap satu daftar mapel bernomor terus, tanpa sekat Kelompok A/B. */
  const cetak=read('src/pages/print.js');
  assert.equal(/<tr class="subject-group-row">/.test(cetak),false);
  assert.match(cetak,/<th>No<\/th><th>Mata Pelajaran<\/th><th>Nilai Akhir<\/th><th>Capaian Kompetensi<\/th>/);
});

test('25. Data lama tetap terbaca setelah pergantian tema',()=>{
  const {sesi,siswa}=panggung();
  saveAssessmentSettings(sesi,'mtk',{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(sesi,'mtk',jenis.id,{[siswa.id]:80});
  invalidateDbCache();
  assert.equal(calculateReportScore(sesi,'mtk',siswa.id).finalScore,80,'nilai tersimpan terbaca kembali');
  /* Tema tidak menyentuh satu pun koleksi penyimpanan. */
  const db=loadDb();
  for(const koleksi of ['assessmentScores','cpEvidenceScores','attitudeProfiles','cocurricularScores',
    'reportDateDefaults','printSettings'])
    assert.ok(Object.hasOwn(db,koleksi),`koleksi ${koleksi} tetap ada`);
});
