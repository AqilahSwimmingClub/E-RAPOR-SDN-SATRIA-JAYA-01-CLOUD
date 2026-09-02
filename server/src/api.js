import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { nowIso } from './db.js';
import { hashPassword, maskLicense, newId, publicJwkFromPrivatePem, sessionToken, sha256Hex, verifyPassword } from './crypto.js';
import * as lisensi from './licenses.js';
import { LicenseError } from './licenses.js';

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

function kirim(res,status,payload){
  const body=JSON.stringify(payload);
  res.writeHead(status,{...JSON_HEADERS,'content-length':Buffer.byteLength(body)});
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

export function createApi({db,secrets,logger=()=>{},publicDir=null}){
  const batasAktivasi=createRateLimiter({windowMs:60_000,max:8});
  const batasLogin=createRateLimiter({windowMs:60_000,max:6});

  function ownerDariRequest(req){
    const header=String(req.headers.authorization||'');
    if(!header.startsWith('Bearer '))return null;
    const hash=sha256Hex(header.slice(7));
    const sesi=db.prepare('SELECT * FROM owner_sessions WHERE token_hash=?').get(hash);
    if(!sesi)return null;
    if(new Date(sesi.expires_at).getTime()<=Date.now()){
      db.prepare('DELETE FROM owner_sessions WHERE token_hash=?').run(hash);
      return null;
    }
    const akun=db.prepare('SELECT * FROM owner_accounts WHERE id=? AND active=1').get(sesi.owner_id);
    return akun?{id:akun.id,username:akun.username}:null;
  }

  function wajibOwner(req){
    const owner=ownerDariRequest(req);
    if(!owner)throw new LicenseError('UNAUTHORIZED','Akses ini hanya untuk Pemilik aplikasi.',401);
    return owner;
  }

  function ip(req){return String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'lokal';}

  const rute={
    /* ---------------------------------------------------------- publik / client sekolah */
    'GET /api/v1/health':async()=>({ok:true,time:nowIso()}),
    'GET /api/v1/public-key':async()=>({algorithm:'ECDSA-P256-SHA256',public_jwk:publicJwkFromPrivatePem(secrets.signingPrivateKeyPem)}),

    'POST /api/v1/activate':async(req,res,body)=>{
      if(!batasAktivasi(`ip:${ip(req)}`)||!batasAktivasi(`inst:${String(body?.installation_id||'').slice(0,80)}`))
        throw new LicenseError('RATE_LIMITED','Terlalu banyak percobaan aktivasi. Coba lagi beberapa menit lagi.',429);
      const hasil=lisensi.activateLicense(db,body,secrets);
      return {
        status:hasil.license.status,
        license_id:hasil.license.id,
        license_hint:hasil.license.license_hint,
        activation_token:hasil.token,
        next_check_at:JSON.parse(Buffer.from(hasil.token.split('.')[0],'base64url').toString()).next_check_at,
      };
    },

    'POST /api/v1/check':async(req,res,body)=>{
      const hasil=lisensi.checkLicense(db,body,secrets);
      return {status:hasil.license.status,license_id:hasil.license.id,license_hint:hasil.license.license_hint,activation_token:hasil.token};
    },

    /* Disiapkan untuk Tahap 9. Belum ada updater apa pun yang memakainya. */
    'GET /api/v1/updates/latest':async()=>({implemented:false,message:'Sistem update belum diaktifkan.'}),

    /* ------------------------------------------------------------------- owner: sesi */
    'POST /api/v1/owner/login':async(req,res,body)=>{
      if(!batasLogin(`ip:${ip(req)}`))throw new LicenseError('RATE_LIMITED','Terlalu banyak percobaan masuk.',429);
      const akun=db.prepare('SELECT * FROM owner_accounts WHERE username=? AND active=1').get(String(body?.username||'').trim());
      if(!akun||!verifyPassword(String(body?.password||''),akun.password_salt,akun.password_hash))
        throw new LicenseError('UNAUTHORIZED','Username atau password Pemilik salah.',401);
      const token=sessionToken();
      db.prepare('INSERT INTO owner_sessions(token_hash,owner_id,created_at,expires_at) VALUES(?,?,?,?)')
        .run(sha256Hex(token),akun.id,nowIso(),new Date(Date.now()+SESSION_HOURS*3600_000).toISOString());
      lisensi.logEvent(db,{type:'OWNER_LOGIN',actor:akun.username});
      return {token,username:akun.username,expires_in_hours:SESSION_HOURS};
    },
    'POST /api/v1/owner/logout':async req=>{
      const header=String(req.headers.authorization||'');
      if(header.startsWith('Bearer '))db.prepare('DELETE FROM owner_sessions WHERE token_hash=?').run(sha256Hex(header.slice(7)));
      return {ok:true};
    },
    'GET /api/v1/owner/me':async req=>({owner:wajibOwner(req)}),

    /* ------------------------------------------------------------- owner: data lisensi */
    'GET /api/v1/owner/summary':async req=>{wajibOwner(req);return lisensi.summary(db);},
    'GET /api/v1/owner/licenses':async(req,res,body,url)=>{
      wajibOwner(req);
      return {licenses:lisensi.listLicenses(db,{q:url.searchParams.get('q')||'',status:url.searchParams.get('status')||''})};
    },
    'GET /api/v1/owner/events':async req=>{wajibOwner(req);return {events:lisensi.listEvents(db,{})};},
    'GET /api/v1/owner/customers':async req=>{wajibOwner(req);return {customers:lisensi.listCustomers(db)};},
    'POST /api/v1/owner/customers':async(req,res,body)=>{
      const owner=wajibOwner(req);
      return {customer:lisensi.upsertCustomer(db,{...body,actor:owner.username})};
    },
    'POST /api/v1/owner/licenses':async(req,res,body)=>{
      const owner=wajibOwner(req);
      const dibuat=lisensi.createLicenses(db,{...body,actor:owner.username,recoverySecret:secrets});
      /* Kunci utuh hanya dikembalikan sekali, saat pembuatan, kepada Pemilik. */
      return {created:dibuat.length,licenses:dibuat};
    },
  };

  /* Aksi per lisensi memakai pola /owner/licenses/:id/<aksi>. */
  const aksiLisensi={
    'reset-device':(owner,id,body)=>({result:lisensi.resetDevice(db,id,{actor:owner.username,reason:body?.reason})}),
    'suspend':(owner,id,body)=>({license:lisensi.setStatus(db,id,'SUSPENDED',{actor:owner.username,reason:body?.reason})}),
    'reactivate':(owner,id,body)=>{
      const detail=lisensi.licenseDetail(db,id);
      if(detail.license.status!=='SUSPENDED')throw new LicenseError('NOT_SUSPENDED','Hanya lisensi yang ditangguhkan yang dapat diaktifkan kembali.',409);
      const adaPerangkat=detail.devices.some(item=>item.is_active===1);
      return {license:lisensi.setStatus(db,id,adaPerangkat?'ACTIVE':'UNUSED',{actor:owner.username,reason:body?.reason})};
    },
    'revoke':(owner,id,body)=>({license:lisensi.setStatus(db,id,'REVOKED',{actor:owner.username,reason:body?.reason})}),
    'recover':(owner,id,body)=>({recovery:lisensi.recoverLicenseKey(db,id,{actor:owner.username,reason:body?.reason},secrets)}),
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
      if(req.method==='GET'&&!pathname.startsWith('/api/')&&sajikanStatis(req,res,url.pathname))return;

      const kunci=`${req.method} ${pathname}`;
      const body=req.method==='POST'?await bacaJson(req):{};
      logger({method:req.method,path:pathname,body:ringkasUntukLog(body)});

      if(rute[kunci])return kirim(res,200,await rute[kunci](req,res,body,url));

      const cocok=pathname.match(/^\/api\/v1\/owner\/licenses\/([A-Za-z0-9_]+)\/([a-z-]+)$/);
      if(cocok&&req.method==='POST'){
        const aksi=aksiLisensi[cocok[2]];
        if(!aksi)throw new LicenseError('NOT_FOUND','Aksi tidak dikenal.',404);
        const owner=wajibOwner(req);
        return kirim(res,200,aksi(owner,cocok[1],body));
      }
      const detail=pathname.match(/^\/api\/v1\/owner\/licenses\/([A-Za-z0-9_]+)$/);
      if(detail&&req.method==='GET'){wajibOwner(req);return kirim(res,200,lisensi.licenseDetail(db,detail[1]));}

      kirim(res,404,{error:{code:'NOT_FOUND',message:'Endpoint tidak dikenal.'}});
    }catch(error){
      if(error instanceof LicenseError)return kirim(res,error.httpStatus,{error:{code:error.code,message:error.message}});
      logger({level:'error',message:error.message});
      kirim(res,500,{error:{code:'SERVER_ERROR',message:'Terjadi kesalahan pada server lisensi.'}});
    }
  };
}

/* Akun pemilik pertama dibuat dari environment, bukan dari nilai yang ditanam di kode. */
export function ensureOwnerAccount(db,{username,password}){
  if(!username||!password)return null;
  const ada=db.prepare('SELECT * FROM owner_accounts WHERE username=?').get(username);
  if(ada)return ada;
  const {salt,hash}=hashPassword(password);
  const id=newId('own');
  db.prepare('INSERT INTO owner_accounts(id,username,password_salt,password_hash,active,created_at) VALUES(?,?,?,?,1,?)')
    .run(id,username,salt,hash,nowIso());
  return db.prepare('SELECT * FROM owner_accounts WHERE id=?').get(id);
}
