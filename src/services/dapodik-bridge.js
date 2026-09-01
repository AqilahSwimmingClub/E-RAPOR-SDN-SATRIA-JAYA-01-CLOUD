/* Penemuan bridge Dapodik dari sisi browser.
   Token peluncuran hanya dibaca dari meta tag yang disuntikkan peluncur Windows dan disimpan
   di memori modul saja. Bila token tidak ada, aplikasi sedang berjalan di Web/PWA atau Android:
   tidak ada satu pun permintaan jaringan Dapodik yang dilakukan, hanya pesan arahan. */

export const DAPODIK_WINDOWS_REQUIRED='Sinkronisasi Dapodik harus dijalankan melalui aplikasi Windows.';

const PATHS=Object.freeze({
  config:'/__erapor/dapodik/config',
  test:'/__erapor/dapodik/test',
  pull:'/__erapor/dapodik/pull',
  push:'/__erapor/dapodik/push'
});

function readTokenFromMeta(){
  const meta=globalThis.document?.querySelector?.('meta[name="erapor-desktop-bridge-token"]');
  return String(meta?.getAttribute?.('content')||'').trim();
}

async function readSafeJson(response){
  let payload=null;
  try{payload=await response.json();}
  catch{throw new Error('Jawaban bridge Dapodik tidak dapat dibaca.');}
  if(!response.ok){
    const message=String(payload?.error||'').trim();
    throw new Error(message||'Permintaan ke bridge Dapodik gagal.');
  }
  return payload;
}

export function createBrowserDapodikBridge({readToken=readTokenFromMeta,fetchImpl=globalThis.fetch}={}){
  function platform(){
    const token=String(readToken()||'').trim();
    return token?{available:true,platform:'windows',reason:''}:{available:false,platform:'web',reason:DAPODIK_WINDOWS_REQUIRED};
  }

  async function request(path,{method='GET',body}={}){
    /* Token dibaca ulang setiap permintaan supaya peluncuran baru langsung terpakai dan tidak
       ada salinan token yang bertahan di memori lebih lama dari yang diperlukan. */
    const token=String(readToken()||'').trim();
    if(!token)throw new Error(DAPODIK_WINDOWS_REQUIRED);
    let response;
    try{
      response=await fetchImpl(path,{
        method,
        credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-ERapor-Bridge-Token':token},
        body:body===undefined?undefined:JSON.stringify(body)
      });
    }catch{
      /* Pesan asli fetch dapat memuat URL internal; diganti pesan yang dapat ditindaklanjuti. */
      throw new Error('Bridge Dapodik tidak dapat dihubungi. Pastikan aplikasi Windows e-Rapor masih berjalan.');
    }
    return readSafeJson(response);
  }

  return {
    platform,
    getConfig:()=>request(PATHS.config),
    saveConfig:input=>request(PATHS.config,{method:'PUT',body:input||{}}),
    clearConfig:()=>request(PATHS.config,{method:'DELETE'}),
    test:()=>request(PATHS.test,{method:'POST',body:{}}),
    pull:()=>request(PATHS.pull,{method:'POST',body:{}}),
    push:payload=>request(PATHS.push,{method:'POST',body:payload||{}})
  };
}

const defaultBridge=createBrowserDapodikBridge();
export function dapodikPlatform(){return defaultBridge.platform();}
export function getDapodikPublicConfig(){return defaultBridge.getConfig();}
export function saveDapodikConfig(input){return defaultBridge.saveConfig(input);}
export function clearDapodikConfig(){return defaultBridge.clearConfig();}
export function testDapodikConnection(){return defaultBridge.test();}
export function pullDapodikData(){return defaultBridge.pull();}
export function pushDapodikValues(payload){return defaultBridge.push(payload);}
