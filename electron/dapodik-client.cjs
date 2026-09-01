'use strict';

const net=require('node:net');
const dns=require('node:dns').promises;

/* Klien HTTP Dapodik untuk proses utama Electron.
   Dua penjagaan utama: (1) target dibatasi loopback atau alamat privat hasil resolusi DNS,
   sehingga URL yang salah ketik atau berniat jahat tidak dapat mengirim token ke internet;
   (2) seluruh kesalahan jaringan diubah menjadi pesan Indonesia yang aman, karena pesan asli
   dapat memuat URL beserta kredensial. */

const MAX_BODY_BYTES=10*1024*1024;
const ENDPOINTS={
  school:'/WebService/getSekolah',
  teachers:'/WebService/getGtk',
  students:'/WebService/getPesertaDidik',
  classes:'/WebService/getRombonganBelajar',
  subjects:'/WebService/getMataPelajaran',
  lessons:'/WebService/getPembelajaran',
  registrations:'/WebService/postMatevRapor',
  scores:'/WebService/postNilai'
};

function isPrivateAddress(address){
  const host=String(address==null?'':address).trim().replace(/^\[|\]$/g,'').replace(/%.*$/,'');
  if(!host)return false;
  if(net.isIPv6(host)){
    const lower=host.toLowerCase();
    if(lower==='::1')return true;
    if(lower.startsWith('fc')||lower.startsWith('fd'))return true;
    if(lower.startsWith('fe80'))return true;
    const mapped=lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped?isPrivateAddress(mapped[1]):false;
  }
  if(!net.isIPv4(host))return false;
  const parts=host.split('.').map(Number);
  if(parts.some(part=>!Number.isInteger(part)||part<0||part>255))return false;
  const [a,b]=parts;
  if(a===127)return true;
  if(a===10)return true;
  if(a===172&&b>=16&&b<=31)return true;
  if(a===192&&b===168)return true;
  if(a===169&&b===254)return true;
  return false;
}

async function validateDapodikUrl(value,lookup=(host)=>dns.lookup(host,{all:true})){
  let url;
  try{url=new URL(String(value==null?'':value));}
  catch{throw new Error('URL Dapodik tidak valid. Contoh: http://localhost:5774');}
  if(!['http:','https:'].includes(url.protocol))throw new Error('URL Dapodik harus HTTP atau HTTPS.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  let addresses;
  if(net.isIP(host))addresses=[{address:host}];
  else{
    try{addresses=await lookup(host,{all:true});}
    catch{throw new Error('Nama host Dapodik tidak dapat ditemukan pada jaringan ini.');}
  }
  const daftar=Array.isArray(addresses)?addresses:[addresses];
  /* Satu jawaban publik saja sudah cukup untuk menolak: nama host yang sama bisa
     me-resolve ke alamat berbeda pada permintaan berikutnya. */
  if(!daftar.length||daftar.some(item=>!isPrivateAddress(item&&item.address))){
    throw new Error('URL Dapodik harus mengarah ke komputer lokal atau jaringan privat.');
  }
  url.search='';url.hash='';
  return url;
}

function safeHttpError(status){
  if(status===401||status===403)return new Error('Token Dapodik ditolak. Perbarui token pada Pengaturan Web Service Dapodik.');
  if(status===404)return new Error('Endpoint Dapodik tidak ditemukan. Periksa alamat Web Service Dapodik.');
  if(status===408||status===504)return new Error('Dapodik tidak menjawab tepat waktu. Pastikan aplikasi Dapodik sedang berjalan.');
  return new Error(`Dapodik menolak permintaan (kode ${status}).`);
}

function createDapodikClient({fetchImpl=globalThis.fetch,lookup,timeoutMs=15000}={}){
  if(typeof fetchImpl!=='function')throw new Error('Klien Dapodik memerlukan implementasi fetch.');

  async function request(config,endpoint,{method='GET',body=null}={}){
    const base=await validateDapodikUrl(config&&config.baseUrl,lookup);
    const basePath=base.pathname.replace(/\/+$/,'');
    const url=new URL(`${basePath}${endpoint}`,base.origin);
    const headers={Accept:'application/json'};
    const token=String((config&&config.token)||'').trim();
    if(token)headers.Authorization=`Bearer ${token}`;
    if(body)headers['Content-Type']='application/json';
    let response;
    try{
      response=await fetchImpl(url,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
    }catch(error){
      /* Pesan asli bisa memuat URL lengkap beserta header; tidak pernah diteruskan. */
      if(error&&(error.name==='TimeoutError'||error.name==='AbortError'))throw new Error('Dapodik tidak menjawab tepat waktu. Pastikan aplikasi Dapodik sedang berjalan.');
      throw new Error('Tidak dapat terhubung ke Dapodik. Pastikan aplikasi Dapodik berjalan dan alamatnya benar.');
    }
    if(!response.ok)throw safeHttpError(response.status);
    const declared=Number(response.headers&&response.headers.get&&response.headers.get('Content-Length'));
    if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new Error('Respons Dapodik terlalu besar untuk diproses.');
    let text;
    try{text=await response.text();}
    catch{throw new Error('Respons Dapodik tidak dapat dibaca.');}
    if(text.length>MAX_BODY_BYTES)throw new Error('Respons Dapodik terlalu besar untuk diproses.');
    try{return JSON.parse(text);}
    catch{throw new Error('Respons Dapodik tidak dapat dibaca sebagai JSON.');}
  }

  async function test(config){
    const school=await request(config,ENDPOINTS.school);
    const rows=Array.isArray(school)?school:(school&&(school.rows||school.data||school.results))||[];
    const first=rows[0]||{};
    const npsn=String(first.npsn==null?'':first.npsn).replace(/\D/g,'');
    const semesterId=String(first.semester_id==null?'':first.semester_id).trim();
    return {
      school:{npsn,name:String(first.nama==null?'':first.nama).trim(),semesterId},
      matches:npsn===String((config&&config.npsn)||'').replace(/\D/g,'')&&semesterId===String((config&&config.semesterId)||'').trim()
    };
  }

  async function pull(config){
    const dataset={};
    for(const key of ['school','teachers','students','classes','subjects','lessons']){
      dataset[key]=await request(config,ENDPOINTS[key]);
    }
    return dataset;
  }

  async function push(config,payload){
    const hasil={registrations:null,scores:null};
    const registrations=(payload&&payload.registrations)||[];
    const scores=(payload&&payload.scores)||[];
    if(registrations.length)hasil.registrations=await request(config,ENDPOINTS.registrations,{method:'POST',body:{npsn:config.npsn,semester_id:config.semesterId,rows:registrations}});
    if(scores.length)hasil.scores=await request(config,ENDPOINTS.scores,{method:'POST',body:{npsn:config.npsn,semester_id:config.semesterId,table:'rapor',rows:scores}});
    return hasil;
  }

  return {test,pull,push,endpoints:{...ENDPOINTS}};
}

module.exports={createDapodikClient,isPrivateAddress,validateDapodikUrl,DAPODIK_ENDPOINTS:ENDPOINTS};
