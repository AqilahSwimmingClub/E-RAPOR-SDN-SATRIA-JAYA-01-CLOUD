import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserDapodikBridge, DAPODIK_WINDOWS_REQUIRED } from '../src/services/dapodik-bridge.js';

function jsonFetch(body,status=200){
  return async()=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
}

test('Browser tanpa metadata desktop meminta aplikasi Windows dan tidak melakukan fetch',async()=>{
  let calls=0;
  const bridge=createBrowserDapodikBridge({readToken:()=>'',fetchImpl:async()=>{calls+=1;}});
  assert.deepEqual(bridge.platform(),{available:false,platform:'web',reason:DAPODIK_WINDOWS_REQUIRED});
  await assert.rejects(()=>bridge.test(),/aplikasi Windows/);
  await assert.rejects(()=>bridge.pull(),/aplikasi Windows/);
  await assert.rejects(()=>bridge.push({scores:[]}),/aplikasi Windows/);
  await assert.rejects(()=>bridge.getConfig(),/aplikasi Windows/);
  await assert.rejects(()=>bridge.saveConfig({}),/aplikasi Windows/);
  assert.equal(calls,0,'tidak ada permintaan jaringan sama sekali di Web/PWA');
});

test('Bridge Windows mengirim header token peluncuran',async()=>{
  const requests=[];
  const bridge=createBrowserDapodikBridge({readToken:()=>'launch-secret',fetchImpl:async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
  }});
  await bridge.test();
  assert.equal(requests[0].options.headers['X-ERapor-Bridge-Token'],'launch-secret');
  assert.equal(requests[0].options.credentials,'same-origin');
  assert.deepEqual(bridge.platform(),{available:true,platform:'windows',reason:''});
});

test('Seluruh permintaan memakai jalur same-origin tetap, bukan URL absolut',async()=>{
  const requests=[];
  const bridge=createBrowserDapodikBridge({readToken:()=>'t',fetchImpl:async(url,options)=>{
    requests.push({url:String(url),method:options.method});
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
  }});
  await bridge.getConfig();await bridge.saveConfig({baseUrl:'http://localhost:5774'});await bridge.clearConfig();
  await bridge.test();await bridge.pull();await bridge.push({scores:[]});
  assert.deepEqual(requests.map(item=>item.url),[
    '/__erapor/dapodik/config','/__erapor/dapodik/config','/__erapor/dapodik/config',
    '/__erapor/dapodik/test','/__erapor/dapodik/pull','/__erapor/dapodik/push'
  ]);
  assert.deepEqual(requests.map(item=>item.method),['GET','PUT','DELETE','POST','POST','POST']);
  assert.equal(requests.every(item=>item.url.startsWith('/')),true,'tidak pernah URL absolut');
});

test('Token peluncuran tidak pernah disimpan ke penyimpanan browser',async()=>{
  const disentuh=[];
  const asli=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>{disentuh.push('get');return null;},setItem:()=>disentuh.push('set'),removeItem:()=>disentuh.push('remove'),clear:()=>disentuh.push('clear')};
  try{
    const bridge=createBrowserDapodikBridge({readToken:()=>'launch-secret',fetchImpl:jsonFetch({ok:true})});
    await bridge.test();
    assert.deepEqual(disentuh,[]);
  }finally{if(asli===undefined)delete globalThis.localStorage;else globalThis.localStorage=asli;}
  const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../src/services/dapodik-bridge.js',import.meta.url),'utf8'));
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB/);
});

test('Token dibaca ulang setiap permintaan sehingga peluncuran baru langsung terpakai',async()=>{
  let token='pertama';
  const dikirim=[];
  const bridge=createBrowserDapodikBridge({readToken:()=>token,fetchImpl:async(url,options)=>{
    dikirim.push(options.headers['X-ERapor-Bridge-Token']);
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
  }});
  await bridge.test();
  token='kedua';
  await bridge.test();
  assert.deepEqual(dikirim,['pertama','kedua']);
});

test('Kesalahan bridge diteruskan sebagai pesan yang dapat ditindaklanjuti',async()=>{
  const bridge=createBrowserDapodikBridge({readToken:()=>'t',fetchImpl:jsonFetch({error:'Dapodik belum dikonfigurasi pada aplikasi Windows ini.'},400)});
  await assert.rejects(()=>bridge.test(),/belum dikonfigurasi/);
  const rusak=createBrowserDapodikBridge({readToken:()=>'t',fetchImpl:async()=>new Response('bukan json',{status:200,headers:{'content-type':'text/plain'}})});
  await assert.rejects(()=>rusak.test(),/tidak dapat dibaca/);
  const putus=createBrowserDapodikBridge({readToken:()=>'t',fetchImpl:async()=>{throw new Error('failed to fetch http://127.0.0.1:5321 rahasia');}});
  await assert.rejects(()=>putus.test(),error=>/aplikasi Windows|bridge/i.test(error.message)&&!/rahasia/.test(error.message));
});

test('Pembacaan token bawaan hanya dari meta tag, bukan sumber lain',async()=>{
  const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../src/services/dapodik-bridge.js',import.meta.url),'utf8'));
  assert.match(source,/erapor-desktop-bridge-token/);
  assert.match(source,/querySelector/);
  assert.doesNotMatch(source,/location\.search|URLSearchParams|document\.cookie/);
});
