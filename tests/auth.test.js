import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, CLASSES } from '../src/data/constants.js';
import { authenticate, changeOwnPassword, createPasswordHash, getSession, listUserAccounts, recoverAdmin, resetTeacherPassword, saveSession, setTeacherActive } from '../src/services/auth.js';
import { loadDb, updateDb } from '../src/services/storage.js';
import { aktifkanLisensiLokal } from './helpers/license-local.js';

function memoryStorage(){const values=new Map();return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}

test('Keamanan login memakai hash, mendukung 24 Guru, perubahan/reset password, dan expiry sesi',async()=>{
  globalThis.localStorage=memoryStorage();globalThis.sessionStorage=memoryStorage();
  /* Login kini bergerbang lisensi; perangkat uji dinyatakan berlisensi sah. */
  aktifkanLisensiLokal();
  /* Akun Guru baru sengaja dibuat NONAKTIF, jadi Admin membukanya lebih dulu - persis seperti
     yang harus dilakukan Admin sungguhan setelah lisensi pertama kali aktif. */
  for(const classId of CLASSES)await setTeacherActive({role:'admin'},classId,true);
  const teacherSessions=[];
  for(const classId of CLASSES){
    const session=await authenticate({role:'teacher',username:'Guru',password:`Kelas${classId.toLowerCase()}`,semester:`Genap ${ACADEMIC_YEAR}`});
    assert.equal(session.role,'teacher');assert.equal(session.classId,classId);teacherSessions.push(session);
  }
  assert.equal(teacherSessions.length,24);
  const db=loadDb();const accounts=Object.values(db.userAccounts).filter(account=>account.role==='teacher');
  assert.equal(accounts.length,24);assert.ok(accounts.every(account=>account.passwordHash?.algorithm==='PBKDF2-SHA-256'));
  assert.ok(accounts.every(account=>!Object.hasOwn(account,'password')));assert.doesNotMatch(JSON.stringify(db.userAccounts),/Kelas1a/i);

  const activation={recoveryCode:'ABCDE-FGHIJ-KLMNP-QRSTU'};const [passwordHash,recoveryHash]=await Promise.all([createPasswordHash('AdminSecure2026'),createPasswordHash(activation.recoveryCode)]);updateDb(next=>{next.userAccounts.admin={...next.userAccounts.admin,passwordHash,recoveryHash,requiresActivation:false};next.security.ownerActivated=true;return next;});
  let admin=await authenticate({role:'admin',username:'Admin',password:'AdminSecure2026',semester:`Genap ${ACADEMIC_YEAR}`});
  assert.equal(admin.role,'admin');assert.ok(activation.recoveryCode);
  const recovery=await recoverAdmin(activation.recoveryCode,'AdminRecovered2026');
  admin=await authenticate({role:'admin',username:'Admin',password:'AdminRecovered2026',semester:`Genap ${ACADEMIC_YEAR}`});
  assert.ok(recovery.recoveryCode);assert.equal((await listUserAccounts(admin)).length,24);

  const teacher=teacherSessions.find(item=>item.classId==='5B');
  await changeOwnPassword(teacher,'Kelas5b','PasswordBaru5B');
  await assert.rejects(()=>authenticate({role:'teacher',username:'Guru5B',password:'Kelas5b',semester:`Genap ${ACADEMIC_YEAR}`}));
  assert.equal((await authenticate({role:'teacher',username:'Guru5B',password:'PasswordBaru5B',semester:`Genap ${ACADEMIC_YEAR}`})).classId,'5B');

  const reset=await resetTeacherPassword(admin,'5B');
  assert.ok(reset.temporaryPassword);assert.equal((await authenticate({role:'teacher',username:'Guru5B',password:reset.temporaryPassword,semester:`Genap ${ACADEMIC_YEAR}`})).mustChangePassword,true);
  await setTeacherActive(admin,'6D',false);
  await assert.rejects(()=>authenticate({role:'teacher',username:'Guru6D',password:'Kelas6d',semester:`Genap ${ACADEMIC_YEAR}`}));
  await setTeacherActive(admin,'6D',true);

  saveSession({...teacherSessions[0],expiresAt:new Date(Date.now()-1000).toISOString()});
  assert.equal(getSession(),null);assert.equal(sessionStorage.getItem('erapor_satria_session_v2'),null);
});
