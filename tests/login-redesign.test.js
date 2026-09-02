import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ACADEMIC_YEAR, SCHOOL } from '../src/data/constants.js';
import { authenticate, createPasswordHash, ensureSecurityBootstrap, getSecurityStatus, recoverAdmin, saveSession } from '../src/services/auth.js';
import { updateDb } from '../src/services/storage.js';
import { activateOwnerAdmin, getOwnerActivationStatus, isInstallationActivated } from '../src/services/owner-activation.js';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const login=()=>read('src/pages/login.js');
const css=()=>read('src/styles/app.css');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};globalThis.sessionStorage=globalThis.localStorage;}

/* ------------------------------------------------------ 1. Intro lama benar-benar hilang */

test('Intro lama tidak lagi dijalankan dan aplikasi langsung merender Login',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/intro-screen/,'markup layar intro dibuang');
  assert.doesNotMatch(html,/intro-logo\.mp4/,'video intro tidak dimuat');
  assert.doesNotMatch(html,/ui\/intro\.js/,'skrip intro tidak dipanggil');
  assert.doesNotMatch(html,/intro-active/,'kelas penahan intro dibuang');
  assert.equal(existsSync(new URL('src/ui/intro.js',root)),false,'berkas intro dihapus');
  assert.match(html,/src\/app\.js/,'aplikasi tetap dimuat');
  /* Tidak ada sisa pemanggilan intro di sumber maupun daftar precache. */
  assert.doesNotMatch(read('sw.js'),/intro\.js|intro-logo/);
  assert.doesNotMatch(read('package.json'),/ui\/intro\.js/);
  assert.doesNotMatch(css(),/\.intro-screen|--intro-bg|intro-active/);
});

/* ------------------------------------------------------ 2. Layout dan tema login baru */

test('Login memakai satu panel menyatu, bukan foto besar kiri dan blok putih kanan',()=>{
  const source=login(),t=css();
  assert.doesNotMatch(source,/login-visual/,'panel foto besar dibuang');
  assert.doesNotMatch(t,/\.login-visual\{/,'gaya panel foto dibuang');
  assert.doesNotMatch(t,/\.login-page\{[^}]*background:#fff/,'tidak ada blok putih besar');
  assert.match(source,/login-stage/);
  assert.match(source,/login-shell/);
  assert.match(t,/\.login-stage\{/);
  assert.match(t,/\.login-shell\{/);
});

test('Tema login memakai foto di kolom kiri dan panel kaca di kolom kanan',()=>{
  const t=css();
  assert.match(t,/\.login-stage\{[^}]*grid-template-columns:1\.05fr \.95fr/,'dua kolom di layar lebar');
  assert.match(t,/\.login-photo\{[^}]*login-background\.jpg/,'kolom kiri memakai foto sekolah');
  assert.match(t,/\.login-photo-overlay\{[^}]*linear-gradient/,'foto diberi peredup agar teks terbaca');
  assert.match(t,/\.login-panel\{[^}]*var\(--navy/,'kolom kanan memakai latar navy');
  assert.match(t,/\.login-shell\{[^}]*backdrop-filter\s*:\s*blur\(/,'kartu form tetap kaca');
  assert.match(t,/\.login-shell\{[^}]*border:1px solid/,'border tipis');
});

/* ------------------------------------------------------ 3. Animasi ringan dan stabil */

test('Animasi form memakai transform/opacity saja dan berhenti stabil',()=>{
  const t=css();
  assert.match(t,/@keyframes loginCaseOpen/,'panel terbuka seperti koper pada video referensi');
  assert.match(t,/@keyframes loginFieldRise/,'field muncul bertahap');
  const animasi=t.match(/@keyframes login[A-Za-z]+\{[^@]*?\}\s*\}/g)||[];
  assert.ok(animasi.length>=2,'ada beberapa keyframe login');
  for(const blok of animasi)
    assert.doesNotMatch(blok,/\b(width|height|margin|top|left|right|bottom)\s*:/,'hanya transform/opacity, tanpa properti yang memicu layout');
  /* Animasi hanya berjalan sekali lalu diam: forwards, tanpa infinite. */
  assert.match(t,/\.login-shell\{[^}]*animation:loginCaseOpen[^;}]*both/,'animasi buka menahan keadaan akhir');
  assert.doesNotMatch(t.slice(t.indexOf('.login-stage{')),/animation:[^;]*infinite/,'tidak ada animasi berulang saat mengetik');
  assert.match(t,/@media\(prefers-reduced-motion:reduce\)/,'menghormati pengaturan kurangi gerak');
});

test('Input aktif dan tombol Masuk punya micro-animation tanpa pustaka luar',()=>{
  const t=css(),source=login();
  assert.match(t,/\.login-field:focus-within\{[^}]*border-color:var\(--cyan\)/,'isian aktif berbingkai cyan');
  assert.match(t,/\.login-field:focus-within\{[^}]*box-shadow/,'ada cahaya tipis saat aktif');
  assert.match(t,/\.login-submit/,'tombol Masuk punya gaya sendiri');
  assert.match(t,/\.login-submit:active\{[^}]*transform:/,'ada respons tekan');
  assert.doesNotMatch(source,/gsap|anime\.js|framer|lottie/i,'tanpa pustaka animasi berat');
  assert.match(t,/\.role-switch/,'peralihan peran tetap ada');
  assert.match(t,/transition:/,'peralihan halus');
});

/* ------------------------------------------------------ 4. Fungsi login dipertahankan */

test('Seluruh kendali login wajib tetap ada pada halaman',()=>{
  const source=login();
  for(const id of ['semester','username','password','loginForm','loginError','forgot','loginHelp'])
    assert.match(source,new RegExp(`id="${id}"`),`kontrol ${id} tetap ada`);
  for(const teks of ['Admin','Guru / Wali Kelas','Sekolah','Semester Aktif','Username','Password','Masuk','Aktivasi Admin Pertama','Lupa Password'])
    assert.ok(source.includes(teks),`teks ${teks} tetap ada`);
  assert.match(source,/password-toggle/,'tampil atau sembunyikan password');
  assert.match(source,/data-activate/);
  assert.match(source,/openAdminRecovery/,'recovery Admin tetap ada');
  assert.match(source,/ensureSecurityBootstrap/,'security bootstrap tetap dipanggil');
});

test('Kontrak layanan login tidak berubah',()=>{
  const berubah=execFileSync('git',['diff','--name-only','HEAD','--','src/services/auth.js','src/services/owner-activation.js','src/services/storage.js','src/pages/activation.js','src/data/navigation.js','src/core/router.js','src/pages/dashboard.js'],{cwd:new URL('.',root).pathname,encoding:'utf8'}).trim();
  assert.equal(berubah,'','auth, aktivasi, storage, navigasi, dan dashboard tidak boleh berubah');
  const source=login();
  assert.match(source,/authenticate\(\{role,username:/,'authenticate dipanggil dengan bentuk yang sama');
  assert.match(source,/saveSession\(session\)/);
  assert.match(source,/recoverAdmin\(/);
});

test('Login Admin, login Guru, recovery, dan aktivasi tetap berfungsi',async()=>{
  useMemoryStorage();
  const semester=`Ganjil ${ACADEMIC_YEAR}`;
  /* Aktivasi instalasi: kontraknya tetap tersedia dan statusnya terbaca sejak awal. */
  assert.equal(typeof activateOwnerAdmin,'function');
  assert.equal(isInstallationActivated(),false,'instalasi baru belum teraktivasi');
  assert.equal(typeof getOwnerActivationStatus().failures,'number');

  await ensureSecurityBootstrap();
  const status=await getSecurityStatus();
  assert.equal(typeof status.adminActivated,'boolean');

  const guru=await authenticate({role:'teacher',username:'Guru',password:'Kelas5b',semester});
  assert.equal(guru.role,'teacher');
  assert.equal(guru.classId,'5B');
  assert.equal(guru.semester,semester);
  saveSession(guru);

  const kode='ABCDE-FGHIJ-KLMNP-QRSTU';
  const [passwordHash,recoveryHash]=await Promise.all([createPasswordHash('AdminSecure2026'),createPasswordHash(kode)]);
  updateDb(db=>{db.security={...db.security,ownerActivated:true};db.userAccounts.admin={...db.userAccounts.admin,role:'admin',username:'Admin',active:true,requiresActivation:false,mustChangePassword:false,passwordHash,recoveryHash};return db;});
  const admin=await authenticate({role:'admin',username:'Admin',password:'AdminSecure2026',semester});
  assert.equal(admin.role,'admin');
  await assert.rejects(()=>authenticate({role:'admin',username:'Admin',password:'salah',semester}),/.+/,'password salah tetap ditolak');

  await recoverAdmin(kode,'AdminRecovered2026');
  const pulih=await authenticate({role:'admin',username:'Admin',password:'AdminRecovered2026',semester});
  assert.equal(pulih.role,'admin','recovery Admin tetap berfungsi');
});

/* ------------------------------------------------------ 5. Branding dan footer */

test('Branding sekolah dan footer pengembang sesuai permintaan',()=>{
  const source=login();
  for(const teks of ['e-Rapor','SDN SATRIA JAYA 01','Cerdas • Berkarakter • Berprestasi','Dirancang &amp; Dikembangkan oleh','FAHMI DJAWAS, S.Pd.','Semua Hak Dilindungi'])
    assert.ok(source.includes(teks),`branding ${teks} tampil`);
  assert.match(source,/©\s*2026 e-Rapor SDN Satria Jaya 01/);
  assert.doesNotMatch(source,/System Architect/,'teks lama dibuang');
  assert.doesNotMatch(source,/Inovasi digital mandiri/,'motto lama dibuang');
  assert.match(css(),/\.login-footer\{[^}]*text-align:center/,'footer di tengah');
  assert.equal(SCHOOL.length>0,true);
});

/* ------------------------------------------------------ 6. Responsif */

test('Login nyaman di Android potret, lanskap, tablet, dan laptop',()=>{
  const t=css();
  const stage=t.match(/\.login-stage\{[^}]*\}/)[0];
  assert.match(stage,/min-height:100/,'memenuhi tinggi layar');
  /* Pada tata letak dua kolom, kolom form kanan yang bergulir, bukan seluruh panggung. */
  assert.match(t,/\.login-panel\{[^}]*overflow-y:auto/,'kolom form dapat digulir saat layar pendek');
  assert.match(t,/\.login-shell\{[^}]*width:min\(/,'lebar mengikuti layar sehingga tidak terpotong');
  assert.doesNotMatch(stage,/overflow-x:scroll/);
  assert.match(t,/@media\(max-width:767px\)[^@]*\.login-shell\{/,'penyesuaian ponsel');
  assert.match(t,/@media\(max-width:900px\)[^@]*\.login-stage\{[^}]*grid-template-columns:1fr/,'tablet dan ponsel menumpuk dua kolom');
  assert.match(t,/@media\(max-height:560px\) and \(max-width:900px\)[^@]*\.login-photo\{/,'lanskap ponsel mempersempit foto');
  assert.match(t,/env\(safe-area-inset-bottom\)/,'aman dari area sistem dan papan ketik');
});

/* ------------------------------------------------------ 7. Bagian lain tidak tersentuh */

test('Navigasi dan dashboard tidak ikut berubah',()=>{
  const admin=flattenNavigation('admin').map(item=>item.route);
  const teacher=flattenNavigation('teacher').map(item=>item.route);
  assert.equal(new Set(admin).size,admin.length);
  assert.equal(new Set(teacher).size,teacher.length);
  assert.ok(admin.includes('dashboard')&&teacher.includes('dashboard'));
  assert.ok(teacher.includes('reference-mapping'),'Mapping Mata Pelajaran Guru tetap ada');
  assert.match(read('src/pages/dashboard.js'),/dash-hero/,'dashboard baru tetap utuh');
});
