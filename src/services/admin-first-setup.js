import { createPasswordHash, ensureSecurityBootstrap } from './auth.js';
import { assertLicenseAllowsLogin } from './license.js';
import { loadDb, updateDb } from './storage.js';

function validatePasswordPolicy(value){
  const password=String(value||'');
  if(password.length<8||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/\d/.test(password)){
    throw new Error('Password minimal 8 karakter dan memuat huruf besar, huruf kecil, serta angka.');
  }
  return password;
}

function randomBytes(length=20){const bytes=new Uint8Array(length);globalThis.crypto.getRandomValues(bytes);return bytes;}
function recoveryCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const value=[...randomBytes()].map(byte=>alphabet[byte%alphabet.length]).join('');
  return value.match(/.{1,5}/g).join('-');
}

/* Pembuatan Admin pertama untuk sekolah pembeli.
   Syaratnya hanya lisensi aplikasi yang sah pada perangkat ini. Tidak ada Owner Key/PIN,
   dan fungsi ini tidak membaca atau mengubah credential Owner/Developer. */
export async function setupFirstAdmin(newPassword){
  assertLicenseAllowsLogin();
  await ensureSecurityBootstrap();
  const current=loadDb();
  if(!current.userAccounts.admin?.requiresActivation)throw new Error('Password Admin pertama sudah dibuat.');

  const password=validatePasswordPolicy(newPassword);
  const code=recoveryCode();
  const [passwordHash,recoveryHash]=await Promise.all([
    createPasswordHash(password),
    createPasswordHash(code)
  ]);

  updateDb(db=>{
    if(!db.userAccounts.admin?.requiresActivation)throw new Error('Password Admin pertama sudah dibuat.');
    db.userAccounts.admin={
      ...db.userAccounts.admin,
      passwordHash,
      recoveryHash,
      requiresActivation:false,
      mustChangePassword:false,
      updatedAt:new Date().toISOString()
    };
    /* Flag lama masih dibaca autentikasi/router. Ia dipertahankan hanya sebagai penanda bahwa
       Admin lokal sudah siap, bukan sebagai bukti bahwa credential Owner dibagikan ke pembeli. */
    db.security={...db.security,ownerActivated:true};
    return db;
  });

  return {recoveryCode:code};
}
