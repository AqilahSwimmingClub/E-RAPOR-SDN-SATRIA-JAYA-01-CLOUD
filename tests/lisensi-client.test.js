import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startTestServer } from './helpers/license-server.js';
import { installBrowserEnv } from './helpers/license-server.js';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { getSchoolMaster, saveSchoolIdentitySetup } from '../src/services/master.js';
import { buildBackup, restoreBackup, validateBackupPayload } from '../src/services/backup.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, storageKey } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { getInstallationId, isInstallationId, resetInstallationId } from '../src/services/installation.js';
import { INSTALLATION_STORAGE_KEY, LICENSE_STORAGE_KEY } from '../src/data/license-config.js';

/* Sisi aplikasi sekolah. Yang diuji di sini: identitas instalasi, verifikasi token, perilaku
   offline, mode terbatas, dan yang paling penting — lisensi tidak pernah ikut berpindah lewat
   berkas backup. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
const admin={role:'admin'};

function siapkanSekolah(){
  installBrowserEnv();
  invalidateDbCache();
  saveSchoolIdentitySetup({name:'SDN Contoh Nusantara 02',npsn:'12345678',status:'Negeri',
    address:'Jl Contoh',village:'Desa',district:'Kecamatan',city:'Kabupaten Contoh',province:'Provinsi',
    postalCode:'17510',phone:'021',email:'a@contoh.sch.id',website:'',registrationNumber:'',
    principalName:'Kepala',principalNip:'1980',schoolLogo:''});
  return getSchoolMaster();
}

/* Modul lisensi dimuat ulang agar membaca konfigurasi yang baru dipasang tiap test. */
async function muatLisensi(server){
  const config=await import(`../src/data/license-config.js?t=${Math.random()}`);
  const modul=await import(`../src/services/license.js?t=${Math.random()}`);
  return {modul,config};
}

/* ------------------------------------------------------- 01-03. Gerbang alur aplikasi */

test('01-03. Alur fresh install: aktivasi lisensi lebih dulu, baru setup sekolah',()=>{
  const app=read('src/app.js');
  /* Urutannya pernah terbalik: Setup Awal diperiksa duluan, sehingga instalasi baru yang belum
     punya identitas sekolah langsung membuka Setup Awal dan aktivasi terlewat sama sekali. */
  assert.match(app,/if\(!startupError&&!licenseState\.canUseApp\)\{/,'tanpa lisensi aplikasi berhenti di gerbang aktivasi');
  assert.match(app,/app\.append\(renderLicenseActivation\(/,'halaman aktivasi yang ditampilkan');
  assert.match(app,/if\(!startupError&&!isSchoolIdentityReady\(\)\)/,'setup sekolah tetap ada sebagai gerbang berikutnya');
  assert.match(app,/renderSchoolSetup\(\{onComplete:\(\)=>navigate\('login'\)\}\)/,'setup selesai lanjut ke login');
  assert.ok(app.indexOf('!licenseState.canUseApp')<app.indexOf('!isSchoolIdentityReady()'),
    'gerbang lisensi wajib dievaluasi sebelum gerbang Setup Awal');
  /* Gerbang lisensi berada sebelum resolusi route mana pun, termasuk dashboard. */
  assert.ok(app.indexOf('licenseState.canUseApp')<app.indexOf('const route=resolveRoute'),
    'lisensi diperiksa sebelum route diselesaikan');
});

test('Installation ID acak, berformat tetap, dan bertahan antar pemanggilan',()=>{
  installBrowserEnv();
  const pertama=getInstallationId();
  assert.ok(isInstallationId(pertama),`format Installation ID benar: ${pertama}`);
  assert.equal(getInstallationId(),pertama,'nilainya bertahan, tidak dibuat ulang setiap kali');
  const kumpulan=new Set();
  for(let i=0;i<200;i++){resetInstallationId();kumpulan.add(getInstallationId());}
  assert.equal(kumpulan.size,200,'setiap instalasi mendapat identitas berbeda');
  /* Tidak diturunkan dari identitas sekolah maupun perangkat keras. */
  /* Komentar dibuang lebih dulu supaya yang diperiksa benar-benar kodenya. */
  const sumber=read('src/services/installation.js').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  for(const larangan of ['getSchoolMaster','npsn','NPSN','imei','IMEI','userAgent','phone','Date.now'])
    assert.equal(sumber.includes(larangan),false,`Installation ID tidak memakai ${larangan}`);
  assert.match(sumber,/crypto\.getRandomValues/,'dibuat dengan acak kriptografis');
});

/* ------------------------------------------------- 04-08. Aktivasi nyata lalu offline */

test('04-08. Aktivasi nyata, token terverifikasi, dan aplikasi tetap jalan saat offline',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  siapkanSekolah();
  const [lisensi]=await server.buatLisensi(1,{schoolName:'SDN Contoh Nusantara 02'});
  const {modul}=await muatLisensi(server);

  /* Konfigurasi client disuntik seperti hasil pemasangan di lapangan. */
  const config=await import('../src/data/license-config.js');
  const asliFetch=globalThis.fetch;
  globalThis.fetch=(url,init)=>asliFetch(`${server.base}${String(url).replace(/^.*\/api\/v1/,'/api/v1')}`,init);
  const publicJwk=server.publicJwk;

  /* activateLicense memakai LICENSE_API_BASE/PUBLIC_JWK dari modul konfigurasi; pada test,
     alur setara dijalankan langsung agar tidak perlu menulis rahasia ke berkas repo. */
  const payload=modul.buildActivationPayload({licenseKey:lisensi.key,school:getSchoolMaster()});
  assert.equal(payload.installation_id,getInstallationId());
  assert.equal(payload.school_name,'SDN Contoh Nusantara 02');
  for(const dilarang of ['students','scores','attendance','reports'])
    assert.equal(Object.hasOwn(payload,dilarang),false,`payload aktivasi tidak membawa ${dilarang}`);

  const {data}=await server.call('/activate',{method:'POST',body:payload});
  assert.equal(data.status,'ACTIVE');
  const klaim=await modul.verifyActivationToken(data.activation_token,publicJwk);
  assert.ok(klaim,'token terverifikasi dengan kunci publik di sisi client');
  assert.equal(klaim.installation_id,getInstallationId());

  /* Token yang dirusak satu huruf harus ditolak. */
  const rusak=`${data.activation_token.slice(0,-3)}AAA`;
  assert.equal(await modul.verifyActivationToken(rusak,publicJwk),null,'tanda tangan palsu ditolak');
  /* Token yang ditandatangani kunci lain juga ditolak. */
  const serverLain=await startTestServer();t.after(()=>serverLain.close());
  assert.equal(await modul.verifyActivationToken(data.activation_token,serverLain.publicJwk),null,
    'token dari kunci lain tidak diterima');

  /* Simpan hasil aktivasi seperti yang dilakukan aplikasi, lalu putuskan jaringan. */
  globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,JSON.stringify({schema:1,
    activation_token:data.activation_token,license_id:klaim.license_id,license_hint:klaim.license_hint,
    installation_id:klaim.installation_id,status:'ACTIVE',issued_at:klaim.issued_at,
    next_check_at:klaim.next_check_at,last_successful_check_at:klaim.issued_at}));
  globalThis.fetch=()=>Promise.reject(new Error('offline'));

  const status=modul.getLicenseState();
  assert.equal(status.state,'ACTIVE');
  assert.equal(status.canUseApp,true,'aplikasi tetap dapat dipakai tanpa internet');
  assert.equal(status.canEditData,true,'penginputan data tetap terbuka saat offline');

  /* Data sekolah tetap dapat diinput saat offline. */
  const session=guru();
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:index<2,order:index+1})));
  createStudent(session,{classId:'5B',nis:'U1',nisn:'9000000001',name:'Siswa Sintetis',gender:'L',religion:'Islam',
    birthPlace:'Kota',birthDate:'2015-01-02',parentName:'Ortu',phone:'08',address:'Jl',photo:''});
  assert.equal(listStudents(session,{classId:'5B'}).length,1,'input siswa berhasil tanpa internet');
  /* Pemeriksaan berkala yang gagal karena jaringan tidak boleh mencabut lisensi. */
  const setelahGagal=await modul.checkLicense({force:true});
  assert.equal(setelahGagal.status,'ACTIVE','gagal menghubungi server tidak dianggap lisensi dicabut');
  globalThis.fetch=asliFetch;
  void config;
});

/* -------------------------------------------------- 10-12. Mode terbatas non-destruktif */

test('10-12. Suspended dan revoked membatasi penyuntingan tanpa menghapus data',async()=>{
  siapkanSekolah();
  const {modul}=await muatLisensi();
  const session=guru();
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:index<2,order:index+1})));
  createStudent(session,{classId:'5B',nis:'U1',nisn:'9000000001',name:'Siswa Sintetis',gender:'L',religion:'Islam',
    birthPlace:'Kota',birthDate:'2015-01-02',parentName:'Ortu',phone:'08',address:'Jl',photo:''});
  const sebelum=JSON.stringify(loadDb());

  /* Ditangguhkan, dicabut, dan tidak terikat sama-sama mengembalikan perangkat ke halaman
     Aktivasi Lisensi. Ketiganya adalah JAWABAN SERVER bahwa lisensi ini tidak boleh dipakai,
     jadi ketiganya memutus akses tanpa masa tenggang - termasuk SUSPENDED, yang sebelumnya
     masih membuka aplikasi dalam mode terbatas.

     Yang TIDAK berubah: data akademik lokal tetap utuh. Status lisensi tidak pernah menjadi
     alasan menghapus data sekolah, dan itulah yang diperiksa di bawah. */
  for(const [status,bolehDibuka] of [['SUSPENDED',false],['REVOKED',false],['NOT_BOUND',false]]){
    globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,JSON.stringify({schema:1,activation_token:'token',
      license_id:'lic',license_hint:'ERAPOR-••••-••••-AAAA',installation_id:getInstallationId(),status,
      issued_at:new Date().toISOString(),next_check_at:new Date(Date.now()+864e5).toISOString()}));
    const state=modul.getLicenseState();
    assert.equal(state.state,status);
    assert.equal(state.canUseApp,bolehDibuka,`${status}: gerbang aplikasi sesuai aturan`);
    assert.equal(state.canEditData,false,`${status}: penyuntingan data ditutup`);
    assert.ok(state.message,'pengguna diberi keterangan yang jelas');
    assert.equal(JSON.stringify(loadDb()),sebelum,`${status}: tidak ada satu pun data yang berubah`);
  }
  assert.equal(listStudents(session,{classId:'5B'}).length,1,'siswa tetap ada');

  /* Backup tetap dapat dibuat dalam mode terbatas: data sekolah tidak boleh menjadi sandera. */
  const app=read('src/app.js');
  assert.match(app,/READ_ONLY_SAFE_ROUTES=new Set\(\[[^\]]*'backup'/,'menu Backup tetap terbuka saat lisensi bermasalah');
  for(const larangan of ['localStorage.clear()','replaceDb({})','delete db.students'])
    assert.equal(read('src/services/license.js').includes(larangan),false,`layanan lisensi tidak pernah ${larangan}`);
});

test('Masa tenggang offline berjalan penuh, lalu berhenti setelah 72 jam',async()=>{
  siapkanSekolah();
  const {modul}=await muatLisensi();
  const jam=3600000;
  /* Masa tenggang diukur dari VERIFIKASI SERVER TERAKHIR yang menyatakan lisensi ACTIVE, bukan
     dari jadwal pemeriksaan berikutnya. Jadwal itu berjarak dua pekan, sehingga kalau ia yang
     dipakai perangkat dapat berbulan-bulan offline tanpa pernah memeriksa lisensinya. */
  const pasang=(jamLalu,nextCheck)=>{
    const diverifikasi=new Date(Date.now()-jamLalu*jam).toISOString();
    globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,JSON.stringify({schema:1,
      activation_token:'token',license_id:'lic',license_hint:'ERAPOR-••••-••••-AAAA',
      installation_id:getInstallationId(),status:'ACTIVE',issued_at:diverifikasi,
      last_verified_at:diverifikasi,next_check_at:nextCheck}));
  };

  pasang(1,new Date(Date.now()+5*24*jam).toISOString());
  assert.equal(modul.getLicenseState().state,'ACTIVE');

  /* Lewat separuh masa tenggang: aplikasi tetap penuh, hanya diberi tahu. */
  pasang(40,new Date(Date.now()+5*24*jam).toISOString());
  const tenggang=modul.getLicenseState();
  assert.equal(tenggang.state,'GRACE');
  assert.equal(tenggang.canEditData,true,'selama masa tenggang aplikasi tetap penuh');
  assert.match(tenggang.message,/Sambungkan internet/);

  /* Lewat 72 jam: akses diputus sampai lisensi berhasil diverifikasi lagi. Data tidak disentuh. */
  const sebelum=JSON.stringify(loadDb());
  pasang(80,new Date(Date.now()+5*24*jam).toISOString());
  const habis=modul.getLicenseState();
  assert.equal(habis.state,'GRACE_EXPIRED');
  assert.equal(habis.canUseApp,false,'lebih dari 72 jam tanpa verifikasi menutup akses');
  assert.equal(habis.canEditData,false);
  assert.match(habis.message,/Lisensi perlu diverifikasi/);
  assert.equal(JSON.stringify(loadDb()),sebelum,'tidak satu pun data berubah karenanya');
});

/* ---------------------------------------------- 13-15. Backup tidak memindahkan lisensi */

test('13-15. Backup tidak memuat token, Installation ID, atau ikatan perangkat',()=>{
  siapkanSekolah();
  const session=guru();
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:index<2,order:index+1})));
  createStudent(session,{classId:'5B',nis:'U1',nisn:'9000000001',name:'Siswa Sintetis',gender:'L',religion:'Islam',
    birthPlace:'Kota',birthDate:'2015-01-02',parentName:'Ortu',phone:'08',address:'Jl',photo:''});
  const installationId=getInstallationId();
  globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,JSON.stringify({schema:1,activation_token:'TOKEN-RAHASIA-A',
    license_id:'lic-a',license_hint:'ERAPOR-••••-••••-AAAA',installation_id:installationId,status:'ACTIVE'}));

  const payload=buildBackup(session);
  const teks=JSON.stringify(payload);
  for(const rahasia of ['TOKEN-RAHASIA-A','lic-a',installationId,LICENSE_STORAGE_KEY,INSTALLATION_STORAGE_KEY,'activation_token','license_hint'])
    assert.equal(teks.includes(rahasia),false,`berkas backup tidak memuat ${rahasia}`);
  /* Data sekolah tetap ikut seperti sebelumnya. */
  assert.ok(teks.includes('Siswa Sintetis'),'data siswa tetap ikut ke backup');
  assert.ok(teks.includes('SDN Contoh Nusantara 02'),'identitas sekolah tetap ikut ke backup');

  /* Restore ke perangkat lain: data sekolah pindah, lisensi tidak. */
  installBrowserEnv();
  invalidateDbCache();
  const instalasiB=getInstallationId();
  assert.notEqual(instalasiB,installationId,'perangkat kedua punya Installation ID sendiri');
  assert.doesNotThrow(()=>validateBackupPayload(payload));
  restoreBackup(payload,session);
  assert.equal(listStudents(session,{classId:'5B'}).length,1,'data sekolah ikut pindah');
  assert.equal(getSchoolMaster().name,'SDN Contoh Nusantara 02');
  assert.equal(globalThis.localStorage.getItem(LICENSE_STORAGE_KEY),null,'lisensi TIDAK ikut pindah');
  assert.equal(getInstallationId(),instalasiB,'Installation ID perangkat kedua tidak tertimpa');
});

test('Kunci penyimpanan lisensi memang terpisah dari database sekolah',()=>{
  const storage=read('src/services/storage.js');
  assert.match(storage,/const DB_KEY = 'erapor_satria_jaya_01_v1'/,'DB_KEY tidak berubah');
  assert.equal(LICENSE_STORAGE_KEY,'erapor_license_v1');
  assert.equal(INSTALLATION_STORAGE_KEY,'erapor_installation_v1');
  assert.notEqual(LICENSE_STORAGE_KEY,storageKey());
  /* Backup hanya mengekspor koleksi di dalam DB_KEY, sehingga pemisahan ini yang menjamin
     lisensi tidak pernah ikut. */
  const backup=read('src/services/backup.js');
  for(const larangan of ['LICENSE_STORAGE_KEY','INSTALLATION_STORAGE_KEY','activation_token','installation_id'])
    assert.equal(backup.includes(larangan),false,`backup tidak menyentuh ${larangan}`);
});

/* ----------------------------------------------------------- 29-30. Kunci tersamar saja */

test('29-30. Aplikasi sekolah hanya menampilkan kunci tersamar dan tidak menuliskannya ke log',async()=>{
  siapkanSekolah();
  const {modul}=await muatLisensi();
  assert.equal(modul.maskLicenseKey('ERAPOR-VRDK-XD2X-TT6F'),'ERAPOR-••••-••••-TT6F');
  globalThis.localStorage.setItem(LICENSE_STORAGE_KEY,JSON.stringify({schema:1,activation_token:'t',
    license_id:'lic',license_hint:'ERAPOR-••••-••••-TT6F',installation_id:getInstallationId(),status:'ACTIVE'}));
  const tampil=modul.getLicenseDisplay();
  assert.equal(tampil.hint,'ERAPOR-••••-••••-TT6F');
  assert.equal(JSON.stringify(tampil).includes('VRDK'),false,'grup awal kunci tidak pernah ditampilkan');

  /* Tidak ada tombol apa pun di aplikasi sekolah untuk mengambil kunci utuh dari server. */
  const halaman=read('src/pages/license-activation.js');
  for(const larangan of ['/recover','recovery','owner/','license_key:record','fullKey'])
    assert.equal(halaman.includes(larangan),false,`halaman sekolah tidak menyediakan ${larangan}`);
  /* Tidak ada console.log yang membawa kunci pada seluruh jalur lisensi client. */
  for(const berkas of ['src/services/license.js','src/services/installation.js','src/pages/license-activation.js']){
    const isi=read(berkas);
    assert.equal(/console\.(log|info|warn|error)/.test(isi),false,`${berkas} tidak menulis ke console`);
  }
});
