import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ACADEMIC_YEAR, DEFAULT_SCHOOL_NAME } from '../src/data/constants.js';
import { ACCEPTED_BACKUP_APP_NAMES, APP_NAME, APP_TAGLINE, LEGACY_APP_NAMES,
  OWNER_APP_NAME } from '../src/data/app-identity.js';
import { getSchoolMaster, isSchoolIdentityReady, saveSchoolIdentitySetup } from '../src/services/master.js';
import { invalidateDbCache, loadDb, storageKey } from '../src/services/storage.js';
import { MASTER_APLIKASI, MASTER_OWNER, buatIkon } from '../scripts/generate-icons.mjs';

/* Branding produk dan identitas sekolah adalah dua hal yang berbeda.

   e-Rapor dijual ke banyak sekolah, jadi nama produknya tidak boleh memuat nama sekolah mana
   pun. Nama sekolah datang dari Setup Awal dan berbeda di setiap pemasangan. Suite ini menjaga
   pemisahan itu, sekaligus menjaga identifier internal yang menentukan apakah pemasangan lama
   masih mengenali datanya sendiri. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const ada=path=>existsSync(new URL(path,root));
const sidik=path=>createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex');
const LAMA='SDN Satria Jaya 01';

function memoriBersih(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
  return nilai;
}

/* ------------------------------------------------------------------ 1-2. Branding produk */

test('1. Branding produk adalah e-Rapor, tanpa nama sekolah',()=>{
  assert.equal(APP_NAME,'e-Rapor');
  assert.equal(APP_TAGLINE,'Solusi Digital Pengelolaan Rapor Sekolah');
  assert.ok(!APP_NAME.includes('SDN'),'nama produk tidak memuat nama sekolah');

  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name,'e-Rapor');
  assert.equal(manifest.short_name,'e-Rapor');
  assert.ok(!manifest.description.includes(LAMA));

  assert.match(read('index.html'),/<title>e-Rapor<\/title>/);
  assert.equal(JSON.parse(read('capacitor.config.json')).appName,'e-Rapor',
    'appName Capacitor menjadi label peluncur Android');
  const strings=read('android/app/src/main/res/values/strings.xml');
  assert.match(strings,/<string name="app_name">e-Rapor<\/string>/);
  assert.match(strings,/<string name="title_activity_main">e-Rapor<\/string>/);

  /* Nama yang dilihat pengguna Windows: pintasan dan daftar "Apps & features". */
  const builder=read('electron-builder.yml');
  assert.match(builder,/^\s*shortcutName: e-Rapor$/m);
  assert.match(builder,/^\s*uninstallDisplayName: e-Rapor$/m);
  assert.match(read('electron/main.cjs'),/app\.setName\('e-Rapor'\);/);
});

test('2. Instalasi baru tidak membawa nama sekolah mana pun',()=>{
  memoriBersih();
  assert.equal(DEFAULT_SCHOOL_NAME,'');
  assert.equal(loadDb().masterData.school.name,'','instalasi baru kosong dari identitas sekolah');
  assert.equal(isSchoolIdentityReady(),false);
  assert.equal(getSchoolMaster().name,'');

  /* Tidak ada satu pun nama sekolah yang ditanam sebagai branding di kode aplikasi. */
  for(const berkas of ['src/data/app-identity.js','src/data/constants.js','index.html',
    'manifest.webmanifest','src/pages/login.js','src/pages/school-setup.js',
    'src/pages/license-activation.js']){
    const isi=read(berkas);
    const sisa=berkas==='src/data/app-identity.js'
      ? isi.replace(/export const LEGACY_APP_NAMES[^;]+;/,'')   /* nama backup lama, bukan branding */
      : isi;
    assert.ok(!sisa.includes(LAMA),`${berkas} tidak menanam nama sekolah sebagai branding`);
  }
});

/* -------------------------------------------------------------- 3-4. Identitas sekolah */

test('3. Identitas sekolah dinamis dan berbeda per sekolah',()=>{
  for(const nama of ['SDN Maju Jaya 01','SDN Harapan Bangsa']){
    memoriBersih();
    saveSchoolIdentitySetup({name:nama,npsn:'12345678',status:'Negeri',registrationNumber:'101010101010',
      phone:'0211234567',email:'sekolah@contoh.sch.id',address:'Jl. Contoh',village:'Desa',
      district:'Kecamatan',city:'Kabupaten',province:'Provinsi',postalCode:'12345',
      principalName:'Kepala Sekolah',principalNip:'196001011980121001'});
    assert.equal(getSchoolMaster().name,nama,`sekolah menampilkan namanya sendiri: ${nama}`);
    assert.equal(isSchoolIdentityReady(),true);
    /* Branding produk tidak ikut berubah mengikuti sekolah. */
    assert.equal(APP_NAME,'e-Rapor');
  }
});

test('4. Sekolah lama SDN Satria Jaya 01 tetap terbaca sebagai identitas sekolahnya',()=>{
  const nilai=memoriBersih();
  nilai.set(storageKey(),JSON.stringify({masterData:{school:{name:LAMA,npsn:'20218098'}}}));
  invalidateDbCache();
  assert.equal(getSchoolMaster().name,LAMA,'identitas sekolah lama tidak boleh hilang');
  assert.equal(isSchoolIdentityReady(),true);
  /* Berkas backup terbitan versi lama tetap dikenali. */
  assert.ok(LEGACY_APP_NAMES.includes('e-Rapor SDN Satria Jaya 01'));
  assert.ok(ACCEPTED_BACKUP_APP_NAMES.includes('e-Rapor SDN Satria Jaya 01'));
  assert.ok(ACCEPTED_BACKUP_APP_NAMES.includes(APP_NAME));
});

/* ----------------------------------------------------------------------- 5-7. Ikon */

test('5. Logo master aplikasi dan Owner tersedia sebagai sumber tunggal',()=>{
  for(const master of [MASTER_APLIKASI,MASTER_OWNER])
    assert.ok(ada(master),`master ${master} wajib ada; seluruh ikon diturunkan darinya`);
  assert.notEqual(sidik(MASTER_APLIKASI),sidik(MASTER_OWNER),
    'aplikasi dan Owner memakai logo yang berbeda');
});

test('6. Ikon Android dibuat dari master umum, bukan gambar bernama sekolah',()=>{
  /* Ikon yang di-commit harus persis sama dengan yang dihasilkan generator dari master.
     Dengan begitu ikon tidak mungkin melenceng dari logo resmi tanpa ketahuan. */
  const dibuat=buatIkon({tulis:false});
  const mipmap=dibuat.filter(item=>item.berkas.includes('/mipmap-'));
  assert.ok(mipmap.length>=18,'seluruh kepadatan layar Android terisi');
  for(const {berkas,isi} of dibuat){
    assert.ok(ada(berkas),`${berkas} sudah dibuat`);
    assert.equal(createHash('sha256').update(readFileSync(new URL(berkas,root))).digest('hex'),
      createHash('sha256').update(isi).digest('hex'),
      `${berkas} harus sama dengan hasil generator; jalankan "npm run icons"`);
  }
  /* Gambar lama bertuliskan "E-RAPOR SDN SATRIA JAYA 01" tidak boleh kembali menjadi ikon
     produk. Sidik jari di bawah diambil dari berkas yang benar-benar pernah dirilis. */
  const LAMA_BERNAMA_SEKOLAH=new Set([
    'ed8c2d00c3fa4cc4bebf3dbe67c4c86578ffe401b20ef8cf3886b5fb662f3ee9', /* android-icon-master.png */
    'b074f2ee1039b7f993c5a1d4747d0d8f78cb84555ffbcd6814a86e641df3655f', /* ic_launcher xxxhdpi */
  ]);
  for(const {berkas} of dibuat)
    assert.ok(!LAMA_BERNAMA_SEKOLAH.has(sidik(berkas)),
      `${berkas} masih memakai gambar lama bernama sekolah`);
  assert.ok(!LAMA_BERNAMA_SEKOLAH.has(sidik(MASTER_APLIKASI)),
    'master aplikasi bukan gambar lama bernama sekolah');
});

test('7. Owner memakai ikon yang berbeda dari aplikasi sekolah',()=>{
  const app='assets/app-icon-512.png',owner='server/public/owner/icons/owner-icon-512.png';
  for(const berkas of [app,owner])assert.ok(ada(berkas),`${berkas} tersedia`);
  assert.notEqual(sidik(app),sidik(owner),
    'ikon Owner wajib berbeda supaya pintasannya tidak tertukar di layar utama');
});

/* --------------------------------------------------------- 8-9. Pintasan Owner e-Rapor */

test('8. Pintasan Owner bernama "Owner e-Rapor"',()=>{
  const manifest=JSON.parse(read('server/public/owner/manifest.webmanifest'));
  assert.equal(manifest.name,OWNER_APP_NAME);
  assert.equal(manifest.short_name,OWNER_APP_NAME);
  assert.equal(OWNER_APP_NAME,'Owner e-Rapor');
  assert.notEqual(manifest.name,APP_NAME,'nama pintasan Owner berbeda dari aplikasi sekolah');
  const halaman=read('server/public/owner/index.html');
  assert.match(halaman,/<meta name="apple-mobile-web-app-title" content="Owner e-Rapor"\/>/);
  assert.match(halaman,/<link rel="manifest" href="\.\/manifest\.webmanifest"\/>/);
  assert.match(halaman,/<link rel="apple-touch-icon" href="\.\/icons\/owner-icon-192\.png"\/>/);
});

test('9. Pintasan Owner membuka /owner/ dan tetap meminta login',()=>{
  const manifest=JSON.parse(read('server/public/owner/manifest.webmanifest'));
  assert.equal(manifest.start_url,'/owner/');
  assert.equal(manifest.scope,'/owner/');
  assert.equal(manifest.display,'standalone');
  for(const ikon of manifest.icons)assert.match(ikon.src,/^\.\/icons\/owner-icon-/);

  /* Pintasan hanyalah tautan. Ia tidak membawa kredensial, dan panel tetap menampilkan
     layar login selama belum ada token di sessionStorage. */
  const teks=JSON.stringify(manifest);
  for(const rahasia of ['password','token','OWNER_PASSWORD','authorization'])
    assert.ok(!teks.toLowerCase().includes(rahasia.toLowerCase()),`manifest tidak memuat ${rahasia}`);
  const panel=read('server/public/owner/app.js');
  assert.match(panel,/if\(!token\)return tampilanLogin\(\);/,'tanpa token panel menampilkan login');
  assert.equal(read('server/public/owner/index.html').includes('OWNER_PASSWORD'),false);

  /* Manifest dan ikon harus punya tipe MIME benar; header nosniff membuat tipe salah
     ditolak browser sehingga pintasan tidak pernah bisa dipasang. */
  const api=read('server/src/api.js');
  assert.match(api,/'\.webmanifest':'application\/manifest\+json'/);
  assert.match(api,/'\.png':'image\/png'/);
});

/* ------------------------------------------------------ 10-11. Owner Panel tetap rahasia */

test('10. Halaman /beli tidak memuat tautan ke Owner Panel',()=>{
  for(const berkas of ['public/beli/index.html','public/beli/beli.js','public/beli/order-form.js',
    'public/beli/nav.js','public/beli/beli.css']){
    const isi=read(berkas);
    assert.ok(!/\/owner/.test(isi),`${berkas} tidak menyebut /owner`);
    assert.ok(!/Owner Panel/i.test(isi),`${berkas} tidak menyebut Owner Panel`);
  }
});

test('11. Aplikasi sekolah tidak memuat tautan maupun menu Owner Panel',()=>{
  for(const berkas of ['index.html','src/app.js','src/ui/layout.js','src/data/navigation.js',
    'src/pages/login.js','src/pages/about-updates.js','src/pages/license-activation.js',
    'src/pages/school-setup.js','manifest.webmanifest']){
    const isi=read(berkas);
    assert.ok(!/href=["'][^"']*\/owner/.test(isi),`${berkas} tidak menautkan ke /owner`);
    assert.ok(!/Owner Panel/i.test(isi),`${berkas} tidak menyebut Owner Panel`);
  }
  /* Owner Panel tetap dilayani di /owner/ dan tidak diindeks mesin pencari. */
  const vercel=JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(r=>r.source==='/owner'&&r.destination==='/owner/index.html'));
  assert.ok(vercel.rewrites.some(r=>r.source==='/owner/'));
  assert.match(read('server/public/owner/index.html'),/name="robots" content="noindex, nofollow"/);
});

/* ------------------------------------------- 12-14. Identifier internal dan desain rapor */

test('12. Identifier kompatibilitas sengaja tidak berubah',()=>{
  /* Mengganti salah satu nilai di bawah membuat pemasangan lama dianggap aplikasi berbeda:
     Windows terpasang dua kali, Android tidak bisa diperbarui, dan data lama seolah hilang. */
  assert.match(read('electron-builder.yml'),/^appId: id\.sch\.sdn\.satriajaya01\.erapor$/m);
  assert.match(read('electron-builder.yml'),/^\s*guid: 9a3f0d21-6c4b-5e88-9d17-2f6a1b7c4e30$/m);
  assert.match(read('electron-builder.yml'),/^productName: e-Rapor SDN Satria Jaya 01$/m);
  assert.match(read('electron/main.cjs'),/const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01';/);
  assert.match(read('electron/main.cjs'),/app\.setAppUserModelId\('id\.sch\.sdn\.satriajaya01\.erapor'\);/);
  assert.match(read('electron/main.cjs'),/const STORAGE_KEY='erapor_satria_jaya_01_v1';/);
  assert.equal(JSON.parse(read('capacitor.config.json')).appId,'id.sch.sdn.satriajaya01.erapor');
  assert.match(read('android/app/build.gradle'),/applicationId "id\.sch\.sdn\.satriajaya01\.erapor"/);
  assert.match(read('android/app/src/main/res/values/strings.xml'),
    /<string name="package_name">id\.sch\.sdn\.satriajaya01\.erapor<\/string>/);
  assert.match(read('forge.config.cjs'),/appBundleId:'id\.sch\.sdn\.satriajaya01\.erapor'/);
  assert.equal(JSON.parse(read('package.json')).name,'e-rapor-sdn-satria-jaya-01-codex-v1');
});

test('13. DB_KEY dan kunci penyimpanan lisensi tidak berubah',async()=>{
  memoriBersih();
  assert.equal(storageKey(),'erapor_satria_jaya_01_v1');
  assert.match(read('src/services/storage.js'),/const DB_KEY = 'erapor_satria_jaya_01_v1';/);
  const konfigurasi=read('src/data/license-config.js');
  assert.match(konfigurasi,/INSTALLATION_STORAGE_KEY='erapor_installation_v1'/);
  assert.match(konfigurasi,/LICENSE_STORAGE_KEY='erapor_license_v1'/);
});

test('14. Desain rapor tidak tersentuh pekerjaan branding',()=>{
  /* Logo dan nama pada dokumen sekolah berasal dari identitas sekolah, bukan dari ikon
     produk. Mengganti ikon aplikasi tidak boleh merembet ke lembar rapor. */
  const cetak=read('src/pages/print.js');
  assert.ok(!/app-icon|icon-only|android-icon-master|brand\//.test(cetak),
    'lembar cetak tidak memakai ikon produk');
  const css=read('src/styles/app.css');
  assert.match(css,/\.report-cover-a4\{display:flow-root;text-align:center;padding:37\.8px\}/,
    'geometri cover rapor tetap seperti desain final');
  assert.match(css,/Times New Roman/,'huruf dokumen rapor tidak berubah');
  assert.ok(!/app-icon|icon-only/.test(read('src/services/documents.js')),
    'identitas dokumen tidak mengambil ikon produk');
});

/* ------------------------------------------------------------------- 15. Alur lisensi */

test('15. Alur lisensi hasil perbaikan sebelumnya tetap utuh',()=>{
  const app=read('src/app.js');
  assert.ok(app.indexOf('!licenseState.canUseApp')<app.indexOf('!isSchoolIdentityReady()'),
    'gerbang lisensi tetap dievaluasi sebelum Setup Awal');
  const konfigurasi=read('src/data/license-config.js');
  assert.match(konfigurasi,/LICENSE_API_BASE='https:\/\//,'alamat server lisensi produksi tetap ada');
  assert.equal(/BEGIN PRIVATE KEY|"d"\s*:/.test(konfigurasi),false,'tidak ada kunci privat di aplikasi');
  const lisensi=read('server/src/licenses.js');
  assert.match(lisensi,/LICENSE_TYPES=Object\.freeze\(\['CUSTOMER','DEVELOPER'\]\)/);
  assert.match(lisensi,/tanpaRahasiaLisensi/,'hash dan paket pemulihan tetap disaring dari API');
  const panel=read('server/public/owner/app.js');
  for(const status of ['ACTIVE','UNUSED','SUSPENDED','REVOKED'])
    assert.ok(panel.includes(`status:'${status}',type:'CUSTOMER'`),`tab ${status} tetap disaring`);
});
