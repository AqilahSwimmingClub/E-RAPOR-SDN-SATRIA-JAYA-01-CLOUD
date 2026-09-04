import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, CLASSES } from '../src/data/constants.js';
import { authenticate, ensureSecurityBootstrap, getSession, listUserAccounts, saveSession,
  setTeacherActive } from '../src/services/auth.js';
import { assertLicenseAllowsLogin, getLicenseState } from '../src/services/license.js';
import { saveAssessmentScores, saveAssessmentSettings, ASSESSMENT_TYPES } from '../src/services/assessment.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';
import { SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { aktifkanLisensiLokal, cabutLisensiLokal, hapusLisensiLokal } from './helpers/license-local.js';

/* LISENSI SEBAGAI GERBANG AKSES, DAN AKTIVASI AKUN GURU OLEH ADMIN.

   Dua lapis yang harus dipenuhi sebelum siapa pun dapat masuk:

     1. LISENSI SEKOLAH sah. Berlaku untuk Admin maupun Guru - pencabutan memutus akses semua
        orang, bukan hanya wali kelas.
     2. AKUN GURU aktif. Lisensi yang sah TIDAK dengan sendirinya mengaktifkan 24 akun Guru;
        Admin yang menentukannya.

   Dan satu janji yang tidak boleh dilanggar: lisensi hanya memutus HAK AKSES. Tidak satu pun
   catatan akademik - siswa, nilai, absensi, akun - dihapus, direset, atau diubah olehnya. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const nilai=new Map(),sesi=new Map();
  const buat=peta=>({getItem:k=>peta.has(k)?peta.get(k):null,
    setItem:(k,v)=>peta.set(k,String(v)),removeItem:k=>peta.delete(k),clear:()=>peta.clear()});
  globalThis.localStorage=buat(nilai);
  globalThis.sessionStorage=buat(sesi);
  invalidateDbCache();
}
const admin={role:'admin'};
const semester=`Ganjil ${ACADEMIC_YEAR}`;
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});

async function siapkan({lisensi='ACTIVE'}={}){
  useMemoryStorage();
  if(lisensi)aktifkanLisensiLokal({status:lisensi});
  await ensureSecurityBootstrap();
  /* Admin diaktifkan pemilik aplikasi seperti pada instalasi sungguhan. */
  const db=loadDb();
  const {updateDb}=await import('../src/services/storage.js');
  const {createPasswordHash}=await import('../src/services/auth.js');
  const hash=await createPasswordHash('AdminKuat#2026');
  updateDb(next=>{
    next.userAccounts.admin={...next.userAccounts.admin,passwordHash:hash,
      requiresActivation:false,active:true};
    next.security={...next.security,ownerActivated:true};
    return next;
  });
  return db;
}
const masukAdmin=()=>authenticate({role:'admin',username:'Admin',password:'AdminKuat#2026',semester});
const masukGuru=(classId='5B')=>authenticate({role:'teacher',username:`Guru${classId}`,
  password:`Kelas${classId.toLowerCase()}`,semester});

/* Data akademik contoh, dipakai untuk membuktikan tidak ada yang hilang. */
function isiDataAkademik(){
  const sesi=guru('5B');
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:item.id==='mtk',order:index+1})));
  const siswa=createStudent(sesi,{classId:'5B',nis:'L-1',nisn:'880000001',name:'Siswa Lisensi',gender:'P',photo:''});
  saveAssessmentSettings(sesi,'mtk',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(sesi,'mtk',jenis.id,{[siswa.id]:88});
  return {sesi,siswa};
}
const cuplikanData=sesi=>({
  siswa:listStudents(sesi,{classId:'5B'}).length,
  akun:Object.keys(loadDb().userAccounts).length,
  nilai:Object.keys(loadDb().assessmentScores).length,
});

/* ------------------------------------------------------------------ §N.1-3 LISENSI AKTIF */

test('1. Lisensi ACTIVE: Admin dapat login',async()=>{
  await siapkan();
  const sesi=await masukAdmin();
  assert.equal(sesi.role,'admin');
  assert.equal(getLicenseState().state,'ACTIVE');
});

test('2-3. Guru hanya dapat login setelah Admin mengaktifkan akunnya',async()=>{
  await siapkan();
  /* Akun Guru baru NONAKTIF walau lisensinya sah - inilah inti §G. */
  const akun=await listUserAccounts(admin);
  assert.equal(akun.every(item=>item.active===false),true,'24 akun Guru menunggu Admin');

  await assert.rejects(()=>masukGuru('5B'),error=>{
    assert.match(error.message,/belum diaktifkan Admin/i,'pesannya menyebut sebabnya');
    assert.equal(error.code,'ACCOUNT_INACTIVE');
    return true;
  });

  /* Admin membukanya, lalu Guru dapat masuk. */
  await setTeacherActive(admin,'5B',true);
  const sesi=await masukGuru('5B');
  assert.equal(sesi.role,'teacher');
  assert.equal(sesi.classId,'5B');

  /* Rombel lain tetap tertutup - aktivasi bersifat per akun, bukan borongan. */
  await assert.rejects(()=>masukGuru('6A'),/belum diaktifkan Admin/i);
});

/* -------------------------------------------------------------- §N.4-7 LISENSI DICABUT */

test('4-5. Lisensi REVOKED menolak Admin maupun Guru yang aktif',async()=>{
  await siapkan();
  await setTeacherActive(admin,'5B',true);
  await masukGuru('5B');

  cabutLisensiLokal('REVOKED');
  assert.equal(getLicenseState().state,'REVOKED');
  assert.equal(getLicenseState().canUseApp,false);

  await assert.rejects(()=>masukAdmin(),error=>{
    assert.equal(error.code,'LICENSE_BLOCKED');return true;});
  await assert.rejects(()=>masukGuru('5B'),error=>{
    assert.equal(error.code,'LICENSE_BLOCKED');
    assert.equal(error.licenseState,'REVOKED');return true;});

  /* Status akun Guru TIDAK ikut berubah hanya karena lisensinya dicabut (§N.12). */
  const akun=await listUserAccounts(admin);
  assert.equal(akun.find(item=>item.classId==='5B').active,true,'akun tetap aktif');
});

test('6. Logout lalu lisensi dicabut: login berikutnya ditolak',async()=>{
  await siapkan();
  await setTeacherActive(admin,'5B',true);
  const sesi=await masukGuru('5B');
  saveSession(sesi);
  assert.ok(getSession(),'sesi berjalan');

  /* Guru keluar. */
  const {clearSession}=await import('../src/services/auth.js');
  clearSession();
  assert.equal(getSession(),null);

  /* Owner mencabut lisensi. Percobaan masuk berikutnya tertolak. */
  cabutLisensiLokal('REVOKED');
  await assert.rejects(()=>masukGuru('5B'),/LICENSE|lisensi/i);
});

test('7. Startup dengan lisensi dicabut mengarahkan ke halaman aktivasi',async()=>{
  await siapkan();
  cabutLisensiLokal('REVOKED');
  const state=getLicenseState();
  assert.equal(state.canUseApp,false,'aplikasi tidak boleh terbuka');
  /* app.js memakai canUseApp untuk menampilkan halaman Aktivasi Lisensi lebih dulu. */
  const app=read('src/app.js');
  assert.match(app,/!licenseState\.canUseApp[\s\S]{0,200}renderLicenseActivation/,
    'gerbang aktivasi berdiri sebelum apa pun');
  /* Dan pemeriksaan ke server benar-benar dipanggil - dulu hanya diimpor. */
  assert.match(app,/segarkanLisensiDariServer\(\)/,'status lisensi disegarkan saat startup');
  assert.match(app,/checkLicense\(\{force:true\}\)/);
});

/* ------------------------------------------------ §N.8-10 PEMULIHAN DAN LISENSI BARU */

test('8. Reactivate oleh Owner mengembalikan akses tanpa langkah lain',async()=>{
  await siapkan();
  await setTeacherActive(admin,'5B',true);
  cabutLisensiLokal('REVOKED');
  await assert.rejects(()=>masukGuru('5B'),/LICENSE|lisensi/i);

  /* Owner memulihkan; catatan lokal kembali ACTIVE pada pemeriksaan berikutnya. */
  cabutLisensiLokal('ACTIVE');
  const sesi=await masukGuru('5B');
  assert.equal(sesi.classId,'5B','akses kembali normal tanpa mengubah apa pun di sekolah');
});

test('9-11. Lisensi baru mengaktifkan kembali akses tanpa menghapus data akademik',async()=>{
  await siapkan();
  await setTeacherActive(admin,'5B',true);
  const {sesi}=isiDataAkademik();
  const sebelum=cuplikanData(sesi);
  assert.ok(sebelum.siswa>0&&sebelum.nilai>0,'ada data akademik untuk dijaga');

  /* Lisensi dicabut. Akses putus, data TIDAK disentuh. */
  cabutLisensiLokal('REVOKED');
  await assert.rejects(()=>masukAdmin(),/LICENSE|lisensi/i);
  assert.deepEqual(cuplikanData(sesi),sebelum,'revoke tidak menghapus satu pun data');

  /* Perangkat memasukkan License Key baru yang sah. */
  hapusLisensiLokal();
  assert.equal(getLicenseState().state,'UNLICENSED');
  assert.deepEqual(cuplikanData(sesi),sebelum,'melepas lisensi pun tidak menghapus data');
  aktifkanLisensiLokal({status:'ACTIVE'});

  const admins=await masukAdmin();
  assert.equal(admins.role,'admin','akses kembali normal dengan lisensi baru');
  assert.deepEqual(cuplikanData(sesi),sebelum,'seluruh data lama masih ada');
  assert.equal(listStudents(sesi,{classId:'5B'})[0].name,'Siswa Lisensi');
});

/* ------------------------------------------------------- §N.12-13 STATUS AKUN GURU */

test('12-13. Status Guru bertahan melewati pencabutan dan penggantian lisensi',async()=>{
  await siapkan();
  await setTeacherActive(admin,'5B',true);
  await setTeacherActive(admin,'6A',false);

  cabutLisensiLokal('REVOKED');
  hapusLisensiLokal();
  aktifkanLisensiLokal({status:'ACTIVE'});

  const akun=await listUserAccounts(admin);
  assert.equal(akun.find(item=>item.classId==='5B').active,true,'yang aktif tetap aktif');
  assert.equal(akun.find(item=>item.classId==='6A').active,false,'yang nonaktif tetap nonaktif');
  await assert.rejects(()=>masukGuru('6A'),/belum diaktifkan Admin/i);
  assert.equal((await masukGuru('5B')).classId,'5B');
});

/* --------------------------------------------------------- §N.14-16 ATURAN DAN WARISAN */

test('14. Aturan satu perangkat aktif per slot tidak tersentuh',()=>{
  /* Pengikatan perangkat tetap dijaga server lewat indeks unik parsial, dan client tidak
     menyentuh installation_id maupun token. */
  const server=read('server/src/db.js');
  /* Aturannya ditegakkan indeks unik parsial di database, bukan pemeriksaan di kode. Satu
     lisensi pembelian punya tepat dua slot: satu Android dan satu Windows. */
  assert.match(server,/CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_slot\s*\n\s*ON device_activations\(license_id,slot\) WHERE is_active=1 AND slot IS NOT NULL/,
    'paling banyak satu perangkat aktif per slot');
  assert.match(server,/DROP INDEX IF EXISTS ux_one_active_device/,'indeks lama dilepas, bukan dibiarkan bertabrakan');
  const license=read('src/services/license.js');
  assert.match(license,/installation_id/,'aktivasi tetap membawa Installation ID');
  /* Gerbang login hanya membaca status; ia tidak pernah menulis atau menghapus catatan lisensi. */
  const gerbang=license.slice(license.indexOf('export function assertLicenseAllowsLogin'),
    license.indexOf('export async function refreshLicenseForLogin'));
  assert.equal(/tulis\(|removeItem|clearLicense/.test(gerbang),false,
    'gerbang login tidak mengubah catatan lisensi');
});

test('15. Gerbang lisensi tidak pernah menghapus data - dijaga pada tingkat kode',()=>{
  const license=read('src/services/license.js');
  const auth=read('src/services/auth.js');
  for(const [nama,isi] of [['license.js',license],['auth.js',auth]]){
    assert.equal(/localStorage\.clear\(\)|indexedDB\.deleteDatabase/.test(isi),false,
      `${nama} tidak pernah mengosongkan penyimpanan`);
  }
  /* Yang dihapus clearLicense hanyalah catatan lisensinya sendiri, bukan database sekolah. */
  assert.match(license,/removeItem\(LICENSE_STORAGE_KEY\)/);
});

test('16. Akun Guru instalasi lama tidak ikut terkunci oleh aturan baru',async()=>{
  useMemoryStorage();
  aktifkanLisensiLokal();
  /* Instalasi lama: akun Guru sudah ada dan berstatus aktif sebelum aturan ini berlaku. */
  await ensureSecurityBootstrap();
  await setTeacherActive(admin,'5B',true);
  const sebelum=(await listUserAccounts(admin)).find(item=>item.classId==='5B');
  assert.equal(sebelum.active,true);

  /* Bootstrap dijalankan lagi - seperti setiap kali aplikasi dibuka. Akun yang sudah ada
     TIDAK disentuh, sehingga sekolah yang sudah berjalan tidak tiba-tiba kehilangan akses. */
  await ensureSecurityBootstrap();
  const sesudah=(await listUserAccounts(admin)).find(item=>item.classId==='5B');
  assert.equal(sesudah.active,true,'status akun lama dipertahankan');
  assert.equal(CLASSES.length,24);
  assert.equal((await listUserAccounts(admin)).length,24,'jumlah akun tidak berubah');
});

/* ------------------------------------------------------------------- KONTRAK GERBANG */

test('17. authenticate memanggil gerbang lisensi, bukan halaman Login saja',()=>{
  const auth=read('src/services/auth.js');
  assert.match(auth,/assertLicenseAllowsLogin\(\);/,'gerbang ada di dalam authenticate');
  /* Diletakkan di layanan supaya tidak ada pemanggil yang dapat melewatinya. */
  const posisiGerbang=auth.indexOf('assertLicenseAllowsLogin();');
  const posisiBootstrap=auth.indexOf('await ensureSecurityBootstrap();const db=loadDb();');
  assert.ok(posisiGerbang<posisiBootstrap,'lisensi diperiksa paling awal');

  const login=read('src/pages/login.js');
  assert.match(login,/await refreshLicenseForLogin\(\)/,'setiap login menyegarkan status ke server');
  assert.match(login,/LICENSE_BLOCKED/,'login yang tertolak diarahkan ke aktivasi');
});

test('18. Gerbang lisensi menolak setiap keadaan yang tidak boleh memakai aplikasi',()=>{
  useMemoryStorage();
  hapusLisensiLokal();
  assert.throws(()=>assertLicenseAllowsLogin(),error=>{
    assert.equal(error.code,'LICENSE_BLOCKED');
    assert.equal(error.licenseState,'UNLICENSED');return true;});

  for(const status of ['REVOKED','NOT_BOUND']){
    aktifkanLisensiLokal({status});
    assert.throws(()=>assertLicenseAllowsLogin(),error=>{
      assert.equal(error.licenseState,status);return true;},`${status} ditolak`);
  }
  /* SUSPENDED ikut memutus login. Penangguhan adalah jawaban server bahwa lisensi ini sedang
     tidak boleh dipakai, dan jawaban server selalu mengalahkan masa tenggang offline. Tidak ada
     satu pun data yang dihapus karenanya - lihat test masa tenggang offline. */
  aktifkanLisensiLokal({status:'SUSPENDED'});
  assert.equal(getLicenseState().canUseApp,false);
  assert.equal(getLicenseState().canEditData,false);
  assert.throws(()=>assertLicenseAllowsLogin(),error=>{
    assert.equal(error.licenseState,'SUSPENDED');return true;},'SUSPENDED ditolak');

  aktifkanLisensiLokal({status:'ACTIVE'});
  assert.doesNotThrow(()=>assertLicenseAllowsLogin());
});
