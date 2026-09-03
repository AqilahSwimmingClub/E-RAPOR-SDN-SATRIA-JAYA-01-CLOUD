import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { hashPassword, maskLicense, newId, publicJwkFromPrivatePem, sessionToken, sha256Hex, verifyPassword } from './crypto.js';
import * as lisensi from './licenses.js';
import { LicenseError } from './licenses.js';
import * as pembaruan from './updates.js';

/* Lapisan HTTP. Tidak ada keputusan lisensi di sini: seluruhnya didelegasikan ke licenses.js.
   Endpoint pemilik selalu menuntut sesi pemilik yang sah; endpoint sekolah tidak pernah bisa
   membuat, mereset, atau mengubah status lisensi. */

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const SESSION_HOURS=12;

/* Pembatas laju sederhana per IP dan per Installation ID. Tujuannya menahan penebakan kunci
   secara massal; angkanya sengaja longgar untuk sekolah yang salah ketik beberapa kali. */
export function createRateLimiter({windowMs=60_000,max=10}={}){
  const ember=new Map();
  return function ambil(kunci,sekarang=Date.now()){
    const daftar=(ember.get(kunci)||[]).filter(waktu=>sekarang-waktu<windowMs);
    if(daftar.length>=max){ember.set(kunci,daftar);return false;}
    daftar.push(sekarang);ember.set(kunci,daftar);
    return true;
  };
}

/* Aplikasi sekolah berjalan dari origin lain (WebView Android, Electron, atau domain sekolah),
   sehingga dua endpoint publik perlu izin lintas origin. Izin ini TIDAK diberikan pada endpoint
   pemilik: panel disajikan dari origin yang sama dan memakai sesi Bearer, jadi membukanya
   lintas origin hanya memperluas permukaan serangan tanpa manfaat. */
const PUBLIC_CORS_PATHS=new Set(['/api/v1/activate','/api/v1/check','/api/v1/public-key','/api/v1/health','/api/v1/updates/latest']);
function corsHeaders(pathname){
  if(!PUBLIC_CORS_PATHS.has(pathname))return {};
  return {'access-control-allow-origin':'*','access-control-allow-headers':'content-type',
    'access-control-allow-methods':'GET,POST,OPTIONS','access-control-max-age':'600','vary':'origin'};
}

function kirim(res,status,payload,pathname=''){
  const body=JSON.stringify(payload);
  res.writeHead(status,{...JSON_HEADERS,...corsHeaders(pathname),'content-length':Buffer.byteLength(body)});
  res.end(body);
}

async function bacaJson(req,batas=16*1024){
  const potongan=[];let panjang=0;
  for await(const bagian of req){
    panjang+=bagian.length;
    if(panjang>batas)throw new LicenseError('PAYLOAD_TOO_LARGE','Permintaan terlalu besar.',413);
    potongan.push(bagian);
  }
  if(!panjang)return {};
  try{return JSON.parse(Buffer.concat(potongan).toString('utf8'));}
  catch{throw new LicenseError('INVALID_JSON','Body permintaan bukan JSON yang sah.',400);}
}

/* Lisensi tidak pernah ditulis utuh ke log. Yang tercatat hanya bentuk tersamarnya. */
function ringkasUntukLog(body){
  if(!body||typeof body!=='object')return {};
  const salin={...body};
  if(salin.license_key)salin.license_key=maskLicense(salin.license_key);
  delete salin.password;
  return salin;
}

export function createApi({store,secrets,logger=()=>{},publicDir=null}){
  const batasAktivasi=createRateLimiter({windowMs:60_000,max:8});
  const batasLogin=createRateLimiter({windowMs:60_000,max:6});

  async function ownerDariRequest(req){
    const header=String(req.headers.authorization||'');
    if(!header.startsWith('Bearer '))return null;
    const hash=sha256Hex(header.slice(7));
    const sesi=await store.one('SELECT * FROM owner_sessions WHERE token_hash=$1',[hash]);
    if(!sesi)return null;
    if(new Date(sesi.expires_at).getTime()<=Date.now()){
      await store.run('DELETE FROM owner_sessions WHERE token_hash=$1',[hash]);
      return null;
    }
    const akun=await store.one('SELECT * FROM owner_accounts WHERE id=$1 AND active=TRUE',[sesi.owner_id]);
    return akun?{id:akun.id,username:akun.username}:null;
  }

  async function wajibOwner(req){
    const owner=await ownerDariRequest(req);
    if(!owner)throw new LicenseError('UNAUTHORIZED','Akses ini hanya untuk Pemilik aplikasi.',401);
    return owner;
  }

  function ip(req){return String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'lokal';}

  const rute={
    /* ---------------------------------------------------------- publik / client sekolah */
    'GET /api/v1/health':async()=>({ok:true,time:new Date().toISOString()}),
    'GET /api/v1/public-key':async()=>({algorithm:'ECDSA-P256-SHA256',public_jwk:publicJwkFromPrivatePem(secrets.signingPrivateKeyPem)}),

    'POST /api/v1/activate':async(req,res,body)=>{
      if(!batasAktivasi(`ip:${ip(req)}`)||!batasAktivasi(`inst:${String(body?.installation_id||'').slice(0,80)}`))
        throw new LicenseError('RATE_LIMITED','Terlalu banyak percobaan aktivasi. Coba lagi beberapa menit lagi.',429);
      const hasil=await lisensi.activateLicense(store,body,secrets);
      return {
        status:hasil.license.status,
        license_id:hasil.license.id,
        license_hint:hasil.license.license_hint,
        activation_token:hasil.token,
        next_check_at:JSON.parse(Buffer.from(hasil.token.split('.')[0],'base64url').toString()).next_check_at,
      };
    },

    'POST /api/v1/check':async(req,res,body)=>{
      const hasil=await lisensi.checkLicense(store,body,secrets);
      return {status:hasil.license.status,license_id:hasil.license.id,license_hint:hasil.license.license_hint,activation_token:hasil.token};
    },

    /* Metadata pembaruan resmi. Endpoint ini hanya membaca katalog rilis: ia tidak menyentuh
       lisensi, tidak mengikat perangkat, dan tidak menerima satu pun data akademik sekolah.
       Platform dan versi terpasang yang dikirim aplikasi divalidasi lebih dulu. */
    'GET /api/v1/updates/latest':async(req,res,body,url)=>
      pembaruan.latestUpdate(store,{platform:url?.searchParams.get('platform'),version:url?.searchParams.get('version')||''}),

    /* Katalog versi hanya boleh dibaca dan diubah Pemilik. Admin sekolah dan Guru tidak punya
       sesi pemilik, sehingga permintaan mereka berhenti di wajibOwner dengan 401. */
    'GET /api/v1/owner/app-versions':async(req,res,body,url)=>{
      await wajibOwner(req);
      return {versions:await pembaruan.listAppVersions(store,{platform:url?.searchParams.get('platform')||null})};
    },
    'POST /api/v1/owner/app-versions':async(req,res,body)=>{
      const owner=await wajibOwner(req);
      const versi=await pembaruan.createAppVersion(store,body,{actor:owner.username});
      await lisensi.logEvent(store,{type:'APP_VERSION_CREATED',actor:owner.username,
        detail:`${versi.platform} ${versi.version}`});
      return {version:versi};
    },

    /* ------------------------------------------------------------------- owner: sesi */
    'POST /api/v1/owner/login':async(req,res,body)=>{
      if(!batasLogin(`ip:${ip(req)}`))throw new LicenseError('RATE_LIMITED','Terlalu banyak percobaan masuk.',429);
      const akun=await store.one('SELECT * FROM owner_accounts WHERE username=$1 AND active=TRUE',[String(body?.username||'').trim()]);
      if(!akun||!verifyPassword(String(body?.password||''),akun.password_salt,akun.password_hash))
        throw new LicenseError('UNAUTHORIZED','Username atau password Pemilik salah.',401);
      const token=sessionToken();
      await store.run('INSERT INTO owner_sessions(token_hash,owner_id,created_at,expires_at) VALUES($1,$2,$3,$4)',
        [sha256Hex(token),akun.id,new Date().toISOString(),new Date(Date.now()+SESSION_HOURS*3600_000).toISOString()]);
      await lisensi.logEvent(store,{type:'OWNER_LOGIN',actor:akun.username});
      return {token,username:akun.username,expires_in_hours:SESSION_HOURS};
    },
    'POST /api/v1/owner/logout':async req=>{
      const header=String(req.headers.authorization||'');
      if(header.startsWith('Bearer '))await store.run('DELETE FROM owner_sessions WHERE token_hash=$1',[sha256Hex(header.slice(7))]);
      return {ok:true};
    },
    'GET /api/v1/owner/me':async req=>({owner:await wajibOwner(req)}),

    /* ------------------------------------------------------------- owner: data lisensi */
    'GET /api/v1/owner/summary':async req=>{await wajibOwner(req);return lisensi.summary(store);},
    'GET /api/v1/owner/licenses':async(req,res,body,url)=>{
      await wajibOwner(req);
      return {licenses:await lisensi.listLicenses(store,{q:url.searchParams.get('q')||'',
        status:url.searchParams.get('status')||'',type:url.searchParams.get('type')||''})};
    },
    'GET /api/v1/owner/events':async req=>{await wajibOwner(req);return {events:await lisensi.listEvents(store,{})};},
    'GET /api/v1/owner/customers':async req=>{await wajibOwner(req);return {customers:await lisensi.listCustomers(store)};},
    'POST /api/v1/owner/customers':async(req,res,body)=>{
      const owner=await wajibOwner(req);
      return {customer:await lisensi.upsertCustomer(store,{...body,actor:owner.username})};
    },
    'POST /api/v1/owner/licenses':async(req,res,body)=>{
      const owner=await wajibOwner(req);
      const dibuat=await lisensi.createLicenses(store,{...body,actor:owner.username,recoverySecret:secrets});
      /* Kunci utuh hanya dikembalikan sekali, saat pembuatan, kepada Pemilik. */
      return {created:dibuat.length,licenses:dibuat};
    },
  };

  /* Aksi per lisensi memakai pola /owner/licenses/:id/<aksi>. */
  const PULIH_DARI=new Set(['SUSPENDED','REVOKED']);

  const aksiLisensi={
    'reset-device':async(owner,id,body)=>({result:await lisensi.resetDevice(store,id,{actor:owner.username,reason:body?.reason})}),
    'suspend':async(owner,id,body)=>({license:await lisensi.setStatus(store,id,'SUSPENDED',{actor:owner.username,reason:body?.reason})}),
    /* Pemulihan berlaku untuk lisensi yang ditangguhkan maupun yang sudah dicabut. Record-nya
       tidak pernah dihapus, jadi pemulihan hanya mengembalikan status: bila perangkat lamanya
       masih terikat lisensi langsung ACTIVE, bila tidak lisensi kembali menunggu aktivasi. */
    'reactivate':async(owner,id,body)=>{
      const detail=await lisensi.licenseDetail(store,id);
      if(!PULIH_DARI.has(detail.license.status))
        throw new LicenseError('TIDAK_PERLU_PULIH','Hanya lisensi yang ditangguhkan atau dicabut yang dapat dipulihkan.',409);
      const adaPerangkat=detail.devices.some(item=>item.is_active===true);
      return {license:await lisensi.setStatus(store,id,adaPerangkat?'ACTIVE':'UNUSED',{actor:owner.username,reason:body?.reason})};
    },
    'revoke':async(owner,id,body)=>({license:await lisensi.setStatus(store,id,'REVOKED',{actor:owner.username,reason:body?.reason})}),
    'recover':async(owner,id,body)=>({recovery:await lisensi.recoverLicenseKey(store,id,{actor:owner.username,reason:body?.reason},secrets)}),
  };

  /* ------------------------------------------------------------- owner: versi aplikasi */

  const aksiVersi={
    publish:async(owner,id)=>({version:await pembaruan.setAppVersionPublished(store,id,true,{actor:owner.username})}),
    unpublish:async(owner,id)=>({version:await pembaruan.setAppVersionPublished(store,id,false,{actor:owner.username})}),
    delete:async(owner,id)=>({version:await pembaruan.deleteAppVersion(store,id)}),
  };

  function sajikanStatis(req,res,pathname){
    if(!publicDir)return false;
    const relatif=pathname==='/'||pathname==='/owner'||pathname==='/owner/'?'/owner/index.html':pathname;
    const berkas=join(publicDir,normalize(relatif).replace(/^(\.\.[/\\])+/,''));
    if(!berkas.startsWith(publicDir)||!existsSync(berkas))return false;
    const isi=readFileSync(berkas);
    res.writeHead(200,{'content-type':MIME[extname(berkas)]||'application/octet-stream','cache-control':'no-store',
      'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
    res.end(isi);
    return true;
  }

  return async function handle(req,res){
    const url=new URL(req.url,'http://localhost');
    const pathname=url.pathname.replace(/\/+$/,'')||'/';
    try{
      /* Preflight hanya dijawab untuk endpoint publik. */
      if(req.method==='OPTIONS'){
        const headers=corsHeaders(pathname);
        res.writeHead(Object.keys(headers).length?204:405,headers);
        return res.end();
      }
      if(req.method==='GET'&&!pathname.startsWith('/api/')&&sajikanStatis(req,res,url.pathname))return;

      const kunci=`${req.method} ${pathname}`;
      const body=req.method==='POST'?await bacaJson(req):{};
      logger({method:req.method,path:pathname,body:ringkasUntukLog(body)});

      if(rute[kunci])return kirim(res,200,await rute[kunci](req,res,body,url),pathname);

      const cocok=pathname.match(/^\/api\/v1\/owner\/licenses\/([A-Za-z0-9_]+)\/([a-z-]+)$/);
      if(cocok&&req.method==='POST'){
        const aksi=aksiLisensi[cocok[2]];
        if(!aksi)throw new LicenseError('NOT_FOUND','Aksi tidak dikenal.',404);
        const owner=await wajibOwner(req);
        return kirim(res,200,await aksi(owner,cocok[1],body),pathname);
      }
      const versi=pathname.match(/^\/api\/v1\/owner\/app-versions\/([A-Za-z0-9_]+)\/([a-z]+)$/);
      if(versi&&req.method==='POST'){
        const aksi=aksiVersi[versi[2]];
        if(!aksi)throw new LicenseError('NOT_FOUND','Aksi versi tidak dikenal.',404);
        const owner=await wajibOwner(req);
        const hasil=await aksi(owner,versi[1]);
        await lisensi.logEvent(store,{type:`APP_VERSION_${versi[2].toUpperCase()}`,actor:owner.username,
          detail:`${hasil.version.platform} ${hasil.version.version}`});
        return kirim(res,200,hasil,pathname);
      }
      const detail=pathname.match(/^\/api\/v1\/owner\/licenses\/([A-Za-z0-9_]+)$/);
      if(detail&&req.method==='GET'){
        await wajibOwner(req);
        const isi=await lisensi.licenseDetail(store,detail[1]);
        return kirim(res,200,{...isi,license:lisensi.tanpaRahasiaLisensi(isi.license)},pathname);
      }

      kirim(res,404,{error:{code:'NOT_FOUND',message:'Endpoint tidak dikenal.'}},pathname);
    }catch(error){
      if(error instanceof LicenseError)return kirim(res,error.httpStatus,{error:{code:error.code,message:error.message}},pathname);
      logger({level:'error',message:error.message});
      kirim(res,500,{error:{code:'SERVER_ERROR',message:'Terjadi kesalahan pada server lisensi.'}},pathname);
    }
  };
}

/* Akun pemilik pertama dibuat dari environment, bukan dari nilai yang ditanam di kode. */
export async function ensureOwnerAccount(store,{username,password}){
  if(!username||!password)return null;
  const ada=await store.one('SELECT * FROM owner_accounts WHERE username=$1',[username]);
  if(ada)return ada;
  const {salt,hash}=hashPassword(password);
  const id=newId('own');
  await store.run('INSERT INTO owner_accounts(id,username,password_salt,password_hash,active,created_at) VALUES($1,$2,$3,$4,TRUE,$5)',
    [id,username,salt,hash,new Date().toISOString()]);
  return store.one('SELECT * FROM owner_accounts WHERE id=$1',[id]);
}
