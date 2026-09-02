import { createServer } from 'node:http';
import { openDatabase } from './db.js';
import { createApi, ensureOwnerAccount } from './api.js';
import { loadSecrets, loadServerConfig } from './config.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));

export function startLicenseServer({env=process.env,silent=false}={}){
  const config=loadServerConfig(env);
  const secrets=loadSecrets(env);
  const db=openDatabase(config.databaseFile);
  const owner=ensureOwnerAccount(db,{username:config.ownerUsername,password:config.ownerPassword});
  const logger=silent?()=>{}:entry=>{console.log(JSON.stringify({at:new Date().toISOString(),...entry}));};
  const handle=createApi({db,secrets,publicDir:join(here,'..','public'),logger});
  const server=createServer((req,res)=>{handle(req,res);});
  return new Promise(resolve=>{
    server.listen(config.port,config.host,()=>{
      if(!silent){
        console.log(`Server lisensi e-Rapor berjalan di http://${config.host}:${config.port}`);
        console.log(`Owner Panel: http://${config.host}:${config.port}/owner/`);
        if(!owner)console.log('Peringatan: OWNER_USERNAME/OWNER_PASSWORD belum diisi, Owner Panel belum bisa dipakai.');
      }
      resolve({server,db,config,secrets});
    });
  });
}

if(process.argv[1]&&process.argv[1].endsWith('server.js'))startLicenseServer().catch(error=>{
  console.error(error.message);process.exit(1);
});
