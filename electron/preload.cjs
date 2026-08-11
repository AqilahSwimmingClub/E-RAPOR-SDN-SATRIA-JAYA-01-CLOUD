const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('desktopBridge',Object.freeze({
  platform:'windows',
  saveFile:payload=>ipcRenderer.invoke('file:save',payload),
  openFile:payload=>ipcRenderer.invoke('file:open',payload),
  printCurrent:payload=>ipcRenderer.invoke('document:print',payload),
}));
