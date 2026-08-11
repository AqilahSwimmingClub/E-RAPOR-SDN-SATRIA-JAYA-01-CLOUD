function bytesOf(data){
  if(data instanceof Uint8Array)return data;
  if(data instanceof ArrayBuffer)return new Uint8Array(data);
  if(ArrayBuffer.isView(data))return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
  return new TextEncoder().encode(String(data??''));
}
function toBase64(data){const bytes=bytesOf(data);if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');let binary='';for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));return btoa(binary);}
function fromBase64(value){if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(String(value),'base64'));const binary=atob(String(value));return Uint8Array.from(binary,char=>char.charCodeAt(0));}

export function runtimePlatform(){if(globalThis.desktopBridge)return 'windows';if(globalThis.NativeFileIO)return 'android';return 'web';}

export async function saveFile({name,mime='application/octet-stream',data}){
  const fileName=String(name||'download.bin').replace(/[\\/:*?"<>|]+/g,'-');const bytes=bytesOf(data);const platform=runtimePlatform();
  if(platform==='windows')return globalThis.desktopBridge.saveFile({name:fileName,mime,base64:toBase64(bytes)});
  if(platform==='android'){globalThis.NativeFileIO.saveBase64(fileName,mime,toBase64(bytes));return {saved:true,platform};}
  const blob=new Blob([bytes],{type:mime});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.hidden=true;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return {saved:true,platform};
}

export async function pickFile({accept='' }={}){
  if(runtimePlatform()==='windows'){
    const result=await globalThis.desktopBridge.openFile({accept});if(!result)return null;const bytes=fromBase64(result.base64);return {name:result.name,type:result.type||'',bytes,arrayBuffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:new TextDecoder().decode(bytes)};
  }
  return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.hidden=true;document.body.append(input);input.onchange=async()=>{const file=input.files?.[0];input.remove();if(!file){resolve(null);return;}const arrayBuffer=await file.arrayBuffer();resolve({name:file.name,type:file.type,bytes:new Uint8Array(arrayBuffer),arrayBuffer,text:await file.text()});};input.oncancel=()=>{input.remove();resolve(null);};input.click();});
}

export const FileIOService=Object.freeze({runtimePlatform,saveFile,pickFile});
