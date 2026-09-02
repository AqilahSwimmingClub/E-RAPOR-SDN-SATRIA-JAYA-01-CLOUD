import { CLASSES } from '../data/constants.js';
import { loadDb, updateDb } from './storage.js';

function clone(value){return JSON.parse(JSON.stringify(value));}
function clean(value,max=250){return String(value??'').trim().slice(0,max);}
function assertClass(classId){if(!CLASSES.includes(classId))throw new Error('Rombel harus berada pada rentang 1A sampai 6D.');}
function canEditTeacher(session,classId){if(session?.role==='admin')return true;if(session?.role==='teacher'&&session.classId===classId)return true;throw new Error('Anda tidak berwenang mengubah profil Guru rombel ini.');}
/* Foto profil Admin hanya menerima gambar yang benar-benar diunggah sekolah. Foto pembuat
   aplikasi tidak lagi menjadi nilai yang sah di sini: tempatnya di branding aplikasi
   (src/data/app-identity.js), bukan di data sekolah. */
function normalizePhoto(value){const photo=String(value??'').trim();if(photo&&!photo.startsWith('data:image/'))throw new Error('Foto profil harus berupa gambar lokal.');if(photo.length>1500000)throw new Error('Ukuran foto profil terlalu besar untuk storage lokal.');return photo;}
function validEmail(value){return !value||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
function normalizeLogo(value,label){const logo=String(value??'').trim();if(logo&&!logo.startsWith('data:image/'))throw new Error(`${label} harus berupa file gambar lokal.`);if(logo.length>1500000)throw new Error(`Ukuran ${label} terlalu besar untuk storage lokal.`);return logo;}

export function getSchoolMaster(){return clone(loadDb().masterData.school);}
export function getAdminProfile(){return clone(loadDb().masterData.admin);}
export function getTeacherProfile(classId){assertClass(classId);return clone(loadDb().masterData.teachers[classId]);}
export function listTeacherProfiles(){const teachers=loadDb().masterData.teachers;return CLASSES.map(classId=>clone(teachers[classId]));}
export function listMasterClasses(){return [...CLASSES];}

/* Status sekolah dipilih, bukan diketik, supaya dokumen resmi konsisten. */
export const SCHOOL_STATUSES=Object.freeze(['Negeri','Swasta']);
function normalizeStatus(value){const status=clean(value,20);if(status&&!SCHOOL_STATUSES.includes(status))throw new Error('Status sekolah harus Negeri atau Swasta.');return status;}
function normalizePostalCode(value){const code=clean(value,10);if(code&&!/^\d{5}$/.test(code))throw new Error('Kode Pos harus 5 angka.');return code;}

/* Nama sekolah berasal dari input Admin. Aplikasi ini dipakai banyak sekolah, jadi tidak ada
   satu pun nama sekolah yang ditanam di kode. Field lama tetap dipertahankan apa adanya
   supaya identitas yang sudah tersimpan pada instalasi lama tidak hilang. */
export function saveSchoolMaster(session,input){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengubah master sekolah.');
  return applySchoolMaster(input);
}

/* Setup Awal berjalan sebelum ada satu pun akun, jadi belum ada session Admin yang bisa
   memberi izin. Jalur ini hanya terbuka selama identitas sekolah belum pernah diisi, memakai
   validasi yang sama persis, dan tertutup sendiri begitu nama sekolah tersimpan. Sesudah itu
   perubahan identitas sekolah kembali menuntut session Admin. */
export function saveSchoolIdentitySetup(input){
  if(isSchoolIdentityReady())throw new Error('Identitas sekolah sudah disetup. Ubah melalui menu Data Sekolah.');
  return applySchoolMaster(input);
}

function applySchoolMaster(input){
  const principalName=clean(input?.principalName,150),principalNip=clean(input?.principalNip,40);const email=clean(input?.email,180).toLowerCase();if(!validEmail(email))throw new Error('Format email sekolah tidak valid.');let saved;
  const name=clean(input?.name??'',150);
  if(!name)throw new Error('Nama sekolah wajib diisi.');
  const status=normalizeStatus(input?.status??'');
  const postalCode=normalizePostalCode(input?.postalCode??'');
  updateDb(db=>{
    saved={...db.masterData.school,name,principalName,principalNip,
      npsn:clean(input?.npsn,20),registrationNumber:clean(input?.registrationNumber,40),
      status,postalCode,phone:clean(input?.phone,40),
      address:clean(input?.address,200),village:clean(input?.village,120),district:clean(input?.district,120),
      city:clean(input?.city,120),province:clean(input?.province,120),website:clean(input?.website,180),email,
      reportDate:clean(input?.reportDate??db.masterData.school.reportDate,10),
      reportCity:clean(input?.reportCity??db.masterData.school.reportCity,80),
      ministryLogo:normalizeLogo(input?.ministryLogo??db.masterData.school.ministryLogo,'Logo Tut Wuri Handayani'),
      regionLogo:normalizeLogo(input?.regionLogo??db.masterData.school.regionLogo,'Lambang daerah'),
      schoolLogo:normalizeLogo(input?.schoolLogo??db.masterData.school.schoolLogo,'Logo sekolah'),
      updatedAt:new Date().toISOString()};
    db.masterData.school=saved;return db;
  });return clone(saved);
}

export function saveAdminProfile(session,input){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat mengubah profil Admin.');const email=clean(input?.email,180).toLowerCase();if(!validEmail(email))throw new Error('Format email Admin tidak valid.');let saved;
  updateDb(db=>{saved={...db.masterData.admin,name:clean(input?.name,150)||'Administrator',nip:clean(input?.nip,40),phone:clean(input?.phone,40),email,photo:normalizePhoto(input?.photo),updatedAt:new Date().toISOString()};db.masterData.admin=saved;return db;});return clone(saved);
}

export function saveTeacherProfile(session,classId,input){
  assertClass(classId);canEditTeacher(session,classId);const email=clean(input?.email,180).toLowerCase();if(!validEmail(email))throw new Error('Format email Guru tidak valid.');let saved;
  updateDb(db=>{const existing=db.masterData.teachers[classId];saved={...existing,classId,name:clean(input?.name,150)||`Guru / Wali Kelas ${classId}`,nip:clean(input?.nip,40),phone:clean(input?.phone,40),email,photo:normalizePhoto(input?.photo),updatedAt:new Date().toISOString()};db.masterData.teachers[classId]=saved;return db;});return clone(saved);
}

/* Setup Awal ditampilkan selama identitas sekolah belum diisi. Yang menentukan hanyalah nama
   sekolah: tanpa itu seluruh dokumen resmi tidak dapat dicetak dengan benar. */
export function isSchoolIdentityReady(){return Boolean(String(getSchoolMaster().name||'').trim());}
