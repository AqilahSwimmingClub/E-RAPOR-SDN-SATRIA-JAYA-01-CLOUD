'use strict';

/* Bridge Dapodik same-origin untuk proses utama Electron.
   Browser tidak pernah memegang token Dapodik: ia hanya memanggil endpoint di bawah ini, dan
   proses utama yang mengambil token dari store terenkripsi. Setiap permintaan wajib membawa
   token peluncuran acak dan berasal dari host loopback. Tidak ada header CORS yang dikirim,
   sehingga halaman lain di browser yang sama tidak dapat membaca jawabannya. */

const LOOPBACK_HOSTS=['127.0.0.1','localhost','[::1]','::1'];
const BODY_LIMITS={config:256*1024,test:256*1024,pull:256*1024,push:5*1024*1024};
const PREFIX='/__erapor/dapodik/';

function json(status,body){
  return {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(body)};
}

/* Perbandingan token dibuat bersifat waktu-tetap sederhana agar panjang jawaban tidak
   membocorkan seberapa banyak karakter yang sudah benar. */
function tokenMatches(given,expected){
  const a=String(given==null?'':given),b=String(expected==null?'':expected);
  if(!b||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i+=1)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function isLoopbackHost(headers){
  const host=String((headers&&headers.host)||'').replace(/:\d+$/,'');
  return !host||LOOPBACK_HOSTS.includes(host);
}

function readJsonBody(request,limit){
  const raw=request&&request.body;
  if(raw===null||raw===undefined||raw==='')return {ok:true,value:{}};
  const text=String(raw);
  if(Buffer.byteLength(text,'utf8')>limit)return {ok:false,response:json(413,{error:'Data yang dikirim ke bridge terlalu besar.'})};
  const type=String((request.headers&&(request.headers['content-type']||request.headers['Content-Type']))||'');
  if(!/application\/json/i.test(type))return {ok:false,response:json(415,{error:'Bridge hanya menerima application/json.'})};
  try{
    const value=JSON.parse(text);
    if(value===null||typeof value!=='object'||Array.isArray(value))return {ok:false,response:json(400,{error:'Isi permintaan bridge tidak valid.'})};
    return {ok:true,value};
  }catch{return {ok:false,response:json(400,{error:'Isi permintaan bridge bukan JSON yang valid.'})};}
}

function createDapodikBridge({configStore,client,bridgeToken}){
  if(!configStore||!client||!bridgeToken)throw new Error('Bridge Dapodik memerlukan configStore, client, dan bridgeToken.');

  async function handleBridgeRequest(request){
    const headers=(request&&request.headers)||{};
    if(!tokenMatches(headers['x-erapor-bridge-token'],bridgeToken))return json(403,{error:'Bridge Windows tidak diizinkan.'});
    if(!isLoopbackHost(headers))return json(403,{error:'Bridge Windows hanya melayani komputer ini.'});

    let pathname;
    try{pathname=new URL(String((request&&request.url)||'/'),'http://127.0.0.1').pathname;}
    catch{return json(404,{error:'Endpoint bridge tidak ditemukan.'});}
    if(!pathname.startsWith(PREFIX))return json(404,{error:'Endpoint bridge tidak ditemukan.'});
    const action=pathname.slice(PREFIX.length);
    const method=String((request&&request.method)||'GET').toUpperCase();

    try{
      if(action==='config'){
        if(method==='GET')return json(200,configStore.loadPublic());
        if(method==='DELETE'){configStore.clear();return json(200,configStore.loadPublic());}
        if(method==='PUT'){
          const body=readJsonBody(request,BODY_LIMITS.config);
          if(!body.ok)return body.response;
          return json(200,configStore.save(body.value));
        }
        return json(405,{error:'Metode tidak didukung untuk konfigurasi Dapodik.'});
      }
      if(action==='test'||action==='pull'||action==='push'){
        if(method!=='POST')return json(405,{error:'Endpoint Dapodik ini hanya menerima POST.'});
        const body=readJsonBody(request,BODY_LIMITS[action]);
        if(!body.ok)return body.response;
        /* Token diambil di sini, di proses utama. Browser tidak pernah mengirim atau melihatnya. */
        const config=configStore.loadWithToken();
        if(action==='test')return json(200,await client.test(config));
        if(action==='pull')return json(200,await client.pull(config));
        return json(200,await client.push(config,body.value));
      }
      return json(404,{error:'Endpoint bridge tidak ditemukan.'});
    }catch(error){
      /* Pesan store sudah aman dan berguna bagi operator; pesan klien/jaringan diganti pesan
         umum supaya URL maupun kredensial tidak pernah ikut keluar. */
      const message=String((error&&error.message)||'');
      const aman=/belum dikonfigurasi|Penyimpanan aman|wajib diisi|Konfigurasi Dapodik/.test(message);
      return json(aman?400:502,{error:aman?message:'Permintaan ke Dapodik gagal. Periksa Pengaturan Web Service Dapodik lalu coba lagi.'});
    }
  }

  return handleBridgeRequest;
}

module.exports={createDapodikBridge,DAPODIK_BRIDGE_PREFIX:PREFIX};
