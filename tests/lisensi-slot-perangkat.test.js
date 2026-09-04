import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { startTestServer, installBrowserEnv } from './helpers/license-server.js';
import { loadLicenseService } from './helpers/license-module.js';
import * as identitas from '../src/services/device-identity.js';
import { ensureInstallationId, getInstallationId, getInstallationSource,
  isInstallationId, resetInstallationId } from '../src/services/installation.js';
import * as lisensi from '../server/src/licenses.js';
import { verifyActivationToken } from '../server/src/crypto.js';

/* REVISI SISTEM LISENSI: DUA SLOT PERANGKAT, SATU BACKEND, IDENTITAS PERANGKAT NYATA.

   Yang diuji di sini adalah tiga hal yang sebelumnya tidak dijamin apa pun:

     1. Satu License Key melayani satu perangkat Android DAN satu komputer Windows, dan kedua
        slot itu tidak pernah saling memakan.
     2. Identitas perangkat diturunkan dari perangkatnya sendiri, bukan sekadar nilai acak di
        storage, sehingga menyalin storage tidak memindahkan lisensi.
     3. Jenis lisensi - termasuk OWNER yang tanpa batas perangkat - SELALU diputuskan server
        dari kolom database, tidak pernah dari badan permintaan client.

   Seluruh pemeriksaan berjalan di atas server lisensi sungguhan dengan SQLite sungguhan; tidak
   ada satu pun tiruan di jalur keputusan. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const inst=huruf=>`inst_${huruf.repeat(32)}`;
const A=inst('a'),B=inst('b'),C=inst('c');

function bersihkanKapasitor(){
  delete globalThis.Capacitor;
  delete globalThis.document;
}
function pasangAndroid(identifier){
  bersihkanKapasitor();
  globalThis.Capacitor={getPlatform:()=>'android',Plugins:{Device:{getId:async()=>({identifier})}}};
}
function pasangWindows(deviceId){
  bersihkanKapasitor();
  globalThis.document={querySelector:nama=>nama==='meta[name="erapor-desktop-device-id"]'
    ?{getAttribute:()=>deviceId}:null};
}

/* ------------------------------------------------------- Q1-Q8. Dua slot yang terpisah */

test('Q1-Q3. Satu kunci melayani satu Android dan satu Windows sekaligus',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();

  const android=await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  assert.equal(android.status,200,'slot Android terisi');
  const windows=await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:B,platform:'windows'}});
  assert.equal(windows.status,200,'slot Windows terisi tanpa mengusir Android');

  const aktif=s.db.prepare("SELECT slot,installation_id FROM device_activations WHERE license_id=? AND is_active=1 ORDER BY slot")
    .all(kunci.id).map(row=>({...row}));
  assert.deepEqual(aktif,[{slot:'android',installation_id:A},{slot:'windows',installation_id:B}]);
});

test('Q4-Q5. Perangkat ketiga ditolak pada slot mana pun, bukan menggusur yang ada',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:B,platform:'windows'}});

  for(const platform of ['android','windows']){
    const tolak=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:C,platform}});
    assert.equal(tolak.status,409,`slot ${platform} penuh`);
    assert.equal(tolak.data.error.code,'SLOT_TAKEN');
  }
  const jumlah=s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(kunci.id);
  assert.equal(jumlah.n,2,'penolakan tidak menggusur satu pun perangkat yang sudah terikat');
});

test('Q6. Aktivasi ulang perangkat yang sama tidak pernah memakan slot baru',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  for(let i=0;i<4;i++)
    assert.equal((await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:A,platform:'android'}})).status,200);
  const jumlah=s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(kunci.id);
  assert.equal(jumlah.n,1);
});

test('Q7. Aktivasi serentak pada satu slot: tepat satu yang menang, dijaga database',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  const perangkat=Array.from({length:8},(_,i)=>`inst_${String(i).padStart(32,'0')}`);
  const hasil=await Promise.allSettled(perangkat.map(id=>
    lisensi.activateLicense(s.store,{license_key:kunci.key,installation_id:id,platform:'windows'},s.secrets)));
  assert.equal(hasil.filter(item=>item.status==='fulfilled').length,1,'tepat satu aktivasi berhasil');
  const aktif=s.db.prepare("SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1 AND slot='windows'").get(kunci.id);
  assert.equal(aktif.n,1);
});

test('Q8. Perangkat yang sudah terikat kunci lain tidak dapat pindah tanpa Reset',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [satu,dua]=await s.buatLisensi(2);
  assert.equal((await s.call('/activate',{method:'POST',
    body:{license_key:satu.key,installation_id:A,platform:'android'}})).status,200);
  const pindah=await s.call('/activate',{method:'POST',
    body:{license_key:dua.key,installation_id:A,platform:'android'}});
  assert.equal(pindah.status,409);
  assert.equal(pindah.data.error.code,'DEVICE_BOUND_ELSEWHERE');
});

/* -------------------------------------------------- Q9-Q14. Reset per slot oleh Owner */

test('Q9-Q11. Reset Android hanya membebaskan Android; Windows tidak tersentuh',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  const token=await s.ownerToken();
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:B,platform:'windows'}});

  const reset=await s.call(`/owner/licenses/${kunci.id}/reset-device-android`,
    {method:'POST',token,body:{reason:'ganti HP'}});
  assert.equal(reset.status,200);
  assert.equal(reset.data.result.slot,'android');
  assert.equal(reset.data.result.remaining_active,1,'perangkat Windows tetap aktif');

  /* Perangkat Windows masih lolos pemeriksaan berkala. */
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:B,license_id:kunci.id}})).status,200);
  /* Perangkat Android lama tidak lagi terdaftar. */
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:A,license_id:kunci.id}})).data.error.code,'NOT_BOUND');
  /* Slot Android yang kosong dapat diisi perangkat baru. */
  assert.equal((await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:C,platform:'android'}})).status,200);
  /* Lisensi tetap ACTIVE karena masih ada perangkat aktif. */
  assert.equal(s.db.prepare('SELECT status FROM licenses WHERE id=?').get(kunci.id).status,'ACTIVE');
});

test('Q12. Reset Windows hanya membebaskan Windows; Android tidak tersentuh',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  const token=await s.ownerToken();
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:B,platform:'windows'}});

  const reset=await s.call(`/owner/licenses/${kunci.id}/reset-device-windows`,{method:'POST',token,body:{}});
  assert.equal(reset.status,200);
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:A,license_id:kunci.id}})).status,200,
    'perangkat Android tetap sah');
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:B,license_id:kunci.id}})).data.error.code,'NOT_BOUND');
});

test('Q13. Reset membutuhkan sesi Owner yang sah - tanpa itu ditolak 401',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  for(const aksi of ['reset-device','reset-device-android','reset-device-windows']){
    const tanpaSesi=await s.call(`/owner/licenses/${kunci.id}/${aksi}`,{method:'POST',body:{}});
    assert.equal(tanpaSesi.status,401,`${aksi} menolak permintaan tanpa sesi Owner`);
    const sesiPalsu=await s.call(`/owner/licenses/${kunci.id}/${aksi}`,
      {method:'POST',token:'token-karangan',body:{}});
    assert.equal(sesiPalsu.status,401,`${aksi} menolak token karangan`);
  }
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(kunci.id).n,1,
    'tidak ada slot yang terbebaskan oleh permintaan yang ditolak');
});

test('Q14. Reset slot kosong ditolak jelas dan tidak menyentuh slot seberang',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  const token=await s.ownerToken();
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  const kosong=await s.call(`/owner/licenses/${kunci.id}/reset-device-windows`,{method:'POST',token,body:{}});
  assert.equal(kosong.status,409);
  assert.equal(kosong.data.error.code,'NO_ACTIVE_DEVICE');
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:A,license_id:kunci.id}})).status,200);
});

/* ------------------------------------------- Q15-Q18. Status per slot untuk Admin Lisensi */

test('Q15-Q17. Admin Lisensi melihat status ANDROID dan WINDOWS secara terpisah',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  const token=await s.ownerToken();

  const kosong=(await s.call(`/owner/licenses/${kunci.id}`,{token})).data;
  assert.equal(kosong.slots.android.bound,false);
  assert.equal(kosong.slots.windows.bound,false);

  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  const sebagian=(await s.call(`/owner/licenses/${kunci.id}`,{token})).data;
  assert.equal(sebagian.slots.android.bound,true);
  assert.equal(sebagian.slots.android.installation_id,A);
  assert.equal(sebagian.slots.windows.bound,false,'slot Windows dilaporkan apa adanya: belum terikat');

  const daftar=(await s.call('/owner/licenses',{token})).data.licenses.find(item=>item.id===kunci.id);
  assert.equal(daftar.android_bound,true);
  assert.equal(daftar.windows_bound,false);
  assert.equal(daftar.active_devices,1);
});

test('Q18. Panel Owner menyediakan Reset Android dan Reset Windows yang terpisah',()=>{
  const panel=read('server/public/owner/app.js');
  for(const aksi of ['reset-device-android','reset-device-windows'])
    assert.ok(panel.includes(aksi),`panel memanggil aksi ${aksi}`);
  assert.match(panel,/Reset Android/);
  assert.match(panel,/Reset Windows/);
  /* Konfirmasinya menyatakan dengan jelas bahwa slot seberang tidak ikut dilepas. */
  assert.match(panel,/Perangkat Windows pada lisensi yang sama TIDAK ikut dilepas/);
  assert.match(panel,/Perangkat Android pada lisensi yang sama TIDAK ikut dilepas/);
});

/* ------------------------------------ Q19-Q24. Jenis lisensi diputuskan server, bukan client */

test('Q19-Q21. Client tidak dapat mengaku OWNER lewat badan permintaan',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:A,platform:'android'}});
  await s.call('/activate',{method:'POST',body:{license_key:kunci.key,installation_id:B,platform:'windows'}});

  /* Segala bentuk klaim tipe pada badan permintaan diabaikan sepenuhnya. */
  for(const klaim of [{license_type:'OWNER'},{licenseType:'OWNER'},{unlimited_devices:true},
    {slot:null},{license_type:'DEVELOPER',unlimited_devices:true}]){
    const tolak=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:C,platform:'android',...klaim}});
    assert.equal(tolak.status,409,`klaim ${JSON.stringify(klaim)} tidak memberi hak apa pun`);
    assert.equal(tolak.data.error.code,'SLOT_TAKEN');
  }
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(kunci.id).n,2);
  assert.equal(s.db.prepare('SELECT license_type FROM licenses WHERE id=?').get(kunci.id).license_type,'CUSTOMER',
    'jenis lisensi di database tidak berubah oleh permintaan client');
});

test('Q22. Lisensi OWNER dibuat Owner dan boleh dipakai banyak perangkat',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const token=await s.ownerToken();
  const {data}=await s.call('/owner/licenses',{method:'POST',token,
    body:{count:1,licenseType:'OWNER',buyerName:'Pemilik Aplikasi',notes:'QA internal'}});
  assert.equal(data.licenses.length,1);
  const kunci=data.licenses[0];

  for(const [id,platform] of [[A,'android'],[B,'windows'],[C,'android']])
    assert.equal((await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:id,platform}})).status,200,`${id} diterima`);
  const baris=s.db.prepare('SELECT slot FROM device_activations WHERE license_id=? AND is_active=1').all(kunci.id);
  assert.equal(baris.length,3,'lisensi OWNER tidak dibatasi dua slot');
  assert.ok(baris.every(row=>row.slot===null),'baris OWNER tidak memakai slot sama sekali');
});

test('Q23. Lisensi DEVELOPER tetap tunduk pada aturan slot, bukan jalan pintas',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const token=await s.ownerToken();
  const {data}=await s.call('/owner/licenses',{method:'POST',token,
    body:{count:1,licenseType:'DEVELOPER',buyerName:'QA'}});
  const kunci=data.licenses[0];
  assert.equal((await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:A,platform:'android'}})).status,200);
  const kedua=await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:B,platform:'android'}});
  assert.equal(kedua.status,409,'DEVELOPER tetap satu perangkat per slot');
  assert.equal(kedua.data.error.code,'SLOT_TAKEN');
});

test('Q24. Token aktivasi membawa slot dan jenis lisensi hasil keputusan server',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  const {data}=await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:A,platform:'android',license_type:'OWNER'}});
  /* Token diverifikasi dengan kunci PUBLIK server, sama seperti yang dilakukan aplikasi -
     bukan sekadar dibongkar isinya. */
  const klaim=verifyActivationToken(data.activation_token,s.publicJwk);
  assert.ok(klaim,'tanda tangan token sah');
  assert.equal(klaim.slot,'android');
  assert.equal(klaim.license_type,'CUSTOMER','klaim tipe dari client tidak pernah masuk ke token');
  assert.equal(klaim.unlimited_devices,false);
});

/* ----------------------------------------- Q25-Q30. Identitas perangkat di sisi aplikasi */

test('Q25. Identitas Android diturunkan dari Device ID, bukan nilai acak',async()=>{
  installBrowserEnv();
  pasangAndroid('7f3a-DEVICE-9c1b');
  const pertama=await ensureInstallationId();
  assert.ok(isInstallationId(pertama),`format Installation ID benar: ${pertama}`);
  assert.equal(getInstallationSource(),'android');

  /* Pemasangan ulang aplikasi mengosongkan storage. Selama Device ID-nya sama, Installation ID
     yang dihasilkan tetap sama - jadi memperbarui aplikasi tidak pernah dianggap perangkat baru. */
  resetInstallationId();
  assert.equal(await ensureInstallationId(),pertama,'nilainya stabil melewati pengosongan storage');

  /* Nilai mentah tidak pernah menjadi Installation ID apa adanya. */
  assert.equal(pertama.includes('7f3a'),false,'identitas mentah tidak ikut terkirim');
  bersihkanKapasitor();
});

test('Q26. Identitas Windows diturunkan dari nilai yang disuntikkan peluncur',async()=>{
  installBrowserEnv();
  pasangWindows('a'.repeat(64));
  const pertama=await ensureInstallationId();
  assert.ok(isInstallationId(pertama));
  assert.equal(getInstallationSource(),'windows');
  assert.equal(identitas.detectPlatform(),'windows');

  /* Komputer lain menghasilkan Installation ID lain. */
  pasangWindows('b'.repeat(64));
  resetInstallationId();
  assert.notEqual(await ensureInstallationId(),pertama);
  bersihkanKapasitor();
});

test('Q27. Android dan Windows dengan nilai mentah yang sama tetap berbeda',async()=>{
  const android=await identitas.hashDeviceId('android','NILAI-SAMA');
  const windows=await identitas.hashDeviceId('windows','NILAI-SAMA');
  assert.notEqual(android,windows,'pemisahan domain per sumber bekerja');
  /* Normalisasi: beda kapitalisasi dan pemisah tidak melahirkan identitas baru. */
  assert.equal(await identitas.hashDeviceId('windows','AB-CD_ef'),
    await identitas.hashDeviceId('windows','abcdef'));
});

test('Q28-Q29. Menyalin storage dari perangkat A ke perangkat B tidak cukup',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  installBrowserEnv();
  pasangAndroid('perangkat-A-asli');
  const {modul,cleanup}=await loadLicenseService({publicJwk:server.publicJwk,apiBase:server.base});
  t.after(cleanup);
  t.after(()=>bersihkanKapasitor());

  const [kunci]=await server.buatLisensi(1);
  const record=await modul.activateLicense({licenseKey:kunci.key,school:{name:'SDN Uji',npsn:'12345678'}});
  assert.equal(record.status,'ACTIVE');
  assert.equal(modul.getLicenseState().canUseApp,true);

  /* SELURUH isi storage disalin apa adanya ke perangkat kedua - termasuk Activation Token,
     catatan masa tenggang, dan Installation ID milik perangkat pertama. */
  const salinan=globalThis.localStorage.getItem('erapor_license_v1');
  const salinanInstalasi=globalThis.localStorage.getItem('erapor_installation_v1');
  installBrowserEnv();
  globalThis.localStorage.setItem('erapor_license_v1',salinan);
  globalThis.localStorage.setItem('erapor_installation_v1',salinanInstalasi);
  pasangAndroid('perangkat-B-berbeda');
  await ensureInstallationId();

  assert.notEqual(getInstallationId(),record.installation_id,'perangkat kedua menurunkan identitasnya sendiri');
  const state=modul.getLicenseState();
  assert.equal(state.canUseApp,false,'menyalin storage tidak membuat perangkat kedua berlisensi');
  assert.equal(state.canEditData,false);
  assert.match(state.message,/milik perangkat lain/);
});

test('Q30. Web tanpa sinyal perangkat memakai nilai acak, dan itu dinyatakan apa adanya',async()=>{
  installBrowserEnv();
  bersihkanKapasitor();
  const pertama=await ensureInstallationId();
  assert.ok(isInstallationId(pertama));
  assert.equal(getInstallationSource(),'browser');
  const kumpulan=new Set();
  for(let i=0;i<50;i++){resetInstallationId();kumpulan.add(await ensureInstallationId());}
  assert.equal(kumpulan.size,50,'setiap pemasangan browser mendapat identitas berbeda');
  /* Keterbatasan itu diterangkan kepada pengguna, bukan disembunyikan. */
  assert.match(identitas.DEVICE_SOURCE_NOTES.browser,/membersihkan data situs akan/i);
  assert.match(identitas.DEVICE_SOURCE_NOTES.android,/uninstall/i,
    'batas identitas Android dinyatakan terus terang');
});

/* ----------------------------------------------- Q31-Q35. Rahasia, data, dan satu backend */

test('Q31. Tidak ada rahasia server di berkas yang ikut ke Web, APK, maupun EXE',()=>{
  const berkas=['src/services/device-identity.js','src/services/installation.js',
    'src/services/license.js','src/pages/license-activation.js','src/data/license-config.js',
    'electron/main.cjs'];
  const larangan=['BEGIN PRIVATE KEY','LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY',
    'OWNER_PASSWORD','DATABASE_URL','signingPrivateKeyPem'];
  for(const jalur of berkas){
    const isi=read(jalur);
    for(const rahasia of larangan)
      assert.equal(isi.includes(rahasia),false,`${jalur} tidak memuat ${rahasia}`);
    assert.equal(/"d"\s*:/.test(isi),false,`${jalur} tidak memuat komponen kunci privat`);
  }
  /* Berkas rahasia tidak pernah dilacak Git. */
  const terlacak=execFileSync('git',['ls-files'],{cwd:new URL('.',root).pathname,encoding:'utf8'});
  for(const pola of [/\.pem$/m,/server\/\.env$/m])
    assert.doesNotMatch(terlacak,pola,`tidak ada berkas rahasia yang dilacak Git (${pola})`);
});

test('Q32. Android dan Windows memakai satu backend dan satu skema yang sama',()=>{
  /* Tidak ada basis data lisensi terpisah: kedua platform memanggil LICENSE_API_BASE yang sama
     dan server memakai skema yang sama untuk SQLite maupun PostgreSQL. */
  const config=read('src/data/license-config.js');
  assert.equal((config.match(/export const LICENSE_API_BASE=/g)||[]).length,1,
    'hanya ada satu alamat server lisensi');
  for(const jalur of ['server/src/db.js','server/src/pg.js','server/schema-postgres.sql']){
    const isi=read(jalur);
    assert.match(isi,/ux_one_active_slot/,`${jalur} memakai indeks slot yang sama`);
    assert.match(isi,/DROP INDEX IF EXISTS ux_one_active_device/,`${jalur} melepas indeks lama`);
  }
  /* Slot ditentukan server dari platform, dan hanya ada dua. */
  const server=read('server/src/licenses.js');
  assert.match(server,/DEVICE_SLOTS=Object\.freeze\(\['android','windows'\]\)/);
});

test('Q33. Berbohong tentang platform tidak pernah menambah jumlah perangkat',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  /* Platform karangan jatuh ke slot Windows - bukan slot ketiga. */
  assert.equal((await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:A,platform:'platform-karangan'}})).status,200);
  const tolak=await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:B,platform:'sesuatu-yang-lain'}});
  assert.equal(tolak.status,409);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(kunci.id).n,1,
    'tetap satu perangkat aktif, apa pun nama platform yang dikirim');
});

test('Q34. Lisensi tidak pernah menghapus data akademik apa pun',()=>{
  /* Yang dikontrol lisensi hanyalah AKSES. Berkas mana pun di jalur lisensi tidak boleh memuat
     satu pun perintah penghapusan data sekolah. */
  const jalur=['src/services/license.js','src/services/installation.js',
    'src/services/device-identity.js','src/pages/license-activation.js','server/src/licenses.js'];
  const larangan=[/localStorage\.clear\(/,/indexedDB\.deleteDatabase/,/DROP TABLE/i,
    /deleteStudent/,/clearAssessments/,/resetDatabase/,/removeItem\(\s*DB_KEY/,
    /removeItem\(\s*STORAGE_KEY/];
  for(const berkas of jalur){
    const isi=read(berkas);
    for(const pola of larangan)
      assert.doesNotMatch(isi,pola,`${berkas} tidak menghapus data (${pola})`);
  }
  /* Reset perangkat oleh Owner pun hanya menandai baris aktivasi, tidak menghapusnya. */
  const server=read('server/src/licenses.js');
  const reset=server.slice(server.indexOf('export async function resetDevice'),
    server.indexOf('export async function setStatus'));
  assert.match(reset,/is_active=FALSE,released_at=/,'baris aktivasi ditandai, bukan dibuang');
  assert.doesNotMatch(reset,/DELETE FROM/i,'reset tidak menghapus satu baris pun');
});

test('Q35. Reset perangkat tidak menyentuh lisensi, sekolah, maupun riwayatnya',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  const token=await s.ownerToken();
  await s.call('/activate',{method:'POST',
    body:{license_key:kunci.key,installation_id:A,platform:'android',school_name:'SDN Maju Jaya 01',npsn:'12345678'}});
  const sebelum=s.db.prepare('SELECT * FROM licenses WHERE id=?').get(kunci.id);

  await s.call(`/owner/licenses/${kunci.id}/reset-device-android`,{method:'POST',token,body:{reason:'ganti HP'}});
  const sesudah=s.db.prepare('SELECT * FROM licenses WHERE id=?').get(kunci.id);
  for(const kolom of ['license_hash','license_hint','buyer_name','school_name','npsn','customer_id','license_type','created_at'])
    assert.equal(sesudah[kolom],sebelum[kolom],`kolom ${kolom} tidak berubah oleh reset`);
  /* Baris aktivasi lama tetap ada sebagai riwayat, hanya menjadi tidak aktif. */
  const lama=s.db.prepare('SELECT * FROM device_activations WHERE license_id=? AND installation_id=?').get(kunci.id,A);
  assert.equal(lama.is_active,0);
  assert.ok(lama.released_at);
  /* Resetnya tercatat di audit log berikut slot yang dilepas. */
  const jejak=s.db.prepare("SELECT detail FROM license_events WHERE license_id=? AND type='DEVICE_RESET'").get(kunci.id);
  assert.match(jejak.detail,/"slot":"android"/);
});
