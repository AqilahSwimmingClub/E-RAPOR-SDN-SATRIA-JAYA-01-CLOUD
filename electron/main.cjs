/* Mode Windows e-Rapor mengikuti model e-Rapor Kemendikbud: aplikasi desktop hanyalah
   launcher yang menjalankan server lokal lalu membuka browser bawaan pengguna. Tidak ada
   BrowserWindow untuk antarmuka, sehingga tidak ada jendela Electron, address bar Electron,
   maupun tampilan ganda. Seluruh UI berjalan di browser default lewat http://127.0.0.1. */
const {app,BrowserWindow,Menu,Tray,nativeImage,shell}=require('electron');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');
const {createHash,randomBytes}=require('node:crypto');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {safeStorage}=require('electron');
const {createDapodikConfigStore}=require('./dapodik-config.cjs');
const {createDapodikClient}=require('./dapodik-client.cjs');
const {createDapodikBridge,DAPODIK_BRIDGE_PREFIX}=require('./dapodik-bridge.cjs');
const {createDbStore}=require('./db-store.cjs');

if(require('electron-squirrel-startup'))app.quit();

app.setName('e-Rapor');
app.setAppUserModelId('id.sch.sdn.satriajaya01.erapor');

/* Data guru disimpan di folder pengguna Windows (%APPDATA%), bukan di folder instalasi .exe,
   sehingga installer versi baru yang menimpa versi lama tidak pernah menyentuh datanya.
   Nama folder dikunci eksplisit agar tetap sama walau nama produk berubah di kemudian hari. */
/* Nama folder ini SENGAJA memakai nama produk lama. Ia menentukan letak %APPDATA% milik
   pengguna lama; menggantinya membuat seluruh data guru yang sudah ada seolah hilang. */
const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01';
const userDataPath=path.join(app.getPath('appData'),USER_DATA_FOLDER);
app.setPath('userData',userDataPath);

const versionMarkerPath=path.join(userDataPath,'desktop-release.json');
const legacyExportPath=path.join(userDataPath,'legacy-localstorage.json');
const STORAGE_KEY='erapor_satria_jaya_01_v1';

/* Database akademik kini dimiliki aplikasi, bukan profil browser. Letaknya di bawah folder
   %APPDATA% yang sama dengan identitas perangkat, sehingga installer versi baru tidak pernah
   menyentuhnya dan berganti browser tidak lagi membuat data sekolah seolah hilang.

   Batas ukuran badan permintaan dipasang longgar dengan sengaja: satu rombel terukur sekitar
   1,9 MB, dan satu sekolah 24 rombel sekitar 46 MB. Batas 96 MB memberi ruang dua kali lipat
   tanpa membiarkan permintaan tak berbatas menghabiskan memori launcher. */
const DB_PREFIX='/__erapor/db';
const DB_BODY_LIMIT=96*1024*1024;
const dbStore=createDbStore({baseDir:userDataPath});

/* Token bridge dibuat acak setiap peluncuran dan hanya disuntikkan ke index.html yang dilayani
   server lokal ini. Halaman lain di browser yang sama tidak dapat menebaknya, sehingga tidak
   dapat memanggil bridge Dapodik. Token ini BUKAN token Dapodik: token Dapodik tidak pernah
   meninggalkan proses utama. */
const bridgeToken=randomBytes(32).toString('hex');
let dapodikBridge=null;
function siapkanBridgeDapodik(){
  if(dapodikBridge)return dapodikBridge;
  const configStore=createDapodikConfigStore({safeStorage,fs,path,userDataPath});
  dapodikBridge=createDapodikBridge({configStore,client:createDapodikClient({}),bridgeToken});
  return dapodikBridge;
}
function bacaBadanPermintaan(request,limit){
  return new Promise(resolve=>{
    let total=0;const potongan=[];
    request.on('data',bagian=>{
      total+=bagian.length;
      if(total>limit){potongan.length=0;request.destroy();resolve(null);return;}
      potongan.push(bagian);
    });
    request.on('end',()=>resolve(Buffer.concat(potongan).toString('utf8')));
    request.on('error',()=>resolve(null));
  });
}

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
function bridgeTokenMeta(){
  return `<meta name="erapor-desktop-bridge-token" content="${bridgeToken}">`;
}

/* ------------------------------------------------------- IDENTITAS PERANGKAT WINDOWS

   Lisensi e-Rapor terikat pada perangkat. Kalau identitasnya hanya nilai acak di penyimpanan
   browser, menyalin folder profil browser ke komputer lain sudah cukup untuk membuat komputer
   kedua ikut dianggap berlisensi. Karena itu identitasnya DITURUNKAN dari komputer ini:

     1. MachineGuid Windows - nilai yang dibuat sistem saat Windows dipasang. Ia bertahan
        melewati pembaruan aplikasi, penggantian browser, dan pemasangan ulang e-Rapor.
     2. Bila registry tidak dapat dibaca (izin, Windows versi lama, atau bukan Windows sama
        sekali), dipakai nama host digabung alamat MAC adaptor jaringan pertama yang bukan
        adaptor internal.
     3. Bila keduanya gagal, dipakai nilai yang tersimpan dari peluncuran sebelumnya, dan hanya
        bila itu pun belum ada barulah nilai acak dibuat sekali lalu disimpan.

   NILAI MENTAHNYA TIDAK PERNAH KELUAR DARI PROSES INI. Yang disuntikkan ke halaman - dan
   karenanya satu-satunya yang mungkin sampai ke server lisensi - adalah SHA-256-nya. Aplikasi
   masih menghash sekali lagi di sisinya sendiri sebelum mengirim.

   ALASAN_PERANGKAT bukan rahasia: apa pun yang ada di dalam .exe dapat dibaca siapa saja.
   Gunanya semata pemisahan domain agar hash ini tidak pernah bertabrakan dengan hash keperluan
   lain. Keamanannya datang dari nilai mentah yang tidak pernah dikirim, bukan dari string ini.

   Berkas penyimpanannya berada di %APPDATA% - folder yang TIDAK disentuh installer - sehingga
   memperbarui aplikasi pada komputer yang sama tidak pernah dianggap perangkat baru. */
const ALASAN_PERANGKAT='erapor-desktop-device/v1';
const devicePath=path.join(userDataPath,'device-identity.json');

function bacaMachineGuid(){
  if(process.platform!=='win32')return '';
  try{
    const keluaran=execFileSync('reg',
      ['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],
      {encoding:'utf8',windowsHide:true,timeout:4000});
    const cocok=keluaran.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    return cocok?cocok[1].trim():'';
  }catch{return '';}
}

function bacaSidikJaringan(){
  try{
    const antarmuka=Object.values(os.networkInterfaces()||{}).flat()
      .filter(item=>item&&!item.internal&&item.mac&&item.mac!=='00:00:00:00:00:00')
      .map(item=>String(item.mac).toLowerCase()).sort();
    if(!antarmuka.length)return '';
    return `${os.hostname()}|${antarmuka[0]}`;
  }catch{return '';}
}

function bacaIdentitasTersimpan(){
  try{
    const isi=JSON.parse(fs.readFileSync(devicePath,'utf8'));
    return typeof isi?.deviceId==='string'&&/^[0-9a-f]{64}$/.test(isi.deviceId)?isi.deviceId:'';
  }catch{return '';}
}
function simpanIdentitas(deviceId,sumber){
  try{
    fs.mkdirSync(userDataPath,{recursive:true});
    fs.writeFileSync(devicePath,JSON.stringify({deviceId,source:sumber,updatedAt:new Date().toISOString()},null,2));
  }catch{/* penyimpanan opsional: kegagalannya tidak boleh menggagalkan peluncuran */}
}

const hashPerangkat=nilai=>createHash('sha256').update(`${ALASAN_PERANGKAT}:${nilai}`).digest('hex');

let deviceIdCache=null;
function desktopDeviceId(){
  if(deviceIdCache)return deviceIdCache;
  /* Nilai turunan komputer SELALU menang atas nilai tersimpan. Karena itu menyalin folder
     %APPDATA% ke komputer lain tidak memindahkan identitas: komputer kedua menurunkan
     identitasnya sendiri dan menimpa nilai yang ikut tersalin. */
  const guid=bacaMachineGuid();
  if(guid){
    deviceIdCache=hashPerangkat(`machine-guid:${guid.toLowerCase()}`);
    simpanIdentitas(deviceIdCache,'machine-guid');
    return deviceIdCache;
  }
  const jaringan=bacaSidikJaringan();
  if(jaringan){
    deviceIdCache=hashPerangkat(`host-mac:${jaringan.toLowerCase()}`);
    simpanIdentitas(deviceIdCache,'host-mac');
    return deviceIdCache;
  }
  const tersimpan=bacaIdentitasTersimpan();
  if(tersimpan){deviceIdCache=tersimpan;return deviceIdCache;}
  deviceIdCache=hashPerangkat(`acak:${randomBytes(32).toString('hex')}`);
  simpanIdentitas(deviceIdCache,'acak');
  return deviceIdCache;
}

function deviceIdMeta(){
  return `<meta name="erapor-desktop-device-id" content="${desktopDeviceId()}">`
    +'<meta name="erapor-desktop-platform" content="windows">'
    /* Penanda ini yang membuat halaman memakai penyimpanan milik aplikasi. Ia hanya ada pada
       index.html yang dilayani launcher versi ini, sehingga Android, web, dan launcher versi
       lama tetap memakai localStorage seperti sebelumnya tanpa perubahan apa pun. */
    +'<meta name="erapor-desktop-db" content="server">';
}

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

/* ----------------------------------------------------- Endpoint database milik aplikasi

   Tiga lapis izin, dan ketiganya harus lulus:

   1. Host loopback. Sudah dijaga handleRequest untuk seluruh server, diperiksa lagi di sini
      supaya endpoint ini tetap aman bila suatu saat dirutekan dari tempat lain.
   2. Token peluncuran. Nilainya acak setiap kali aplikasi dijalankan dan hanya disuntikkan ke
      index.html yang dilayani server ini, jadi halaman lain di browser yang sama tidak dapat
      menebaknya.
   3. Tidak ada satu pun header izin lintas-origin yang dikirim. Tanpa izin itu browser
      menolak membacakan jawaban endpoint ini kepada halaman dari origin lain, dan PUT
      ber-JSON memicu preflight yang tidak pernah dijawab.

   Letak berkas database TIDAK PERNAH dikirim ke halaman. Yang keluar hanya isi database,
   revisinya, dan status migrasinya - bukan path %APPDATA% tempat ia disimpan. */
function jsonDb(response,status,body){
  kirim(response,status,JSON.stringify(body),'application/json; charset=utf-8');
}

function tokenPermintaanCocok(request){
  const diberi=String(request.headers['x-erapor-bridge-token']||'');
  if(!bridgeToken||diberi.length!==bridgeToken.length)return false;
  let beda=0;
  for(let i=0;i<diberi.length;i+=1)beda|=diberi.charCodeAt(i)^bridgeToken.charCodeAt(i);
  return beda===0;
}

function layaniDatabase(request,response,jalur){
  const host=String(request.headers.host||'').split(':')[0];
  if(host&&!['127.0.0.1','localhost','[::1]','::1'].includes(host))
    return jsonDb(response,403,{error:'Penyimpanan hanya melayani komputer ini.'});
  if(!tokenPermintaanCocok(request))
    return jsonDb(response,403,{error:'Permintaan penyimpanan tidak diizinkan.'});
  const method=String(request.method||'GET').toUpperCase();

  if(jalur===DB_PREFIX&&method==='GET'){
    try{
      const isi=dbStore.baca();
      return jsonDb(response,200,{rev:isi.rev,database:isi.raw,sumber:isi.sumber,migrasi:dbStore.bacaState()});
    }catch(error){
      return jsonDb(response,500,{error:`Database aplikasi tidak dapat dibaca: ${error.message}`});
    }
  }

  if(jalur===DB_PREFIX&&method==='PUT'){
    bacaBadanPermintaan(request,DB_BODY_LIMIT).then(body=>{
      if(body===null)return jsonDb(response,413,{error:'Data yang dikirim ke penyimpanan terlalu besar.'});
      let muatan;
      try{muatan=JSON.parse(body);}catch{return jsonDb(response,400,{error:'Isi permintaan penyimpanan bukan JSON yang valid.'});}
      try{
        const hasil=dbStore.tulis(String(muatan?.database||''),muatan?.baseRev??'');
        /* Konflik BUKAN kegagalan penyimpanan: ia berarti ada penulis lain yang menang lebih
           dulu. Isi terbarunya ikut dikirim supaya halaman dapat mengulang perubahannya di
           atas data terbaru itu, bukan menimpanya. */
        if(hasil.konflik)return jsonDb(response,409,{konflik:true,rev:hasil.rev,database:hasil.raw});
        return jsonDb(response,200,{ok:true,rev:hasil.rev});
      }catch(error){
        return jsonDb(response,500,{error:`Database gagal disimpan: ${error.message}`});
      }
    }).catch(()=>jsonDb(response,500,{error:'Database gagal disimpan.'}));
    return;
  }

  if(jalur===`${DB_PREFIX}/backup`&&method==='POST'){
    bacaBadanPermintaan(request,DB_BODY_LIMIT).then(body=>{
      if(body===null)return jsonDb(response,413,{error:'Cadangan yang dikirim terlalu besar.'});
      let muatan;
      try{muatan=JSON.parse(body);}catch{return jsonDb(response,400,{error:'Isi cadangan bukan JSON yang valid.'});}
      try{
        const hasil=dbStore.simpanCadanganMigrasi(String(muatan?.database||''),muatan?.waktu);
        /* Hanya NAMA berkasnya yang dikembalikan, bukan path lengkapnya. */
        return jsonDb(response,200,{ok:true,nama:hasil.nama,bytes:hasil.bytes});
      }catch(error){
        return jsonDb(response,500,{error:`Cadangan gagal dibuat: ${error.message}`});
      }
    }).catch(()=>jsonDb(response,500,{error:'Cadangan gagal dibuat.'}));
    return;
  }

  if(jalur===`${DB_PREFIX}/state`&&method==='POST'){
    bacaBadanPermintaan(request,256*1024).then(body=>{
      if(body===null)return jsonDb(response,413,{error:'Status migrasi terlalu besar.'});
      let muatan;
      try{muatan=JSON.parse(body);}catch{return jsonDb(response,400,{error:'Status migrasi bukan JSON yang valid.'});}
      try{
        dbStore.tulisState(muatan||{});
        return jsonDb(response,200,{ok:true});
      }catch(error){
        return jsonDb(response,500,{error:`Status migrasi gagal dicatat: ${error.message}`});
      }
    }).catch(()=>jsonDb(response,500,{error:'Status migrasi gagal dicatat.'}));
    return;
  }

  return jsonDb(response,405,{error:'Metode tidak didukung pada penyimpanan.'});
}

function handleRequest(request,response){
  /* Hanya permintaan dari mesin ini yang dilayani. Host asing ditolak sebagai pengaman
     tambahan di samping listen yang memang hanya pada 127.0.0.1. */
  const host=String(request.headers.host||'').split(':')[0];
  if(host&&!['127.0.0.1','localhost','[::1]','::1'].includes(host))return kirim(response,403,'Akses hanya dari komputer ini.');
  const url=String(request.url||'/');
  if(url.startsWith(HEALTH_PATH))return kirim(response,200,JSON.stringify({app:HEALTH_TOKEN,version:app.getVersion(),port:activePort,pid:process.pid}),'application/json; charset=utf-8');
  if(url.startsWith('/__erapor/legacy-consumed')){markLegacyConsumed();return kirim(response,204,'');}
  if(url.split('?')[0]===DB_PREFIX||url.split('?')[0].startsWith(`${DB_PREFIX}/`)){
    layaniDatabase(request,response,url.split('?')[0]);
    return;
  }
  if(url.startsWith('/__erapor/exit')){kirim(response,200,'Menutup e-Rapor.');setTimeout(()=>keluar(),200);return;}
  /* Jalur bridge dirutekan sebelum berkas statis supaya tidak pernah jatuh ke index.html. */
  if(url.startsWith(DAPODIK_BRIDGE_PREFIX)){
    const batas=url.includes('/push')?5*1024*1024:256*1024;
    bacaBadanPermintaan(request,batas).then(async body=>{
      if(body===null)return kirim(response,413,JSON.stringify({error:'Data yang dikirim ke bridge terlalu besar.'}),'application/json; charset=utf-8');
      const hasil=await siapkanBridgeDapodik()({method:request.method,url,headers:request.headers,body});
      response.writeHead(hasil.status,hasil.headers);
      response.end(hasil.body);
    }).catch(()=>kirim(response,502,JSON.stringify({error:'Bridge Dapodik gagal memproses permintaan.'}),'application/json; charset=utf-8'));
    return;
  }

  let file=safeFilePath(url);
  if(!file)return kirim(response,403,'Permintaan tidak diizinkan.');
  if(!path.extname(file)||!fs.existsSync(file))file=path.join(distPath,'index.html');
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  fs.readFile(file,(error,data)=>{
    if(error)return kirim(response,404,'Berkas tidak ditemukan.');
    const type=MIME[path.extname(file).toLowerCase()]||'application/octet-stream';
    if(path.basename(file)==='index.html'){
      const html=data.toString('utf8').replace('</head>',`${bridgeTokenMeta()}${deviceIdMeta()}${legacyBootstrapScript()}</head>`);
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
    tray.setToolTip(`e-Rapor · ${appUrl()}`);
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
