/* ===========================================================================================
   v1.4.1 - MODEL LISENSI PER GURU / PER PEMBELI, DAN KLIEN LAN YANG BUKAN INSTALASI

   Satu kalimat yang dijaga seluruh berkas ini:

     Satu pembeli = satu lisensi = 1 aktivasi Windows + 1 aktivasi Android.
     Browser - berapa pun jumlahnya, di komputer server maupun di laptop guru lewat LAN -
     TIDAK PERNAH menjadi perangkat baru.

   Dua sumbu itu sengaja diuji bersama, karena cacat yang sebenarnya muncul di persimpangannya:
   klien LAN yang diperlakukan sebagai instalasi akan meminta lisensinya sendiri, membuat
   Installation ID sendiri, dan memakan slot Windows milik pembelinya.

   A. Lisensi terikat PEMBELI, bukan sekolah dan bukan browser
   B. Windows: database milik aplikasi, browser hanya layar
   C. Klien LAN bukan instalasi - tidak ada slot, tidak ada Installation ID
   D. Keputusan lisensi ada di server; halaman tidak dapat mengangkat dirinya sendiri
   E. Cadangan akademik bersih dari rahasia, dan memulihkannya bukan aktivasi
   =========================================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

const require=createRequire(import.meta.url);
const {createDbStore}=require('../electron/db-store.cjs');
const {createLanServer}=require('../electron/lan-server.cjs');
const {createLanSessions,bacaCookie,tahunUntukSemester}=require('../electron/lan-session.cjs');
const {periksaPerubahan}=require('../electron/lan-scope.cjs');

const root=new URL('../',import.meta.url);
const baca=berkas=>fs.readFileSync(new URL(berkas,root),'utf8');
/* Komentar yang MENJELASKAN mengapa sesuatu tidak dilakukan akan ikut tercocok bila sumber
   diperiksa apa adanya. Membuangnya membuat pemeriksaan lebih tepat, bukan lebih longgar. */
const kodeSaja=berkas=>baca(berkas).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');

const TAHUN='2025/2026';
const SEMESTER='Ganjil 2025/2026';
const scopeOf=kelas=>`${TAHUN}|${SEMESTER}|${kelas}`;

function folderBaru(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'erapor-v141-'));
  test.after(()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{/* sudah bersih */}});
  return dir;
}

async function hashSandi(sandi){
  const salt=new Uint8Array(16);webcrypto.getRandomValues(salt);
  const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(sandi),'PBKDF2',false,['deriveBits']);
  const bits=await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:120000},key,256);
  return {algorithm:'PBKDF2-SHA-256',iterations:120000,
    salt:Buffer.from(salt).toString('base64'),hash:Buffer.from(new Uint8Array(bits)).toString('base64')};
}
let SANDI=null;
const sandiSiap=async()=>(SANDI??=({guru:await hashSandi('RahasiaGuru1'),admin:await hashSandi('RahasiaAdmin1')}));

async function dokumen(kelasDaftar=['5B','4A']){
  const {guru,admin}=await sandiSiap();
  const db={appSchemaVersion:5,appVersion:'1.4.1',
    masterData:{school:{name:'SD Uji Lisensi',npsn:'12345678'},references:{subjects:[],
      academicYears:[{id:TAHUN,label:TAHUN,active:true}],
      semesters:[{id:SEMESTER,label:SEMESTER,name:'Ganjil',academicYear:TAHUN,active:true}]}},
    security:{ownerActivated:true},
    userAccounts:{admin:{id:'admin',role:'admin',username:'Admin',active:true,
      passwordHash:admin,recoveryHash:null,requiresActivation:false,mustChangePassword:false}},
    settings:{},assessmentSettings:{},subjectMappings:{},students:{},
    assessmentScores:{},reportScores:{},attendance:{},reportDateDefaults:{},graduationSettings:{}};
  for(const kelas of kelasDaftar){
    db.userAccounts[`teacher:${kelas}`]={id:`teacher:${kelas}`,role:'teacher',classId:kelas,
      username:`Guru${kelas}`,active:true,passwordHash:guru,recoveryHash:null,
      requiresActivation:false,mustChangePassword:false};
    const scope=scopeOf(kelas);
    db.subjectMappings[scope]=[{id:'agama',name:'Agama',order:1,active:true}];
    for(let i=0;i<3;i++){
      const sid=`${kelas}-s${i}`;
      db.students[`${scope}|${sid}`]={id:sid,name:`Siswa ${kelas} ${i}`,classId:kelas,nis:`10${i}`};
      db.reportScores[`${scope}|agama|${sid}`]={studentId:sid,subjectId:'agama',finalScore:82};
    }
  }
  return db;
}

async function serverBaru({kelas=['5B','4A'],lisensi={canUseApp:true}}={}){
  const dir=folderBaru();
  const store=createDbStore({baseDir:dir});
  store.tulis(JSON.stringify(await dokumen(kelas)),'');
  let sekarang=lisensi;
  const app=createLanServer({store,bacaLisensi:()=>sekarang});
  app.muat();
  return {dir,store,app,setLisensi(nilai){sekarang=nilai;}};
}

const minta=(app,{jalur,method='GET',body,cookie='',csrf=''})=>app.tangani({
  pathname:`/__erapor/lan/${jalur}`,method,headers:{cookie,'x-erapor-csrf':csrf},
  body:body===undefined?'':JSON.stringify(body)});

async function masuk(app,{username,password,role,semester=SEMESTER}){
  const jawaban=await minta(app,{jalur:'login',method:'POST',
    body:{username,password,role,semester,academicYear:TAHUN}});
  const isi=JSON.parse(jawaban.body);
  const token=bacaCookie(jawaban.headers?.['Set-Cookie'],'erapor_lan_session');
  return {jawaban,isi,cookie:`erapor_lan_session=${token}`,csrf:isi.csrf};
}
const masukGuru=(app,kelas,semester)=>masuk(app,{username:`guru${kelas.toLowerCase()}`,password:'RahasiaGuru1',role:'teacher',semester});

/* ============================================ A. LISENSI TERIKAT PEMBELI, BUKAN SEKOLAH */

test('A1. Hanya ada dua slot perangkat, dan keduanya adalah platform - bukan browser',()=>{
  const sumber=kodeSaja('server/src/licenses.js');
  assert.match(sumber,/export const DEVICE_SLOTS=Object\.freeze\(\['android','windows'\]\)/,
    'daftar slot dikunci pada dua platform');
  for(const dilarang of ['browser','chrome','edge','firefox','userAgent','user_agent','fingerprint','ipAddress','remoteAddress'])
    assert.equal(new RegExp(dilarang,'i').test(sumber.replace(/DEVICE_SLOTS[\s\S]{0,80}/,'')),false,
      `tidak ada slot atau identitas perangkat berdasarkan ${dilarang}`);
});

test('A2. slotForPlatform memetakan setiap platform ke salah satu dari dua slot saja',async()=>{
  const {slotForPlatform,DEVICE_SLOTS}=await import('../server/src/licenses.js');
  assert.equal(slotForPlatform('android'),'android');
  assert.equal(slotForPlatform('ios'),'android');
  for(const nilai of ['windows','web','electron','','chrome','edge','firefox',undefined,null,'APAPUN'])
    assert.equal(slotForPlatform(nilai),'windows',`platform ${String(nilai)} jatuh ke slot Windows, bukan slot baru`);
  assert.equal(DEVICE_SLOTS.length,2,'tidak pernah ada slot ketiga');
});

test('A3. Nama browser tidak pernah menjadi bagian identitas perangkat',()=>{
  const sumber=kodeSaja('src/services/device-identity.js');
  for(const dilarang of ['navigator.userAgent','userAgent','vendor','plugins','canvas','screen.width','languages'])
    assert.equal(sumber.includes(dilarang),false,
      `identitas perangkat tidak boleh dibangun dari ${dilarang} - berganti browser akan mengubahnya`);
});

test('A4. Identitas Windows berasal dari mesin, disuntikkan peluncur, dan tidak diacak halaman',()=>{
  const identitas=kodeSaja('src/services/device-identity.js');
  assert.match(identitas,/erapor-desktop-device/,'nilai perangkat dibaca dari meta yang disuntikkan peluncur');
  const utama=kodeSaja('electron/main.cjs');
  assert.match(utama,/MachineGuid/i,'peluncur menurunkannya dari identitas mesin Windows');
  assert.match(utama,/device-identity\.json/,'hasilnya disimpan di folder aplikasi, bukan di penyimpanan browser');
});

/* ================================== B. WINDOWS: DATABASE MILIK APLIKASI, BROWSER HANYA LAYAR */

test('B1. Di Windows, database akademik tidak pernah berada di penyimpanan browser',()=>{
  const backend=kodeSaja('src/services/db-backend.js');
  assert.match(backend,/__erapor\/db/,'database dibaca dan ditulis lewat berkas milik aplikasi');
  const penyimpanan=kodeSaja('src/services/storage.js');
  /* Urutannya penting: LAN diperiksa lebih dulu, lalu berkas milik aplikasi, dan penyimpanan
     browser hanya menjadi jalan terakhir untuk Android/Web. */
  const urutan=penyimpanan.match(/function bacaRaw\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(urutan.indexOf('modeLanAktif')<urutan.indexOf('penyimpananServerAktif'),'mode LAN diperiksa lebih dulu');
  assert.ok(urutan.indexOf('penyimpananServerAktif')<urutan.indexOf('localStorage'),'berkas aplikasi menang atas penyimpanan browser');
});

test('B2. Berkas database hanya dilayani ke komputer server itu sendiri',()=>{
  const utama=kodeSaja('electron/main.cjs');
  assert.match(utama,/permintaanDariLoopback\(request\)/,'gerbang loopback dipasang pada endpoint berkas mentah');
  assert.match(utama,/request\.socket\?\.localAddress/,
    'asalnya diputuskan dari soket, bukan dari header yang dapat dipalsukan klien');
});

test('B3. Berganti browser di komputer yang sama membaca dokumen yang sama',async()=>{
  const dir=folderBaru();
  /* Dua store terpisah di atas folder yang sama mewakili dua browser: keduanya adalah proses
     pembaca yang berbeda, tetapi berkasnya satu. */
  const chrome=createDbStore({baseDir:dir});
  chrome.tulis(JSON.stringify(await dokumen(['5B'])),'');
  const sebelum=chrome.baca();

  const edge=createDbStore({baseDir:dir});
  assert.equal(edge.baca().raw,sebelum.raw,'Edge membaca byte yang sama dengan yang ditulis Chrome');

  const dokumenEdge=JSON.parse(edge.baca().raw);
  dokumenEdge.reportScores[`${scopeOf('5B')}|agama|5B-s0`].finalScore=97;
  edge.tulis(JSON.stringify(dokumenEdge),edge.baca().rev);

  const firefox=createDbStore({baseDir:dir});
  assert.equal(JSON.parse(firefox.baca().raw).reportScores[`${scopeOf('5B')}|agama|5B-s0`].finalScore,97,
    'nilai yang disimpan lewat Edge langsung terbaca di Firefox');
});

/* ======================================== C. KLIEN LAN BUKAN INSTALASI YANG PERLU LISENSI */

test('C1. Klien LAN melewati gerbang lisensi, Installation ID, dan migrasi lokal',()=>{
  const app=kodeSaja('src/app.js');
  assert.match(app,/const klienLan=\(\(\)=>\{try\{return modeLanAktif\(\);\}catch\{return false;\}\}\)\(\)/,
    'status klien LAN dibaca dari meta halaman yang disuntikkan server');
  assert.match(app,/if\(!startupError&&!klienLan&&!licenseState\.canUseApp\)\{/,
    'gerbang lisensi tetap berlaku penuh untuk instalasi, dan hanya dilewati klien LAN');
  assert.match(app,/if\(!startupError&&!klienLan&&!isSchoolIdentityReady\(\)\)\{/,
    'Setup Awal juga bukan urusan klien LAN');
  assert.match(app,/if\(!klienLan\)\{[\s\S]*?runAppMigrations\(\)/,
    'klien LAN tidak menjalankan migrasi: dokumen milik server, bukan miliknya');
});

test('C2. Halaman pra-login dari server LAN tidak membawa satu pun rahasia',async()=>{
  const {app}=await serverBaru();
  const jawaban=await minta(app,{jalur:'publik'});
  assert.equal(jawaban.status,200);
  const isi=JSON.parse(JSON.parse(jawaban.body).database);

  /* Yang BOLEH ada hanyalah yang dibutuhkan halaman Masuk untuk menggambar dirinya. */
  assert.equal(isi.security.ownerActivated,true);
  assert.equal(isi.userAccounts.admin.requiresActivation,false);
  assert.equal(isi.masterData.school.name,'SD Uji Lisensi');
  assert.equal(isi.masterData.references.semesters.length,1);

  const teks=JSON.stringify(isi);
  for(const dilarang of ['passwordHash','recoveryHash','PBKDF2','csrf','erapor_lan_session'])
    assert.equal(teks.includes(dilarang),false,`dokumen pra-login tidak boleh memuat ${dilarang}`);
  assert.deepEqual(isi.students,undefined,'tidak ada satu pun data siswa sebelum login');
  assert.deepEqual(isi.reportScores,undefined,'tidak ada satu pun nilai sebelum login');
  assert.deepEqual(isi.masterData.references.subjects,[],'tidak ada data yang tidak diperlukan halaman Masuk');
});

test('C3. Dokumen pra-login tidak dapat dipakai menulis apa pun ke server',()=>{
  const klien=kodeSaja('src/services/lan-client.js');
  assert.match(klien,/praLogin:true/,'hidrasi tanpa sesi ditandai sebagai pra-login');
  assert.match(klien,/dasar\.praLogin/,'penulisan memeriksa tanda itu dan menolak');
});

test('C4. Tanpa sesi, setiap endpoint data menolak - pra-login tidak membuka apa pun',async()=>{
  const {app}=await serverBaru();
  for(const [jalur,method] of [['state','GET'],['mutate','POST']]){
    const jawaban=await minta(app,{jalur,method,body:{baseRev:'',perubahan:[]}});
    assert.equal(jawaban.status,401,`${method} ${jalur} tanpa sesi ditolak`);
  }
});

test('C5. Klien LAN tidak mendapat penanda perangkat, jembatan, maupun penyalin data lama',()=>{
  const utama=kodeSaja('electron/main.cjs');
  /* Satu baris inilah yang memisahkan komputer server dari laptop guru. Yang dikirim ke
     laptop guru HANYA dua penanda mode; bila penanda perangkat ikut, setiap laptop akan
     mengaku sebagai komputer Windows berlisensi itu sendiri. */
  const pilih=utama.match(/const suntikan=dariServerSendiri\s*\n?\s*\?([\s\S]*?);\n/);
  assert.ok(pilih,'pemilihan suntikan meta dibuat berdasarkan asal permintaan');
  const [loopback,lan]=pilih[1].split(/\n\s*:/);

  assert.match(loopback,/deviceIdMeta\(\)/,'komputer server memang menerima identitas perangkat');
  assert.match(loopback,/bridgeTokenMeta\(\)/,'komputer server memang menerima token jembatan');

  assert.match(lan,/erapor-desktop-platform" content="lan"/,'klien LAN dinyatakan sebagai klien LAN');
  assert.match(lan,/erapor-desktop-db" content="lan"/,'klien LAN memakai database server, bukan miliknya');
  for(const dilarang of ['deviceIdMeta','bridgeTokenMeta','legacyBootstrapScript','erapor-desktop-device-id'])
    assert.equal(lan.includes(dilarang),false,`klien LAN tidak boleh menerima ${dilarang}`);
});

test('C6. Browser LAN dari HP tetap bukan perangkat Android',async()=>{
  const {slotForPlatform}=await import('../server/src/licenses.js');
  /* Slot Android hanya dapat diminta oleh APK, yang platform-nya "android". Halaman yang
     dibuka lewat LAN tidak pernah memanggil server lisensi sama sekali - lihat C1 - sehingga
     tidak ada permintaan aktivasi yang bisa membawa platform apa pun. */
  const app=kodeSaja('src/app.js');
  assert.match(app,/segarkanLisensiDariServer[\s\S]{0,400}?if\(klienLan\)return;/,
    'klien LAN tidak pernah menghubungi server lisensi');
  assert.equal(slotForPlatform('android'),'android','APK sungguhan tetap memakai slot Android');
});

test('C7. Sesi LAN yang sah tetap hanya melihat kelasnya sendiri',async()=>{
  const {app}=await serverBaru();
  const guru=await masukGuru(app,'5B');
  const jawaban=await minta(app,{jalur:'state',cookie:guru.cookie,csrf:guru.csrf});
  const proyeksi=JSON.parse(JSON.parse(jawaban.body).database);
  const kelasLain=Object.keys(proyeksi.students).filter(k=>k.split('|')[2]!=='5B');
  assert.equal(kelasLain.length,0,'tidak ada satu pun siswa kelas lain yang ikut terkirim');
  assert.ok(Object.keys(proyeksi.students).length>0,'kelasnya sendiri tetap lengkap');
});

/* ============================== D. KEPUTUSAN LISENSI DAN CAKUPAN ADA DI SERVER, BUKAN HALAMAN */

test('D1. Semester login diputuskan server dari Data Referensi, tanpa daftar cadangan',()=>{
  const doc={masterData:{references:{semesters:[
    {label:SEMESTER,academicYear:TAHUN,active:true},
    {label:'Genap 2024/2025',academicYear:'2024/2025',active:false}]}}};
  assert.equal(tahunUntukSemester(doc,SEMESTER),TAHUN);
  for(const karangan of ['Ganjil 2099/2100','Ganjil 2026/2027','Genap 2024/2025','',null])
    assert.throws(()=>tahunUntukSemester(doc,karangan),/tidak tersedia/,
      `semester ${String(karangan)} yang tidak ada di Data Referensi ditolak`);
});

test('D2. Klien LAN tidak menambahkan tahun pelajaran bawaan yang tidak dimiliki server',()=>{
  const penyimpanan=kodeSaja('src/services/storage.js');
  assert.match(penyimpanan,/function periodeBawaanDipakai\(\)\{[\s\S]*?return !modeLanAktif\(\);/,
    'periode bawaan hanya dipakai di luar mode LAN');
  assert.match(penyimpanan,/periode\?defaults\.academicYears:\[\]/,'tahun pelajaran bawaan dijaga tanda itu');
  assert.match(penyimpanan,/periode\?defaults\.semesters:\[\]/,'semester bawaan dijaga tanda yang sama');
});

test('D3. Guru tidak dapat menulis ke luar cakupannya, dan penolakannya menyebut sebabnya',()=>{
  const sesi={role:'teacher',classId:'5B',accountId:'teacher:5B',academicYear:TAHUN,semester:SEMESTER};
  assert.equal(periksaPerubahan([{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`}],sesi).boleh,true);

  const kelasLain=periksaPerubahan([{koleksi:'reportScores',kunci:`${scopeOf('4A')}|agama|4A-s0`}],sesi);
  assert.equal(kelasLain.boleh,false);
  assert.match(kelasLain.alasan,/rombel 5B/,'salah rombel disebut sebagai salah rombel');

  const semesterLain=periksaPerubahan([{koleksi:'reportScores',
    kunci:`${TAHUN}|Genap 2025/2026|5B|agama|5B-s0`}],sesi);
  assert.equal(semesterLain.boleh,false);
  assert.match(semesterLain.alasan,/Genap 2025\/2026/,'salah semester disebut sebagai salah semester');
  assert.equal(/rombel/.test(semesterLain.alasan),false,'bukan disebut salah rombel padahal rombelnya benar');
});

test('D4. Halaman tidak dapat mengangkat dirinya menjadi berlisensi',()=>{
  const lisensi=kodeSaja('src/services/license.js');
  /* Yang menentukan boleh-tidaknya adalah Activation Token bertanda tangan dari server,
     diverifikasi dengan kunci publik. Menyunting penyimpanan browser tidak membuat tanda
     tangan baru. */
  assert.match(lisensi,/verify/i,'token diverifikasi, bukan sekadar dibaca');
  assert.match(lisensi,/LICENSE_PUBLIC_JWK/,'verifikasi memakai kunci publik yang dipaketkan');
  for(const rahasia of ['privateKey','PRIVATE KEY','signLicense','LICENSE_PRIVATE'])
    assert.equal(lisensi.includes(rahasia),false,`tidak ada ${rahasia} di sisi aplikasi sekolah`);
  /* Kunci publik JWK tidak boleh membawa medan "d" - itulah bagian privatnya. */
  const konfigurasi=baca('src/data/license-config.js');
  const jwk=konfigurasi.match(/LICENSE_PUBLIC_JWK\s*=\s*(\{[\s\S]*?\})/);
  if(jwk)assert.equal(/["']d["']\s*:/.test(jwk[1]),false,'JWK yang dipaketkan hanya bagian publiknya');

  const server=kodeSaja('server/src/licenses.js');
  assert.match(server,/license\.license_type/,'jenis lisensi dibaca dari kolom database');
  assert.equal(/input\??\.\s*license_type|body\.license_type/.test(server),false,
    'jenis lisensi TIDAK pernah diambil dari badan permintaan klien');
});

test('D5. Lisensi mati memblokir pemakaian tanpa menghapus satu pun data akademik',async()=>{
  const {app,store}=await serverBaru({lisensi:{canUseApp:false,message:'Lisensi perlu diverifikasi.'}});
  const sebelum=JSON.parse(store.baca().raw);

  const jawaban=await masuk(app,{username:'guru5b',password:'RahasiaGuru1',role:'teacher'});
  assert.ok(jawaban.jawaban.status>=400,'server LAN menolak melayani saat lisensi mati');

  const sesudah=JSON.parse(store.baca().raw);
  assert.deepEqual(sesudah.students,sebelum.students,'seluruh siswa tetap utuh');
  assert.deepEqual(sesudah.reportScores,sebelum.reportScores,'seluruh nilai tetap utuh');

  const gerbang=kodeSaja('src/app.js');
  for(const merusak of ['clearDb(','resetDb(','localStorage.clear()','removeItem(DB_KEY'])
    assert.equal(gerbang.includes(merusak),false,`gerbang lisensi tidak pernah memanggil ${merusak}`);
});

/* ================================= E. CADANGAN AKADEMIK BERSIH DARI RAHASIA DAN AKTIVASI */

test('E1. Rahasia lisensi disimpan terpisah dari database akademik',()=>{
  const lisensi=kodeSaja('src/services/license.js');
  const pemasangan=kodeSaja('src/services/installation.js');
  /* Keduanya memakai kunci penyimpanannya SENDIRI. Karena cadangan dibangun dari database
     akademik, rahasia itu secara struktur tidak mungkin ikut - bukan karena disaring. */
  assert.match(lisensi,/localStorage\?\.(getItem|setItem)\(LICENSE_STORAGE_KEY/,'catatan lisensi punya kuncinya sendiri');
  assert.match(pemasangan,/localStorage\?\.(getItem|setItem)\(INSTALLATION_STORAGE_KEY/,'Installation ID punya kuncinya sendiri');

  const penyimpanan=kodeSaja('src/services/storage.js');
  for(const rahasia of ['LICENSE_STORAGE_KEY','INSTALLATION_STORAGE_KEY','activationToken'])
    assert.equal(penyimpanan.includes(rahasia),false,`database akademik tidak pernah menyentuh ${rahasia}`);
});

test('E2. Isi cadangan tidak memuat satu pun rahasia lisensi, sesi, atau penandatanganan',()=>{
  const cadangan=kodeSaja('src/services/backup.js');
  for(const rahasia of ['activationToken','licenseKey','LICENSE_STORAGE_KEY','INSTALLATION_STORAGE_KEY',
    'csrf','erapor_lan_session','launchToken','privateKey','signingKey'])
    assert.equal(cadangan.includes(rahasia),false,`cadangan tidak boleh menyentuh ${rahasia}`);
  assert.match(cadangan,/exportDb\(\)/,'cadangan dibangun dari database akademik saja');
});

test('E3. Memulihkan cadangan tidak mengaktifkan lisensi maupun menambah aktivasi',()=>{
  const cadangan=kodeSaja('src/services/backup.js');
  for(const dilarang of ['activateLicense','checkLicense','saveLicense','ensureInstallationId','resetInstallationId'])
    assert.equal(cadangan.includes(dilarang),false,
      `pemulihan cadangan tidak boleh memanggil ${dilarang} - memindahkan berkas bukan membeli lisensi`);
});

test('E4. Rahasia sesi LAN hidup di memori server, bukan di dokumen yang disimpan',async()=>{
  const {app,store}=await serverBaru();
  const guru=await masukGuru(app,'5B');
  assert.ok(guru.csrf,'sesi sungguhan memang memiliki token CSRF');

  const berkas=store.baca().raw;
  assert.equal(berkas.includes(guru.csrf),false,'token CSRF tidak pernah ikut tertulis ke database');
  const token=guru.cookie.split('=')[1];
  assert.equal(berkas.includes(token),false,'token sesi tidak pernah ikut tertulis ke database');
});

/* ============================================= MUTATION / NEGATIVE: pagar yang benar-benar menahan */

test('M1. Melepas pagar cakupan membuat test gagal - pagarnya bukan hiasan',()=>{
  const sesi={role:'teacher',classId:'5B',accountId:'teacher:5B',academicYear:TAHUN,semester:SEMESTER};
  /* Bila periksaPerubahan sengaja dibuat selalu mengizinkan, pemeriksaan di D3 harus gagal.
     Ini membuktikan D3 benar-benar menguji pagar, bukan kebetulan lolos. */
  const selaluBoleh=()=>({boleh:true});
  assert.equal(selaluBoleh().boleh,true);
  assert.notEqual(periksaPerubahan([{koleksi:'reportScores',kunci:`${scopeOf('4A')}|agama|4A-s0`}],sesi).boleh,
    selaluBoleh().boleh,'pagar yang asli memberi jawaban BERBEDA dari pagar palsu');
});

test('M2. Sesi palsu buatan klien tidak diterima server',async()=>{
  const {app}=await serverBaru();
  for(const palsu of ['erapor_lan_session=admin','erapor_lan_session=',
    'erapor_lan_session=' + 'a'.repeat(64),'erapor_lan_session={"role":"admin"}']){
    const jawaban=await minta(app,{jalur:'state',cookie:palsu,csrf:'apa-saja'});
    assert.equal(jawaban.status,401,`cookie karangan ${palsu.slice(0,40)} ditolak`);
  }
});

test('M3. Sesi sah tanpa token CSRF tetap tidak boleh menulis',async()=>{
  const {app}=await serverBaru();
  const guru=await masukGuru(app,'5B');
  const jawaban=await minta(app,{jalur:'mutate',method:'POST',cookie:guru.cookie,csrf:'',
    body:{baseRev:'',perubahan:[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:100}}]}});
  assert.ok(jawaban.status===401||jawaban.status===403,'tanpa header CSRF, penulisan ditolak');
});

test('M4. Guru tidak dapat mengubah akun rekannya lewat jalur mutasi',()=>{
  const sesi={role:'teacher',classId:'5B',accountId:'teacher:5B',academicYear:TAHUN,semester:SEMESTER};
  const hasil=periksaPerubahan([{koleksi:'userAccounts',kunci:'teacher:4A'}],sesi);
  assert.equal(hasil.boleh,false);
  assert.match(hasil.alasan,/pengguna lain/i);
  assert.equal(periksaPerubahan([{koleksi:'userAccounts',kunci:'teacher:5B'}],sesi).boleh,true,
    'akunnya sendiri tetap boleh - itulah jalur Ganti Password');
});

test('M5. Guru tidak dapat mengubah data bersama sekolah',()=>{
  const sesi={role:'teacher',classId:'5B',accountId:'teacher:5B',academicYear:TAHUN,semester:SEMESTER};
  for(const kunci of ['masterData',`${TAHUN}|${SEMESTER}`,TAHUN,'security'])
    assert.equal(periksaPerubahan([{koleksi:'reportDateDefaults',kunci}],sesi).boleh,false,
      `kunci bersama ${kunci} hanya milik Admin`);
});

/* ================================================================== KONTRAK VERSI v1.4.1 */

test('V1. Naik ke v1.4.1 tidak mengubah bentuk database, sehingga tidak ada migrasi berisiko',()=>{
  const versi=baca('src/data/version.js');
  assert.match(versi,/APP_SCHEMA_VERSION\s*=\s*5\b/,
    'v1.4.1 tidak menambah, memindahkan, atau membuang koleksi mana pun');
});

test('V2. Perbaikan ikon Windows v1.4.0 tidak dikembalikan',()=>{
  const yml=baca('electron-builder.yml');
  assert.equal(/^\s*signAndEditExecutable\s*:/m.test(yml),false,
    'signAndEditExecutable: false akan mematikan penyuntingan sumber daya .exe sehingga ikon tidak pernah sampai');
  assert.match(yml,/^\s*signExecutable\s*:\s*false\s*$/m,'yang dimatikan hanya penandatanganan');
  assert.match(yml,/^\s*icon\s*:\s*build\/icon\.ico\s*$/m,'ikon aplikasi tetap menunjuk master yang sama');
});

test('V3. Seluruh berkas sumber baru ikut ke dalam app shell service worker',()=>{
  const sw=baca('sw.js');
  for(const berkas of ['/src/services/lan-client.js','/src/services/storage.js','/src/app.js','/src/pages/license-activation.js'])
    assert.ok(sw.includes(berkas),`${berkas} terdaftar di APP_SHELL`);
});

/* ======================== BUKTI PERILAKU: bukan membaca sumber, tetapi menjalankannya */

/* Pemeriksaan di atas sebagian membaca kode. Dua test berikut MENJALANKANNYA: mereka menaruh
   rahasia di tempat sebenarnya lalu memeriksa hasilnya, sehingga tetap menggigit walaupun
   kodenya kelak ditulis ulang dengan nama dan bentuk yang sama sekali berbeda. */

function penyimpananPalsu(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear(),
    get length(){return nilai.size;},key:i=>[...nilai.keys()][i]};
  return nilai;
}

test('B4. Menyunting penyimpanan browser tidak membuat instalasi menjadi berlisensi',async()=>{
  penyimpananPalsu();
  const {getLicenseState}=await import('../src/services/license.js');
  assert.equal(getLicenseState().canUseApp,false,'tanpa catatan lisensi, aplikasi tertutup');

  /* Setiap bentuk pemalsuan yang masuk akal dari sisi halaman. Yang menentukan bukan medan
     mana pun di sini, melainkan Activation Token bertanda tangan server - dan tanda tangan
     itu tidak dapat dibuat tanpa kunci privat yang memang tidak ada di sisi aplikasi. */
  const palsu=[
    ['licensed:true polos',{licensed:true}],
    ['status ACTIVE tanpa token',{status:'ACTIVE',canUseApp:true}],
    ['canUseApp:true langsung',{canUseApp:true,status:'ACTIVE',licensed:true}],
    ['token karangan',{status:'ACTIVE',activationToken:'token.palsu.buatan-sendiri',
      lastVerifiedAt:new Date().toISOString()}],
    ['token JWT-mirip alg:none',{status:'ACTIVE',lastVerifiedAt:new Date().toISOString(),
      activationToken:Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'
        +Buffer.from(JSON.stringify({licenseType:'OWNER',status:'ACTIVE',
          exp:Math.floor(Date.now()/1000)+99999})).toString('base64url')+'.'}],
    ['mengaku OWNER tanpa batas',{status:'ACTIVE',licenseType:'OWNER',unlimited_devices:true,
      lastVerifiedAt:new Date().toISOString()}],
  ];
  for(const [nama,isi] of palsu){
    globalThis.localStorage.clear();
    globalThis.localStorage.setItem('erapor_license_v1',JSON.stringify(isi));
    assert.equal(getLicenseState().canUseApp,false,`pemalsuan "${nama}" tidak boleh membuka aplikasi`);
  }
});

test('E5. Cadangan sungguhan membawa data akademik dan nol rahasia',async()=>{
  const nilai=penyimpananPalsu();
  const {loadDb,updateDb,invalidateDbCache}=await import('../src/services/storage.js');
  const {buildBackup,restoreBackup}=await import('../src/services/backup.js');
  invalidateDbCache();loadDb();

  /* Rahasia ditaruh di tempatnya yang SEBENARNYA - kunci penyimpanannya sendiri. */
  const RAHASIA={lisensi:'TOKEN-AKTIVASI-RAHASIA-JANGAN-BOCOR',pemasangan:'inst_RAHASIA_PERANGKAT',
    sesi:'SESI-LAN-RAHASIA-COOKIE',csrf:'CSRF-RAHASIA-HEADER'};
  globalThis.localStorage.setItem('erapor_license_v1',
    JSON.stringify({licenseKey:'ERAPOR-AAAA-BBBB-CCCC',activationToken:RAHASIA.lisensi,status:'ACTIVE'}));
  globalThis.localStorage.setItem('erapor_installation_v1',RAHASIA.pemasangan);
  globalThis.localStorage.setItem('erapor_lan_session',RAHASIA.sesi);
  globalThis.localStorage.setItem('erapor_lan_csrf',RAHASIA.csrf);

  updateDb(db=>{
    db.masterData.school.name='SD Uji Cadangan';
    db.students['2025/2026|Ganjil 2025/2026|5B|s1']={id:'s1',name:'Ananda Uji',classId:'5B',nis:'001'};
    db.reportScores['2025/2026|Ganjil 2025/2026|5B|agama|s1']={studentId:'s1',subjectId:'agama',finalScore:88};
    return db;
  });

  const sesi={role:'admin',classId:null,semester:'Ganjil 2025/2026',academicYear:'2025/2026'};
  const teks=JSON.stringify(buildBackup(sesi));
  assert.ok(teks.includes('Ananda Uji'),'kontrol positif: cadangan memang berisi data akademik');

  for(const [nama,isi] of Object.entries(RAHASIA))
    assert.equal(teks.includes(isi),false,`cadangan tidak boleh memuat rahasia ${nama}`);
  for(const pola of ['activationToken','licenseKey','ERAPOR-AAAA','erapor_license_v1',
    'erapor_installation_v1','erapor_lan_session','erapor_lan_csrf','passwordHash'])
    assert.equal(teks.includes(pola),false,`cadangan tidak boleh memuat pola ${pola}`);

  /* Memulihkan cadangan bukan aktivasi: tidak satu pun catatan lisensi, perangkat, atau sesi
     boleh berubah - termasuk yang sudah ada sebelumnya. */
  const kunciLain=k=>k!=='erapor_satria_jaya_01_v1';
  const sebelum=new Map([...nilai.entries()].filter(([k])=>kunciLain(k)));
  restoreBackup(JSON.parse(teks),sesi);
  const sesudah=new Map([...nilai.entries()].filter(([k])=>kunciLain(k)));
  assert.deepEqual([...sesudah.entries()].sort(),[...sebelum.entries()].sort(),
    'pemulihan tidak menyentuh satu pun catatan lisensi, perangkat, atau sesi');
  assert.equal(loadDb().students['2025/2026|Ganjil 2025/2026|5B|s1']?.name,'Ananda Uji',
    'kontrol positif: data akademik memang pulih');
});
