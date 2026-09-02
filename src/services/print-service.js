import { APP_NAME } from '../data/app-identity.js';
/* Preview dokumen selalu tersedia DI DALAM aplikasi sebelum dialog cetak perangkat dibuka.
   Electron/Chromium memang tidak menyertakan print preview bawaan, sehingga dialog Windows
   menampilkan "This app doesn't support print preview". Preview palsu tidak dibuat; alurnya
   dibalik menjadi: dokumen tampil di aplikasi, guru memeriksa, baru dialog cetak dibuka. */
export function isDesktop(){return Boolean(globalThis.desktopBridge?.printCurrent);}

/* Menggulirkan dokumen ke layar sehingga yang akan dicetak benar-benar terlihat lebih dulu. */
export function showDocumentPreview(){
  const sheet=globalThis.document?.querySelector('.document-sheet');
  if(!sheet)return false;
  sheet.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}

export function printCurrentDocument({title=APP_NAME,savePdf=false}={}){
  if(globalThis.desktopBridge?.printCurrent){
    /* Simpan PDF memakai printToPDF Electron; Cetak membuka dialog perangkat setelah
       dokumennya lebih dulu ditampilkan di aplikasi. */
    if(!savePdf)showDocumentPreview();
    return globalThis.desktopBridge.printCurrent({title,savePdf});
  }
  if(globalThis.NativePrint?.printCurrentDocument){globalThis.NativePrint.printCurrentDocument(title);return Promise.resolve({platform:'android',requested:true});}
  globalThis.print();return Promise.resolve({platform:'web',requested:true,savePdf});
}
export const PrintService=Object.freeze({printCurrentDocument,showDocumentPreview,isDesktop});
