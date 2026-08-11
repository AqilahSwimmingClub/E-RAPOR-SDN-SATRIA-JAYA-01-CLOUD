import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args=process.argv.slice(2);const option=name=>args[args.indexOf(name)+1];const keyPath=option('--key');const verifierPath=option('--verifier');const pinPath=option('--pin-file');const pin=String(process.env.ERAPOR_OWNER_PIN||'').trim();
if(!keyPath||!verifierPath)throw new Error('Gunakan --key <owner-key.json> --verifier <file-verifier> [--pin-file <file-eksternal>].');
if(!/^\d{8}$/.test(pin))throw new Error('ERAPOR_OWNER_PIN harus tepat 8 digit.');
const key=JSON.parse(await readFile(keyPath,'utf8'));if(key?.version!==1||typeof key.keyId!=='string'||typeof key.secret!=='string')throw new Error('Owner key eksternal tidak valid.');
const salt=new Uint8Array(20);webcrypto.getRandomValues(salt);const iterations=180000;const material=`${key.keyId}\n${key.secret}\n${pin}`;const cryptoKey=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(material),'PBKDF2',false,['deriveBits']);const hash=new Uint8Array(await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},cryptoKey,256));const b64=value=>Buffer.from(value).toString('base64');const verifier={version:1,keyId:key.keyId,algorithm:'PBKDF2-SHA-256',iterations,salt:b64(salt),hash:b64(hash)};
await writeFile(verifierPath,`// Generated verifier only. Owner key and PIN are intentionally external.\nexport const OWNER_VERIFIER=${JSON.stringify(verifier)};\n`,'utf8');
if(pinPath)await writeFile(pinPath,`OWNER PIN - SIMPAN TERPISAH DARI FILE KUNCI\n${pin}\n`,'utf8');
console.log(`Verifier Owner diperbarui untuk keyId ${key.keyId}. PIN tidak ditulis ke source atau log.`);
