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

test('1. Latar Masuk memakai berkas baru; foto kapal Phinisi tidak dipakai lagi',()=>{
  const t=css();
  assert.ok(existsSync(new URL('assets/login-background.svg',root)),'berkas latar baru tersedia');
  assert.equal(existsSync(new URL('assets/login-background.jpg',root)),false,
    'foto lama tidak lagi ikut dipaketkan');
  assert.equal((t.match(/login-background\.svg/g)||[]).length,1,'disebut tepat sekali');
  assert.equal((t.match(/login-background\.jpg/g)||[]).length,0);
  const foto=t.match(/\.login-photo\{[^}]*\}/)[0];
  assert.match(foto,/url\('\.\.\/\.\.\/assets\/login-background\.svg'\)/);
  assert.match(foto,/cover/);
  assert.match(foto,/no-repeat/);
  assert.match(foto,/linear-gradient/,'ada gradasi cadangan bila berkasnya belum ada');
});

test('2. Berkas latar Masuk tidak memuat teks apa pun',()=>{
  const svg=read('assets/login-background.svg');
  const tanpaKomentar=svg.replace(/<!--[\s\S]*?-->/g,'');
  assert.equal(/<text|<tspan|font-family|font-size/.test(tanpaKomentar),false,
    'tidak ada teks yang dibakar ke dalam gambar');
  assert.match(svg,/preserveAspectRatio="xMidYMid slice"/,'gambar menutup kolom tanpa gepeng');
});

test('3. Slogan papan tulis ditulis SATU KALI sebagai elemen halaman',()=>{
  const source=login();
  const slogan='Administrasi Kelas yang Tertata untuk Generasi yang Lebih Baik';
  assert.equal((source.match(new RegExp(slogan,'g'))||[]).length,1,'ditulis tepat sekali');
  assert.match(source,/<p class="login-chalkboard">/,'berdiri sebagai satu elemen papan tulis');
  assert.equal((source.match(/login-chalkboard/g)||[]).length,1);
  /* Bidang papan tulisnya adalah elemen itu sendiri, bukan bidang kedua di dalam gambar. */
  const gaya=css();
  assert.match(gaya,/\.login-chalkboard\{[^}]*border:7px solid #e6d6bd/,'punya bingkai papan tulis');
  assert.match(gaya,/\.login-chalkboard\{[^}]*linear-gradient\(160deg,#2f4f55,#1d3a41\)/,'bidang papan gelap');
  assert.equal(/papan|chalk/i.test(read('assets/login-background.svg').replace(/<!--[\s\S]*?-->/g,'')),false,
    'tidak ada papan tulis kedua yang digambar di dalam berkas latar');
});

test('4. Slogan lama tidak ada lagi di mana pun',()=>{
  const berkas=[login(),css(),read('assets/login-background.svg'),read('src/data/app-identity.js')];
  for(const isi of berkas){
    assert.equal(/Data Akurat/i.test(isi),false,'"Data Akurat" tidak muncul');
    assert.equal(/Prestasi Nyata/i.test(isi),false,'"Prestasi Nyata" tidak muncul');
    assert.equal(/Anak Hebat/i.test(isi),false,'"Anak Hebat" tidak muncul');
  }
});

test('5. Kartu form punya batas sendiri dan menyatu warna dengan latar',()=>{
  const t=css();
  const kartu=aturanBerisi(t,'.login-shell','background:linear-gradient');
  assert.ok(kartu,'aturan kartu ditemukan');
  assert.match(kartu,/rgba\(255,255,255,\.86\)/,'cukup pekat untuk terbaca, bukan kaca tipis');
  assert.match(kartu,/border:1px solid/,'batas kartu tetap terlihat');
  assert.match(kartu,/box-shadow:0 22px 46px/,'bayangan lembut');
  assert.match(kartu,/backdrop-filter:blur/,'tetap berkesan kaca');
  /* Panel kanan memakai keluarga warna yang sama dengan kolom latar. */
  const panel=aturanBerisi(t,'.login-panel','#e6f8f1');
  assert.match(panel,/#e6f8f1|#cdf0f0|#b6e6f5/,'panel memakai mint/tosca yang sama');
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
    'Aktivasi Admin Pertama','Cerdas • Berkarakter • Berprestasi'])
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

test('9. Identitas pengembang tetap di kiri bawah kolom latar, bukan di dalam kartu',()=>{
  const source=login();
  const kolomFoto=source.slice(source.indexOf('<section class="login-photo">'),
    source.indexOf('<section class="login-panel">'));
  assert.ok(kolomFoto.includes('login-photo-caption'),'blok identitas berada di kolom latar');
  const panel=source.slice(source.indexOf('<section class="login-panel">'));
  assert.equal(panel.includes('login-photo-caption'),false,'tidak dipindahkan ke bawah form');
  assert.equal(panel.includes('DEVELOPER_NAME'),false,'tidak disalin ke dalam kartu form');
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
  assert.match(aturanBerisi(t,'.login-credit-name','font-weight'),/font-weight:850/);
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
  assert.equal((css().match(/\.login-crest-upload\{width:(\d+)px;height:\1px;margin:0\}/g)||[]).length,3);
});

test('12. Logo Sekolah dipakai kiri atas Masuk dan tidak pernah masuk Cover',()=>{
  const source=login();
  const kolomFoto=source.slice(source.indexOf('<section class="login-photo">'),
    source.indexOf('<section class="login-panel">'));
  assert.match(kolomFoto,/class="login-logo" src="\$\{escapeHtml\(crest\)\}"/,'kiri atas memakai Logo Sekolah');
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

test('15. Dashboard Admin dan Guru memakai latar baru yang sama',()=>{
  const halaman=read('src/pages/dashboard.js');
  assert.match(halaman,/el\(`<div class="dash dashboard-page">/,'satu penanda tema untuk kedua peran');
  assert.equal((halaman.match(/dashboard-page/g)||[]).length,1);
  /* Penanda itu dipasang tanpa mencabangkan peran, jadi Admin dan Guru sama-sama memakainya. */
  const sebelum=halaman.slice(0,halaman.indexOf('dashboard-page'));
  assert.equal(/isAdmin\s*\?\s*'dash/.test(sebelum),false,'tidak ada cabang peran pada kelas tema');
  const gaya=css();
  assert.match(gaya,/\.dashboard-page::before\{[^}]*url\('\.\.\/\.\.\/assets\/dashboard-background\.svg'\)/);
  assert.match(gaya,/\.dashboard-page::before\{[^}]*center\/cover no-repeat/,'menutup viewport tanpa gepeng');
  assert.match(gaya,/\.dashboard-page>\*\{position:relative;z-index:1\}/,'konten tetap di atas latar');
});

test('16. Berkas latar Dashboard adalah latar MURNI',()=>{
  const svg=read('assets/dashboard-background.svg');
  const isi=svg.replace(/<!--[\s\S]*?-->/g,'');
  for(const dilarang of ['<text','<tspan','<image','font-family','font-size'])
    assert.equal(isi.includes(dilarang),false,`${dilarang} tidak boleh ada di dalam latar`);
  /* Hanya bentuk warna: tidak ada gambar tertanam maupun rujukan berkas lain. */
  assert.equal(/href=|xlink:href=/.test(isi),false,'tidak menautkan berkas gambar lain');
  assert.equal(/base64/.test(isi),false,'tidak ada gambar tertanam');
  assert.match(svg,/preserveAspectRatio="xMidYMid slice"/,'menutup viewport tanpa terdistorsi');
  /* Warnanya memang keluarga mint - tosca - cyan - biru langit. */
  for(const warna of ['#eaf7ec','#8fe6e6','#5fd2ee','#37b4f4'])
    assert.ok(svg.includes(warna),`gradasi memuat ${warna}`);
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

test('18. Kartu Dashboard cukup pekat untuk dibaca dan tetap satu keluarga warna',()=>{
  const gaya=css();
  const kartu=gaya.match(/\.dashboard-page \.card,\.dashboard-page \.dash-stat,\.dashboard-page \.dash-panel\{[^}]*\}/)[0];
  assert.match(kartu,/rgba\(255,255,255,\.9\)/,'cukup opaque, bukan terlalu transparan');
  assert.match(kartu,/border:1px solid/);
  assert.match(kartu,/box-shadow:0 14px 30px/);
  /* Aksen kartu statistik tetap membedakan informasi. */
  for(const nada of ['cyan','teal','purple','amber'])
    assert.match(gaya,new RegExp(`\\.dashboard-page \\.dash-stat-${nada}\\{`),`aksen ${nada} tetap ada`);
  /* Tema hanya menempel pada Dashboard: tidak ada aturan yang menyentuh app-shell atau sidebar. */
  const blok=gaya.slice(gaya.indexOf('TEMA TERANG 1.2.9'));
  for(const selektor of ['.app-shell{','.sidebar{','.topbar{','.content{'])
    assert.equal(blok.includes(selektor),false,`${selektor} tidak ikut diubah tema baru`);
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
