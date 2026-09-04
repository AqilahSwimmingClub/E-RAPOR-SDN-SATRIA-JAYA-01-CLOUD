import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/version.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const main=()=>read('electron/main.cjs');

/* --------------------------------------------------------------- Launcher, bukan jendela UI */

test('1. Windows berjalan sebagai launcher server lokal tanpa jendela antarmuka',()=>{
  const t=main();
  assert.match(t,/http\.createServer\(handleRequest\)/,'launcher menjalankan server lokal sendiri');
  assert.match(t,/instance\.listen\(port,HOST,/,'server dijalankan pada host yang ditentukan');
  /* Tidak ada BrowserWindow untuk antarmuka. Satu-satunya BrowserWindow adalah pembaca data
     lama yang tidak pernah ditampilkan dan langsung dibuang. */
  assert.equal(/loadFile\(path\.join\(__dirname,'\.\.','dist','index\.html'\)\)/.test(t),false,'UI tidak lagi dimuat di dalam Electron');
  assert.equal(/mainWindow/.test(t),false,'tidak ada jendela utama Electron');
  const jendela=[...t.matchAll(/new BrowserWindow\(\{([^}]*)\}/g)].map(item=>item[1]);
  assert.equal(jendela.length,1,'hanya satu BrowserWindow, yaitu pembaca data lama');
  assert.match(jendela[0],/show:false/,'jendela pembaca tidak pernah ditampilkan');
  assert.match(t,/reader\?\.destroy\(\)/,'jendela pembaca langsung dibuang setelah dipakai');
});

test('2. Antarmuka dibuka di browser default lewat penangan sistem',()=>{
  const t=main();
  assert.match(t,/shell\.openExternal\(appUrl\(\)\)/,'memakai shell.openExternal, bukan browser tertentu');
  assert.match(t,/const appUrl=\(\)=>`http:\/\/\$\{HOST\}:\$\{activePort\}\/`/,'satu URL lokal yang stabil');
  for(const paksa of ['chrome.exe','msedge.exe','firefox.exe','--app=','execFile(\'start\''])
    assert.equal(t.includes(paksa),false,`tidak boleh memaksa ${paksa}`);
});

test('3. Server lokal hanya melayani komputer ini',()=>{
  const t=main();
  assert.match(t,/const HOST='127\.0\.0\.1'/,'listen hanya pada localhost');
  assert.equal(/0\.0\.0\.0/.test(t),false,'tidak pernah listen ke seluruh antarmuka jaringan');
  assert.match(t,/if\(host&&!\['127\.0\.0\.1','localhost','\[::1\]','::1'\]\.includes\(host\)\)/,'Host asing ditolak');
  assert.match(t,/return target\.startsWith\(distPath\)\?target:null/,'permintaan di luar folder dist ditolak');
  assert.equal(/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z]/i.test(t.replace(/http:\/\/\$\{HOST\}/g,'')),false,'tidak ada alamat internet pada launcher');
});

test('4. Port utama tetap dan hanya berpindah bila benar-benar dipakai aplikasi lain',()=>{
  const t=main();
  assert.match(t,/const PRIMARY_PORT=5321/,'port utama tetap sehingga origin penyimpanan browser stabil');
  assert.match(t,/const FALLBACK_PORTS=\[5322,5323,5324,5325\]/,'urutan port cadangan tetap');
  assert.match(t,/for\(const port of \[PRIMARY_PORT,\.\.\.FALLBACK_PORTS\]\)/,'port dicoba berurutan');
  assert.match(t,/if\(await cekServerSendiriDiPort\(port\)\)\{activePort=port;return \{port,reused:true\};\}/,'server e-Rapor yang sudah aktif dipakai ulang, tidak dibuat kedua');
  assert.match(t,/HEALTH_TOKEN='e-rapor-sdn-satria-jaya-01'/,'penanda untuk mengenali server milik sendiri');
});

test('5. Satu instance saja: klik dua kali hanya membuka browser',()=>{
  const t=main();
  assert.match(t,/const lock=app\.requestSingleInstanceLock\(\)/);
  assert.match(t,/if\(!lock\)\{[\s\S]*app\.quit\(\);/,'instance kedua langsung berhenti tanpa server baru');
  assert.match(t,/app\.on\('second-instance',\(\)=>\{bukaBrowserDefault\(\);\}\)/,'instance kedua cukup membuka browser');
});

/* ------------------------------------------------------------------ Data dan siklus hidup */

test('6. Data pengguna tetap di folder %APPDATA% dan tidak pernah dihapus launcher',()=>{
  const t=main();
  assert.match(t,/const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01'/);
  assert.match(t,/path\.join\(app\.getPath\('appData'\),USER_DATA_FOLDER\)/);
  assert.match(t,/app\.setPath\('userData',userDataPath\)/);
  for(const berbahaya of ['rmSync','unlinkSync','clearStorageData','localStorage.clear'])
    assert.equal(t.includes(berbahaya),false,`launcher tidak boleh memanggil ${berbahaya}`);
});

test('7. Data versi desktop lama disalin sekali ke aplikasi browser tanpa menimpa data baru',()=>{
  const t=main();
  assert.ok(existsSync(new URL('electron/legacy-reader.html',root)),'halaman pembaca data lama tersedia');
  assert.match(t,/executeJavaScript\(`\(\(\)=>\{try\{return localStorage\.getItem/,'data lama dibaca dari localStorage versi Electron');
  assert.match(t,/if\(!localStorage\.getItem\(K\)\)\{localStorage\.setItem\(K,/,'hanya mengisi bila penyimpanan browser masih kosong');
  assert.match(t,/legacy-consumed/,'penyalinan ditandai selesai agar tidak diulang');
});

test('8. Launcher menyediakan cara keluar yang menutup server dengan rapi',()=>{
  const t=main();
  assert.match(t,/label:'Keluar e-Rapor',click:\(\)=>keluar\(\)/,'tray menyediakan Keluar');
  assert.match(t,/if\(server\)server\.close\(selesai\);else selesai\(\)/,'server ditutup sebelum aplikasi berhenti');
  assert.match(t,/setTimeout\(\(\)=>app\.exit\(0\),2500\)/,'pengaman agar tidak ada proses menggantung');
  assert.match(t,/app\.on\('window-all-closed',\(\)=>\{\}\)/,'tanpa jendela, launcher tetap hidup sampai Keluar');
});

/* --------------------------------------------------------- Identitas installer dan berkas */

test('9. Identitas installer tidak berubah sehingga update tidak perlu uninstall',()=>{
  const builder=read('electron-builder.yml');
  assert.match(builder,/^appId: id\.sch\.sdn\.satriajaya01\.erapor$/m);
  assert.match(builder,/^productName: e-Rapor SDN Satria Jaya 01$/m);
  assert.match(builder,/guid: 9a3f0d21-6c4b-5e88-9d17-2f6a1b7c4e30/);
  assert.match(builder,/deleteAppDataOnUninstall: false/);
  assert.match(builder,/artifactName: E-RAPOR-SDN-SATRIA-JAYA-01-Setup-\$\{version\}\.\$\{ext\}/);
  assert.equal(JSON.parse(read('package.json')).version,APP_VERSION,'versi installer mengikuti versi aplikasi');
});

test('10. Installer memaketkan hasil build web terbaru beserta aset launcher',()=>{
  const builder=read('electron-builder.yml');
  const daftar=builder.slice(builder.indexOf('files:'),builder.indexOf('asar:'));
  for(const pola of ['electron/**/*','dist/**/*','package.json'])assert.ok(daftar.includes(pola),`${pola} ikut dipaketkan`);
  assert.match(main(),/const distPath=path\.join\(__dirname,'\.\.','dist'\)/,'server melayani hasil build web');
  assert.match(main(),/path\.join\(distPath,'assets','icon-only\.png'\)/,'ikon tray diambil dari aset yang ikut dipaketkan');
  assert.match(JSON.parse(read('package.json')).scripts['desktop:win'],/^npm run build:production &&/,'installer selalu dibangun dari source terbaru');
});

test('11. Server melayani SPA, aset, dan tidak menyajikan berkas basi',()=>{
  const t=main();
  assert.match(t,/if\(!path\.extname\(file\)\|\|!fs\.existsSync\(file\)\)file=path\.join\(distPath,'index\.html'\)/,'rute SPA jatuh ke index.html');
  for(const tipe of ["'.js':'text/javascript","'.css':'text/css","'.mp4':'video/mp4","'.json':'application/json"])
    assert.ok(t.includes(tipe),`tipe ${tipe} dilayani`);
  assert.match(t,/'Cache-Control':'no-store'/,'kode terbaru selalu dipakai setelah update');
  assert.match(t,/'X-Content-Type-Options':'nosniff'/);
});

test('12. Cetak dan berkas memakai kemampuan browser saat berjalan di localhost',()=>{
  const fileIo=read('src/services/file-io.js');
  const printService=read('src/services/print-service.js');
  /* Tanpa desktopBridge, aplikasi otomatis memakai jalur browser: unduh lewat Blob dan
     dialog cetak bawaan browser untuk Print maupun Save as PDF. */
  assert.match(fileIo,/if\(platform==='windows'\)return globalThis\.desktopBridge\.saveFile/,'jalur Electron hanya dipakai bila bridge tersedia');
  assert.match(fileIo,/const blob=new Blob\(\[bytes\],\{type:mime\}\)/,'browser mengunduh berkas lewat Blob');
  assert.match(fileIo,/input\.type='file'/,'browser memilih berkas lewat input file');
  assert.match(printService,/globalThis\.print\(\);return Promise\.resolve\(\{platform:'web'/,'browser memakai dialog cetak dan Save as PDF bawaan');
  assert.equal(/webContents\.print\(/.test(main()),false,'launcher tidak lagi memakai dialog cetak Electron');
});
