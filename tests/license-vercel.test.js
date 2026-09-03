import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresStore } from '../server/src/store.js';
import { applySchema } from '../server/src/pg.js';
import { createApi, ensureOwnerAccount } from '../server/src/api.js';
import { createVercelHandler } from '../api/handler.js';
import { generateSigningKeyPair } from '../server/src/crypto.js';

/* Bentuk deployment Vercel. Handler harus stateless: tidak menyimpan koneksi global yang
   mengasumsikan proses menetap, tidak membaca berkas dari disk, dan seluruh rahasianya
   berasal dari environment. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const OWNER={username:'pemilik.uji',password:'kata-sandi-uji-yang-panjang'};

/* Request/response tiruan sesuai kontrak Vercel Functions Node. */
function buatRes(){
  const res={statusCode:200,headers:{},body:'',ended:false,
    writeHead(status,headers={}){res.statusCode=status;Object.assign(res.headers,headers);return res;},
    setHeader(nama,nilai){res.headers[nama.toLowerCase()]=nilai;},
    end(isi=''){res.body+=isi;res.ended=true;}};
  return res;
}
function buatReq({method='GET',url='/',body=null,headers={}}={}){
  const isi=body?Buffer.from(JSON.stringify(body)):null;
  return {method,url,headers:{...headers,...(isi?{'content-type':'application/json'}:{})},
    async *[Symbol.asyncIterator](){if(isi)yield isi;}};
}

async function siapkan(){
  const pg=new PGlite();
  const store=createPostgresStore({client:pg});
  await applySchema(store);
  await ensureOwnerAccount(store,OWNER);
  const {privateKeyPem}=generateSigningKeyPair();
  const secrets={signingPrivateKeyPem:privateKeyPem,pepper:`p-${Math.random()}`,recoveryKey:`r-${Math.random()}`};
  const api=createApi({store,secrets,logger:()=>{}});
  const handler=createVercelHandler({createStore:()=>store,loadSecrets:()=>secrets,api});
  const panggil=async options=>{
    const res=buatRes();
    await handler(buatReq(options),res);
    let data={};try{data=JSON.parse(res.body||'{}');}catch{}
    return {status:res.statusCode,headers:res.headers,data};
  };
  return {pg,store,secrets,panggil,async close(){await pg.close();}};
}

test('Handler Vercel meneruskan seluruh endpoint publik dan pemilik',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  assert.equal((await s.panggil({url:'/api/v1/health'})).data.ok,true);
  assert.ok((await s.panggil({url:'/api/v1/public-key'})).data.public_jwk,'kunci publik tersedia untuk client');

  const masuk=await s.panggil({method:'POST',url:'/api/v1/owner/login',body:OWNER});
  assert.equal(masuk.status,200);
  const token=masuk.data.token;
  const dibuat=await s.panggil({method:'POST',url:'/api/v1/owner/licenses',
    body:{count:1,buyerName:'Siti Rahayu',schoolName:'SDN Contoh Nusantara 02',npsn:'87654321'},
    headers:{authorization:`Bearer ${token}`}});
  assert.equal(dibuat.status,200);
  const key=dibuat.data.licenses[0].key;

  const A=`inst_${'a'.repeat(32)}`,B=`inst_${'b'.repeat(32)}`;
  const aktivasi=await s.panggil({method:'POST',url:'/api/v1/activate',body:{license_key:key,installation_id:A,platform:'android'}});
  assert.equal(aktivasi.status,200);
  assert.equal(aktivasi.data.status,'ACTIVE');
  assert.ok(aktivasi.data.activation_token);
  const kedua=await s.panggil({method:'POST',url:'/api/v1/activate',body:{license_key:key,installation_id:B}});
  assert.equal(kedua.status,409,'aturan satu perangkat tetap berlaku lewat Vercel');
  assert.equal(kedua.data.error.code,'ALREADY_ACTIVATED');
});

test('CORS hanya untuk endpoint publik, tidak pernah untuk endpoint pemilik',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  for(const path of ['/api/v1/activate','/api/v1/check','/api/v1/public-key','/api/v1/health']){
    const pra=await s.panggil({method:'OPTIONS',url:path});
    assert.equal(pra.status,204,`${path} menjawab preflight`);
    assert.equal(pra.headers['access-control-allow-origin'],'*',`${path} mengizinkan lintas origin`);
  }
  for(const path of ['/api/v1/owner/login','/api/v1/owner/licenses','/api/v1/owner/summary']){
    const pra=await s.panggil({method:'OPTIONS',url:path});
    assert.equal(pra.status,405,`${path} tidak menjawab preflight`);
    assert.equal(pra.headers['access-control-allow-origin'],undefined,`${path} tidak pernah membuka CORS`);
  }
});

test('Endpoint pemilik tetap menolak tanpa sesi walau lewat Vercel',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  for(const [method,url,body] of [['POST','/api/v1/owner/licenses',{count:99}],['GET','/api/v1/owner/summary',null],
    ['GET','/api/v1/owner/events',null],['POST','/api/v1/owner/licenses/lic_x/revoke',{}]]){
    const tanpa=await s.panggil({method,url,body});
    assert.equal(tanpa.status,401,`${method} ${url} ditolak tanpa sesi`);
    const palsu=await s.panggil({method,url,body,headers:{authorization:'Bearer karangan'}});
    assert.equal(palsu.status,401,`${method} ${url} ditolak dengan token palsu`);
  }
  assert.equal((await s.store.query('SELECT COUNT(*)::int AS n FROM licenses')).rows[0].n,0);
});

test('Handler stateless: tanpa berkas, tanpa SQLite, tanpa rahasia tertanam',()=>{
  const handler=read('api/handler.js'),rute=read('api/[...route].js');
  for(const berkas of [handler,rute]){
    for(const larangan of ['readFileSync','writeFileSync','mkdirSync','node:sqlite','openDatabase',
      'BEGIN PRIVATE KEY','LICENSE_HASH_PEPPER=','OWNER_PASSWORD='])
      assert.equal(berkas.includes(larangan),false,`handler tidak memakai ${larangan}`);
  }
  /* Seluruh rahasia dibaca dari environment, bukan ditanam. */
  const config=read('server/src/config.js');
  for(const nama of ['DATABASE_URL','LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY'])
    assert.match(config,new RegExp(`env\\.${nama}`),`${nama} dibaca dari environment`);
});

test('vercel.json mengarahkan API dan Owner Panel dengan benar',()=>{
  const config=JSON.parse(read('vercel.json'));
  const tujuan=JSON.stringify(config.rewrites||[]);
  assert.match(tujuan,/api\/v1/,'seluruh /api/v1 diteruskan ke handler');
  assert.match(tujuan,/owner/,'Owner Panel dapat diakses');
  /* Panel pemilik tidak boleh diindeks mesin pencari. */
  assert.match(read('server/public/owner/index.html'),/noindex/);
});

test('Konfigurasi client hanya membawa alamat API dan kunci publik',()=>{
  const config=read('src/data/license-config.js');
  assert.match(config,/LICENSE_API_BASE/);
  assert.match(config,/LICENSE_PUBLIC_JWK/);
  for(const larangan of ['DATABASE_URL','PRIVATE','pepper','PEPPER','recovery','RECOVERY'])
    assert.equal(config.includes(larangan),false,`konfigurasi client tidak memuat ${larangan}`);
});

test('Dokumentasi memuat langkah deploy Vercel dan Neon',()=>{
  const docs=read('docs/LICENSE-SYSTEM.md');
  for(const bagian of ['Vercel','Neon','DATABASE_URL','LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY','OWNER_USERNAME'])
    assert.ok(docs.includes(bagian),`dokumentasi menjelaskan ${bagian}`);
  const contoh=read('server/.env.example');
  assert.match(contoh,/DATABASE_URL=/,'DATABASE_URL ada di berkas contoh');
  for(const baris of contoh.split('\n').filter(baris=>/^(DATABASE_URL|LICENSE_HASH_PEPPER|LICENSE_RECOVERY_KEY|OWNER_PASSWORD)=/.test(baris)))
    assert.match(baris,/=$/,`${baris.split('=')[0]} pada contoh memang kosong`);
});
