/* Mode Windows e-Rapor mengikuti model e-Rapor Kemendikbud: aplikasi desktop hanyalah
   launcher yang menjalankan server lokal lalu membuka browser bawaan pengguna. Tidak ada
   BrowserWindow untuk antarmuka, sehingga tidak ada jendela Electron, address bar Electron,
   maupun tampilan ganda. Seluruh UI berjalan di browser default lewat http://127.0.0.1. */
const {app,BrowserWindow,Menu,Tray,nativeImage,shell}=require('electron');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');

if(require('electron-squirrel-startup'))app.quit();

app.setName('e-Rapor SDN Satria Jaya 01');
app.setAppUserModelId('id.sch.sdn.satriajaya01.erapor');

/* Data guru disimpan di folder pengguna Windows (%APPDATA%), bukan di folder instalasi .exe,
   sehingga installer versi baru yang menimpa versi lama tidak pernah menyentuh datanya.
   Nama folder dikunci eksplisit agar tetap sama walau nama produk berubah di kemudian hari. */
const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01';
const userDataPath=path.join(app.getPath('appData'),USER_DATA_FOLDER);
app.setPath('userData',userDataPath);

const versionMarkerPath=path.join(userDataPath,'desktop-release.json');
const legacyExportPath=path.join(userDataPath,'legacy-localstorage.json');
const STORAGE_KEY='erapor_satria_jaya_01_v1';

/* Port tetap supaya origin http://127.0.0.1:5321 tidak berubah antar sesi. Origin yang stabil
   penting karena penyimpanan browser terikat pada origin: port berubah berarti data guru
   seolah hilang. Port cadangan hanya dipakai bila port utama benar-benar dipakai aplikasi
   lain, dan urutannya tetap sama setiap kali. */
const HOST='127.0.0.1';
const PRIMARY_PORT=5321;
const FALLBACK_PORTS=[5322,5323,5324,5325];
const HEALTH_PATH='/__erapor/health';
const HEALTH_TOKEN='e-rapor-sdn-satria-jaya-01';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.mp4':'video/mp4','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const distPath=path.join(__dirname,'..','dist');

let server=null;
let activePort=0;
let tray=null;
let legacyPayload='';

function readLastRunVersion(){
  try{return String(JSON.parse(fs.readFileSync(versionMarkerPath,'utf8')).version||'');}catch{return '';}
}
function writeLastRunVersion(version){
  try{fs.mkdirSync(userDataPath,{recursive:true});fs.writeFileSync(versionMarkerPath,JSON.stringify({version,port:activePort,updatedAt:new Date().toISOString()}));}catch{/* penanda bersifat opsional */}
}

/* ------------------------------------------------------------------ Data versi desktop lama */

/* Versi desktop sebelumnya menampilkan UI di dalam Electron sehingga datanya tersimpan pada
   localStorage origin file:// milik userData. Sekali saja data itu dibaca lewat halaman kosong
   milik launcher, lalu disalin ke aplikasi yang kini berjalan di browser. Data lama tidak
   pernah dihapus; salinan hanya dipakai bila penyimpanan browser masih kosong. */
async function exportLegacyStorage(){
  if(fs.existsSync(legacyExportPath))return;
  let reader=null;
  try{
    reader=new BrowserWindow({show:false,width:320,height:240,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:false}});
    await reader.loadFile(path.join(__dirname,'legacy-reader.html'));
    const raw=await reader.webContents.executeJavaScript(`(()=>{try{return localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'';}catch(error){return '';}})()`);
    fs.mkdirSync(userDataPath,{recursive:true});
    fs.writeFileSync(legacyExportPath,JSON.stringify({exportedAt:new Date().toISOString(),database:String(raw||'')}));
  }catch{/* tidak ada data lama atau tidak dapat dibaca: aplikasi tetap berjalan normal */}
  finally{try{reader?.destroy();}catch{/* jendela pembaca memang dibuang */}}
}

function loadLegacyPayload(){
  try{
    const isi=JSON.parse(fs.readFileSync(legacyExportPath,'utf8'));
    if(isi?.consumedAt)return '';
    return String(isi?.database||'');
  }catch{return '';}
}
function markLegacyConsumed(){
  try{
    const isi=JSON.parse(fs.readFileSync(legacyExportPath,'utf8'));
    fs.writeFileSync(legacyExportPath,JSON.stringify({...isi,consumedAt:new Date().toISOString()}));
  }catch{/* penanda opsional */}
  legacyPayload='';
}

/* Skrip penyalin dijalankan sebelum aplikasi dimuat dan hanya menulis bila penyimpanan browser
   masih kosong, sehingga data yang sudah ada di browser tidak pernah tertimpa. */
function legacyBootstrapScript(){
  if(!legacyPayload)return '';
  return `<script>try{var K=${JSON.stringify(STORAGE_KEY)};if(!localStorage.getItem(K)){localStorage.setItem(K,${JSON.stringify(legacyPayload)});if(navigator.sendBeacon)navigator.sendBeacon('/__erapor/legacy-consumed');}else if(navigator.sendBeacon)navigator.sendBeacon('/__erapor/legacy-consumed');}catch(error){}</script>`;
}

/* ------------------------------------------------------------------------ Server lokal */

function safeFilePath(urlPath){
  const bersih=decodeURIComponent(String(urlPath||'/').split('?')[0].split('#')[0]);
  const target=path.normalize(path.join(distPath,bersih));
  /* Path traversal ditolak: berkas di luar folder dist tidak pernah dilayani. */
  return target.startsWith(distPath)?target:null;
}

function kirim(response,status,body,type='text/plain; charset=utf-8'){
  response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(body);
}

function handleRequest(request,response){
  /* Hanya permintaan dari mesin ini yang dilayani. Host asing ditolak sebagai pengaman
     tambahan di samping listen yang memang hanya pada 127.0.0.1. */
  const host=String(request.headers.host||'').split(':')[0];
  if(host&&!['127.0.0.1','localhost','[::1]','::1'].includes(host))return kirim(response,403,'Akses hanya dari komputer ini.');
  const url=String(request.url||'/');
  if(url.startsWith(HEALTH_PATH))return kirim(response,200,JSON.stringify({app:HEALTH_TOKEN,version:app.getVersion(),port:activePort,pid:process.pid}),'application/json; charset=utf-8');
  if(url.startsWith('/__erapor/legacy-consumed')){markLegacyConsumed();return kirim(response,204,'');}
  if(url.startsWith('/__erapor/exit')){kirim(response,200,'Menutup e-Rapor.');setTimeout(()=>keluar(),200);return;}

  let file=safeFilePath(url);
  if(!file)return kirim(response,403,'Permintaan tidak diizinkan.');
  if(!path.extname(file)||!fs.existsSync(file))file=path.join(distPath,'index.html');
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  fs.readFile(file,(error,data)=>{
    if(error)return kirim(response,404,'Berkas tidak ditemukan.');
    const type=MIME[path.extname(file).toLowerCase()]||'application/octet-stream';
    if(path.basename(file)==='index.html'){
      const html=data.toString('utf8').replace('</head>',`${legacyBootstrapScript()}</head>`);
      return kirim(response,200,html,type);
    }
    response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(data);
  });
}

function cekServerSendiriDiPort(port){
  return new Promise(resolve=>{
    const request=http.get({host:HOST,port,path:HEALTH_PATH,timeout:1200},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;});
      res.on('end',()=>{try{resolve(JSON.parse(body)?.app===HEALTH_TOKEN);}catch{resolve(false);}});
    });
    request.on('timeout',()=>{request.destroy();resolve(false);});
    request.on('error',()=>resolve(false));
  });
}

function portKosong(port){
  return new Promise(resolve=>{
    const uji=net.createServer();
    uji.once('error',()=>resolve(false));
    uji.once('listening',()=>uji.close(()=>resolve(true)));
    uji.listen(port,HOST);
  });
}

function jalankanServer(port){
  return new Promise((resolve,reject)=>{
    const instance=http.createServer(handleRequest);
    instance.once('error',reject);
    instance.listen(port,HOST,()=>{server=instance;activePort=port;resolve(port);});
  });
}

async function siapkanServer(){
  for(const port of [PRIMARY_PORT,...FALLBACK_PORTS]){
    if(await cekServerSendiriDiPort(port)){activePort=port;return {port,reused:true};}
    if(!await portKosong(port))continue;
    try{await jalankanServer(port);return {port,reused:false};}catch{/* port terpakai balapan, coba berikutnya */}
  }
  throw new Error('Tidak ada port lokal yang tersedia untuk menjalankan e-Rapor.');
}

const appUrl=()=>`http://${HOST}:${activePort}/`;
function bukaBrowserDefault(){
  /* shell.openExternal memakai penangan default Windows, sehingga browser yang terbuka adalah
     browser bawaan pengguna: Chrome, Edge, Firefox, atau lainnya. Tidak ada browser yang
     dipaksakan dari aplikasi. */
  return shell.openExternal(appUrl());
}

/* --------------------------------------------------------------------------- Lifecycle */

function pasangTray(){
  try{
    const ikon=nativeImage.createFromPath(path.join(distPath,'assets','icon-only.png'));
    tray=new Tray(ikon.isEmpty()?nativeImage.createEmpty():ikon.resize({width:16,height:16}));
    tray.setToolTip(`e-Rapor SDN Satria Jaya 01 · ${appUrl()}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:`e-Rapor berjalan di ${appUrl()}`,enabled:false},
      {type:'separator'},
      {label:'Buka e-Rapor di Browser',click:()=>bukaBrowserDefault()},
      {label:'Keluar e-Rapor',click:()=>keluar()},
    ]));
    tray.on('double-click',()=>bukaBrowserDefault());
  }catch{/* tanpa tray aplikasi tetap berjalan */}
}

let sedangKeluar=false;
function keluar(){
  if(sedangKeluar)return;
  sedangKeluar=true;
  try{tray?.destroy();}catch{/* tray memang dilepas */}
  const selesai=()=>app.quit();
  if(server)server.close(selesai);else selesai();
  /* Pengaman supaya proses tidak menggantung bila ada koneksi yang belum tertutup. */
  setTimeout(()=>app.exit(0),2500).unref?.();
}

const lock=app.requestSingleInstanceLock();
if(!lock){
  /* Instance kedua tidak pernah menjalankan server atau database kedua. */
  app.quit();
}else{
  app.on('second-instance',()=>{bukaBrowserDefault();});
  app.whenReady().then(async()=>{
    await exportLegacyStorage();
    legacyPayload=loadLegacyPayload();
    await siapkanServer();
    writeLastRunVersion(app.getVersion());
    pasangTray();
    await bukaBrowserDefault();
  }).catch(()=>{app.exit(1);});
  /* Tidak ada jendela aplikasi, sehingga penutupan jendela tidak boleh mematikan launcher. */
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{try{server?.close();}catch{/* server memang ditutup */}});
}

module.exports={PRIMARY_PORT,FALLBACK_PORTS,HOST,HEALTH_PATH,HEALTH_TOKEN};
