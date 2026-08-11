import { webcrypto } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);const option=name=>args[args.indexOf(name)+1];const output=option('--output');const verifierPath=option('--verifier');
if(!output||!verifierPath)throw new Error('Gunakan --output <folder-rahasia> --verifier <file-verifier>.');
const keyPath=path.join(output,'owner-key.json');const pinPath=path.join(output,'OWNER-PIN.txt');
for(const target of [keyPath,pinPath]){try{await access(target,constants.F_OK);throw new Error(`Credential Owner sudah ada: ${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
const bytes=length=>{const value=new Uint8Array(length);webcrypto.getRandomValues(value);return value;};const b64=value=>Buffer.from(value).toString('base64');
const key={version:1,keyId:`owner-${b64(bytes(9)).replace(/[^a-zA-Z0-9]/g,'').slice(0,12)}`,secret:b64(bytes(32))};const pin=String(Number(BigInt(`0x${Buffer.from(bytes(8)).toString('hex')}`)%90000000n)+10000000);
const salt=bytes(20),iterations=180000,material=`${key.keyId}\n${key.secret}\n${pin}`;const cryptoKey=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(material),'PBKDF2',false,['deriveBits']);const hash=new Uint8Array(await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},cryptoKey,256));const verifier={version:1,keyId:key.keyId,algorithm:'PBKDF2-SHA-256',iterations,salt:b64(salt),hash:b64(hash)};
await mkdir(output,{recursive:true});await mkdir(path.dirname(verifierPath),{recursive:true});await writeFile(keyPath,`${JSON.stringify(key,null,2)}\n`,{encoding:'utf8',flag:'wx'});await writeFile(pinPath,`OWNER PIN - SIMPAN TERPISAH DARI FILE KUNCI\n${pin}\n`,{encoding:'utf8',flag:'wx'});await writeFile(verifierPath,`// Generated verifier only. Owner key and PIN are intentionally external.\nexport const OWNER_VERIFIER=${JSON.stringify(verifier)};\n`,'utf8');
