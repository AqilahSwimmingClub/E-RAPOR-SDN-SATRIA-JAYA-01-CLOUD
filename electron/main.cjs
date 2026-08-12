const {app,BrowserWindow,dialog,ipcMain,session,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');

if(require('electron-squirrel-startup'))app.quit();

app.setName('e-Rapor SDN Satria Jaya 01');
app.setAppUserModelId('id.sch.sdn.satriajaya01.erapor');

/* Data guru disimpan di folder pengguna Windows (%APPDATA%), bukan di folder instalasi .exe,
   sehingga installer versi baru yang menimpa versi lama tidak pernah menyentuh datanya.
   Nama folder dikunci eksplisit agar tetap sama walau nama produk berubah di kemudian hari. */
const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01';
const userDataPath=path.join(app.getPath('appData'),USER_DATA_FOLDER);
app.setPath('userData',userDataPath);

/* Penanda versi yang terakhir dijalankan. Dipakai untuk membersihkan cache kode/HTTP milik
   rilis lama supaya JS dan CSS terbaru langsung dipakai setelah update. Hanya cache yang
   dibersihkan; localStorage, IndexedDB, dan seluruh data guru tidak pernah disentuh. */
const versionMarkerPath=path.join(userDataPath,'desktop-release.json');

function readLastRunVersion(){
  try{return String(JSON.parse(fsSync.readFileSync(versionMarkerPath,'utf8')).version||'');}catch{return '';}
}
function writeLastRunVersion(version){
  try{fsSync.mkdirSync(userDataPath,{recursive:true});fsSync.writeFileSync(versionMarkerPath,JSON.stringify({version,updatedAt:new Date().toISOString()}));}catch{}
}

async function refreshCachesOnNewRelease(){
  const current=app.getVersion();
  if(readLastRunVersion()===current)return {refreshed:false,version:current};
  try{
    const target=session.defaultSession;
    await target.clearCache();
    await target.clearCodeCaches({});
  }catch{/* pembersihan cache bersifat opsional dan tidak boleh menggagalkan startup */}
  writeLastRunVersion(current);
  return {refreshed:true,version:current};
}

let mainWindow=null;
function createWindow(){
  mainWindow=new BrowserWindow({width:1366,height:850,minWidth:360,minHeight:640,backgroundColor:'#f3f0eb',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/i.test(url))shell.openExternal(url);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:'))event.preventDefault();});
}

app.whenReady().then(async()=>{await refreshCachesOnNewRelease();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

ipcMain.handle('desktop:info',()=>({version:app.getVersion(),name:app.getName(),userDataPath:app.getPath('userData'),lastRunVersion:readLastRunVersion()}));

ipcMain.handle('file:save',async(_event,payload)=>{
  const result=await dialog.showSaveDialog(mainWindow,{title:'Simpan File e-Rapor',defaultPath:String(payload?.name||'download.bin')});if(result.canceled||!result.filePath)return {saved:false,canceled:true};await fs.writeFile(result.filePath,Buffer.from(String(payload.base64||''),'base64'));return {saved:true,path:result.filePath};
});

ipcMain.handle('file:open',async(_event,payload)=>{
  const result=await dialog.showOpenDialog(mainWindow,{title:'Pilih File e-Rapor',properties:['openFile'],filters:[{name:'Dokumen e-Rapor',extensions:['xlsx','xls','csv','json']},{name:'Semua File',extensions:['*']}]});if(result.canceled||!result.filePaths[0])return null;const filePath=result.filePaths[0];const data=await fs.readFile(filePath);return {name:path.basename(filePath),type:'',base64:data.toString('base64'),accept:String(payload?.accept||'')};
});

ipcMain.handle('document:print',async(_event,payload)=>{
  const title=String(payload?.title||'e-Rapor SDN Satria Jaya 01');
  if(payload?.savePdf){const result=await dialog.showSaveDialog(mainWindow,{title:'Simpan PDF',defaultPath:`${title.replace(/[\\/:*?"<>|]+/g,'-')}.pdf`,filters:[{name:'PDF',extensions:['pdf']}]});if(result.canceled||!result.filePath)return {saved:false,canceled:true};const pdf=await mainWindow.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});await fs.writeFile(result.filePath,pdf);return {saved:true,path:result.filePath};}
  return new Promise((resolve,reject)=>mainWindow.webContents.print({silent:false,printBackground:true},(success,reason)=>success?resolve({printed:true}):reject(new Error(reason||'Dialog cetak dibatalkan.'))));
});
