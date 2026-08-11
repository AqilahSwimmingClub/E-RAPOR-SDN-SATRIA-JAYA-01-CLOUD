import { CLASSES, SEMESTERS } from '../data/constants.js';
import { getAdminProfile, getSchoolMaster, getTeacherProfile } from './master.js';
import { listLoginSemesters, resolveSemesterAcademicYear } from './references.js';
import { loadDb, updateDb } from './storage.js';

const SESSION_KEY='erapor_satria_session_v2';
const HASH_ITERATIONS=120000;
const SESSION_DURATION_MS=8*60*60*1000;
let bootstrapPromise=null;

function bytesToBase64(bytes){let value='';bytes.forEach(byte=>{value+=String.fromCharCode(byte);});return btoa(value);}
function base64ToBytes(value){return Uint8Array.from(atob(value),character=>character.charCodeAt(0));}
function randomBytes(length=16){const bytes=new Uint8Array(length);globalThis.crypto.getRandomValues(bytes);return bytes;}
function teacherKey(classId){return `teacher:${classId}`;}
function initialTeacherPassword(classId){return `Kelas${classId.toLowerCase()}`;}
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function validateSemester(value){if(!listLoginSemesters().includes(value))throw new Error('Semester login tidak valid.');return value;}
function validatePasswordPolicy(value){const password=String(value||'');if(password.length<8||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/\d/.test(password))throw new Error('Password minimal 8 karakter dan memuat huruf besar, huruf kecil, serta angka.');return password;}
function safeAccount(account){if(!account)return null;const {passwordHash,recoveryHash,...safe}=account;return {...safe,hasPassword:Boolean(passwordHash),hasRecovery:Boolean(recoveryHash)};}

export async function createPasswordHash(password,saltBytes=randomBytes()){
  const key=await globalThis.crypto.subtle.importKey('raw',new TextEncoder().encode(String(password)),'PBKDF2',false,['deriveBits']);const bits=await globalThis.crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations:HASH_ITERATIONS},key,256);return {algorithm:'PBKDF2-SHA-256',iterations:HASH_ITERATIONS,salt:bytesToBase64(saltBytes),hash:bytesToBase64(new Uint8Array(bits))};
}

export async function verifyPassword(password,record){
  if(!record?.salt||!record?.hash||record.algorithm!=='PBKDF2-SHA-256')return false;const key=await globalThis.crypto.subtle.importKey('raw',new TextEncoder().encode(String(password)),'PBKDF2',false,['deriveBits']);const bits=await globalThis.crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:base64ToBytes(record.salt),iterations:record.iterations},key,256);const actual=new Uint8Array(bits),expected=base64ToBytes(record.hash);if(actual.length!==expected.length)return false;let different=0;for(let index=0;index<actual.length;index+=1)different|=actual[index]^expected[index];return different===0;
}

export async function ensureSecurityBootstrap(){
  const current=loadDb();
  if(current.userAccounts.admin&&CLASSES.every(classId=>current.userAccounts[teacherKey(classId)]))return true;
  if(bootstrapPromise)return bootstrapPromise;
  bootstrapPromise=(async()=>{const db=loadDb();const missing=CLASSES.filter(classId=>!db.userAccounts[teacherKey(classId)]);const hashed=await Promise.all(missing.map(async classId=>[classId,await createPasswordHash(initialTeacherPassword(classId))]));updateDb(next=>{if(!next.userAccounts.admin)next.userAccounts.admin={id:'admin',role:'admin',username:'Admin',active:true,passwordHash:null,recoveryHash:null,requiresActivation:true,mustChangePassword:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};hashed.forEach(([classId,passwordHash])=>{const key=teacherKey(classId);if(!next.userAccounts[key])next.userAccounts[key]={id:key,role:'teacher',classId,username:`Guru${classId}`,active:true,passwordHash,recoveryHash:null,requiresActivation:false,mustChangePassword:false,bootstrapCredential:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};});next.security={...next.security,version:1,hashAlgorithm:'PBKDF2-SHA-256',hashIterations:HASH_ITERATIONS,sessionDurationMs:next.security.sessionDurationMs||SESSION_DURATION_MS,initializedAt:next.security.initializedAt||new Date().toISOString()};return next;});return true;})();
  try{return await bootstrapPromise;}finally{bootstrapPromise=null;}
}

function randomCredential(length=14){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const bytes=randomBytes(length);return [...bytes].map(byte=>alphabet[byte%alphabet.length]).join('');}
function recoveryCode(){const value=randomCredential(20).toUpperCase();return value.match(/.{1,5}/g).join('-');}

async function resolveTeacherAccount(username,password){
  const db=loadDb();const direct=String(username||'').match(/^guru([1-6][a-d])$/i);if(direct)return db.userAccounts[teacherKey(direct[1].toUpperCase())]||null;if(normalizeUsername(username)!=='guru')return null;const initial=String(password||'').match(/^kelas([1-6][a-d])$/i);if(initial)return db.userAccounts[teacherKey(initial[1].toUpperCase())]||null;const accounts=CLASSES.map(classId=>db.userAccounts[teacherKey(classId)]).filter(account=>account?.active);const matches=await Promise.all(accounts.map(async account=>verifyPassword(password,account.passwordHash)));return accounts[matches.findIndex(Boolean)]||null;
}

function sessionFor(account,semester){
  const validSemester=validateSemester(semester);const school=getSchoolMaster();const profile=account.role==='admin'?getAdminProfile():getTeacherProfile(account.classId);const now=Date.now();const duration=loadDb().security.sessionDurationMs||SESSION_DURATION_MS;return {role:account.role,classId:account.classId||null,accountId:account.id,semester:validSemester,academicYear:resolveSemesterAcademicYear(validSemester),school:school.name,userName:account.username,displayName:profile.name,profile,loggedInAt:new Date(now).toISOString(),expiresAt:new Date(now+duration).toISOString(),mustChangePassword:Boolean(account.mustChangePassword)};
}

export async function authenticate({role,username,password,semester}){
  await ensureSecurityBootstrap();const db=loadDb();let account=null;let passwordToVerify=String(password||'');if(role==='admin'){if(normalizeUsername(username)!=='admin')throw new Error('Username atau password Admin tidak sesuai.');account=db.userAccounts.admin;if(account?.requiresActivation||!db.security?.ownerActivated)throw new Error('Akun Admin belum diaktivasi oleh pemilik aplikasi.');}else if(role==='teacher'){account=await resolveTeacherAccount(username,passwordToVerify);if(account?.bootstrapCredential&&passwordToVerify.toLowerCase()===initialTeacherPassword(account.classId).toLowerCase())passwordToVerify=initialTeacherPassword(account.classId);}else throw new Error('Pilih peran login terlebih dahulu.');if(!account||!account.active||!await verifyPassword(passwordToVerify,account.passwordHash))throw new Error(role==='teacher'?'Username atau password Guru tidak sesuai.':'Username atau password Admin tidak sesuai.');return sessionFor(account,semester);
}

export async function changeOwnPassword(session,currentPassword,newPassword){
  await ensureSecurityBootstrap();const db=loadDb();const account=db.userAccounts[session?.accountId];if(!account||account.role!==session.role)throw new Error('Session akun tidak valid.');if(!await verifyPassword(currentPassword,account.passwordHash))throw new Error('Password saat ini tidak sesuai.');const passwordHash=await createPasswordHash(validatePasswordPolicy(newPassword));updateDb(next=>{next.userAccounts[account.id]={...next.userAccounts[account.id],passwordHash,mustChangePassword:false,bootstrapCredential:false,updatedAt:new Date().toISOString()};return next;});return true;
}

export async function resetTeacherPassword(session,classId){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mereset password Guru.');if(!CLASSES.includes(classId))throw new Error('Rombel Guru tidak valid.');await ensureSecurityBootstrap();const temporaryPassword=randomCredential();const passwordHash=await createPasswordHash(temporaryPassword);updateDb(db=>{const key=teacherKey(classId);if(!db.userAccounts[key])throw new Error('Akun Guru tidak ditemukan.');db.userAccounts[key]={...db.userAccounts[key],passwordHash,mustChangePassword:true,bootstrapCredential:false,updatedAt:new Date().toISOString()};return db;});return {temporaryPassword};
}

export async function setTeacherActive(session,classId,active){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengubah status akun Guru.');if(!CLASSES.includes(classId))throw new Error('Rombel Guru tidak valid.');await ensureSecurityBootstrap();updateDb(db=>{const key=teacherKey(classId);db.userAccounts[key]={...db.userAccounts[key],active:Boolean(active),updatedAt:new Date().toISOString()};return db;});return Boolean(active);
}

export async function recoverAdmin(recoveryValue,newPassword){
  await ensureSecurityBootstrap();const account=loadDb().userAccounts.admin;if(account?.requiresActivation||!account?.recoveryHash)throw new Error('Recovery Admin belum tersedia.');if(!await verifyPassword(String(recoveryValue||'').trim().toUpperCase(),account.recoveryHash))throw new Error('Kode recovery Admin tidak sesuai.');const validated=validatePasswordPolicy(newPassword),code=recoveryCode();const [passwordHash,recoveryHash]=await Promise.all([createPasswordHash(validated),createPasswordHash(code)]);updateDb(db=>{db.userAccounts.admin={...db.userAccounts.admin,passwordHash,recoveryHash,updatedAt:new Date().toISOString()};return db;});return {recoveryCode:code};
}

export async function listUserAccounts(session){if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat melihat Data Pengguna.');await ensureSecurityBootstrap();const db=loadDb();return CLASSES.map(classId=>safeAccount(db.userAccounts[teacherKey(classId)]));}
export async function getSecurityStatus(){await ensureSecurityBootstrap();const db=loadDb();return {initialized:Boolean(db.security.initializedAt),adminActivated:Boolean(db.security.ownerActivated&&!db.userAccounts.admin.requiresActivation),teacherCount:CLASSES.filter(classId=>db.userAccounts[teacherKey(classId)]).length,algorithm:db.security.hashAlgorithm};}

export function saveSession(session){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}
export function clearSession(){sessionStorage.removeItem(SESSION_KEY);}
export function getSession(now=Date.now()){
  try{const session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(!session)return null;if(!session.expiresAt||new Date(session.expiresAt).getTime()<=now){clearSession();return null;}const db=loadDb();const account=db.userAccounts[session.accountId];if(!account?.active||(session.role==='admin'&&(!db.security?.ownerActivated||account.requiresActivation))){clearSession();return null;}const profile=session.role==='admin'?getAdminProfile():getTeacherProfile(session.classId);return {...session,school:getSchoolMaster().name,displayName:profile.name,profile};}catch{clearSession();return null;}
}

export function createSessionForTest({role='teacher',classId='1A',semester=SEMESTERS[0],durationMs=SESSION_DURATION_MS}={}){const account={id:role==='admin'?'admin':teacherKey(classId),role,classId:role==='admin'?null:classId,username:role==='admin'?'Admin':`Guru${classId}`,mustChangePassword:false};const session=sessionFor(account,semester);const now=Date.now();return {...session,loggedInAt:new Date(now).toISOString(),expiresAt:new Date(now+durationMs).toISOString()};}
