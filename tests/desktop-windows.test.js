import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/version.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

/* ------------------------------------------------------------ Identitas dan versi desktop */

test('Versi desktop mengikuti rilis aplikasi dan identitas produk konsisten',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,APP_VERSION,'versi desktop sama dengan versi aplikasi');
  assert.equal(pkg.productName,'e-Rapor SDN Satria Jaya 01','nama produk desktop konsisten');
  assert.equal(pkg.main,'electron/main.cjs','entry Electron tidak berubah');
  assert.match(pkg.scripts['desktop:win'],/electron-builder --win nsis/,'tersedia perintah build installer Windows');
  assert.match(pkg.scripts['desktop:win'],/^npm run build &&/,'installer selalu memakai hasil build web terbaru');
});

test('Identitas aplikasi tidak berubah antar versi sehingga installer mengenali instalasi lama',()=>{
  const builder=read('electron-builder.yml');
  const main=read('electron/main.cjs');
  assert.match(builder,/^appId: id\.sch\.sdn\.satriajaya01\.erapor$/m,'appId sama dengan Android dan tidak boleh berubah');
  assert.match(builder,/^productName: e-Rapor SDN Satria Jaya 01$/m);
  assert.match(builder,/guid: 9a3f0d21-6c4b-5e88-9d17-2f6a1b7c4e30/,'GUID uninstall dikunci agar upgrade terdeteksi');
  assert.match(main,/app\.setAppUserModelId\('id\.sch\.sdn\.satriajaya01\.erapor'\)/,'AppUserModelId sama dengan appId installer');
  assert.match(main,/app\.setName\('e-Rapor SDN Satria Jaya 01'\)/);
});

/* --------------------------------------------------------- Data pengguna dan update in-place */

test('Data pengguna disimpan di folder pengguna Windows, bukan folder instalasi',()=>{
  const main=read('electron/main.cjs');
  assert.match(main,/const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01'/,'nama folder data dikunci eksplisit');
  assert.match(main,/path\.join\(app\.getPath\('appData'\),USER_DATA_FOLDER\)/,'lokasi data mengikuti %APPDATA%');
  assert.match(main,/app\.setPath\('userData',userDataPath\)/,'userData ditetapkan eksplisit');
  assert.equal(/app\.getAppPath\(\)[^\n]*userData/.test(main),false,'data tidak pernah diletakkan di folder aplikasi');
});

test('Installer memperbarui instalasi lama tanpa uninstall dan tanpa menghapus data',()=>{
  const builder=read('electron-builder.yml');
  assert.match(builder,/deleteAppDataOnUninstall: false/,'AppData tidak pernah dihapus, termasuk saat uninstall');
  assert.match(builder,/oneClick: true/,'installer langsung memperbarui tanpa menanyakan uninstall');
  assert.match(builder,/perMachine: false/,'pemasangan per-pengguna sehingga lokasi data tetap sama');
  assert.match(builder,/allowToChangeInstallationDirectory: false/,'folder instalasi tetap agar upgrade selalu terdeteksi');
  assert.match(builder,/target: nsis/,'memakai target NSIS yang mendukung upgrade di tempat');
  assert.equal(/deleteAppDataOnUninstall: true/.test(builder),false);
});

test('Berkas yang dipaketkan tidak membawa data guru maupun kunci rahasia',()=>{
  const builder=read('electron-builder.yml');
  const daftar=builder.slice(builder.indexOf('files:'),builder.indexOf('asar:'));
  for(const pola of ['electron/**/*','dist/**/*','package.json'])assert.ok(daftar.includes(pola),`${pola} ikut dipaketkan`);
  for(const terlarang of ['owner-credentials','signing.properties','.jks','.keystore'])
    assert.equal(builder.includes(terlarang),false,`${terlarang} tidak boleh ikut ke installer`);
});

/* ------------------------------------------------------------------ Kesegaran kode setelah update */

test('Kode terbaru selalu dipakai karena server lokal melarang cache',()=>{
  const main=read('electron/main.cjs');
  assert.match(main,/'Cache-Control':'no-store'/,'server lokal tidak pernah menyajikan berkas dari cache');
  assert.match(main,/writeLastRunVersion\(app\.getVersion\(\)\)/,'penanda versi rilis desktop tetap dicatat');
  /* Yang boleh disentuh hanya berkas aplikasi. Data guru tidak pernah dihapus launcher. */
  for(const berbahaya of ['clearStorageData','clearData(','localStorage.clear','removeItem','rmSync','unlinkSync'])
    assert.equal(main.includes(berbahaya),false,`main.cjs tidak boleh memanggil ${berbahaya}`);
});

test('Service worker tidak dipakai pada desktop sehingga tidak ada bundle lama dari cache',()=>{
  assert.match(read('src/app.js'),/'serviceWorker' in navigator && location\.protocol!=='file:'/,'registrasi service worker dilewati pada protokol file');
});

/* ------------------------------------------------------------------------- Intro responsive */

test('Intro tampil utuh dan proporsional pada portrait maupun landscape',()=>{
  const css=read('src/styles/app.css');
  const aturan=css.match(/\.intro-screen\{[^}]*\}/)[0];
  assert.match(aturan,/height:100vh/,'tinggi mengikuti viewport, bukan sekadar inset');
  assert.match(css,/@supports \(height:100dvh\)\{\.intro-screen\{width:100dvw;height:100dvh\}\}/,'memakai viewport dinamis bila tersedia');
  assert.match(aturan,/align-items:center/);
  assert.match(aturan,/justify-content:center/);
  assert.match(aturan,/overflow:hidden/);
  assert.match(aturan,/env\(safe-area-inset-top\)/,'area aman perangkat diperhitungkan');

  const video=css.match(/\.intro-screen video\{[^}]*\}/)[0];
  assert.match(video,/object-fit:contain/,'video tidak pernah terpotong');
  assert.match(video,/max-width:100%/);
  assert.match(video,/max-height:100%/);
  assert.match(video,/object-position:center center/,'video center horizontal dan vertikal');
  assert.equal(/object-fit:cover/.test(video),false,'cover dilarang karena memotong video');
  assert.equal(/object-fit:fill/.test(video),false,'fill dilarang karena menggepengkan video');
});

test('Intro tidak dimuat ulang atau memulai audio dari awal saat orientasi berubah',()=>{
  const intro=read('src/ui/intro.js');
  for(const pemicu of ['orientationchange','addEventListener(\'resize\'','location.reload','video.load()'])
    assert.equal(new RegExp(pemicu.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(intro.replace(/video\.load\(\);\}catch/,'')),false,`intro tidak boleh bereaksi pada ${pemicu}`);
  assert.match(intro,/video\.addEventListener\('ended',finish,\{once:true\}\)/,'intro selesai lalu masuk Login seperti biasa');
});

/* --------------------------------------------------------------------- Fitur final tidak berubah */

test('Perubahan desktop tidak menyentuh format dokumen yang sudah final',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/\.report-a4\{padding:14mm 13mm\}/,'format cetak rapor tetap');
  assert.match(css,/\.report-learning-table th:nth-child\(3\),\.report-learning-table \.subject-score-cell\{text-align:center;vertical-align:middle\}/,'posisi Nilai Akhir tetap');
  assert.match(css,/\.brand-photo\{width:78px;height:78px/,'branding pembuat tetap');
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/COVER_LOGO_DEFAULTS=Object\.freeze\(\{/,'Cover tetap memakai logo resmi');
  assert.match(cetak,/if\(tab==='leger'\)setPrintPageSize\('landscape',marginRule\('leger'\)\)/,'Leger A4 landscape tetap');
  assert.match(cetak,/return mode==='report'\?'10mm 0':'8mm';/,'margin leger bawaan tetap 8mm');
});
