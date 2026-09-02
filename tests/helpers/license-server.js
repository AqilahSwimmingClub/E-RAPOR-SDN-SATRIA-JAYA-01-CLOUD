import { createServer } from 'node:http';
import { openDatabase } from '../../server/src/db.js';
import { createApi, ensureOwnerAccount } from '../../server/src/api.js';
import { createSqliteStore } from '../../server/src/store.js';
import { generateSigningKeyPair, publicJwkFromPrivatePem } from '../../server/src/crypto.js';

/* Server lisensi sungguhan di atas HTTP dan SQLite, dipakai test integrasi. Rahasianya dibuat
   segar setiap kali sehingga tidak ada satu pun nilai rahasia yang tersimpan di repo. */

export const OWNER={username:'pemilik.uji',password:'kata-sandi-uji-yang-panjang'};

export async function startTestServer(){
  const {privateKeyPem}=generateSigningKeyPair();
  const secrets={signingPrivateKeyPem:privateKeyPem,pepper:`pepper-uji-${Math.random()}`,recoveryKey:`recovery-uji-${Math.random()}`};
  const db=openDatabase(':memory:');
  const store=createSqliteStore(db);
  await ensureOwnerAccount(store,OWNER);
  const handle=createApi({store,secrets,logger:()=>{}});
  const server=createServer((req,res)=>{handle(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const konteks={
    db,store,secrets,base,server,
    publicJwk:publicJwkFromPrivatePem(privateKeyPem),
    async close(){await new Promise(resolve=>server.close(resolve));db.close();},
    async call(path,{method='GET',body=null,token=''}={}){
      const res=await fetch(`${base}/api/v1${path}`,{method,
        headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},
        body:body?JSON.stringify(body):undefined});
      return {status:res.status,data:await res.json().catch(()=>({}))};
    },
    async ownerToken(){
      const {data}=await konteks.call('/owner/login',{method:'POST',body:OWNER});
      return data.token;
    },
    async buatLisensi(jumlah=1,extra={}){
      const token=await konteks.ownerToken();
      const {data}=await konteks.call('/owner/licenses',{method:'POST',token,body:{count:jumlah,...extra}});
      return data.licenses;
    },
  };
  return konteks;
}

/* Lingkungan browser tiruan untuk menguji layanan lisensi sisi client apa adanya. */
export function installBrowserEnv(){
  const store=new Map();
  globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k),clear:()=>store.clear()};
  globalThis.atob=value=>Buffer.from(value,'base64').toString('binary');
  globalThis.btoa=value=>Buffer.from(value,'binary').toString('base64');
  return store;
}
