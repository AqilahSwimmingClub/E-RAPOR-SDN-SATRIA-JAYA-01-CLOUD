const {app,BrowserWindow,dialog,ipcMain,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');

if(require('electron-squirrel-startup'))app.quit();

app.setName('e-Rapor SDN Satria Jaya 01');
app.setAppUserModelId('id.sch.sdn.satriajaya01.erapor');

let mainWindow=null;
function createWindow(){
  mainWindow=new BrowserWindow({width:1366,height:850,minWidth:360,minHeight:640,backgroundColor:'#f3f0eb',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/i.test(url))shell.openExternal(url);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:'))event.preventDefault();});
}

app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

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
