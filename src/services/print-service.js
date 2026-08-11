export function printCurrentDocument({title='e-Rapor SDN Satria Jaya 01',savePdf=false}={}){
  if(globalThis.desktopBridge?.printCurrent)return globalThis.desktopBridge.printCurrent({title,savePdf});
  if(globalThis.NativePrint?.printCurrentDocument){globalThis.NativePrint.printCurrentDocument(title);return Promise.resolve({platform:'android',requested:true});}
  globalThis.print();return Promise.resolve({platform:'web',requested:true,savePdf});
}
export const PrintService=Object.freeze({printCurrentDocument});
