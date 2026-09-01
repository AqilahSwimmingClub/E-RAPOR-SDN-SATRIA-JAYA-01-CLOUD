import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createDapodikClient, isPrivateAddress, validateDapodikUrl }=require('../electron/dapodik-client.cjs');

const config={baseUrl:'http://localhost:5774',npsn:'20218098',semesterId:'20262',token:'SECRET'};
const loopback=async()=>[{address:'127.0.0.1'}];
function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}

test('Kebijakan alamat privat hanya menerima loopback dan RFC1918',()=>{
  for(const alamat of ['127.0.0.1','10.2.3.4','172.16.1.2','172.31.255.254','192.168.1.10','169.254.1.1','::1'])
    assert.equal(isPrivateAddress(alamat),true,`${alamat} privat`);
  for(const alamat of ['8.8.8.8','1.1.1.1','172.32.0.1','172.15.255.254','203.0.113.5','11.0.0.1',''])
    assert.equal(isPrivateAddress(alamat),false,`${alamat} publik`);
});

test('URL wajib HTTP/HTTPS dan mengarah ke jaringan privat',async()=>{
  const url=await validateDapodikUrl('http://localhost:5774/',loopback);
  assert.equal(url.protocol,'http:');
  assert.equal(url.pathname,'/');
  /* Sub-jalur dipertahankan agar instalasi Dapodik di belakang prefiks tetap terjangkau. */
  assert.equal((await validateDapodikUrl('http://localhost:5774/dapodik/',loopback)).pathname,'/dapodik/');
  await assert.rejects(()=>validateDapodikUrl('ftp://localhost:5774',loopback),/HTTP atau HTTPS/);
  await assert.rejects(()=>validateDapodikUrl('file:///etc/passwd',loopback),/HTTP atau HTTPS/);
  await assert.rejects(()=>validateDapodikUrl('http://dapodik.kemdikbud.go.id',async()=>[{address:'203.0.113.5'}]),/lokal atau jaringan privat/);
  /* Nama host yang sebagian jawabannya publik tetap ditolak, bukan diambil yang privat saja. */
  await assert.rejects(()=>validateDapodikUrl('http://campuran.test',async()=>[{address:'127.0.0.1'},{address:'8.8.8.8'}]),/lokal atau jaringan privat/);
  await assert.rejects(()=>validateDapodikUrl('http://kosong.test',async()=>[]),/lokal atau jaringan privat/);
  await assert.rejects(()=>validateDapodikUrl('bukan-url',loopback),/URL Dapodik/);
  assert.equal((await validateDapodikUrl('http://192.168.1.10:5774',async()=>[{address:'192.168.1.10'}])).hostname,'192.168.1.10');
});

test('Klien mengirim bearer token tetapi menyuntingnya dari pesan kesalahan',async()=>{
  const requests=[];
  const client=createDapodikClient({
    lookup:loopback,
    fetchImpl:async(url,options)=>{requests.push({url:String(url),options});return new Response('server failed',{status:500});},
    timeoutMs:1000
  });
  await assert.rejects(()=>client.test(config),error=>!error.message.includes('SECRET'));
  assert.equal(requests[0].options.headers.Authorization,'Bearer SECRET');
  assert.equal(requests[0].options.headers.Accept,'application/json');
});

test('Kesalahan jaringan dan HTTP menjadi pesan Indonesia yang aman',async()=>{
  const buat=fetchImpl=>createDapodikClient({lookup:loopback,fetchImpl,timeoutMs:1000});
  await assert.rejects(()=>buat(async()=>{throw new Error('connect ECONNREFUSED 127.0.0.1:5774 token=SECRET');}).test(config),
    error=>/Dapodik/.test(error.message)&&!/SECRET|ECONNREFUSED/.test(error.message));
  await assert.rejects(()=>buat(async()=>new Response('nope',{status:401})).test(config),/[Tt]oken/);
  await assert.rejects(()=>buat(async()=>new Response('nope',{status:404})).test(config),/tidak ditemukan/);
  await assert.rejects(()=>buat(async()=>new Response('bukan json',{status:200})).test(config),/tidak dapat dibaca|tidak didukung/);
});

test('Permintaan memakai batas waktu dan menolak badan respons yang terlalu besar',async()=>{
  const client=createDapodikClient({lookup:loopback,fetchImpl:async(url,options)=>{
    assert.ok(options.signal,'permintaan membawa sinyal batas waktu');
    return new Response(JSON.stringify({rows:[]}),{status:200,headers:{'Content-Type':'application/json','Content-Length':String(11*1024*1024)}});
  },timeoutMs:1000});
  await assert.rejects(()=>client.test(config),/terlalu besar/);
});

test('Profil endpoint memakai jalur WebService yang disepakati',async()=>{
  const dipanggil=[];
  const client=createDapodikClient({lookup:loopback,timeoutMs:1000,fetchImpl:async(url)=>{
    dipanggil.push(new URL(String(url)).pathname);
    return jsonResponse({rows:[{npsn:'20218098',nama:'SDN SATRIA JAYA 01',semester_id:'20262'}]});
  }});
  await client.pull(config);
  assert.deepEqual(dipanggil,['/WebService/getSekolah','/WebService/getGtk','/WebService/getPesertaDidik','/WebService/getRombonganBelajar','/WebService/getMataPelajaran','/WebService/getPembelajaran']);
});

test('Uji koneksi membaca identitas sekolah lebih dulu',async()=>{
  const dipanggil=[];
  const client=createDapodikClient({lookup:loopback,timeoutMs:1000,fetchImpl:async(url)=>{
    dipanggil.push(new URL(String(url)).pathname);
    return jsonResponse({rows:[{npsn:'20218098',nama:'SDN SATRIA JAYA 01',semester_id:'20262'}]});
  }});
  const hasil=await client.test(config);
  assert.deepEqual(dipanggil,['/WebService/getSekolah']);
  assert.equal(hasil.school.npsn,'20218098');
  assert.equal(hasil.matches,true);
  assert.equal('token' in hasil,false);
});

test('Push mengirim registrasi matev dan nilai rapor dengan table=rapor',async()=>{
  const dikirim=[];
  const client=createDapodikClient({lookup:loopback,timeoutMs:1000,fetchImpl:async(url,options)=>{
    dikirim.push({path:new URL(String(url)).pathname,method:options.method,body:options.body});
    return jsonResponse({rows:[{status:'ok'}]});
  }});
  await client.push(config,{registrations:[{id:'matev-1'}],scores:[{id:'nilai-1'}]});
  assert.deepEqual(dikirim.map(item=>item.path),['/WebService/postMatevRapor','/WebService/postNilai']);
  assert.ok(dikirim.every(item=>item.method==='POST'));
  assert.match(String(dikirim[1].body),/"table":"rapor"/);
});

test('Klien tidak pernah menulis token ke berkas atau localStorage',async()=>{
  const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../electron/dapodik-client.cjs',import.meta.url),'utf8'));
  assert.doesNotMatch(source,/localStorage|writeFileSync|appendFileSync/);
  assert.doesNotMatch(source,/console\.(log|error|warn)/,'token tidak boleh sampai ke log aplikasi');
});
