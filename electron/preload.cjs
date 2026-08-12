const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('desktopBridge',Object.freeze({
  platform:'windows',
  saveFile:payload=>ipcRenderer.invoke('file:save',payload),
  openFile:payload=>ipcRenderer.invoke('file:open',payload),
  printCurrent:payload=>ipcRenderer.invoke('document:print',payload),
  /* Informasi rilis desktop dan lokasi penyimpanan data, dipakai halaman Pengaturan dan uji. */
  desktopInfo:()=>ipcRenderer.invoke('desktop:info'),
}));
