import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createDapodikBridge }=require('../electron/dapodik-bridge.cjs');

const TOKEN='launch-secret';
function fakeRequest({method='GET',url='/',headers={},body=null}={}){
  return {method,url,headers:{host:'127.0.0.1:5321',...headers},body:body===null?null:JSON.stringify(body)};
}
function auth(extra={}){return {'x-erapor-bridge-token':TOKEN,...extra};}
function neverCalledStore(){
  return new Proxy({},{get(_,prop){return()=>{throw new Error(`configStore.${String(prop)} tidak boleh dipanggil.`);};}});
}
function neverCalledClient(){
  return new Proxy({},{get(_,prop){return()=>{throw new Error(`client.${String(prop)} tidak boleh dipanggil.`);};}});
}
function storeStub(){
  const state={saved:null,cleared:false};
  return {state,
    loadPublic:()=>({baseUrl:'http://localhost:5774',npsn:'20218098',semesterId:'20262',tokenConfigured:true,updatedAt:''}),
    loadWithToken:()=>({baseUrl:'http://localhost:5774',npsn:'20218098',semesterId:'20262',token:'SECRET'}),
    save:input=>{state.saved=input;return {baseUrl:input.baseUrl,npsn:input.npsn,semesterId:input.semesterId,tokenConfigured:true};},
    clear:()=>{state.cleared=true;}};
}
function clientStub(){
  const calls=[];
  return {calls,
    test:config=>{calls.push(['test',config]);return Promise.resolve({school:{npsn:'20218098'},matches:true});},
    pull:config=>{calls.push(['pull',config]);return Promise.resolve({school:{rows:[]}});},
    push:(config,payload)=>{calls.push(['push',config,payload]);return Promise.resolve({registrations:null,scores:null});}};
}

test('Bridge menolak token peluncuran yang hilang atau salah sebelum membaca konfigurasi',async()=>{
  const bridge=createDapodikBridge({bridgeToken:TOKEN,configStore:neverCalledStore(),client:neverCalledClient()});
  assert.equal((await bridge(fakeRequest({method:'POST',url:'/__erapor/dapodik/test'}))).status,403);
  assert.equal((await bridge(fakeRequest({method:'POST',url:'/__erapor/dapodik/test',headers:{'x-erapor-bridge-token':'wrong'}}))).status,403);
  assert.equal((await bridge(fakeRequest({method:'GET',url:'/__erapor/dapodik/config'}))).status,403);
});

test('Bridge menolak host bukan loopback dan tidak mengirim header CORS',async()=>{
  const bridge=createDapodikBridge({bridgeToken:TOKEN,configStore:storeStub(),client:clientStub()});
  const asing=await bridge(fakeRequest({method:'GET',url:'/__erapor/dapodik/config',headers:{...auth(),host:'contoh.test'}}));
  assert.equal(asing.status,403);
  const ok=await bridge(fakeRequest({method:'GET',url:'/__erapor/dapodik/config',headers:auth()}));
  assert.equal(ok.status,200);
  const headerKeys=Object.keys(ok.headers||{}).map(key=>key.toLowerCase());
  assert.equal(headerKeys.some(key=>key.startsWith('access-control-')),false,'tidak ada header CORS');
});

test('Konfigurasi publik tidak pernah memuat token',async()=>{
  const bridge=createDapodikBridge({bridgeToken:TOKEN,configStore:storeStub(),client:clientStub()});
  const response=await bridge(fakeRequest({method:'GET',url:'/__erapor/dapodik/config',headers:auth()}));
  assert.equal(response.status,200);
  const body=JSON.parse(response.body);
  assert.equal('token' in body,false);
  assert.equal(body.tokenConfigured,true);
  assert.doesNotMatch(response.body,/SECRET/);
});

test('Simpan dan hapus konfigurasi memakai metode yang tepat',async()=>{
  const store=storeStub();
  const bridge=createDapodikBridge({bridgeToken:TOKEN,configStore:store,client:clientStub()});
  const simpan=await bridge(fakeRequest({method:'PUT',url:'/__erapor/dapodik/config',headers:auth({'content-type':'application/json'}),body:{baseUrl:'http://localhost:5774',npsn:'20218098',semesterId:'20262',token:'SECRET'}}));
  assert.equal(simpan.status,200);
  assert.equal(store.state.saved.token,'SECRET');
  assert.doesNotMatch(simpan.body,/SECRET/,'respons simpan tidak mengembalikan token');
  const hapus=await bridge(fakeRequest({method:'DELETE',url:'/__erapor/dapodik/config',headers:auth()}));
  assert.equal(hapus.status,200);
  assert.equal(store.state.cleared,true);
  /* Metode yang tidak cocok ditolak, bukan diperlakukan sebagai GET. */
  assert.equal((await bridge(fakeRequest({method:'PATCH',url:'/__erapor/dapodik/config',headers:auth()}))).status,405);
});

test('Test, pull, dan push memakai konfigurasi bertoken dari proses utama',async()=>{
  const client=clientStub();
  const bridge=createDapodikBridge({bridgeToken:TOKEN,configStore:storeStub(),client});
  assert.equal((await bridge(fakeRequest({method:'POST',url:'/__erapor/dapodik/test',headers:auth()}))).status,200);
  assert.equal((await bridge(fakeRequest({method:'POST',url:'/__erapor/dapodik/pull',headers:auth()}))).status,200);
  const push=await bridge(fakeRequest({method:'POST',url:'/__erapor/dapodik/push',headers:auth({'content-type':'application/json'}),body:{registrations:[],scores:[{id:'n-1'}]}}));
  assert.equal(push.status,200);
  assert.deepEqual(client.calls.map(item=>item[0]),['test','pull','push']);
  assert.equal(client.calls[0][1].token,'SECRET','token diambil di proses utama, bukan dikirim browser');
  assert.deepEqual(client.calls[2][2].scores,[{id:'n-1'}]);
});

test('Badan permintaan dibatasi dan JSON rusak ditolak dengan aman',async()=>{
  const bridge=createDapodikBridge({bridgeToken:TOKEN,configStore:storeStub(),client:clientStub()});
  const besar=await bridge({method:'PUT',url:'/__erapor/dapodik/config',headers:{host:'127.0.0.1',...auth({'content-type':'application/json'})},body:'x'.repeat(300*1024)});
  assert.equal(besar.status,413);
  const rusak=await bridge({method:'PUT',url:'/__erapor/dapodik/config',headers:{host:'127.0.0.1',...auth({'content-type':'application/json'})},body:'{bukan json'});
  assert.equal(rusak.status,400);
  const salahTipe=await bridge({method:'PUT',url:'/__erapor/dapodik/config',headers:{host:'127.0.0.1',...auth({'content-type':'text/plain'})},body:'{}'});
  assert.equal(salahTipe.status,415);
});

test('Endpoint tak dikenal menjawab 404 dan kesalahan klien tidak membocorkan rahasia',async()=>{
  const client=clientStub();
  client.test=()=>Promise.reject(new Error('gagal memakai Bearer SECRET pada http://localhost:5774'));
  const bridge=createDapodikBridge({bridgeToken:TOKEN,configStore:storeStub(),client});
  assert.equal((await bridge(fakeRequest({method:'GET',url:'/__erapor/dapodik/entah',headers:auth()}))).status,404);
  const gagal=await bridge(fakeRequest({method:'POST',url:'/__erapor/dapodik/test',headers:auth()}));
  assert.equal(gagal.status,502);
  assert.doesNotMatch(gagal.body,/SECRET|Bearer/);
});

test('Peluncur menyuntikkan metadata token peluncuran saja, bukan token Dapodik',async()=>{
  const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8'));
  assert.match(source,/erapor-desktop-bridge-token/);
  assert.match(source,/randomBytes\(32\)/);
  assert.doesNotMatch(source,/Access-Control-Allow-Origin/);
  /* Token Dapodik tidak pernah disebut di berkas peluncur; hanya store terenkripsi yang tahu. */
  assert.doesNotMatch(source,/Bearer/);
});
