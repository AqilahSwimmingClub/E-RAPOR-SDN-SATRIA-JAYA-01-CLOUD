import { createHmac, createPrivateKey, createPublicKey, createCipheriv, createDecipheriv,
  generateKeyPairSync, randomBytes, randomUUID, sign as signBuf, timingSafeEqual, verify as verifyBuf, scryptSync } from 'node:crypto';

/* Seluruh operasi kriptografi lisensi. Private key HANYA hidup di proses server ini dan
   dibaca dari environment; tidak pernah dikirim ke client, tidak pernah masuk repo. */

/* Alfabet tanpa huruf/angka yang mudah tertukar (tanpa I, L, O, U, 0, 1). */
const ALPHABET='23456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUPS=3,GROUP_LEN=4;

/* Kunci dibuat dari acak kriptografis, bukan urutan atau waktu. Rejection sampling dipakai
   agar setiap huruf punya peluang sama persis. */
export function generateLicenseKey(){
  const total=GROUPS*GROUP_LEN;
  const out=[];
  const batas=Math.floor(256/ALPHABET.length)*ALPHABET.length;
  while(out.length<total){
    for(const byte of randomBytes(total*2)){
      if(byte>=batas)continue;
      out.push(ALPHABET[byte%ALPHABET.length]);
      if(out.length===total)break;
    }
  }
  const grup=[];
  for(let i=0;i<GROUPS;i++)grup.push(out.slice(i*GROUP_LEN,(i+1)*GROUP_LEN).join(''));
  return `ERAPOR-${grup.join('-')}`;
}

export function normalizeLicenseKey(value){
  const bersih=String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!bersih.startsWith('ERAPOR'))return '';
  const inti=bersih.slice('ERAPOR'.length);
  if(inti.length!==GROUPS*GROUP_LEN)return '';
  if([...inti].some(ch=>!ALPHABET.includes(ch)))return '';
  const grup=[];
  for(let i=0;i<GROUPS;i++)grup.push(inti.slice(i*GROUP_LEN,(i+1)*GROUP_LEN));
  return `ERAPOR-${grup.join('-')}`;
}

/* Lookup memakai HMAC dengan pepper server, sehingga bocornya isi database saja tidak cukup
   untuk mencari kunci secara offline tanpa pepper. */
export function licenseHash(key,pepper){
  const normal=normalizeLicenseKey(key);
  if(!normal)throw new Error('Format License Key tidak valid.');
  return createHmac('sha256',String(pepper)).update(normal).digest('hex');
}

/* Yang ditampilkan ke sekolah maupun log hanyalah bentuk tersamar. */
export function licenseHint(key){
  const normal=normalizeLicenseKey(key);
  if(!normal)return 'ERAPOR-••••-••••-••••';
  const grup=normal.split('-');
  return `ERAPOR-••••-••••-${grup[grup.length-1]}`;
}

export function maskLicense(value){return licenseHint(value);}

/* Nilai pemulihan disimpan terenkripsi AES-256-GCM. Kuncinya berasal dari environment,
   sehingga isi database saja tidak dapat dibuka. */
function recoveryKey(secret){return scryptSync(String(secret),'erapor-license-recovery',32);}

export function encryptRecovery(key,secret){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',recoveryKey(secret),iv);
  const data=Buffer.concat([cipher.update(normalizeLicenseKey(key),'utf8'),cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export function decryptRecovery(payload,secret){
  const [versi,iv,tag,data]=String(payload||'').split('.');
  if(versi!=='v1'||!iv||!tag||!data)throw new Error('Nilai pemulihan lisensi tidak dapat dibaca.');
  const decipher=createDecipheriv('aes-256-gcm',recoveryKey(secret),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}

/* ---------------------------------------------------------------- Activation token */

/* ECDSA P-256 dengan SHA-256, format tanda tangan IEEE-P1363 supaya dapat diverifikasi
   langsung oleh WebCrypto di browser maupun WebView Android tanpa pustaka tambahan. */
export function generateSigningKeyPair(){
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  return {
    privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'}),
    publicKeyJwk:publicKey.export({format:'jwk'}),
  };
}

export function publicJwkFromPrivatePem(pem){
  return createPublicKey(createPrivateKey(pem)).export({format:'jwk'});
}

const b64u=buf=>Buffer.from(buf).toString('base64url');

export function signActivationToken(payload,privateKeyPem){
  const body=b64u(JSON.stringify(payload));
  const signature=signBuf('sha256',Buffer.from(body),{key:createPrivateKey(privateKeyPem),dsaEncoding:'ieee-p1363'});
  return `${body}.${b64u(signature)}`;
}

export function verifyActivationToken(token,publicJwk){
  const [body,signature]=String(token||'').split('.');
  if(!body||!signature)return null;
  const key=createPublicKey({key:publicJwk,format:'jwk'});
  const ok=verifyBuf('sha256',Buffer.from(body),{key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'));
  if(!ok)return null;
  try{return JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch{return null;}
}

/* ---------------------------------------------------------------- Owner authentication */

export function hashPassword(password,salt=randomBytes(16).toString('hex')){
  return {salt,hash:scryptSync(String(password),salt,64).toString('hex')};
}
export function verifyPassword(password,salt,hash){
  const calon=Buffer.from(scryptSync(String(password),String(salt),64).toString('hex'));
  const asli=Buffer.from(String(hash));
  return calon.length===asli.length&&timingSafeEqual(calon,asli);
}
export function newId(prefix){return `${prefix}_${randomUUID().replace(/-/g,'')}`;}
export function newInstallationId(){return `inst_${randomBytes(16).toString('hex')}`;}
export function sessionToken(){return randomBytes(32).toString('base64url');}
export function sha256Hex(value){return createHmac('sha256','erapor-session').update(String(value)).digest('hex');}
