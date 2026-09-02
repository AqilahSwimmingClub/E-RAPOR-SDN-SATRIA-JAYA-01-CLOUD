import { createApi } from '../server/src/api.js';
import { createPostgresStore } from '../server/src/store.js';
import { applySchema } from '../server/src/pg.js';
import { ensureOwnerAccount } from '../server/src/api.js';
import { loadSecrets, loadServerConfig } from '../server/src/config.js';

/* Handler lisensi untuk Vercel Functions.

   Stateless: tidak ada berkas yang dibaca dari disk, tidak ada SQLite, dan tidak ada koneksi
   global yang mengasumsikan proses menetap. Setiap invocation membuat store PostgreSQL sendiri
   dan menutupnya kembali, sehingga aman dijalankan pada runtime serverless yang dapat mati
   kapan saja.

   Seluruh rahasia berasal dari environment Vercel. Yang sampai ke aplikasi sekolah hanyalah
   alamat API dan kunci publik verifikasi. */

let siapkanSekali=null;

/* Skema dan akun pemilik disiapkan sekali per instance yang hidup. Keduanya idempotent, jadi
   invocation dingin yang menjalankannya lagi tidak merusak apa pun. */
async function siapkanDatabase(store,config){
  if(!siapkanSekali){
    siapkanSekali=(async()=>{
      await applySchema(store);
      if(config.ownerUsername&&config.ownerPassword)
        await ensureOwnerAccount(store,{username:config.ownerUsername,password:config.ownerPassword});
    })().catch(error=>{siapkanSekali=null;throw error;});
  }
  return siapkanSekali;
}

export function createVercelHandler({createStore=null,loadSecrets:muatRahasia=loadSecrets,api=null}={}){
  return async function handler(req,res){
    let store=null;
    let milikSendiri=false;
    try{
      const teruskan=api;
      if(teruskan)return teruskan(req,res);
      const config=loadServerConfig(process.env);
      const secrets=muatRahasia(process.env);
      store=createStore?createStore():createPostgresStore({connectionString:process.env.DATABASE_URL});
      milikSendiri=!createStore;
      await siapkanDatabase(store,config);
      const handle=createApi({store,secrets,logger:()=>{}});
      await handle(req,res);
    }catch(error){
      if(!res.headersSent){
        const body=JSON.stringify({error:{code:'SERVER_ERROR',message:error?.message||'Terjadi kesalahan pada server lisensi.'}});
        res.writeHead(500,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
        res.end(body);
      }
    }finally{
      if(store&&milikSendiri&&store.close)await store.close().catch(()=>{});
    }
  };
}

export default createVercelHandler();
