import { readFileSync } from 'node:fs';

/* Seluruh rahasia berasal dari environment. Tidak ada satu pun nilai rahasia yang ditanam di
   kode maupun disimpan di repo. Server menolak start bila rahasianya belum diisi. */

function wajib(nama,nilai){
  if(!nilai||!String(nilai).trim())
    throw new Error(`Environment ${nama} belum diisi. Salin server/.env.example lalu isi nilainya.`);
  return String(nilai).trim();
}

export function loadSecrets(env=process.env){
  const pem=env.LICENSE_SIGNING_PRIVATE_KEY_FILE
    ? readFileSync(env.LICENSE_SIGNING_PRIVATE_KEY_FILE,'utf8')
    : String(env.LICENSE_SIGNING_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  wajib('LICENSE_SIGNING_PRIVATE_KEY atau LICENSE_SIGNING_PRIVATE_KEY_FILE',pem);
  return {
    signingPrivateKeyPem:pem,
    pepper:wajib('LICENSE_HASH_PEPPER',env.LICENSE_HASH_PEPPER),
    recoveryKey:wajib('LICENSE_RECOVERY_KEY',env.LICENSE_RECOVERY_KEY),
  };
}

export function loadServerConfig(env=process.env){
  return {
    /* Dipakai adapter PostgreSQL/Neon. Pada Vercel diisi lewat Environment Variables. */
    databaseUrl:env.DATABASE_URL||'',
    port:Number.parseInt(env.PORT||'8787',10),
    host:env.HOST||'127.0.0.1',
    databaseFile:env.LICENSE_DB_FILE||'./server/data/licenses.db',
    ownerUsername:env.OWNER_USERNAME||'',
    ownerPassword:env.OWNER_PASSWORD||'',
  };
}
