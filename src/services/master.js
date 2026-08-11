import { CLASSES, SCHOOL } from '../data/constants.js';
import { loadDb, updateDb } from './storage.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=250){return String(value??'').trim().slice(0,max);}
function assertClass(classId){if(!CLASSES.includes(classId))throw new Error('Rombel harus berada pada rentang 1A sampai 6D.');}
function canEditTeacher(session,classId){if(session?.role==='admin')return true;if(session?.role==='teacher'&&session.classId===classId)return true;throw new Error('Anda tidak berwenang mengubah profil Guru rombel ini.');}
function normalizePhoto(value){const photo=String(value??'').trim();if(photo&&photo!=='./assets/fahmi-djawas.jpg'&&!photo.startsWith('data:image/'))throw new Error('Foto profil harus berupa gambar lokal.');if(photo.length>1500000)throw new Error('Ukuran foto profil terlalu besar untuk storage lokal.');return photo;}
function validEmail(value){return !value||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}

export function getSchoolMaster(){return clone(loadDb().masterData.school);}
export function getAdminProfile(){return clone(loadDb().masterData.admin);}
export function getTeacherProfile(classId){assertClass(classId);return clone(loadDb().masterData.teachers[classId]);}
export function listTeacherProfiles(){const teachers=loadDb().masterData.teachers;return CLASSES.map(classId=>clone(teachers[classId]));}
export function listMasterClasses(){return [...CLASSES];}

export function saveSchoolMaster(session,input){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengubah master sekolah.');const principalName=clean(input?.principalName,150),principalNip=clean(input?.principalNip,40);let saved;
  updateDb(db=>{saved={name:SCHOOL,principalName,principalNip,updatedAt:new Date().toISOString()};db.masterData.school=saved;return db;});return clone(saved);
}

export function saveAdminProfile(session,input){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengubah profil Admin.');const email=clean(input?.email,180).toLowerCase();if(!validEmail(email))throw new Error('Format email Admin tidak valid.');let saved;
  updateDb(db=>{saved={...db.masterData.admin,name:clean(input?.name,150)||'Administrator',nip:clean(input?.nip,40),phone:clean(input?.phone,40),email,photo:normalizePhoto(input?.photo),updatedAt:new Date().toISOString()};db.masterData.admin=saved;return db;});return clone(saved);
}

export function saveTeacherProfile(session,classId,input){
  assertClass(classId);canEditTeacher(session,classId);const email=clean(input?.email,180).toLowerCase();if(!validEmail(email))throw new Error('Format email Guru tidak valid.');let saved;
  updateDb(db=>{const existing=db.masterData.teachers[classId];saved={...existing,classId,name:clean(input?.name,150)||`Guru / Wali Kelas ${classId}`,nip:clean(input?.nip,40),phone:clean(input?.phone,40),email,photo:normalizePhoto(input?.photo),updatedAt:new Date().toISOString()};db.masterData.teachers[classId]=saved;return db;});return clone(saved);
}
