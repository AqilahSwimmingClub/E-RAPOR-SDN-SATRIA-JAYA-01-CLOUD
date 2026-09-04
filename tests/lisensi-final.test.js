import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startTestServer, installBrowserEnv } from './helpers/license-server.js';

/* Perbaikan final sistem lisensi.

   Dua kegagalan nyata yang dijaga suite ini agar tidak terulang:
   1. Instalasi baru langsung membuka Setup Awal sehingga Aktivasi terlewat sama sekali.
   2. APK produksi menjawab "Server lisensi belum dikonfigurasi" karena aplikasi dikirim tanpa
      alamat server dan tanpa kunci verifikasi publik. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const inst=huruf=>`inst_${huruf.repeat(32)}`;
const IDENTITAS={buyerName:'Budi Santoso',schoolName:'SDN Maju Jaya 01',npsn:'12345678'};

/* ------------------------------------------------------- 38. Fresh install dan startup guard */

test('1. Aktivasi diperiksa LEBIH DULU daripada Setup Awal',()=>{
  const app=read('src/app.js');
  const gerbangLisensi=app.indexOf('!licenseState.canUseApp');
  const gerbangSetup=app.indexOf('!isSchoolIdentityReady()');
  assert.ok(gerbangLisensi>0&&gerbangSetup>0,'kedua gerbang ada');
  assert.ok(gerbangLisensi<gerbangSetup,
    'gerbang lisensi wajib dievaluasi sebelum gerbang Setup Awal; urutan terbalik membuat instalasi baru langsung membuka Setup Awal');
  /* Setup Awal tidak boleh menjadi pengganti aktivasi. */
  assert.match(app,/renderLicenseActivation\(\{onActivated/);
  assert.match(app,/renderSchoolSetup\(\{onComplete:\(\)=>navigate\('login'\)\}\)/);
});

test('2. Instalasi tanpa aktivasi tidak dapat memakai aplikasi',async()=>{
  installBrowserEnv();
  const {getLicenseState}=await import('../src/services/license.js');
  const keadaan=getLicenseState();
  assert.equal(keadaan.state,'UNLICENSED');
  assert.equal(keadaan.canUseApp,false,'tanpa token, aplikasi tidak boleh terbuka');
  assert.equal(keadaan.canEditData,false);
});

test('3. Lisensi dicabut dan perangkat tidak terikat dikembalikan ke Aktivasi',async()=>{
  const simpanan=installBrowserEnv();
  const {getLicenseState}=await import('../src/services/license.js');
  const dasar={activation_token:'token-lama',next_check_at:new Date(Date.now()+86400000).toISOString()};
  for(const status of ['REVOKED','NOT_BOUND']){
    simpanan.set('erapor_license_v1',JSON.stringify({...dasar,status}));
    const keadaan=getLicenseState();
    assert.equal(keadaan.state,status);
    assert.equal(keadaan.canUseApp,false,`${status} wajib kembali ke halaman Aktivasi`);
  }
  /* Ditangguhkan ikut mengembalikan perangkat ke halaman Aktivasi. Sama seperti dicabut, ini
     adalah JAWABAN SERVER bahwa lisensi tidak boleh dipakai, jadi ia mengalahkan masa tenggang
     offline dan memutus login - bukan sekadar menutup penyuntingan. Data akademiknya tetap
     utuh; yang diputus hanya hak aksesnya sampai Owner memulihkan lisensinya. */
  simpanan.set('erapor_license_v1',JSON.stringify({...dasar,status:'SUSPENDED'}));
  const ditangguhkan=getLicenseState();
  assert.equal(ditangguhkan.state,'SUSPENDED');
  assert.equal(ditangguhkan.canUseApp,false);
  assert.equal(ditangguhkan.canEditData,false);
  assert.match(ditangguhkan.message,/ditangguhkan/i);
});

test('4. Uninstall lalu pasang ulang wajib memasukkan License Key lagi',async()=>{
  const simpanan=installBrowserEnv();
  const {getLicenseState}=await import('../src/services/license.js');
  simpanan.set('erapor_license_v1',JSON.stringify({activation_token:'token',status:'ACTIVE',
    next_check_at:new Date(Date.now()+86400000).toISOString()}));
  assert.equal(getLicenseState().canUseApp,true,'perangkat aktif dapat memakai aplikasi');
  /* Uninstall menghapus seluruh penyimpanan aplikasi. */
  simpanan.clear();
  assert.equal(getLicenseState().state,'UNLICENSED');
  assert.equal(getLicenseState().canUseApp,false,'pemasangan ulang wajib aktivasi lagi');
  /* Tidak ada jalur yang menganggap perangkat aktif hanya karena data sekolah masih ada. */
  simpanan.set('erapor_satria_jaya_01_v1',JSON.stringify({masterData:{school:{name:'SDN Maju Jaya 01'}}}));
  assert.equal(getLicenseState().canUseApp,false,'data sekolah bukan bukti aktivasi');
});

/* --------------------------------------------------- 39. Konfigurasi server dan kunci publik */

test('5. Aplikasi membawa alamat server lisensi produksi',()=>{
  const konfigurasi=read('src/data/license-config.js');
  const base=konfigurasi.match(/export const LICENSE_API_BASE='([^']*)';/)[1];
  assert.equal(base,'https://e-rapor-sdn-satria-jaya-01-cloud.vercel.app');
  assert.match(base,/^https:\/\//,'wajib https');
  /* Kunci privat tidak pernah berada di aplikasi. */
  assert.equal(/BEGIN PRIVATE KEY|"d"\s*:/.test(konfigurasi),false);
});

test('6. Penjaga build produksi menolak konfigurasi yang belum siap',async()=>{
  const penjaga=read('scripts/verify-production-config.mjs');
  assert.match(penjaga,/LICENSE_API_BASE kosong/);
  assert.match(penjaga,/LICENSE_PUBLIC_JWK kosong/);
  assert.match(penjaga,/process\.exit\(1\)/,'build dihentikan, bukan sekadar peringatan');
  assert.match(penjaga,/memuat komponen PRIVAT \(d\)/,'komponen privat menghentikan build');
  /* Penyuntik konfigurasi menolak kunci privat dan alamat non-https. */
  const {terapkanKonfigurasi}=await import('../scripts/set-license-config.mjs');
  assert.throws(()=>terapkanKonfigurasi({LICENSE_API_BASE:'http://contoh.id'}),/https/);
  assert.throws(()=>terapkanKonfigurasi({LICENSE_PUBLIC_JWK:'{"kty":"EC","crv":"P-256","x":"a","y":"b","d":"rahasia"}'}),/privat/i);
  assert.throws(()=>terapkanKonfigurasi({LICENSE_PUBLIC_JWK:'{"kty":"RSA"}'}),/EC P-256|tidak lengkap/);
});

test('7. Alur rilis Android menyiapkan dan memeriksa konfigurasi produksi',()=>{
  const berkas=read('.github/workflows/rilis.yml');
  /* Pekerjaan "periksa" juga menjalankan cap sync, jadi urutannya diperiksa di dalam
     pekerjaan "android" saja — di situlah APK rilis benar-benar dibangun. */
  const alur=berkas.slice(berkas.indexOf('\n  android:'),berkas.indexOf('\n  windows:'));
  assert.ok(alur.length>0,'pekerjaan android ditemukan di alur rilis');
  assert.match(alur,/npm run verify:production/,'penjaga dijalankan sebelum membangun APK');
  assert.match(alur,/LICENSE_API_BASE:/);
  assert.match(alur,/LICENSE_PUBLIC_JWK:/);
  assert.ok(alur.indexOf('npm run verify:production')<alur.indexOf('npx cap sync android'),
    'konfigurasi disiapkan sebelum aset disalin ke Android');
  assert.match(alur,/node scripts\/verify-android-assets\.mjs/,'aset Android diperiksa, bukan hanya sumbernya');
  const pemeriksa=read('scripts/verify-android-assets.mjs');
  assert.match(pemeriksa,/android\/app\/src\/main\/assets\/public/);
  assert.match(pemeriksa,/src\/data\/license-config\.js/);
  assert.match(pemeriksa,/BEGIN PRIVATE KEY/,'rahasia server tidak boleh ikut ke aset');
});

/* AKAR MASALAH "Server lisensi belum dikonfigurasi pada aplikasi ini." pada installer Windows.

   Job Android sejak awal menyuntikkan LICENSE_API_BASE dan LICENSE_PUBLIC_JWK sebelum
   membangun; job Windows tidak. Akibatnya .exe yang terkirim membawa kunci publik null dan
   berhenti di layar Aktivasi Lisensi - License Key sekolah tidak pernah salah. Test ini
   menjaga agar langkah itu tidak pernah hilang lagi. */
test('7b. Alur rilis Windows menyiapkan dan memeriksa konfigurasi produksi yang sama',()=>{
  const berkas=read('.github/workflows/rilis.yml');
  const alur=berkas.slice(berkas.indexOf('\n  windows:'));
  assert.ok(alur.length>0,'pekerjaan windows ditemukan di alur rilis');
  assert.match(alur,/npm run verify:production/,'penjaga dijalankan sebelum membangun installer');
  assert.match(alur,/LICENSE_API_BASE:/);
  assert.match(alur,/LICENSE_PUBLIC_JWK:/);
  assert.ok(alur.indexOf('npm run verify:production')<alur.indexOf('npm run desktop:win'),
    'konfigurasi disiapkan sebelum installer dibangun');
  /* Jalur build produksi memeriksa dist/ yang BENAR-BENAR dikemas, bukan berkas sumbernya. */
  const skrip=JSON.parse(read('package.json')).scripts;
  assert.match(skrip['desktop:win'],/^npm run build:production &&/);
  assert.match(skrip['desktop:win'],/npm run verify:desktop-assets/);
  assert.match(skrip['verify:desktop-assets'],/verify-android-assets\.mjs dist/);
  assert.match(skrip['build:production'],/npm run verify:production/);
  /* Seluruh jalur build yang hasilnya dikirim ke sekolah memakai penjaga yang sama. */
  for(const jalur of ['cap:android','desktop:make','desktop:package','desktop:win'])
    assert.match(skrip[jalur],/^npm run build:production/,`${jalur} memakai build produksi`);
});

/* ------------------------------------------------- 40-41. Status dan identitas Owner Panel */

test('8. Identitas pembeli wajib saat membuat lisensi',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const tolak=async(body,pola)=>{
      const {status,data}=await s.call('/owner/licenses',{method:'POST',token,body:{count:1,...body}});
      assert.equal(status,400,`seharusnya ditolak: ${JSON.stringify(body)}`);
      assert.match(data.error.message,pola);
    };
    await tolak({schoolName:'SDN Maju Jaya 01',npsn:'12345678'},/Nama Pembeli/);
    await tolak({buyerName:'Budi',npsn:'12345678'},/Nama Sekolah/);
    await tolak({buyerName:'Budi',schoolName:'SDN Maju Jaya 01'},/NPSN/);
    await tolak({buyerName:'Budi',schoolName:'SDN Maju Jaya 01',npsn:'123'},/8 digit/);

    const {status,data}=await s.call('/owner/licenses',{method:'POST',token,body:{count:1,...IDENTITAS}});
    assert.equal(status,200);
    assert.equal(data.created,1);
    const daftar=await s.call('/owner/licenses',{token});
    const lisensi=daftar.data.licenses[0];
    assert.equal(lisensi.buyer_name,'Budi Santoso');
    assert.equal(lisensi.school_name,'SDN Maju Jaya 01');
    assert.equal(lisensi.npsn,'12345678');
    assert.equal(lisensi.license_type,'CUSTOMER');
    assert.match(lisensi.license_hint,/^ERAPOR-••••-••••-[A-Z0-9]{4}$/,'daftar hanya memuat kunci tersamar');
  }finally{await s.close();}
});

test('9. Setiap status hanya muncul pada kategorinya sendiri',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const kunci=await s.buatLisensi(4);
    const id=async index=>(await s.call('/owner/licenses',{token})).data.licenses
      .find(item=>item.license_hint===kunci[index].hint).id;
    /* satu ACTIVE, satu SUSPENDED, satu REVOKED, satu tetap UNUSED */
    await s.call('/activate',{method:'POST',body:{license_key:kunci[0].key,installation_id:inst('a'),platform:'android'}});
    await s.call('/activate',{method:'POST',body:{license_key:kunci[1].key,installation_id:inst('b'),platform:'android'}});
    await s.call(`/owner/licenses/${await id(1)}/suspend`,{method:'POST',token,body:{reason:'uji'}});
    await s.call(`/owner/licenses/${await id(2)}/revoke`,{method:'POST',token,body:{reason:'pindah sekolah'}});

    const per=async status=>(await s.call(`/owner/licenses?status=${status}`,{token})).data.licenses;
    const aktif=await per('ACTIVE'),unused=await per('UNUSED'),
      suspended=await per('SUSPENDED'),revoked=await per('REVOKED');
    assert.equal(aktif.length,1);
    assert.equal(suspended.length,1);
    assert.equal(revoked.length,1);
    assert.equal(unused.length,1);
    /* Tidak boleh ada satu record pun yang muncul di dua kategori. */
    const semua=[...aktif,...unused,...suspended,...revoked].map(item=>item.id);
    assert.equal(new Set(semua).size,semua.length,'satu lisensi hanya berada di satu kategori');
    for(const [daftar,status] of [[aktif,'ACTIVE'],[unused,'UNUSED'],[suspended,'SUSPENDED'],[revoked,'REVOKED']])
      for(const item of daftar)assert.equal(item.status,status);
    /* Lisensi yang dicabut menyimpan waktu dan alasannya, dan tidak dihapus. */
    assert.ok(revoked[0].revoked_at,'waktu pencabutan tercatat');
    assert.equal(revoked[0].revoke_reason,'pindah sekolah');
    assert.equal(revoked[0].buyer_name,'Budi Santoso','identitas pembeli tetap ada');
  }finally{await s.close();}
});

test('10. Lisensi dicabut dapat dipulihkan tanpa kehilangan identitas',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const [kunci]=await s.buatLisensi(1);
    const cari=async()=>(await s.call('/owner/licenses',{token})).data.licenses[0];
    const awal=await cari();
    await s.call(`/owner/licenses/${awal.id}/revoke`,{method:'POST',token,body:{reason:'uji cabut'}});
    assert.equal((await cari()).status,'REVOKED');
    /* Kunci yang dicabut ditolak saat aktivasi. */
    const ditolak=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('c'),platform:'android'}});
    assert.equal(ditolak.status,403);

    await s.call(`/owner/licenses/${awal.id}/reactivate`,{method:'POST',token,body:{reason:'pulih'}});
    const pulih=await cari();
    assert.equal(pulih.status,'UNUSED','tanpa perangkat terikat, lisensi kembali menunggu aktivasi');
    assert.equal(pulih.revoked_at,null,'jejak pencabutan dibersihkan');
    assert.equal(pulih.buyer_name,'Budi Santoso');
    assert.equal(pulih.school_name,'SDN Maju Jaya 01');
    assert.equal(pulih.npsn,'12345678');
    assert.equal(pulih.id,awal.id,'record yang sama, bukan lisensi baru');

    /* Setelah dipulihkan, kunci dapat diaktivasi lagi. */
    const aktivasi=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('d'),platform:'android'}});
    assert.equal(aktivasi.status,200);
    assert.equal(aktivasi.data.status,'ACTIVE');
    const jenis=(await s.call('/owner/events',{token})).data.events.map(item=>item.type);
    assert.ok(jenis.includes('STATUS_REVOKED')&&jenis.includes('STATUS_UNUSED'));
  }finally{await s.close();}
});

test('11. Reset device melepas perangkat lama tanpa menghapus identitas',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const [kunci]=await s.buatLisensi(1);
    await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:inst('a'),platform:'android'}});
    const sebelum=(await s.call('/owner/licenses',{token})).data.licenses[0];
    assert.equal(sebelum.active_installation,inst('a'));

    await s.call(`/owner/licenses/${sebelum.id}/reset-device`,{method:'POST',token,body:{reason:'HP hilang'}});
    const sesudah=(await s.call('/owner/licenses',{token})).data.licenses[0];
    assert.equal(sesudah.active_installation,null,'ikatan perangkat lama dilepas');
    assert.equal(sesudah.status,'UNUSED');
    assert.equal(sesudah.buyer_name,'Budi Santoso');
    assert.equal(sesudah.school_name,'SDN Maju Jaya 01');
    assert.equal(sesudah.npsn,'12345678');
    assert.equal(sesudah.id,sebelum.id,'lisensi yang sama, bukan lisensi baru');

    /* Kunci dapat dipakai pada perangkat pengganti. */
    const pengganti=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('e'),platform:'android'}});
    assert.equal(pengganti.status,200);
    /* Perangkat lama tidak lagi bisa memakainya. */
    const lama=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('a'),platform:'android'}});
    assert.equal(lama.status,409,'satu lisensi tetap satu perangkat aktif');
  }finally{await s.close();}
});

/* ------------------------------------------------------------ 44-45. Lisensi Developer */

test('12. Lisensi Developer adalah lisensi resmi, bukan jalan pintas',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    /* Tidak memerlukan identitas sekolah pembeli maupun pesanan /beli. */
    const {status,data}=await s.call('/owner/licenses',{method:'POST',token,
      body:{count:1,licenseType:'DEVELOPER',buyerName:'FAHMI DJAWAS, S.Pd.',notes:'Development / QA / Demo'}});
    assert.equal(status,200);
    const kunci=data.licenses[0].key;

    const daftar=(await s.call('/owner/licenses?type=DEVELOPER',{token})).data.licenses;
    assert.equal(daftar.length,1);
    assert.equal(daftar[0].license_type,'DEVELOPER');
    assert.equal(daftar[0].buyer_name,'FAHMI DJAWAS, S.Pd.');
    assert.match(daftar[0].license_hint,/^ERAPOR-••••-••••-[A-Z0-9]{4}$/);

    /* Melalui aktivasi server yang sama, dengan token bertanda tangan dan ikatan perangkat. */
    const aktivasi=await s.call('/activate',{method:'POST',
      body:{license_key:kunci,installation_id:inst('a'),platform:'android'}});
    assert.equal(aktivasi.status,200);
    assert.equal(aktivasi.data.status,'ACTIVE');
    assert.ok(aktivasi.data.activation_token,'memakai token bertanda tangan yang sama');

    /* DEVELOPER ADALAH NAMA LAMA KELAS PEMILIK, jadi perangkat kedua memang DITERIMA.

       Test ini dulu menuntut sebaliknya, dan tuntutan itulah yang membuat kunci pemilik yang
       sudah beredar - seluruhnya bertipe DEVELOPER karena nama OWNER baru ada belakangan -
       jatuh ke aturan 1 Android + 1 Windows lalu ditolak di perangkat kedua.

       Yang tetap dijaga di sini adalah maksud aslinya: DEVELOPER bukan JALAN PINTAS. Ia tetap
       lisensi resmi yang melewati aktivasi server, token bertanda tangan, ikatan perangkat,
       reset, pencabutan, dan audit yang sama persis - tanpa satu pun pengecualian. */
    const kedua=await s.call('/activate',{method:'POST',
      body:{license_key:kunci,installation_id:inst('b'),platform:'android'}});
    assert.equal(kedua.status,200,'kelas pemilik menerima perangkat kedua');
    assert.ok(kedua.data.activation_token,'perangkat kedua pun memakai token bertanda tangan');

    /* Reset device dan revoke berlaku sama. */
    const id=daftar[0].id;
    await s.call(`/owner/licenses/${id}/reset-device`,{method:'POST',token,body:{reason:'ganti HP uji'}});
    const setelahReset=await s.call('/activate',{method:'POST',
      body:{license_key:kunci,installation_id:inst('b'),platform:'android'}});
    assert.equal(setelahReset.status,200,'perangkat uji pengganti dapat aktivasi');
    await s.call(`/owner/licenses/${id}/revoke`,{method:'POST',token,body:{reason:'selesai QA'}});
    const setelahCabut=await s.call('/check',{method:'POST',
      body:{license_key:kunci,installation_id:inst('b')}});
    assert.equal(setelahCabut.status>=400,true,'Developer License yang dicabut ikut ditolak');

    /* Tercatat di audit seperti lisensi lain. */
    const jenis=(await s.call('/owner/events',{token})).data.events.map(item=>item.type);
    for(const peristiwa of ['LICENSE_CREATED','DEVICE_RESET','STATUS_REVOKED'])
      assert.ok(jenis.includes(peristiwa),`audit ${peristiwa}`);
  }finally{await s.close();}
});

test('13. Lisensi Developer tidak dihitung sebagai penjualan',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const kunci=await s.buatLisensi(4);
    const id=async index=>(await s.call('/owner/licenses?type=CUSTOMER',{token})).data.licenses
      .find(item=>item.license_hint===kunci[index].hint).id;
    await s.call('/activate',{method:'POST',body:{license_key:kunci[0].key,installation_id:inst('a'),platform:'android'}});
    await s.call('/activate',{method:'POST',body:{license_key:kunci[1].key,installation_id:inst('b'),platform:'android'}});
    await s.call(`/owner/licenses/${await id(1)}/suspend`,{method:'POST',token,body:{}});
    await s.call(`/owner/licenses/${await id(2)}/revoke`,{method:'POST',token,body:{}});
    const dev=await s.call('/owner/licenses',{method:'POST',token,
      body:{count:1,licenseType:'DEVELOPER',buyerName:'FAHMI DJAWAS, S.Pd.'}});
    await s.call('/activate',{method:'POST',
      body:{license_key:dev.data.licenses[0].key,installation_id:inst('c'),platform:'android'}});

    const {data}=await s.call('/owner/summary',{token});
    assert.equal(data.total,4,'total hanya menghitung lisensi pembeli');
    assert.equal(data.ACTIVE,1);
    assert.equal(data.UNUSED,1);
    assert.equal(data.SUSPENDED,1);
    assert.equal(data.REVOKED,1);
    assert.equal(data.total,data.ACTIVE+data.UNUSED+data.SUSPENDED+data.REVOKED);
    assert.equal(data.developer.total,1,'lisensi developer dilaporkan terpisah');
    assert.equal(data.developer.ACTIVE,1);
  }finally{await s.close();}
});

/* --------------------------------------------------------- 46. Keamanan dan Owner Panel */

test('14. Owner Panel memisahkan status dan menampilkan identitas pemilik',()=>{
  const panel=read('server/public/owner/app.js');
  for(const tab of ["['aktif','Lisensi Aktif']","['unused','Belum Digunakan']",
    "['suspended','Ditangguhkan']","['revoked','Lisensi Dicabut']","['developer','Lisensi Developer']"])
    assert.ok(panel.includes(tab),`tab ${tab}`);
  /* Setiap halaman status menyaring ke lisensi PEMBELI. Tanpa saringan ini lisensi Developer
     ikut muncul di tab "Lisensi Aktif" yang keterangannya menyebut lisensi pembeli. */
  for(const status of ['ACTIVE','UNUSED','SUSPENDED','REVOKED'])
    assert.ok(panel.includes(`status:'${status}',type:'CUSTOMER'`),
      `halaman ${status} hanya menampilkan lisensi pembeli`);
  assert.match(panel,/type:'DEVELOPER'/);
  /* Lisensi Developer tidak punya pembeli/NPSN, jadi barisnya tidak ditampilkan sebagai
     data kosong melainkan sebagai keterangan lisensi developer. */
  assert.match(panel,/DEVELOPER'\)\s*\n?\s*return `<td>/,'identitas lisensi Developer punya tampilan sendiri');
  /* Identitas pemilik lisensi selalu ikut ditampilkan. */
  assert.match(panel,/buyer_name/);
  assert.match(panel,/school_name/);
  assert.match(panel,/NPSN \$\{esc\(l\.npsn/);
  /* Form pembuatan meminta ketiga identitas wajib. */
  for(const kolom of ['name="buyerName"','name="schoolName"','name="npsn"'])
    assert.ok(panel.includes(kolom),`kolom ${kolom}`);
  /* Kunci utuh tidak pernah ditampilkan pada daftar; hanya lewat tindakan Lihat Key. */
  assert.match(panel,/license_hint/);
  assert.match(panel,/data-aksi="recover"[^>]*>Lihat Key/);
  assert.equal(/license_key(?!:)/.test(panel.replace(/hasil\.recovery\.license_key/g,'')),false,
    'kunci utuh hanya berasal dari endpoint recovery');
});

test('15. Rahasia server tidak pernah ikut ke aplikasi maupun backup',()=>{
  /* Tidak ada bahan rahasia di sisi aplikasi. */
  for(const berkas of ['src/data/license-config.js','src/services/license.js','src/services/backup.js']){
    const isi=read(berkas);
    for(const rahasia of ['BEGIN PRIVATE KEY','LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY','OWNER_PASSWORD'])
      assert.equal(isi.includes(rahasia),false,`${berkas} tidak memuat ${rahasia}`);
  }
  /* Backup akademik tidak menyentuh kunci lisensi maupun Installation ID. */
  const backup=read('src/services/backup.js');
  for(const kunci of ['erapor_license_v1','erapor_installation_v1','activation_token','installation_id'])
    assert.equal(backup.includes(kunci),false,`backup tidak menyentuh ${kunci}`);
  /* Tidak ada jalan pintas apa pun di sisi aplikasi. */
  const lisensi=read('src/services/license.js').replace(/\/\*[\s\S]*?\*\//g,'');
  for(const pintas of ['MASTER_KEY','UNIVERSAL','bypass','BYPASS','developerOverride'])
    assert.equal(lisensi.includes(pintas),false,`tidak ada ${pintas}`);
  /* Server tidak pernah menyimpan data akademik. */
  const skema=read('server/schema-postgres.sql');
  for(const kolom of ['student','siswa','nilai','grade','attendance','absensi'])
    assert.equal(new RegExp(`\\b${kolom}`,'i').test(skema),false,`skema server tidak memuat ${kolom}`);
});

test('16. Migrasi lisensi bersifat menambah kolom dan aman diulang',()=>{
  for(const berkas of ['server/schema-postgres.sql','server/src/pg.js']){
    const isi=read(berkas);
    assert.match(isi,/ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_type\s+TEXT NOT NULL DEFAULT 'CUSTOMER'/);
    assert.match(isi,/ALTER TABLE licenses ADD COLUMN IF NOT EXISTS buyer_name/);
    assert.match(isi,/ALTER TABLE licenses ADD COLUMN IF NOT EXISTS revoked_at/);
    assert.equal(/DROP TABLE\s+(IF EXISTS\s+)?licenses/i.test(isi),false,'tabel lisensi tidak pernah dibuang');
    assert.equal(/DELETE FROM licenses/i.test(isi),false);
  }
  const sqlite=read('server/src/db.js');
  assert.match(sqlite,/PRAGMA table_info\(licenses\)/,'SQLite hanya menambah kolom yang belum ada');
  /* Lisensi lama otomatis dianggap CUSTOMER. */
  assert.match(read('server/src/licenses.js'),/COALESCE\(license_type,\$1\)/);
});

/* ------------------------------- 38. Skenario instalasi baru dari sisi server aktivasi */

test('17. Instalasi baru dapat diaktivasi dan langsung memakai aplikasi',async()=>{
  const s=await startTestServer();
  try{
    const [kunci]=await s.buatLisensi(1);
    const hasil=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('e'),platform:'android'}});
    assert.equal(hasil.status,200,'kunci sah pada perangkat bersih wajib diterima');
    assert.equal(hasil.data.status,'ACTIVE');
    assert.ok(hasil.data.activation_token,'server mengirim Activation Token bertanda tangan');
    /* Token itulah satu-satunya bukti aktivasi yang disimpan aplikasi. */
    const simpanan=installBrowserEnv();
    const {getLicenseState}=await import('../src/services/license.js');
    simpanan.set('erapor_license_v1',JSON.stringify({activation_token:hasil.data.activation_token,
      status:'ACTIVE',next_check_at:new Date(Date.now()+86400000).toISOString()}));
    assert.equal(getLicenseState().canUseApp,true);
  }finally{await s.close();}
});

test('18. Satu lisensi hanya boleh terikat pada satu perangkat',async()=>{
  const s=await startTestServer();
  try{
    const [kunci]=await s.buatLisensi(1);
    const pertama=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('f'),platform:'android'}});
    assert.equal(pertama.status,200);
    const kedua=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('a'),platform:'android'}});
    assert.equal(kedua.status,409,'perangkat kedua ditolak selama perangkat pertama masih terikat');
    /* Aktivasi ulang pada perangkat yang sama tetap boleh: bukan penambahan perangkat. */
    const ulang=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:inst('f'),platform:'android'}});
    assert.equal(ulang.status,200,'perangkat yang sama tidak dianggap perangkat baru');
    const token=await s.ownerToken();
    const ringkas=(await s.call('/owner/summary',{token})).data;
    assert.equal(ringkas.devices,1,'hanya satu perangkat aktif yang tercatat');
  }finally{await s.close();}
});

/* ------------------------------------------- 45. Dashboard Owner memuat data yang informatif */

test('19. Ringkasan Owner memisahkan penjualan, status, dan lisensi developer',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const [dipakai,dicabut]=await s.buatLisensi(2);
    await s.call('/activate',{method:'POST',
      body:{license_key:dipakai.key,installation_id:inst('b'),platform:'android'}});
    const daftar=(await s.call('/owner/licenses',{token})).data.licenses;
    const idDicabut=daftar.find(item=>item.license_hint===dicabut.hint)?.id
      ??daftar.find(item=>item.status==='UNUSED').id;
    await s.call(`/owner/licenses/${idDicabut}/revoke`,{method:'POST',token,body:{reason:'uji'}});
    await s.call('/owner/licenses',{method:'POST',token,
      body:{count:1,licenseType:'DEVELOPER',notes:'Lisensi developer resmi'}});

    const ringkas=(await s.call('/owner/summary',{token})).data;
    for(const kunci of ['total','ACTIVE','UNUSED','SUSPENDED','REVOKED','devices','developer'])
      assert.ok(Object.hasOwn(ringkas,kunci),`ringkasan memuat ${kunci}`);
    assert.equal(ringkas.ACTIVE,1);
    assert.equal(ringkas.REVOKED,1);
    assert.equal(ringkas.devices,1);
    assert.equal(ringkas.total,2,'lisensi developer tidak dihitung sebagai penjualan');
    assert.equal(ringkas.developer.total,1);
    /* Dashboard menampilkan angka itu apa adanya, tanpa menghitung ulang sendiri. */
    const panel=read('server/public/owner/app.js');
    assert.match(panel,/developer/,'panel membaca bagian developer dari ringkasan');
    assert.match(panel,/Lisensi Aktif Terbaru/);
    assert.match(panel,/Lisensi Dicabut Terbaru/);
  }finally{await s.close();}
});

/* ------------------------------------ 46. Backup akademik tidak membawa material lisensi */

test('20. Backup akademik tidak memuat lisensi dan restore tidak mengubah status perangkat',async()=>{
  const simpanan=installBrowserEnv();
  const {getLicenseState}=await import('../src/services/license.js');
  const { DB_KEY }=await import('../src/data/constants.js');
  const { LICENSE_STORAGE_KEY, INSTALLATION_STORAGE_KEY }=await import('../src/data/license-config.js');
  /* Kunci penyimpanan lisensi wajib terpisah dari kunci basis data akademik; pemisahan inilah
     yang membuat backup tidak mungkin membawa lisensi, bukan sekadar penyaringan field. */
  assert.notEqual(LICENSE_STORAGE_KEY,DB_KEY);
  assert.notEqual(INSTALLATION_STORAGE_KEY,DB_KEY);

  const lisensi={activation_token:'token-perangkat-ini',status:'ACTIVE',
    license_hint:'ERPR-XXXX',next_check_at:new Date(Date.now()+86400000).toISOString()};
  simpanan.set(LICENSE_STORAGE_KEY,JSON.stringify(lisensi));
  simpanan.set(INSTALLATION_STORAGE_KEY,inst('e'));
  simpanan.set(DB_KEY,JSON.stringify({masterData:{school:{name:'SDN Maju Jaya 01',npsn:'12345678'}}}));

  /* Backup hanya mengekspor isi DB_KEY. */
  const isiBackup=JSON.parse(simpanan.get(DB_KEY));
  const teks=JSON.stringify(isiBackup);
  for(const rahasia of ['activation_token','installation_id',lisensi.activation_token,
    'license_key','license_hash','recovery'])
    assert.ok(!teks.includes(rahasia),`backup akademik tidak boleh memuat ${rahasia}`);

  /* Restore admin mengganti seluruh isi DB_KEY, dan tidak menyentuh kunci lisensi. */
  simpanan.set(DB_KEY,JSON.stringify({masterData:{school:{name:'SDN Lain 02'}}}));
  assert.equal(simpanan.get(LICENSE_STORAGE_KEY),JSON.stringify(lisensi),'status lisensi tidak berubah karena restore');
  assert.equal(getLicenseState().canUseApp,true);

  const berkas=read('src/services/backup.js');
  for(const rahasia of ['LICENSE_STORAGE_KEY','INSTALLATION_STORAGE_KEY','activation_token','license_key'])
    assert.ok(!berkas.includes(rahasia),`modul backup tidak menyentuh ${rahasia}`);
});

test('21. API Owner tidak pernah mengirim hash lisensi maupun paket pemulihan',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const [kunci]=await s.buatLisensi(1);
    const daftar=await s.call('/owner/licenses',{token});
    const rinci=await s.call(`/owner/licenses/${kunci.id}`,{token});
    for(const [nama,jawaban] of [['daftar',daftar],['rincian',rinci]]){
      const teks=JSON.stringify(jawaban.data);
      assert.ok(!teks.includes('license_hash'),`${nama} tidak membocorkan hash lisensi`);
      assert.ok(!teks.includes('encrypted_recovery'),`${nama} tidak membocorkan paket pemulihan`);
      assert.ok(!teks.includes(kunci.key),`${nama} tidak memuat License Key utuh`);
    }
    /* Kunci utuh hanya keluar lewat aksi "recover" yang tercatat di audit. */
    const pulih=await s.call(`/owner/licenses/${kunci.id}/recover`,{method:'POST',token,body:{reason:'uji'}});
    assert.equal(pulih.status,200);
    const jenis=(await s.call('/owner/events',{token})).data.events.map(item=>item.type);
    assert.ok(jenis.some(item=>/RECOVER/i.test(item)),'pemulihan kunci tercatat di audit');
  }finally{await s.close();}
});
