import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, CLASSES } from '../src/data/constants.js';
import { LICENSE_CLOCK_TOLERANCE_MINUTES, LICENSE_OFFLINE_GRACE_HOURS,
  LICENSE_STORAGE_KEY } from '../src/data/license-config.js';
import { assertLicenseAllowsLogin, getLicenseState, isCheckDue, noteClockObservation,
  offlineGraceStatus } from '../src/services/license.js';
import { authenticate, createPasswordHash, ensureSecurityBootstrap, setTeacherActive } from '../src/services/auth.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, updateDb } from '../src/services/storage.js';
import { saveSchoolIdentitySetup } from '../src/services/master.js';
import { installBrowserEnv, startTestServer } from './helpers/license-server.js';
import { loadLicenseService } from './helpers/license-module.js';
import { aktifkanLisensiLokal, bacaLisensiLokal, cabutLisensiLokal,
  geserVerifikasiLisensi } from './helpers/license-local.js';

/* MASA TENGGANG OFFLINE 72 JAM.

   Sekolah harus tetap dapat memakai e-Rapor ketika internetnya mati, tetapi tidak boleh dapat
   memakainya offline selamanya - kalau begitu pencabutan lisensi tidak akan pernah sampai ke
   perangkat. Batasnya 72 jam sejak verifikasi server terakhir yang menyatakan lisensi ACTIVE.

   Dua hal yang paling mudah tertukar dan karena itu diuji berulang kali di bawah:

     - SERVER TIDAK DAPAT DIHUBUNGI. Hanya ini yang mendapat masa tenggang.
     - SERVER MENJAWAB bahwa lisensi tidak boleh dipakai. Ini MENGALAHKAN masa tenggang, betapa
       pun barunya verifikasi ACTIVE sebelumnya. */

const JAM=3600000;
const BATAS=LICENSE_OFFLINE_GRACE_HOURS;
const semester=`Ganjil ${ACADEMIC_YEAR}`;
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});

/* assert.throws tidak mengembalikan galatnya, padahal yang diuji di sini justru isi galatnya. */
function tangkap(fn){
  try{fn();}catch(error){return error;}
  throw new assert.AssertionError({message:'seharusnya menolak, tetapi lolos'});
}

function memoryStorage(){
  const nilai=new Map();
  return {getItem:k=>nilai.has(k)?nilai.get(k):null,setItem:(k,v)=>nilai.set(k,String(v)),
    removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
}

function siapkanPerangkat(){
  globalThis.localStorage=memoryStorage();
  globalThis.sessionStorage=memoryStorage();
  invalidateDbCache();
  aktifkanLisensiLokal();
}

/* ------------------------------------------------------------ 1. Titik nol masa tenggang */

test('1. Verifikasi ACTIVE dari server menyimpan lastVerifiedAt sebagai titik nol',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  const [kunci]=await server.buatLisensi(1,{schoolName:'SDN Uji Tenggang'});

  const sebelum=Date.now();
  const record=await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji Tenggang',npsn:'12345678'}});
  assert.equal(record.status,'ACTIVE');
  assert.ok(record.last_verified_at,'lastVerifiedAt tersimpan pada catatan lisensi');
  const titikNol=Date.parse(record.last_verified_at);
  assert.ok(Number.isFinite(titikNol),'lastVerifiedAt berupa waktu yang sah');
  /* Waktunya datang dari klaim token yang ditandatangani server, bukan jam perangkat. */
  const klaim=await modul.verifyActivationToken(record.activation_token,server.publicJwk);
  assert.equal(record.last_verified_at,klaim.issued_at,'titik nol memakai waktu server, bukan jam perangkat');
  assert.ok(Math.abs(titikNol-sebelum)<60000,'waktunya memang baru saja');
  assert.equal(modul.getLicenseState().state,'ACTIVE');
  assert.equal(modul.offlineGraceStatus().expired,false);
});

/* ----------------------------------------------------- 2-6. Batas 72 jam dan boundary-nya */

test('2-4. Offline 1 jam, 24 jam, dan 71 jam masih boleh masuk',async()=>{
  for(const jam of [1,24,71]){
    siapkanPerangkat();
    geserVerifikasiLisensi(jam);
    const state=getLicenseState();
    assert.equal(state.canUseApp,true,`offline ${jam} jam: aplikasi tetap terbuka`);
    assert.equal(state.canEditData,true,`offline ${jam} jam: penginputan tetap penuh`);
    assert.equal(state.offline.expired,false,`offline ${jam} jam: masa tenggang belum habis`);
    assert.doesNotThrow(()=>assertLicenseAllowsLogin(),`offline ${jam} jam: gerbang login lolos`);
  }
});

test('5. Boundary tepat 72 jam masih diizinkan; lewat sedikit langsung diblokir',()=>{
  siapkanPerangkat();
  /* BATAS YANG DITETAPKAN: selisih TEPAT 72 jam masih boleh. Yang memblokir hanyalah selisih
     yang LEBIH DARI 72 jam, supaya perangkat yang jamnya meleset beberapa detik di ujung masa
     tenggang tidak terkunci hanya karena pembulatan. */
  const record=bacaLisensiLokal();
  const pas=Date.now()-BATAS*JAM;
  globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,
    JSON.stringify({...record,last_verified_at:new Date(pas).toISOString()}));
  const tepat=getLicenseState({now:pas+BATAS*JAM});
  assert.equal(tepat.offline.elapsedMs,BATAS*JAM,'selisihnya benar-benar tepat 72 jam');
  assert.equal(tepat.offline.expired,false,'tepat 72 jam belum habis');
  assert.equal(tepat.canUseApp,true,'tepat 72 jam masih boleh masuk');

  const lewat=getLicenseState({now:pas+BATAS*JAM+1});
  assert.equal(lewat.offline.expired,true,'lebih dari 72 jam sudah habis');
  assert.equal(lewat.canUseApp,false,'lebih dari 72 jam diblokir');
});

test('6. Offline lebih dari 72 jam memblokir login dan meminta internet, bukan menyebut dicabut',()=>{
  siapkanPerangkat();
  geserVerifikasiLisensi(BATAS+1);
  const state=getLicenseState();
  assert.equal(state.state,'GRACE_EXPIRED');
  assert.equal(state.canUseApp,false,'login diblokir');
  assert.equal(state.needsVerification,true,'ditandai butuh verifikasi, bukan pencabutan');
  assert.match(state.message,/Lisensi perlu diverifikasi/);
  assert.match(state.message,/internet/i,'pengguna diberi tahu cukup menyambungkan internet');
  /* Pesannya tidak boleh menuduh lisensi dicabut: server memang belum berhasil dihubungi. */
  assert.doesNotMatch(state.message,/dicabut|ditangguhkan|tidak valid/i);
  const galat=tangkap(()=>assertLicenseAllowsLogin());
  assert.match(galat.message,/Lisensi perlu diverifikasi/);
  assert.equal(galat.code,'LICENSE_BLOCKED');
  assert.equal(galat.needsVerification,true);
});

test('7. Kembali online dengan status ACTIVE memulihkan akses setelah masa tenggang habis',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  const [kunci]=await server.buatLisensi(1);
  await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji',npsn:'12345678'}});

  /* Perangkat dibiarkan offline melewati batas. */
  const record=JSON.parse(globalThis.localStorage.getItem(LICENSE_STORAGE_KEY));
  const lampau=new Date(Date.now()-(BATAS+5)*JAM).toISOString();
  globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,JSON.stringify({...record,
    issued_at:lampau,last_successful_check_at:lampau,last_verified_at:lampau,clock_seen_at:lampau}));
  assert.equal(modul.getLicenseState().canUseApp,false,'sebelum tersambung: terblokir');

  const sesudah=await modul.checkLicense({force:true});
  assert.equal(sesudah.status,'ACTIVE');
  assert.equal(modul.getLicenseState().state,'ACTIVE','akses kembali normal setelah verifikasi');
  assert.ok(Date.parse(sesudah.last_verified_at)>Date.parse(lampau),'titik nol diperbarui');
  assert.equal(modul.offlineGraceStatus().expired,false,'masa tenggang 72 jam dimulai lagi');
});

/* ------------------------------- 8-12. Jawaban server mengalahkan masa tenggang offline */

test('8. Verifikasi ACTIVE satu jam lalu tidak menolong ketika server menjawab REVOKED',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  const [kunci]=await server.buatLisensi(1);
  const record=await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji',npsn:'12345678'}});

  /* Verifikasi terakhir sengaja dibuat baru satu jam lalu - masa tenggangnya masih 71 jam. */
  const satuJamLalu=new Date(Date.now()-JAM).toISOString();
  globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,
    JSON.stringify({...record,last_verified_at:satuJamLalu,last_successful_check_at:satuJamLalu}));
  assert.equal(modul.getLicenseState().canUseApp,true,'sebelum dicabut masih boleh dipakai');
  assert.ok(modul.offlineGraceStatus().remainingMs>70*JAM,'masa tenggangnya memang masih panjang');

  const token=await server.ownerToken();
  await server.call(`/owner/licenses/${record.license_id}/revoke`,{method:'POST',token,body:{reason:'uji'}});

  const sesudah=await modul.checkLicense({force:true});
  assert.equal(sesudah.status,'REVOKED','jawaban server menjadi status perangkat');
  const state=modul.getLicenseState();
  assert.equal(state.state,'REVOKED');
  assert.equal(state.canUseApp,false,'langsung diblokir, masa tenggang tidak menutupinya');
  assert.match(state.message,/dicabut/i);
});

test('9-11. REVOKED, SUSPENDED, dan INVALID tidak pernah mendapat masa tenggang',()=>{
  for(const status of ['REVOKED','SUSPENDED','INVALID','NOT_BOUND']){
    siapkanPerangkat();
    /* Verifikasi ACTIVE-nya sengaja dibuat sebaru mungkin: kalau masa tenggang sampai
       menolong salah satu status ini, di sinilah ia akan ketahuan. */
    cabutLisensiLokal(status);
    const state=getLicenseState();
    assert.equal(state.state,status,`${status}: statusnya dikenali apa adanya`);
    assert.equal(state.canUseApp,false,`${status}: akses diputus tanpa masa tenggang`);
    assert.equal(state.canEditData,false,`${status}: penyuntingan tertutup`);
    assert.ok(state.message,`${status}: pengguna diberi keterangan`);
    assert.equal(state.needsVerification,undefined,`${status}: bukan sekadar butuh verifikasi`);
    const galat=tangkap(()=>assertLicenseAllowsLogin());
    assert.equal(galat.code,'LICENSE_BLOCKED');
    assert.equal(galat.needsVerification,false,`${status}: bukan kasus "sambungkan internet"`);
  }
});

test('12. Gagal jaringan berbeda dari jawaban REVOKED: hanya yang pertama mendapat tenggang',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  const [kunci]=await server.buatLisensi(1);
  const record=await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji',npsn:'12345678'}});

  /* A. Server benar-benar tidak dapat dihubungi. */
  const fetchAsli=globalThis.fetch;
  globalThis.fetch=()=>Promise.reject(new Error('offline'));
  const offline=await modul.checkLicense({force:true});
  globalThis.fetch=fetchAsli;
  assert.equal(offline.status,'ACTIVE','gagal jaringan TIDAK PERNAH dianggap lisensi dicabut');
  assert.equal(offline.last_check_error,'NETWORK','alasannya dicatat sebagai kegagalan konektivitas');
  assert.ok(offline.last_offline_at,'waktu gagal terhubung dicatat');
  assert.equal(offline.last_verified_at,record.last_verified_at,'titik nol TIDAK diperbarui oleh kegagalan');
  assert.equal(modul.getLicenseState().canUseApp,true,'masa tenggang berjalan, aplikasi tetap terbuka');

  /* B. Server menjawab, dan jawabannya lisensi dicabut. */
  const token=await server.ownerToken();
  await server.call(`/owner/licenses/${record.license_id}/revoke`,{method:'POST',token,body:{reason:'uji'}});
  const dijawab=await modul.checkLicense({force:true});
  assert.equal(dijawab.status,'REVOKED');
  assert.equal(dijawab.last_check_error,'REVOKED','jawaban server dicatat sebagai jawaban, bukan gangguan jaringan');
  assert.equal(modul.getLicenseState().canUseApp,false,'jawaban server langsung memutus akses');

  /* Sumbernya menegaskan pembedaan itu, bukan sekadar kebetulan perilaku. */
  const sumber=(await import('node:fs')).readFileSync(new URL('../src/services/license.js',import.meta.url),'utf8');
  assert.match(sumber,/STATUS_DITOLAK_SERVER/,'daftar jawaban server yang memblokir dipisahkan sendiri');
  assert.equal(/catch\s*\{\s*return\s*\{[^}]*canUseApp:\s*true/.test(sumber),false,
    'tidak ada fallback "gagal berarti boleh offline"');
});

/* --------------------------------------- 13-15. Berlaku untuk Admin maupun Guru, dua lapis */

test('13-15. Masa tenggang berlaku untuk Admin dan Guru, tetapi Guru nonaktif tetap ditolak',async()=>{
  siapkanPerangkat();
  await ensureSecurityBootstrap();
  const hash=await createPasswordHash('AdminKuat#2026');
  updateDb(next=>{next.userAccounts.admin={...next.userAccounts.admin,passwordHash:hash,
    requiresActivation:false,active:true};next.security={...next.security,ownerActivated:true};return next;});
  await setTeacherActive({role:'admin'},'5B',true);

  /* Masih dalam masa tenggang: keduanya boleh masuk. */
  geserVerifikasiLisensi(48);
  const admin=await authenticate({role:'admin',username:'Admin',password:'AdminKuat#2026',semester});
  assert.equal(admin.role,'admin','13. Admin boleh masuk selama masa tenggang');
  const wali=await authenticate({role:'teacher',username:'Guru5B',password:'Kelas5b',semester});
  assert.equal(wali.classId,'5B','14. Guru aktif boleh masuk selama masa tenggang');

  /* Lapis kedua tetap berdiri: masa tenggang bukan izin untuk akun yang belum diaktifkan. */
  const belumAktif=await assert.rejects(
    ()=>authenticate({role:'teacher',username:'Guru6A',password:'Kelas6a',semester}),
    /belum diaktifkan Admin/);
  void belumAktif;
  const galat=await authenticate({role:'teacher',username:'Guru6A',password:'Kelas6a',semester})
    .then(()=>null).catch(error=>error);
  assert.equal(galat.code,'ACCOUNT_INACTIVE','15. Guru nonaktif ditolak karena akunnya, bukan lisensinya');

  /* Lewat batas: keduanya ikut terblokir oleh lisensi. */
  geserVerifikasiLisensi(BATAS+2);
  for(const [peran,nama,sandi] of [['admin','Admin','AdminKuat#2026'],['teacher','Guru5B','Kelas5b']]){
    const ditolak=await authenticate({role:peran,username:nama,password:sandi,semester})
      .then(()=>null).catch(error=>error);
    assert.equal(ditolak.code,'LICENSE_BLOCKED',`${nama}: ikut terblokir setelah masa tenggang habis`);
  }
});

/* ------------------------------------------------------------ 16. Jam mundur tidak menolong */

test('16. Memundurkan jam perangkat tidak memperpanjang masa tenggang',()=>{
  siapkanPerangkat();
  const sekarang=Date.now();
  /* Perangkat terakhir diverifikasi 80 jam lalu dan aplikasi pernah dibuka pada waktu itu, jadi
     clock_seen_at sudah tercatat. Pengguna lalu memundurkan tanggal 5 hari ke belakang. */
  geserVerifikasiLisensi(BATAS+8);
  noteClockObservation(sekarang);
  const dimundurkan=sekarang-5*24*JAM;
  const state=getLicenseState({now:dimundurkan});
  assert.equal(state.state,'GRACE_EXPIRED','jam mundur tidak mengembalikan akses');
  assert.equal(state.canUseApp,false);
  assert.ok(offlineGraceStatus(bacaLisensiLokal(),dimundurkan).elapsedMs>BATAS*JAM,
    'perhitungan tetap memakai waktu tertinggi yang pernah dilihat');

  /* Koreksi waktu yang wajar tidak boleh merusak penggunaan normal. */
  siapkanPerangkat();
  geserVerifikasiLisensi(1);
  noteClockObservation(sekarang);
  const koreksiKecil=sekarang-(LICENSE_CLOCK_TOLERANCE_MINUTES-1)*60000;
  assert.equal(getLicenseState({now:koreksiKecil}).canUseApp,true,
    'jam yang meleset beberapa menit tetap dianggap normal');
  /* Dan catatan waktunya tidak pernah turun. */
  const sebelum=bacaLisensiLokal().clock_seen_at;
  noteClockObservation(sekarang-10*24*JAM);
  assert.equal(bacaLisensiLokal().clock_seen_at,sebelum,'clock_seen_at tidak pernah dimundurkan');
});

/* ------------------------------------------------------------- 17. Data tidak pernah hilang */

test('17. Habisnya masa tenggang dan pencabutan tidak menghapus satu pun data akademik',async()=>{
  siapkanPerangkat();
  saveSchoolIdentitySetup({name:'SDN Uji Tenggang',npsn:'12345678',status:'Negeri',address:'Jl',
    village:'Desa',district:'Kecamatan',city:'Kabupaten',province:'Provinsi',postalCode:'17510',
    phone:'021',email:'a@contoh.sch.id',website:'',registrationNumber:'',
    principalName:'Kepala',principalNip:'1980',schoolLogo:''});
  const sesi=guru();
  createStudent(sesi,{classId:'5B',nis:'T1',nisn:'9000000009',name:'Siswa Tenggang',gender:'L',
    religion:'Islam',birthPlace:'Kota',birthDate:'2015-01-02',parentName:'Ortu',phone:'08',address:'Jl',photo:''});
  const sebelum=JSON.stringify(loadDb());

  geserVerifikasiLisensi(BATAS+10);
  assert.equal(getLicenseState().canUseApp,false,'aksesnya memang sudah diputus');
  assert.equal(JSON.stringify(loadDb()),sebelum,'tidak satu pun baris database berubah');
  cabutLisensiLokal('REVOKED');
  assert.equal(JSON.stringify(loadDb()),sebelum,'pencabutan pun tidak mengubah apa pun');
  assert.equal(listStudents(sesi,{classId:'5B'}).length,1,'siswa tetap ada');
  assert.ok(bacaLisensiLokal().activation_token,'License Key lokal tidak ikut dihapus');
  await ensureSecurityBootstrap();
  const akunSebelum=Object.keys(loadDb().userAccounts).length;
  assert.ok(akunSebelum>=CLASSES.length,'akun Guru setiap rombel memang ada');
  geserVerifikasiLisensi(BATAS+20);
  cabutLisensiLokal('REVOKED');
  assert.equal(Object.keys(loadDb().userAccounts).length,akunSebelum,'tidak satu pun akun dihapus');

  /* Layanan lisensi memang tidak punya jalan untuk menghapus data. */
  const sumber=(await import('node:fs')).readFileSync(new URL('../src/services/license.js',import.meta.url),'utf8');
  for(const larangan of ['localStorage.clear()','replaceDb(','delete db.','updateDb('])
    assert.equal(sumber.includes(larangan),false,`layanan lisensi tidak pernah ${larangan}`);
});

/* -------------------------------------- 18-20. Lisensi baru, reactivate, dan satu perangkat */

test('18. License Key baru yang sah memulai masa tenggang baru dan data lama tetap utuh',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  invalidateDbCache();
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  const sesi=guru();
  createStudent(sesi,{classId:'5B',nis:'T2',nisn:'9000000010',name:'Siswa Lama',gender:'P',
    religion:'Islam',birthPlace:'Kota',birthDate:'2015-02-02',parentName:'Ortu',phone:'08',address:'Jl',photo:''});

  const [lama,baru]=await server.buatLisensi(2);
  const record=await modul.activateLicense({licenseKey:lama.key,school:{name:'SDN Uji',npsn:'12345678'}});
  const token=await server.ownerToken();
  await server.call(`/owner/licenses/${record.license_id}/revoke`,{method:'POST',token,body:{reason:'uji'}});
  await modul.checkLicense({force:true});
  assert.equal(modul.getLicenseState().canUseApp,false,'lisensi lama dicabut, akses terputus');

  const segar=await modul.activateLicense({licenseKey:baru.key,school:{name:'SDN Uji',npsn:'12345678'}});
  assert.equal(segar.status,'ACTIVE');
  assert.notEqual(segar.license_id,record.license_id,'lisensi yang dipakai memang kunci baru');
  assert.equal(modul.getLicenseState().state,'ACTIVE','akses kembali normal');
  assert.ok(Date.now()-Date.parse(segar.last_verified_at)<60000,'masa tenggang dihitung dari verifikasi baru');
  assert.equal(listStudents(sesi,{classId:'5B'})[0].name,'Siswa Lama','data akademik lama tetap utuh');
});

test('19. Reactivate oleh Owner memulihkan akses dan memulai masa tenggang baru',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  const [kunci]=await server.buatLisensi(1);
  const record=await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji',npsn:'12345678'}});
  const token=await server.ownerToken();

  await server.call(`/owner/licenses/${record.license_id}/revoke`,{method:'POST',token,body:{reason:'uji'}});
  await modul.checkLicense({force:true});
  assert.equal(modul.getLicenseState().state,'REVOKED');

  await server.call(`/owner/licenses/${record.license_id}/reactivate`,{method:'POST',token,body:{reason:'uji'}});
  const pulih=await modul.checkLicense({force:true});
  assert.equal(pulih.status,'ACTIVE','status kembali ACTIVE setelah dipulihkan');
  assert.equal(modul.getLicenseState().state,'ACTIVE','akses kembali normal');
  assert.equal(modul.offlineGraceStatus().expired,false,'masa tenggang 72 jam dimulai dari verifikasi ini');
});

test('20. Aturan satu lisensi = satu perangkat aktif tetap utuh',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  const [kunci]=await server.buatLisensi(1);
  const pertama=await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji',npsn:'12345678'}});
  assert.equal(pertama.status,'ACTIVE');

  /* Perangkat kedua: instalasi baru, kunci yang sama. */
  const { resetInstallationId, getInstallationId }=await import('../src/services/installation.js');
  const perangkatLama=pertama.installation_id;
  resetInstallationId();
  assert.notEqual(getInstallationId(),perangkatLama,'perangkat kedua punya Installation ID sendiri');
  const ditolak=await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji',npsn:'12345678'}})
    .then(()=>null).catch(error=>error);
  assert.ok(ditolak,'perangkat kedua tidak boleh ikut aktif');
  assert.equal(ditolak.code,'ALREADY_ACTIVATED','satu lisensi tetap hanya untuk satu perangkat aktif');

  /* Masa tenggang offline tidak menambah satu pun perangkat aktif. */
  const daftar=await server.store.query('SELECT * FROM device_activations WHERE license_id=$1 AND is_active=TRUE',
    [pertama.license_id]);
  assert.equal(daftar.rows.length,1,'tetap tepat satu perangkat aktif di server');
});

/* ------------------------------------------- Pemberitahuan ringan selama masa tenggang */

test('Masa tenggang yang sedang berjalan diberi tahu tanpa menutup satu pun halaman',async()=>{
  siapkanPerangkat();
  geserVerifikasiLisensi(40);
  const state=getLicenseState();
  assert.equal(state.state,'GRACE','lewat separuh masa tenggang, pemeriksaan sudah jatuh tempo');
  assert.equal(state.canUseApp,true,'aplikasi tetap berjalan penuh');
  assert.equal(state.canEditData,true,'tidak ada halaman yang ditutup');
  assert.match(state.message,/verifikasi lisensi offline/i,'keterangannya jujur menyebut verifikasi offline');
  assert.match(state.message,/Sambungkan internet/,'dan menyebutkan apa yang perlu dilakukan');
  assert.equal(isCheckDue(bacaLisensiLokal()),true,'pemeriksaan berikutnya memang dijadwalkan');

  /* app.js menampilkan keterangan itu pada baris status, bukan sebagai penguncian. */
  const app=(await import('node:fs')).readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/licenseState\.state!=='GRACE'/,'keadaan GRACE ikut memunculkan baris keterangan');
});

test('Halaman Aktivasi menawarkan pemeriksaan ulang ketika yang kurang hanya internet',async()=>{
  const halaman=(await import('node:fs')).readFileSync(new URL('../src/pages/license-activation.js',import.meta.url),'utf8');
  assert.match(halaman,/needsVerification===true/,'penawaran itu hanya muncul untuk masa tenggang yang habis');
  assert.match(halaman,/data-recheck/,'ada tombol pemeriksaan ulang');
  assert.match(halaman,/checkLicense\(\{force:true\}\)/,'tombolnya benar-benar menghubungi server lisensi');
  assert.match(halaman,/PERIKSA LISENSI SEKARANG/,'namanya jelas bagi pengguna');
  /* Halaman ini tetap tidak pernah menyentuh data sekolah. */
  for(const larangan of ['localStorage.clear()','updateDb(','replaceDb('])
    assert.equal(halaman.includes(larangan),false,`halaman aktivasi tidak pernah ${larangan}`);
});
