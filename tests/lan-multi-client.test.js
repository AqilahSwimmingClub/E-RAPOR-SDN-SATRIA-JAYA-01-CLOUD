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
const {createLanSessions,bacaCookie}=require('../electron/lan-session.cjs');
const {proyeksikan,periksaPerubahan,cakupanDariKunci}=require('../electron/lan-scope.cjs');
const {daftarAlamatLan,pilihAlamat}=require('../electron/lan-network.cjs');

const root=new URL('../',import.meta.url);
const baca=berkas=>fs.readFileSync(new URL(berkas,root),'utf8');
/* Sebagian pemeriksaan di bawah menanyakan "apakah KODE ini melakukan X". Komentar yang
   menjelaskan mengapa X justru TIDAK dilakukan akan ikut tercocok bila teksnya diperiksa apa
   adanya, sehingga penjelasan yang baik malah menggagalkan test. Karena itu komentar dibuang
   lebih dulu - dan hasilnya pemeriksaannya menjadi lebih tepat, bukan lebih longgar. */
const kodeSaja=berkas=>baca(berkas)
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .replace(/^\s*\/\/.*$/gm,'');

const TAHUN='2025/2026';
const SEMESTER='Ganjil 2025/2026';
const scopeOf=kelas=>`${TAHUN}|${SEMESTER}|${kelas}`;

function folderBaru(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'erapor-lan-'));
  test.after(()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{/* sudah bersih */}});
  return dir;
}

/* Hash PBKDF2 dibuat dengan WebCrypto - persis cara aplikasi membuatnya - sehingga yang diuji
   adalah verifikasi terhadap catatan akun yang bentuknya sama dengan milik sekolah sungguhan. */
async function hashSandi(sandi){
  const salt=new Uint8Array(16);webcrypto.getRandomValues(salt);
  const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(sandi),'PBKDF2',false,['deriveBits']);
  const bits=await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:120000},key,256);
  return {algorithm:'PBKDF2-SHA-256',iterations:120000,
    salt:Buffer.from(salt).toString('base64'),
    hash:Buffer.from(new Uint8Array(bits)).toString('base64')};
}

let SANDI_GURU=null,SANDI_ADMIN=null;
async function sandiSiap(){
  if(!SANDI_GURU)SANDI_GURU=await hashSandi('RahasiaGuru1');
  if(!SANDI_ADMIN)SANDI_ADMIN=await hashSandi('RahasiaAdmin1');
  return {SANDI_GURU,SANDI_ADMIN};
}

function dokumenSekolah(kelasDaftar=['5B','4A','6D']){
  const db={appSchemaVersion:5,appVersion:'1.4.0',
    /* Data Referensi diisi seperti database sekolah sungguhan: server MEMBACA tahun pelajaran
       dari sini saat login, sehingga fixture tanpa daftar semester tidak mewakili keadaan
       nyata dan akan menyembunyikan perilaku yang justru ingin diuji. */
    masterData:{school:{name:'SD Uji LAN'},references:{subjects:[],
      academicYears:[{id:TAHUN,label:TAHUN,active:true},{id:'2024/2025',label:'2024/2025',active:true}],
      semesters:[
        {id:SEMESTER,label:SEMESTER,name:'Ganjil',academicYear:TAHUN,active:true},
        {id:'Genap 2025/2026',label:'Genap 2025/2026',name:'Genap',academicYear:TAHUN,active:true},
        {id:'Ganjil 2024/2025',label:'Ganjil 2024/2025',name:'Ganjil',academicYear:'2024/2025',active:true},
      ]}},
    security:{ownerActivated:true},
    userAccounts:{},settings:{},assessmentSettings:{},subjectMappings:{},
    students:{},assessmentScores:{},reportScores:{},attendance:{},
    reportDateDefaults:{},graduationSettings:{}};
  for(const kelas of kelasDaftar){
    const scope=scopeOf(kelas);
    db.subjectMappings[scope]=[{id:'agama',name:'Agama',order:1,active:true}];
    for(let i=0;i<5;i++){
      const sid=`${kelas}-s${i}`;
      db.students[`${scope}|${sid}`]={id:sid,name:`Siswa ${kelas} ${i}`,classId:kelas,nis:`10${i}`};
      db.assessmentScores[`${scope}|agama|formative|${sid}`]={studentId:sid,subjectId:'agama',assessmentType:'formative',score:80};
      db.reportScores[`${scope}|agama|${sid}`]={studentId:sid,subjectId:'agama',finalScore:82};
    }
  }
  /* Catatan bersama: tidak bercakupan kelas mana pun. */
  db.reportDateDefaults[`${TAHUN}|${SEMESTER}`]={tanggal:'2026-06-20'};
  db.graduationSettings[TAHUN]={tanggalLulus:'2026-06-05'};
  return db;
}

async function dokumenDenganAkun(kelasDaftar){
  const {SANDI_GURU,SANDI_ADMIN}=await sandiSiap();
  const db=dokumenSekolah(kelasDaftar);
  db.userAccounts.admin={id:'admin',role:'admin',username:'Admin',active:true,
    passwordHash:SANDI_ADMIN,recoveryHash:null,requiresActivation:false,mustChangePassword:false};
  for(const kelas of kelasDaftar)
    db.userAccounts[`teacher:${kelas}`]={id:`teacher:${kelas}`,role:'teacher',classId:kelas,
      username:`Guru${kelas}`,active:true,passwordHash:SANDI_GURU,recoveryHash:null,
      requiresActivation:false,mustChangePassword:false};
  return db;
}

/* Server LAN sungguhan di atas store sungguhan, dipanggil lewat antarmuka permintaan yang
   sama persis dengan yang dipakai launcher. */
async function serverBaru({kelas=['5B','4A','6D'],lisensi={canUseApp:true}}={}){
  const dir=folderBaru();
  const store=createDbStore({baseDir:dir});
  store.tulis(JSON.stringify(await dokumenDenganAkun(kelas)),'');
  let lisensiSekarang=lisensi;
  const app=createLanServer({store,bacaLisensi:()=>lisensiSekarang});
  app.muat();
  return {dir,store,app,setLisensi(nilai){lisensiSekarang=nilai;}};
}

function permintaan(app,{jalur,method='GET',body,cookie='',csrf=''}){
  return app.tangani({pathname:`/__erapor/lan/${jalur}`,method,
    headers:{cookie,'x-erapor-csrf':csrf},
    body:body===undefined?'':JSON.stringify(body)});
}

async function masuk(app,{username,password,role,kelas}={}){
  const jawaban=await permintaan(app,{jalur:'login',method:'POST',
    body:{username,password,role,semester:SEMESTER,academicYear:TAHUN}});
  const isi=JSON.parse(jawaban.body);
  const token=bacaCookie(jawaban.headers['Set-Cookie'],'erapor_lan_session');
  return {jawaban,isi,cookie:`erapor_lan_session=${token}`,csrf:isi.csrf,token,kelas};
}
const masukGuru=(app,kelas)=>masuk(app,{username:`guru${kelas.toLowerCase()}`,password:'RahasiaGuru1',role:'teacher',kelas});
const masukAdmin=app=>masuk(app,{username:'admin',password:'RahasiaAdmin1',role:'admin'});

const ambilState=async(app,sesi)=>{
  const j=await permintaan(app,{jalur:'state',cookie:sesi.cookie,csrf:sesi.csrf});
  return {status:j.status,isi:JSON.parse(j.body)};
};
const mutasi=(app,sesi,perubahan,baseRev)=>permintaan(app,{jalur:'mutate',method:'POST',
  cookie:sesi.cookie,csrf:sesi.csrf,body:{baseRev,perubahan}});

/* ======================================================= 1-7. AUTENTIKASI DAN SESSION */

test('L1. LAN nonaktif: berkas mentah database tidak pernah dilayani ke jaringan',()=>{
  const t=baca('electron/main.cjs');
  assert.match(t,/if\(!permintaanDariLoopback\(request\)\)\s*\n\s*return jsonDb\(response,403,\{error:'Berkas database hanya dapat diakses dari komputer server\.'\}\);/);
  assert.match(t,/function permintaanDariLoopback\(request\)\{[\s\S]*?request\.socket\?\.localAddress/,
    'asal permintaan diputuskan dari soket, bukan dari header yang dapat dipalsukan');
  /* Pendengar LAN hanya dibuat ketika Admin menyalakannya; tidak ada jalur yang menyalakannya
     sendiri saat aplikasi dijalankan tanpa persetujuan itu. */
  assert.match(t,/if\(lanConfig\.enabled&&bacaLanLicense\(\)\.canUseApp\)await mulaiLan/);
});

test('L2. Login yang benar menghasilkan sesi; Host dan alamat LAN dijaga terpisah',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  assert.equal(sesi.jawaban.status,200);
  assert.equal(sesi.isi.sesi.role,'teacher');
  assert.equal(sesi.isi.sesi.classId,'5B');
  assert.ok(sesi.token.length>=32,'token sesi panjang dan acak');
  assert.match(sesi.jawaban.headers['Set-Cookie'],/HttpOnly/,'cookie tidak dapat dibaca JavaScript halaman');
  assert.match(sesi.jawaban.headers['Set-Cookie'],/SameSite=Strict/,'cookie tidak dikirim atas permintaan situs lain');
  /* Token sesi TIDAK boleh ikut ke badan jawaban. */
  assert.equal(sesi.jawaban.body.includes(sesi.token),false,'token sesi tidak pernah masuk badan jawaban');
});

test('L3. Kata sandi salah ditolak dan tidak menghasilkan sesi',async()=>{
  const {app}=await serverBaru();
  const j=await permintaan(app,{jalur:'login',method:'POST',
    body:{username:'guru5b',password:'SalahSekali',role:'teacher',semester:SEMESTER,academicYear:TAHUN}});
  assert.equal(j.status,401);
  assert.equal(j.headers['Set-Cookie'],undefined,'tidak ada cookie yang diberikan');
  assert.match(JSON.parse(j.body).error,/tidak sesuai/i);
});

test('L4. Permintaan tanpa sesi ditolak sebelum menyentuh data',async()=>{
  const {app}=await serverBaru();
  for(const jalur of ['state','mutate']){
    const j=await permintaan(app,{jalur,method:jalur==='state'?'GET':'POST',body:{baseRev:0,perubahan:[]}});
    assert.equal(j.status,401,`${jalur} ditolak tanpa sesi`);
    assert.equal(j.body.includes('Siswa'),false,'tidak ada data sekolah yang bocor pada penolakan');
  }
});

test('L5. Token sesi palsu ditolak',async()=>{
  const {app}=await serverBaru();
  const j=await permintaan(app,{jalur:'state',cookie:'erapor_lan_session='+'a'.repeat(64)});
  assert.equal(j.status,401);
});

test('L6. Sesi kedaluwarsa ditolak dan dibuang',async()=>{
  const {SANDI_GURU}=await sandiSiap();
  let waktu=1000000;
  const doc={userAccounts:{'teacher:5B':{id:'teacher:5B',role:'teacher',classId:'5B',
    username:'Guru5B',active:true,passwordHash:SANDI_GURU}},security:{ownerActivated:true},
    masterData:{references:{semesters:[{label:SEMESTER,academicYear:TAHUN,active:true}]}}};
  const sessions=createLanSessions({bacaDokumen:()=>doc,durasiMs:1000,sekarang:()=>waktu});
  const sesi=sessions.login({username:'guru5b',password:'RahasiaGuru1',role:'teacher',semester:SEMESTER});
  assert.ok(sessions.validasi(sesi.token),'sesi sah sebelum kedaluwarsa');
  waktu+=1001;
  assert.equal(sessions.validasi(sesi.token),null,'sesi ditolak sesudah kedaluwarsa');
  assert.equal(sessions.jumlahSesi(),0,'sesi kedaluwarsa dibuang, bukan sekadar ditolak');
});

test('L7. Logout memutus sesi sehingga token lama tidak dapat dipakai lagi',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  assert.equal((await ambilState(app,sesi)).status,200);
  const keluar=await permintaan(app,{jalur:'logout',method:'POST',cookie:sesi.cookie,csrf:sesi.csrf});
  assert.equal(keluar.status,200);
  assert.match(keluar.headers['Set-Cookie'],/Max-Age=0/,'cookie dihapus di browser');
  assert.equal((await ambilState(app,sesi)).status,401,'token lama tidak sah lagi');
});

/* ================================================= 8-14. OTORISASI DAN ISOLASI KELAS */

test('L8. Guru 5B membaca kelasnya sendiri',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const db=JSON.parse(isi.database);
  assert.equal(Object.keys(db.students).length,5,'kelima siswa 5B terbaca');
  assert.ok(db.students[`${scopeOf('5B')}|5B-s0`],'siswa 5B ada');
});

test('L9. Guru 5B menulis nilai kelasnya sendiri dan benar-benar tersimpan',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const kunci=`${scopeOf('5B')}|agama|5B-s0`;
  const j=await mutasi(app,sesi,[{koleksi:'reportScores',kunci,nilai:{studentId:'5B-s0',subjectId:'agama',finalScore:95}}],isi.rev);
  assert.equal(j.status,200);
  const diPiringan=JSON.parse(store.baca().raw);
  assert.equal(diPiringan.reportScores[kunci].finalScore,95,'nilai benar-benar ada di berkas server');
});

test('L10. Guru 5B TIDAK menerima data kelas 4A maupun 6D',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const db=JSON.parse(isi.database);
  for(const kelasLain of ['4A','6D']){
    const awalan=scopeOf(kelasLain);
    for(const koleksi of ['students','assessmentScores','reportScores','subjectMappings'])
      assert.equal(Object.keys(db[koleksi]||{}).some(k=>k.startsWith(awalan)),false,
        `${koleksi} kelas ${kelasLain} tidak ikut terkirim`);
  }
  /* Bukan sekadar disembunyikan tampilan: namanya pun tidak ada di dalam muatan. */
  assert.equal(isi.database.includes('Siswa 4A 0'),false,'nama siswa kelas lain tidak ada dalam muatan');
  assert.equal(isi.database.includes('Siswa 6D 0'),false);
});

test('L11. Guru 5B TIDAK dapat menulis ke kelas 4A walau memanggil API langsung',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const sebelum=store.baca().raw;
  const kunci=`${scopeOf('4A')}|agama|4A-s0`;
  const j=await mutasi(app,sesi,[{koleksi:'reportScores',kunci,nilai:{finalScore:10}}],isi.rev);
  assert.equal(j.status,403);
  assert.match(JSON.parse(j.body).error,/rombel 5B/i);
  assert.equal(store.baca().raw,sebelum,'berkas server tidak berubah sedikit pun');
});

test('L12. Peran ADMIN yang dipalsukan pada permintaan tidak berpengaruh',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const sebelum=store.baca().raw;
  /* Klien menyisipkan medan role/classId palsu ke badan permintaan. Server tidak pernah
     membacanya: peran dan rombel diambil dari catatan sesinya sendiri. */
  const j=await app.tangani({pathname:'/__erapor/lan/mutate',method:'POST',
    headers:{cookie:sesi.cookie,'x-erapor-csrf':sesi.csrf},
    body:JSON.stringify({baseRev:isi.rev,role:'admin',classId:'4A',
      perubahan:[{koleksi:'reportScores',kunci:`${scopeOf('4A')}|agama|4A-s0`,nilai:{finalScore:10}}]})});
  assert.equal(j.status,403);
  assert.equal(store.baca().raw,sebelum);
});

test('L13. classId palsu saat login tidak memindahkan guru ke kelas lain',async()=>{
  const {app}=await serverBaru();
  const j=await permintaan(app,{jalur:'login',method:'POST',
    body:{username:'guru5b',password:'RahasiaGuru1',role:'teacher',classId:'4A',
      semester:SEMESTER,academicYear:TAHUN}});
  const isi=JSON.parse(j.body);
  assert.equal(isi.sesi.classId,'5B','rombel diambil dari akun, bukan dari permintaan');
});

test('L14. Guru tidak menerima akun rekannya maupun hash kata sandinya',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const db=JSON.parse(isi.database);
  assert.deepEqual(Object.keys(db.userAccounts),['teacher:5B'],'hanya akunnya sendiri');
  assert.equal(isi.database.includes('"admin"'),false,'akun Admin tidak ikut terkirim');
  const {SANDI_ADMIN}=await sandiSiap();
  assert.equal(isi.database.includes(SANDI_ADMIN.hash),false,'hash kata sandi Admin tidak pernah terkirim');
});

test('L15. Guru tidak dapat mengubah akun pengguna lain',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const j=await mutasi(app,sesi,[{koleksi:'userAccounts',kunci:'admin',
    nilai:{id:'admin',role:'admin',active:true}}],isi.rev);
  assert.equal(j.status,403);
  assert.match(JSON.parse(j.body).error,/pengguna lain/i);
});

test('L16. Guru tidak dapat mengubah data bersama sekolah',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const j=await mutasi(app,sesi,[{koleksi:'graduationSettings',kunci:TAHUN,nilai:{tanggalLulus:'2099-01-01'}}],isi.rev);
  assert.equal(j.status,403);
  assert.match(JSON.parse(j.body).error,/hanya dapat diubah Admin/i);
});

test('L17. Guru TETAP dapat membaca data bersama yang dibutuhkan untuk bekerja',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const db=JSON.parse((await ambilState(app,sesi)).isi.database);
  assert.equal(db.masterData.school.name,'SD Uji LAN','identitas sekolah terbaca');
  assert.ok(db.reportDateDefaults[`${TAHUN}|${SEMESTER}`],'tanggal rapor terbaca');
  assert.ok(db.graduationSettings[TAHUN],'pengaturan kelulusan terbaca');
});

test('L18. Admin memegang data seluruh sekolah seperti sebelumnya',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukAdmin(app);
  const db=JSON.parse((await ambilState(app,sesi)).isi.database);
  for(const kelas of ['5B','4A','6D'])
    assert.ok(Object.keys(db.students).some(k=>k.startsWith(scopeOf(kelas))),`Admin melihat kelas ${kelas}`);
  const j=await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('4A')}|agama|4A-s0`,
    nilai:{studentId:'4A-s0',finalScore:91}}],(await ambilState(app,sesi)).isi.rev);
  assert.equal(j.status,200,'Admin dapat menulis lintas kelas');
});

/* ============================================================ 19-21. CSRF DAN BENTUK API */

test('L19. Penyimpanan tanpa penanda CSRF ditolak',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const sebelum=store.baca().raw;
  const j=await permintaan(app,{jalur:'mutate',method:'POST',cookie:sesi.cookie,csrf:'',
    body:{baseRev:isi.rev,perubahan:[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:1}}]}});
  assert.equal(j.status,403);
  assert.equal(JSON.parse(j.body).kode,'CSRF');
  assert.equal(store.baca().raw,sebelum);
});

test('L20. Penanda CSRF milik sesi lain ditolak',async()=>{
  const {app}=await serverBaru();
  const guru=await masukGuru(app,'5B');
  const lain=await masukGuru(app,'4A');
  const {isi}=await ambilState(app,guru);
  const j=await permintaan(app,{jalur:'mutate',method:'POST',cookie:guru.cookie,csrf:lain.csrf,
    body:{baseRev:isi.rev,perubahan:[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:1}}]}});
  assert.equal(j.status,403);
});

test('L21. Jawaban LAN tidak pernah membawa izin lintas-origin dan tidak boleh di-cache',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const j=await permintaan(app,{jalur:'state',cookie:sesi.cookie,csrf:sesi.csrf});
  for(const nama of Object.keys(j.headers))
    assert.equal(/access-control/i.test(nama),false,`tidak ada header ${nama}`);
  assert.equal(j.headers['Cache-Control'],'no-store');
  assert.equal(j.headers['X-Content-Type-Options'],'nosniff');
});

/* ================================================== 22-27. CONCURRENCY DAN ZERO LOST WRITE */

test('L22. Dua guru kelas berbeda menyimpan bersamaan tanpa saling menimpa',async()=>{
  const {app,store}=await serverBaru();
  const a=await masukGuru(app,'5B');
  const b=await masukGuru(app,'4A');
  const revA=(await ambilState(app,a)).isi.rev;
  const revB=(await ambilState(app,b)).isi.rev;
  const [ja,jb]=await Promise.all([
    mutasi(app,a,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:88}}],revA),
    mutasi(app,b,[{koleksi:'reportScores',kunci:`${scopeOf('4A')}|agama|4A-s0`,nilai:{finalScore:77}}],revB),
  ]);
  assert.equal(ja.status,200);assert.equal(jb.status,200);
  const db=JSON.parse(store.baca().raw);
  assert.equal(db.reportScores[`${scopeOf('5B')}|agama|5B-s0`].finalScore,88,'pekerjaan guru 5B utuh');
  assert.equal(db.reportScores[`${scopeOf('4A')}|agama|4A-s0`].finalScore,77,'pekerjaan guru 4A utuh');
});

test('L23. Satu guru, dua siswa berbeda pada kelas yang sama, bersamaan',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const rev=(await ambilState(app,sesi)).isi.rev;
  const hasil=await Promise.all([0,1,2,3,4].map(i=>
    mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s${i}`,
      nilai:{studentId:`5B-s${i}`,finalScore:70+i}}],rev)));
  assert.equal(hasil.every(j=>j.status===200),true,'kunci berbeda tidak pernah dianggap konflik');
  const db=JSON.parse(store.baca().raw);
  for(let i=0;i<5;i++)
    assert.equal(db.reportScores[`${scopeOf('5B')}|agama|5B-s${i}`].finalScore,70+i,`nilai siswa ${i} utuh`);
});

test('L24. Catatan yang SAMA disunting bersamaan: yang kalah ditolak, bukan ditimpa diam-diam',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const rev=(await ambilState(app,sesi)).isi.rev;
  const kunci=`${scopeOf('5B')}|agama|5B-s0`;
  const pertama=await mutasi(app,sesi,[{koleksi:'reportScores',kunci,nilai:{finalScore:90}}],rev);
  assert.equal(pertama.status,200);
  /* Penulis kedua masih memegang revisi lama - persis keadaan dua jendela. */
  const kedua=await mutasi(app,sesi,[{koleksi:'reportScores',kunci,nilai:{finalScore:60}}],rev);
  assert.equal(kedua.status,409,'ditolak, bukan diterima diam-diam');
  assert.equal(JSON.parse(kedua.body).kode,'KONFLIK');
  assert.equal(JSON.parse(store.baca().raw).reportScores[kunci].finalScore,90,'nilai pertama tetap berlaku');
});

test('L25. Revisi basi pada satu kunci tidak menghalangi kunci lain',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const rev=(await ambilState(app,sesi)).isi.rev;
  await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:90}}],rev);
  const lain=await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s1`,nilai:{finalScore:70}}],rev);
  assert.equal(lain.status,200,'kunci yang belum tersentuh tetap dapat ditulis dengan revisi lama');
});

test('L26. Penyimpanan beruntun cepat: tidak ada satu pun yang hilang',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  let rev=(await ambilState(app,sesi)).isi.rev;
  for(let i=0;i<25;i++){
    const j=await mutasi(app,sesi,[{koleksi:'assessmentScores',
      kunci:`${scopeOf('5B')}|agama|formative|5B-s${i%5}`,
      nilai:{studentId:`5B-s${i%5}`,score:i}}],rev);
    assert.equal(j.status,200,`penyimpanan ke-${i} berhasil`);
    rev=JSON.parse(j.body).rev;
  }
  const db=JSON.parse(store.baca().raw);
  for(let s=0;s<5;s++){
    const terakhir=[...Array(25).keys()].filter(i=>i%5===s).pop();
    assert.equal(db.assessmentScores[`${scopeOf('5B')}|agama|formative|5B-s${s}`].score,terakhir,
      `siswa ${s} menyimpan nilai terakhirnya`);
  }
});

test('L27. Satu perubahan tidak sah membatalkan SELURUH permintaan',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const sebelum=store.baca().raw;
  const j=await mutasi(app,sesi,[
    {koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:99}},
    {koleksi:'reportScores',kunci:`${scopeOf('4A')}|agama|4A-s0`,nilai:{finalScore:99}},
  ],isi.rev);
  assert.equal(j.status,403);
  /* Yang sah pun TIDAK ikut tersimpan: menerima sebagian membuat guru mengira semuanya
     tersimpan padahal separuhnya tidak. */
  assert.equal(store.baca().raw,sebelum,'tidak ada perubahan yang diterapkan sebagian');
});

/* ============================================ 28-32. KEGAGALAN SERVER DAN PEMULIHAN */

test('L28. Server dimuat ulang: data tetap ada dan sesi lama tidak berlaku',async()=>{
  const {app,store,dir}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const rev=(await ambilState(app,sesi)).isi.rev;
  await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:93}}],rev);

  /* Launcher dijalankan ulang: store yang sama, server yang baru. */
  const store2=createDbStore({baseDir:dir});
  const app2=createLanServer({store:store2,bacaLisensi:()=>({canUseApp:true})});
  app2.muat();
  assert.equal(JSON.parse(store2.baca().raw).reportScores[`${scopeOf('5B')}|agama|5B-s0`].finalScore,93,
    'data selamat melewati restart');
  const j=await permintaan(app2,{jalur:'state',cookie:sesi.cookie});
  assert.equal(j.status,401,'sesi lama tidak hidup kembali setelah server dijalankan ulang');
});

test('L29. Penyimpanan gagal dilaporkan GAGAL, bukan diam-diam dianggap berhasil',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  /* Piringan yang menolak menulis. */
  const asli=app.dokumenSekarang();
  const store2={baca:()=>({raw:JSON.stringify(asli),rev:'x',sumber:'utama'}),
    tulisLangsung(){throw new Error('piringan penuh');}};
  const app2=createLanServer({store:store2,bacaLisensi:()=>({canUseApp:true})});
  app2.muat();
  const sesi2=await masukGuru(app2,'5B');
  const rev2=(await ambilState(app2,sesi2)).isi.rev;
  const j=await mutasi(app2,sesi2,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:50}}],rev2);
  assert.equal(j.status,500);
  assert.match(JSON.parse(j.body).error,/GAGAL disimpan/);
});

test('L30. Berkas utama rusak: server memuat dari cadangan, bukan memulai kosong',async()=>{
  const {app,store,dir}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const rev=(await ambilState(app,sesi)).isi.rev;
  await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:87}}],rev);
  await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s1`,nilai:{finalScore:88}}],rev+1);
  fs.writeFileSync(store.paths.berkas,'{rusak');
  const app2=createLanServer({store:createDbStore({baseDir:dir}),bacaLisensi:()=>({canUseApp:true})});
  const sumber=app2.muat();
  assert.equal(sumber,'cadangan');
  assert.equal(app2.dokumenSekarang().reportScores[`${scopeOf('5B')}|agama|5B-s0`].finalScore,87,
    'nilai dari cadangan terbaca, bukan database kosong');
});

test('L31. Penulisan dibekukan saat restore, lalu dapat dilanjutkan',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const rev=(await ambilState(app,sesi)).isi.rev;
  app.bekukanTulis();
  const ditolak=await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:1}}],rev);
  assert.equal(ditolak.status,503);
  assert.equal(JSON.parse(ditolak.body).kode,'BEKU');
  app.lanjutkanTulis();
  const diterima=await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:2}}],rev);
  assert.equal(diterima.status,200,'penyimpanan berjalan lagi setelah restore selesai');
});

test('L32. Restore menaikkan revisi sehingga salinan lama klien tidak dapat menimpanya',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const revLama=(await ambilState(app,sesi)).isi.rev;
  app.gantiDokumen(JSON.parse(JSON.stringify(app.dokumenSekarang())));
  const j=await mutasi(app,sesi,[{koleksi:'reportScores',kunci:`${scopeOf('5B')}|agama|5B-s0`,nilai:{finalScore:5}}],revLama);
  assert.ok(app.revisiSekarang()>revLama,'revisi naik setelah dokumen diganti');
  assert.equal(j.status,200,'klien tetap dapat menyimpan setelah menyegarkan revisinya');
});

/* ==================================================================== 33-37. LISENSI */

test('L33. Lisensi dicabut: login LAN diblokir, data akademik tidak disentuh',async()=>{
  const {app,store,setLisensi}=await serverBaru();
  const sebelum=store.baca().raw;
  setLisensi({canUseApp:false,state:'REVOKED',message:'Lisensi dicabut.'});
  const j=await permintaan(app,{jalur:'login',method:'POST',
    body:{username:'guru5b',password:'RahasiaGuru1',role:'teacher',semester:SEMESTER,academicYear:TAHUN}});
  assert.equal(j.status,403);
  assert.equal(JSON.parse(j.body).kode,'LICENSE_BLOCKED');
  assert.equal(store.baca().raw,sebelum,'tidak satu pun nilai siswa berubah karena lisensi dicabut');
});

test('L34. Masa tenggang habis memblokir login LAN',async()=>{
  const {app,setLisensi}=await serverBaru();
  setLisensi({canUseApp:false,state:'GRACE_EXPIRED',message:'Perlu diperiksa ulang.'});
  const j=await permintaan(app,{jalur:'login',method:'POST',
    body:{username:'guru5b',password:'RahasiaGuru1',role:'teacher',semester:SEMESTER,academicYear:TAHUN}});
  assert.equal(j.status,403);
});

test('L35. Masa tenggang masih berjalan: login LAN tetap diizinkan',async()=>{
  const {app,setLisensi}=await serverBaru();
  setLisensi({canUseApp:true,state:'GRACE'});
  const sesi=await masukGuru(app,'5B');
  assert.equal(sesi.jawaban.status,200);
});

test('L36. Masa tenggang dihitung dari waktu kedaluwarsa yang tercatat, bukan dari kepercayaan klien',()=>{
  const t=baca('electron/main.cjs');
  assert.match(t,/if\(isi\.graceExpiresAt&&Date\.parse\(isi\.graceExpiresAt\)<=Date\.now\(\)\)/,
    'server memeriksa sendiri apakah masa tenggang sudah lewat');
  assert.match(t,/canUseApp:false,state:'GRACE_EXPIRED'/);
  /* Status lisensi yang belum pernah didorong komputer server dianggap TIDAK berlaku, bukan
     dianggap berlaku - keadaan yang tidak diketahui tidak boleh membuka akses. */
  assert.match(t,/catch\{\s*\n\s*return \{canUseApp:false,state:'UNKNOWN'/);
});

test('L37. Klien LAN tidak pernah menerima token lisensi maupun Installation ID',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  for(const rahasia of ['activation_token','installation_id','erapor_license_v1','erapor_installation_v1'])
    assert.equal(isi.database.includes(rahasia),false,`${rahasia} tidak ada dalam muatan`);
  /* Halaman yang dilayani ke LAN pun tidak membawa token peluncuran maupun identitas
     perangkat - keduanya hanya disuntikkan untuk komputer server sendiri. */
  const t=baca('electron/main.cjs');
  assert.match(t,/const dariServerSendiri=permintaanDariLoopback\(request\);[\s\S]*?:'<meta name="erapor-desktop-platform" content="lan"><meta name="erapor-desktop-db" content="lan">'/);
});

/* ============================================ 38-44. PRIVASI, JALUR BERKAS, DAN BENTUK */

test('L38. Letak berkas di komputer server tidak pernah dikirim ke klien LAN',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const j=await permintaan(app,{jalur:'state',cookie:sesi.cookie,csrf:sesi.csrf});
  assert.equal(j.body.includes(store.paths.dataDir),false,'path folder data tidak bocor');
  assert.equal(/[A-Za-z]:\\|\/tmp\/|%APPDATA%/.test(j.body),false,'tidak ada jalur berkas dalam jawaban');
});

test('L39. Endpoint LAN yang tidak dikenal menjawab 404 tanpa membocorkan apa pun',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const j=await permintaan(app,{jalur:'../../etc/passwd',cookie:sesi.cookie,csrf:sesi.csrf});
  assert.equal(j.status,404);
  assert.equal(j.body.includes('Siswa'),false);
});

test('L40. Pengaturan Server LAN hanya dapat diubah dari komputer server',()=>{
  const t=baca('electron/main.cjs');
  assert.match(t,/function layaniKontrolLan\(request,response,jalur\)\{\s*\n\s*if\(!permintaanDariLoopback\(request\)\)/,
    'kontrol LAN menolak permintaan yang datang lewat soket LAN');
  assert.match(t,/Pengaturan Server LAN hanya dapat diubah dari komputer server/);
  assert.match(t,/if\(!tokenPermintaanCocok\(request\)\)\s*\n\s*return jsonDb\(response,403,\{error:'Permintaan pengaturan tidak diizinkan\.'\}\)/);
});

test('L41. Proyeksi menyaring berdasarkan BENTUK KUNCI sehingga koleksi baru ikut terlindungi',()=>{
  const sesi={role:'teacher',classId:'5B',accountId:'teacher:5B',academicYear:TAHUN,semester:SEMESTER};
  /* Koleksi yang belum pernah ada saat kode otorisasi ditulis. */
  const doc={koleksiBaruSuatuHari:{
    [`${scopeOf('5B')}|milik-sendiri`]:{nilai:1},
    [`${scopeOf('4A')}|milik-kelas-lain`]:{nilai:2},
    'catatan-bersama':{nilai:3},
  }};
  const hasil=proyeksikan(doc,sesi);
  assert.deepEqual(Object.keys(hasil.koleksiBaruSuatuHari).sort(),
    ['catatan-bersama',`${scopeOf('5B')}|milik-sendiri`].sort());
  const tulis=periksaPerubahan([{koleksi:'koleksiBaruSuatuHari',kunci:`${scopeOf('4A')}|x`,nilai:{}}],sesi);
  assert.equal(tulis.boleh,false,'menulis ke kelas lain tetap ditolak pada koleksi yang belum dikenal');
});

test('L42. Kunci tanpa cakupan dikenali sebagai catatan bersama, bukan milik kelas',()=>{
  assert.equal(cakupanDariKunci(`${scopeOf('5B')}|agama|s1`),scopeOf('5B'));
  assert.equal(cakupanDariKunci(`${TAHUN}|${SEMESTER}`),null,'tanggal rapor bukan milik kelas mana pun');
  assert.equal(cakupanDariKunci(TAHUN),null);
  assert.equal(cakupanDariKunci('admin'),null);
  /* Nama yang MIRIP kelas tetapi bukan kelas sah tidak boleh dianggap cakupan. */
  assert.equal(cakupanDariKunci(`${TAHUN}|${SEMESTER}|9Z|x`),null);
});

test('L43. Hash kata sandi tidak hilang ketika Admin menulis ulang catatan akun',async()=>{
  const {app,store}=await serverBaru();
  const sesi=await masukAdmin(app);
  const {isi}=await ambilState(app,sesi);
  const sebelum=JSON.parse(store.baca().raw).userAccounts['teacher:5B'].passwordHash;
  /* Halaman Admin menulis ulang catatan dengan sebaran objek; salinan yang dikirim bisa saja
     tidak membawa hash. Server mempertahankan yang lama alih-alih menghapusnya. */
  const j=await mutasi(app,sesi,[{koleksi:'userAccounts',kunci:'teacher:5B',
    nilai:{id:'teacher:5B',role:'teacher',classId:'5B',username:'Guru5B',active:false}}],isi.rev);
  assert.equal(j.status,200);
  const sesudah=JSON.parse(store.baca().raw).userAccounts['teacher:5B'];
  assert.equal(sesudah.active,false,'perubahan status tersimpan');
  assert.deepEqual(sesudah.passwordHash,sebelum,'kata sandi guru TIDAK ikut terhapus');
});

test('L44. Metode yang tidak didukung ditolak',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const j=await permintaan(app,{jalur:'state',method:'DELETE',cookie:sesi.cookie,csrf:sesi.csrf});
  assert.equal(j.status,404);
});

/* ============================================================ 45-49. JARINGAN DAN QR */

test('L45. Hanya alamat IPv4 privat yang ditawarkan',()=>{
  const palsu={
    'Wi-Fi':[{address:'192.168.1.10',family:'IPv4',internal:false}],
    'Ethernet 2':[{address:'8.8.4.4',family:'IPv4',internal:false}],
    'Ethernet':[{address:'169.254.12.9',family:'IPv4',internal:false}],
    'Loopback':[{address:'127.0.0.1',family:'IPv4',internal:true}],
  };
  const daftar=daftarAlamatLan(palsu).map(i=>i.alamat);
  assert.deepEqual(daftar,['192.168.1.10']);
  assert.equal(daftar.includes('8.8.4.4'),false,'alamat publik tidak pernah ditawarkan');
  assert.equal(daftar.includes('169.254.12.9'),false,'alamat link-local tidak ditawarkan');
});

test('L46. Adaptor virtual dan VPN tidak pernah menjadi pilihan bawaan',()=>{
  const palsu={
    'vEthernet (WSL)':[{address:'172.20.96.1',family:'IPv4',internal:false}],
    'OpenVPN TAP-Windows6':[{address:'10.8.0.6',family:'IPv4',internal:false}],
    'VirtualBox Host-Only Network':[{address:'192.168.56.1',family:'IPv4',internal:false}],
    'Wi-Fi':[{address:'192.168.1.10',family:'IPv4',internal:false}],
  };
  assert.equal(pilihAlamat(null,palsu),'192.168.1.10','Wi-Fi asli menang atas adaptor virtual');
  assert.equal(daftarAlamatLan(palsu).find(i=>i.alamat==='10.8.0.6').virtual,true,'VPN ditandai virtual');
  /* Admin tetap boleh memilihnya bila memang itu jaringan sekolahnya. */
  assert.equal(pilihAlamat('192.168.56.1',palsu),'192.168.56.1','pilihan Admin dihormati');
});

test('L47. Alamat yang berubah karena DHCP tidak dipaksakan',()=>{
  const palsu={'Wi-Fi':[{address:'192.168.1.55',family:'IPv4',internal:false}]};
  assert.equal(pilihAlamat('192.168.1.10',palsu),'192.168.1.55',
    'alamat lama yang sudah tidak ada digantikan alamat yang benar-benar dimiliki komputer');
});

test('L48. QR hanya memuat alamat, tanpa rahasia apa pun',async()=>{
  const {qrSvg,buatMatriksQr}=await import('../src/services/qr.js');
  const url='http://192.168.1.10:5321';
  const svg=qrSvg(url);
  for(const rahasia of ['token','password','sandi','license','installation','csrf','session'])
    assert.equal(new RegExp(rahasia,'i').test(svg),false,`QR tidak memuat ${rahasia}`);
  const m=buatMatriksQr(url);
  assert.equal(m.length,25,'versi 2 cukup untuk alamat LAN');
  assert.equal(m.every(b=>b.every(v=>v===0||v===1)),true,'seluruh modul terisi');
});

test('L49. Halaman Server LAN tidak pernah muncul di klien LAN maupun browser biasa',()=>{
  const t=baca('src/services/lan-admin.js');
  assert.match(t,/metaKonten\('erapor-desktop-db'\)==='server'&&Boolean\(metaKonten\('erapor-desktop-bridge-token'\)\)/,
    'kontrol LAN hanya tersedia di komputer server');
  const halaman=baca('src/pages/lan-server.js');
  assert.match(halaman,/session\?\.role!=='admin'/,'halaman menolak non-Admin');
  assert.match(halaman,/dukunganLanTersedia\(\)/,'halaman menolak dijalankan di luar komputer server');
});

/* ========================================================= 50-54. KLIEN DAN OFFLINE */

test('L50. Klien LAN tidak pernah membuat database akademik lokal',()=>{
  const t=kodeSaja('src/services/lan-client.js');
  assert.equal(/localStorage\.setItem/.test(t),false,'tidak ada penulisan ke penyimpanan browser');
  assert.equal(/localStorage|indexedDB|sessionStorage/.test(t),false,
    'klien LAN tidak menyentuh penyimpanan browser sama sekali');
  /* Tidak ada penundaan: sinkronisasi diam-diam selalu berwujud penjadwalan atau antrian yang
     menahan perubahan lalu mengirimkannya belakangan. Tak satu pun mekanisme itu boleh ada -
     penyimpanan harus berhasil sekarang atau dinyatakan gagal sekarang. */
  assert.equal(/setTimeout|setInterval|requestIdleCallback|navigator\.sendBeacon/.test(t),false,
    'tidak ada penundaan pengiriman perubahan');
  const storage=baca('src/services/storage.js');
  assert.match(storage,/if\(modeLanAktif\(\)\)return tulisRawLan\(raw\);/,
    'penulisan klien LAN selalu berakhir di server, tidak pernah di localStorage');
});

test('L51. Server tidak terjangkau: penyimpanan GAGAL dan dikatakan gagal',()=>{
  const t=baca('src/services/lan-client.js');
  const kode=kodeSaja('src/services/lan-client.js');
  assert.match(t,/Server e-Rapor tidak dapat dihubungi/,'pesannya menyebutkan keadaan sebenarnya');
  assert.match(t,/statusKoneksi=\{terhubung:false/);
  /* Tidak ada cabang yang mengembalikan "berhasil" ketika permintaannya gagal. */
  assert.equal(/catch[\s\S]{0,120}return raw/.test(kode),false,'kegagalan tidak pernah dianggap berhasil');
});

test('L52. Perbandingan perubahan hanya mengirim catatan yang benar-benar berubah',async()=>{
  const {hitungPerubahan}=await import('../src/services/lan-client.js');
  const lama={reportScores:{a:{n:1},b:{n:2}},students:{s1:{name:'A'}}};
  const baru={reportScores:{a:{n:1},b:{n:99}},students:{s1:{name:'A'}}};
  const perubahan=hitungPerubahan(lama,baru);
  assert.equal(perubahan.length,1,'hanya satu catatan yang berubah');
  assert.deepEqual(perubahan[0],{koleksi:'reportScores',kunci:'b',nilai:{n:99}});
});

test('L53. updatedAt tidak ikut dikirim sehingga guru tidak saling bertabrakan',async()=>{
  const {hitungPerubahan}=await import('../src/services/lan-client.js');
  const perubahan=hitungPerubahan({updatedAt:'lama',reportScores:{}},{updatedAt:'baru',reportScores:{}});
  assert.deepEqual(perubahan,[],'penanda waktu dokumen bukan catatan yang perlu dikirim');
});

test('L54. Catatan yang dihapus ikut terkirim sebagai penghapusan',async()=>{
  const {hitungPerubahan}=await import('../src/services/lan-client.js');
  const perubahan=hitungPerubahan({reportScores:{a:{n:1}}},{reportScores:{}});
  assert.deepEqual(perubahan,[{koleksi:'reportScores',kunci:'a',nilai:null}]);
});

test('L65. Login LAN tidak boleh memerlukan pembacaan database lebih dulu',()=>{
  /* BUG NYATA YANG DITEMUKAN VERIFIKASI BROWSER. Versi pertama memvalidasi semester di
     halaman sebelum login. Validasi itu membaca Data Referensi dari database, sedangkan
     database baru boleh dibaca setelah ada sesi - sehingga login LAN SELALU gagal dengan
     "Sesi Anda sudah berakhir". Unit test tidak menemukannya karena unit test memanggil
     server langsung, bukan lewat jalur authenticate() milik halaman.

     Sekarang server yang memutuskan: ia mencari semester pada Data Referensi miliknya sendiri
     dan menolak yang tidak tersedia. Pemeriksaannya tidak hilang, hanya pindah ke pihak yang
     memang sudah memegang datanya. */
  const auth=kodeSaja('src/services/auth.js');
  /* Yang diiris HANYA cabang LAN di dalam authenticate(). sessionFor() memang memanggil
     validateSemester, dan itu benar: ia dijalankan SESUDAH login, ketika database sudah
     dapat dibaca. Yang dilarang adalah memanggilnya SEBELUM sesi ada. */
  const mulai=auth.indexOf('export async function authenticate');
  const cabang=auth.slice(mulai,auth.indexOf('assertLicenseAllowsLogin();',mulai));
  assert.ok(cabang.includes('modeLanAktif()'),'irisan memuat cabang LAN');
  assert.equal(/validateSemester|resolveSemesterAcademicYear/.test(cabang),false,
    'cabang LAN tidak memanggil validasi yang membaca database sebelum login');
  assert.match(cabang,/masukLan\(\{role,username,password,semester\}\)/,
    'kredensial dikirim apa adanya ke server');
  const sesi=kodeSaja('electron/lan-session.cjs');
  assert.match(sesi,/function tahunUntukSemester\(doc,semester\)/,'server yang me-resolve tahun pelajaran');
  assert.match(sesi,/academicYear:tahun/,'tahun pelajaran sesi berasal dari server');
  assert.equal(/academicYear:String\(academicYear/.test(sesi),false,
    'tahun pelajaran TIDAK pernah diambil dari permintaan klien');
});

test('L66. Semester di luar Data Referensi ditolak server',async()=>{
  const {app}=await serverBaru();
  const j=await permintaan(app,{jalur:'login',method:'POST',
    body:{username:'guru5b',password:'RahasiaGuru1',role:'teacher',
      semester:'Ganjil 2099/2100',academicYear:'2099/2100'}});
  assert.equal(j.status,401);
  assert.match(JSON.parse(j.body).error,/Data Referensi/i);
});

test('L67. Tahun pelajaran yang dipalsukan klien tidak mengubah cakupan',async()=>{
  const {app,store}=await serverBaru();
  /* Klien menyebut tahun lain saat login. Server mengabaikannya dan memakai tahun dari Data
     Referensi, sehingga proyeksinya tetap tahun yang sah. */
  const doc=JSON.parse(store.baca().raw);
  doc.reportScores['2024/2025|Ganjil 2024/2025|5B|agama|5B-s0']={finalScore:33};
  store.tulisLangsung(JSON.stringify(doc));
  const app2=createLanServer({store,bacaLisensi:()=>({canUseApp:true})});
  app2.muat();
  const j=await permintaan(app2,{jalur:'login',method:'POST',
    body:{username:'guru5b',password:'RahasiaGuru1',role:'teacher',
      semester:SEMESTER,academicYear:'2024/2025'}});
  assert.equal(JSON.parse(j.body).sesi.academicYear,TAHUN,'tahun pelajaran diambil dari Data Referensi');
});

test('L68. Hasil normalisasi loadDb tidak ikut terkirim sebagai perubahan',async()=>{
  /* BUG NYATA KEDUA YANG DITEMUKAN VERIFIKASI BROWSER. loadDb() menormalkan masterData setiap
     kali membaca - menggabungkan identitas sekolah dengan bawaannya, menyusun ulang daftar
     kelas dan guru. Ketika perubahan dihitung terhadap teks mentah dari server, seluruh hasil
     normalisasi itu terbaca sebagai "berubah", sehingga setiap guru yang menyimpan SATU nilai
     tampak hendak mengubah data bersama sekolah - dan penyimpanannya ditolak otorisasi.

     Pembanding karena itu disetel ke dokumen SESUDAH normalisasi. */
  const {hitungPerubahan}=await import('../src/services/lan-client.js');
  const mentahDariServer={masterData:{school:{name:'SD Uji'}},reportScores:{a:{n:1}}};
  const sesudahNormalisasi={masterData:{school:{name:'SD Uji',npsn:''},admin:{name:'Administrator'},
    classes:['1A'],teachers:{'1A':{classId:'1A'}}},reportScores:{a:{n:1}}};
  assert.ok(hitungPerubahan(mentahDariServer,sesudahNormalisasi).length>0,
    'terhadap teks mentah, normalisasi memang terbaca sebagai perubahan');
  assert.deepEqual(hitungPerubahan(sesudahNormalisasi,sesudahNormalisasi),[],
    'terhadap dokumen sesudah normalisasi, tidak ada perubahan palsu');
  /* Dan satu perubahan nyata tetap terkirim. */
  const diubah=JSON.parse(JSON.stringify(sesudahNormalisasi));
  diubah.reportScores.a={n:2};
  assert.deepEqual(hitungPerubahan(sesudahNormalisasi,diubah),
    [{koleksi:'reportScores',kunci:'a',nilai:{n:2}}]);
  const storage=kodeSaja('src/services/storage.js');
  assert.match(storage,/if\(modeLanAktif\(\)\)tandaiProyeksiLan\(db\);/,
    'pembanding disetel tepat setelah normalisasi di loadDb');
});

test('L69. Browser tanpa catatan lisensi tidak mematikan Server LAN',()=>{
  /* RISIKO NYATA YANG DITEMUKAN SAAT VERIFIKASI BROWSER. Membuka e-Rapor dengan browser lain
     di komputer server membuat status lisensi terbaca UNLICENSED - bukan karena lisensinya
     bermasalah, melainkan karena profil browser itu belum memuat catatannya. Mendorong
     pembacaan itu akan memutus seluruh guru dari Server LAN tanpa sebab. */
  const t=kodeSaja('src/services/lan-admin.js');
  assert.match(t,/if\(!state\?\.record\)return false;/,
    'keadaan tanpa catatan lisensi tidak pernah didorong ke server');
  /* Pencabutan tetap tersampaikan, sebab lisensi yang dicabut selalu membawa catatannya. */
  assert.match(t,/canUseApp:Boolean\(state\?\.canUseApp\)/);
  const main=kodeSaja('electron/main.cjs');
  assert.match(main,/if\(!muatan\?\.canUseApp\)\{hentikanLan\(\);/,
    'lisensi yang dinyatakan tidak berlaku tetap mematikan LAN seketika');
});

/* ============================================================== 55-58. SERVICE WORKER */

test('L55. Service worker tidak pernah menyentuh endpoint LAN maupun autentikasi',()=>{
  const t=baca('sw.js');
  assert.match(t,/function isStorageEndpoint\(url\)\{return new URL\(url\)\.pathname\.startsWith\('\/__erapor\/'\);\}/,
    'seluruh jalur __erapor - termasuk /lan/ dan /lan-control/ - dilepas apa adanya');
  assert.match(t,/addEventListener\('fetch',event=>\{if\(isStorageEndpoint\(event\.request\.url\)\)return;/,
    'diperiksa PALING AWAL, sebelum cabang cache mana pun');
  assert.equal(t.includes("'./src/services/lan-client.js'"),true);
  assert.equal(t.includes("'./src/pages/lan-server.js'"),true);
});

test('L56. Jawaban LAN memakai no-store sehingga tidak tertinggal untuk pengguna berikutnya',async()=>{
  const {app}=await serverBaru();
  const guru=await masukGuru(app,'5B');
  const j1=await permintaan(app,{jalur:'state',cookie:guru.cookie,csrf:guru.csrf});
  assert.equal(j1.headers['Cache-Control'],'no-store');
  const login=await permintaan(app,{jalur:'login',method:'POST',
    body:{username:'guru4a',password:'RahasiaGuru1',role:'teacher',semester:SEMESTER,academicYear:TAHUN}});
  assert.equal(login.headers['Cache-Control'],'no-store','jawaban login pun tidak boleh di-cache');
});

test('L57. Pengguna berbeda pada browser yang sama menerima proyeksi masing-masing',async()=>{
  const {app}=await serverBaru();
  const a=await masukGuru(app,'5B');
  const b=await masukGuru(app,'4A');
  const dbA=JSON.parse((await ambilState(app,a)).isi.database);
  const dbB=JSON.parse((await ambilState(app,b)).isi.database);
  assert.ok(Object.keys(dbA.students).every(k=>k.startsWith(scopeOf('5B'))));
  assert.ok(Object.keys(dbB.students).every(k=>k.startsWith(scopeOf('4A'))));
  assert.equal(Object.keys(dbA.userAccounts)[0],'teacher:5B');
  assert.equal(Object.keys(dbB.userAccounts)[0],'teacher:4A');
});

/* ================================================== 58-62. ISOLASI SEMESTER DAN TAHUN */

test('L58. Semester lain tidak ikut terkirim kepada guru',async()=>{
  const {app,store}=await serverBaru();
  const doc=JSON.parse(store.baca().raw);
  doc.reportScores[`${TAHUN}|Genap 2025/2026|5B|agama|5B-s0`]={finalScore:55};
  store.tulisLangsung(JSON.stringify(doc));
  const app2=createLanServer({store,bacaLisensi:()=>({canUseApp:true})});
  app2.muat();
  const sesi=await masukGuru(app2,'5B');
  const db=JSON.parse((await ambilState(app2,sesi)).isi.database);
  assert.equal(Object.keys(db.reportScores).some(k=>k.includes('Genap')),false,
    'semester lain tidak ikut, walau kelasnya sama');
});

test('L59. Tahun pelajaran lain tidak ikut terkirim kepada guru',async()=>{
  const {app,store}=await serverBaru();
  const doc=JSON.parse(store.baca().raw);
  doc.reportScores[`2024/2025|Ganjil 2024/2025|5B|agama|5B-s0`]={finalScore:44};
  store.tulisLangsung(JSON.stringify(doc));
  const app2=createLanServer({store,bacaLisensi:()=>({canUseApp:true})});
  app2.muat();
  const sesi=await masukGuru(app2,'5B');
  const db=JSON.parse((await ambilState(app2,sesi)).isi.database);
  assert.equal(Object.keys(db.reportScores).some(k=>k.startsWith('2024/2025')),false);
});

test('L60. Menulis ke semester lain ditolak walau kelasnya sama',async()=>{
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const {isi}=await ambilState(app,sesi);
  const j=await mutasi(app,sesi,[{koleksi:'reportScores',
    kunci:`${TAHUN}|Genap 2025/2026|5B|agama|5B-s0`,nilai:{finalScore:1}}],isi.rev);
  assert.equal(j.status,403);
});

/* ======================================================== 61-64. AKADEMIK TIDAK BERUBAH */

test('L61. Mesin perhitungan akademik tidak disentuh rilis ini',()=>{
  const report=kodeSaja('src/services/report.js');
  assert.match(report,/const roundedScore=rawScore===null\?null:Math\.round\(rawScore\)/,
    'satu titik pembulatan kanonik tetap sama');
  assert.match(report,/if\(previous\?\.isManualOverride\)\{saved\.push\(previous\);return;\}/,
    'penjaga override manual tetap ada');
  /* Yang diperiksa adalah KETERGANTUNGAN, bukan kemunculan huruf: mesin nilai tidak boleh
     mengimpor apa pun yang berhubungan dengan jaringan. Mencocokkan potongan kata akan salah
     menuduh - kata "TAMPILAN" pun memuat huruf LAN. */
  const impor=[...report.matchAll(/^import .*?from '([^']+)';$/gm)].map(m=>m[1]);
  for(const modul of impor)
    assert.equal(/lan-client|lan-admin|db-backend/.test(modul),false,
      `mesin nilai tidak bergantung pada ${modul}`);
  assert.deepEqual(impor.filter(m=>m.includes('storage')),['./storage.js'],
    'satu-satunya jalur data tetap storage.js, persis seperti sebelumnya');
});

test('L62. scopeKey tidak berubah bentuknya',async()=>{
  const {scopeKey}=await import('../src/services/storage.js');
  assert.equal(scopeKey({academicYear:TAHUN,semester:SEMESTER,classId:'5B',role:'teacher'}),scopeOf('5B'));
  assert.equal(scopeKey({academicYear:TAHUN,semester:SEMESTER,classId:'5B',role:'admin'}),`${TAHUN}|${SEMESTER}|ALL`);
});

test('L63. APP_SCHEMA_VERSION tetap 5: yang berubah transportnya, bukan bentuk data',async()=>{
  const {APP_SCHEMA_VERSION}=await import('../src/data/version.js');
  assert.equal(APP_SCHEMA_VERSION,5);
  /* Proyeksi memakai koleksi dan bentuk kunci yang sama persis dengan dokumen aslinya. */
  const {app}=await serverBaru();
  const sesi=await masukGuru(app,'5B');
  const db=JSON.parse((await ambilState(app,sesi)).isi.database);
  assert.equal(db.appSchemaVersion,5);
  assert.ok(db.students[`${scopeOf('5B')}|5B-s0`],'bentuk kunci tidak berubah di dalam proyeksi');
});

test('L64. Android tidak diubah pada rilis ini',()=>{
  const gradle=baca('android/app/build.gradle');
  assert.match(gradle,/applicationId "id\.sch\.sdn\.satriajaya01\.erapor"/);
  const storage=baca('src/services/storage.js');
  assert.match(storage,/return localStorage\.getItem\(DB_KEY\);/,
    'tanpa penanda LAN maupun penanda server, Android tetap memakai localStorage');
});

/* ================================================================= 65-70. IKON WINDOWS */

const ico=()=>fs.readFileSync(new URL('build/icon.ico',root));

test('I1. Sumber ikon Windows adalah master ikon Android yang sudah dipakai APK',()=>{
  const master=fs.readFileSync(new URL('assets/android-icon-master.png',root));
  const androidLauncher=fs.readFileSync(new URL('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',root));
  const appIcon192=fs.readFileSync(new URL('assets/app-icon-192.png',root));
  assert.equal(master.readUInt32BE(16),1024,'master beresolusi tinggi');
  assert.deepEqual(androidLauncher,appIcon192,'ikon launcher Android memang berasal dari aset yang sama');
  const skrip=baca('scripts/generate-windows-icon.mjs');
  assert.match(skrip,/'assets','android-icon-master\.png'/,'skrip memakai master Android, bukan gambar baru');
});

test('I2. Berkas ICO valid dan bukan PNG yang diganti namanya',()=>{
  const b=ico();
  assert.equal(b.readUInt16LE(0),0,'kolom reserved bernilai nol');
  assert.equal(b.readUInt16LE(2),1,'bertipe ICO');
  assert.ok(b.readUInt16LE(4)>=7,'memuat banyak gambar');
  assert.equal(b.slice(0,8).toString('hex')==='89504e470d0a1a0a',false,'bukan berkas PNG yang diganti namanya');
});

test('I3. Seluruh resolusi yang diminta benar-benar ada dan berukuran benar',()=>{
  const b=ico();
  const jumlah=b.readUInt16LE(4);
  const ditemukan=[];
  for(let i=0;i<jumlah;i+=1){
    const o=6+i*16;
    const lebar=b.readUInt8(o)||256;
    const panjang=b.readUInt32LE(o+8), offset=b.readUInt32LE(o+12);
    const isi=b.slice(offset,offset+panjang);
    assert.equal(isi.slice(0,8).toString('hex'),'89504e470d0a1a0a',`entri ${lebar} berisi gambar PNG yang sah`);
    /* Ukuran yang DIAKUI entri harus sama dengan ukuran gambar yang sebenarnya. */
    assert.equal(isi.readUInt32BE(16),lebar,`entri ${lebar} benar-benar berukuran ${lebar}`);
    assert.equal(isi.readUInt32BE(20),lebar,`entri ${lebar} bujur sangkar`);
    assert.equal(b.readUInt16LE(o+6),32,`entri ${lebar} memakai 32 bit dengan alpha`);
    ditemukan.push(lebar);
  }
  for(const n of [16,24,32,48,64,128,256])
    assert.ok(ditemukan.includes(n),`resolusi ${n} tersedia`);
});

test('I4. Ukuran tiap gambar naik sesuai resolusinya, tanda pengecilan benar-benar terjadi',()=>{
  const b=ico();
  const jumlah=b.readUInt16LE(4);
  const daftar=[];
  for(let i=0;i<jumlah;i+=1){
    const o=6+i*16;
    daftar.push({n:b.readUInt8(o)||256,panjang:b.readUInt32LE(o+8)});
  }
  daftar.sort((a,b2)=>a.n-b2.n);
  for(let i=1;i<daftar.length;i+=1)
    assert.ok(daftar[i].panjang>daftar[i-1].panjang,
      `gambar ${daftar[i].n} lebih besar daripada ${daftar[i-1].n}`);
});

test('I5. electron-builder memakai ikon itu untuk EXE, installer, dan shortcut',()=>{
  const yml=baca('electron-builder.yml');
  assert.match(yml,/^\s{2}icon:\s*build\/icon\.ico$/m,'ikon EXE dan shortcut');
  assert.match(yml,/installerIcon:\s*build\/icon\.ico/,'ikon installer');
  assert.match(yml,/uninstallerIcon:\s*build\/icon\.ico/,'ikon uninstaller dan Add/Remove Programs');
  assert.match(yml,/installerHeaderIcon:\s*build\/icon\.ico/);
  assert.match(yml,/createDesktopShortcut:\s*true/);
  assert.match(yml,/createStartMenuShortcut:\s*true/);
});

test('I6. Identitas aplikasi Windows TIDAK berubah oleh penggantian ikon',()=>{
  const yml=baca('electron-builder.yml');
  assert.match(yml,/appId:\s*id\.sch\.sdn\.satriajaya01\.erapor/);
  assert.match(yml,/productName:\s*e-Rapor SDN Satria Jaya 01/);
  assert.match(yml,/guid:\s*9a3f0d21-6c4b-5e88-9d17-2f6a1b7c4e30/);
  assert.match(yml,/deleteAppDataOnUninstall:\s*false/);
  const main=baca('electron/main.cjs');
  assert.match(main,/const USER_DATA_FOLDER='e-Rapor SDN Satria Jaya 01'/);
  assert.match(main,/setAppUserModelId\('id\.sch\.sdn\.satriajaya01\.erapor'\)/);
});

test('I7. Ikon Windows generik: tidak ada nama sekolah yang ditanam ke dalamnya',()=>{
  /* Ikonnya adalah master Android apa adanya, dan master itu sudah generik. Yang diperiksa di
     sini: tidak ada langkah dalam pembuatan ikon yang menambahkan teks apa pun. */
  const skrip=baca('scripts/generate-windows-icon.mjs');
  assert.equal(/fillText|drawText|font\s*=/.test(skrip),false,'tidak ada teks yang digambar ke ikon');
  assert.equal(/SATRIA|Satria/.test(skrip),false,'nama sekolah tidak pernah disebut pembuat ikon');
  assert.match(skrip,/ctx\.drawImage\(gambar,0,0,gambar\.width,gambar\.height,0,0,n,n\)/,
    'gambar disalin utuh tanpa dipotong dan tanpa diregangkan');
});

test('I8. Ikon Android tidak diubah oleh rilis ini',()=>{
  const master=fs.readFileSync(new URL('assets/android-icon-master.png',root));
  const iconOnly=fs.readFileSync(new URL('assets/icon-only.png',root));
  assert.deepEqual(master,iconOnly,'aset ikon Android tetap seperti adanya');
  const skrip=baca('scripts/generate-windows-icon.mjs');
  assert.equal(/mipmap|ic_launcher|android\//.test(skrip),false,
    'pembuat ikon Windows tidak pernah menulis ke folder Android');
});
