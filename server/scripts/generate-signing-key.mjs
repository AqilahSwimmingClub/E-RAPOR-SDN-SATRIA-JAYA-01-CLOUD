import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { generateSigningKeyPair } from '../src/crypto.js';

/* Membuat sepasang kunci penandatangan. Private key HANYA disimpan di server; public key
   ditempel ke aplikasi sekolah dan memang tidak rahasia. */
const target=process.argv[2]||'./server/secrets/license-signing-key.pem';
if(existsSync(target)){
  console.error(`Berkas ${target} sudah ada. Hapus dulu bila memang ingin membuat kunci baru.`);
  console.error('Perhatian: mengganti kunci membuat seluruh Activation Token lama tidak lagi terverifikasi.');
  process.exit(1);
}
mkdirSync(target.slice(0,target.lastIndexOf('/'))||'.',{recursive:true});
const {privateKeyPem,publicKeyJwk}=generateSigningKeyPair();
writeFileSync(target,privateKeyPem,{mode:0o600});
console.log(`Private key disimpan di ${target} (jangan pernah di-commit).`);
console.log('\nTempel PUBLIC KEY berikut ke src/data/license-config.js pada LICENSE_PUBLIC_JWK:\n');
console.log(JSON.stringify(publicKeyJwk,null,2));
