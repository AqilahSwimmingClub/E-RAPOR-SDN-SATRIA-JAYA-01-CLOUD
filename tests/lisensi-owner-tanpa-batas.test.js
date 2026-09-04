import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { startTestServer } from './helpers/license-server.js';
import { openDatabase } from '../server/src/db.js';
import { createSqliteStore } from '../server/src/store.js';
import * as lisensi from '../server/src/licenses.js';

/* LISENSI KELAS PEMILIK = TANPA BATAS PERANGKAT.

   BUG YANG DIJAGA SUITE INI. Kunci pemilik yang sudah beredar tersimpan di basis data dengan
   tipe DEVELOPER - nama OWNER baru diperkenalkan belakangan, dan panel Owner sampai sekarang
   masih menerbitkan dengan nama lama itu. Ketika daftar "tipe tanpa batas" sempat dipersempit
   menjadi OWNER saja, kunci pemilik yang sedang dipakai jatuh ke aturan 1 Android + 1 Windows
   milik lisensi pembelian, lalu ditolak pada perangkat kedua.

   Yang dijaga di sini:

     - OWNER dan DEVELOPER sama-sama tanpa batas, pada Android maupun Windows.
     - Aktivasi ulang perangkat yang sama tidak menggandakan baris.
     - Lisensi Pembelian/Guru TIDAK ikut berubah: tetap 1 Android + 1 Windows.
     - Client tidak dapat mengaku sebagai kelas pemilik.
     - Kunci lama yang barisnya terlanjur bernomor slot tetap lolos setelah migrasi. */

const inst=huruf=>`inst_${huruf.repeat(32)}`;
const A=inst('a'),B=inst('b'),C=inst('c'),D=inst('d'),E=inst('e'),F=inst('f');

/* Kedua nama diuji dengan skenario yang sama persis, sehingga tidak mungkin salah satunya
   diam-diam berbeda perlakuan. */
const KELAS_PEMILIK=['OWNER','DEVELOPER'];

async function kunciPemilik(s,licenseType){
  const token=await s.ownerToken();
  const {data}=await s.call('/owner/licenses',{method:'POST',token,
    body:{count:1,licenseType,buyerName:'Pemilik Aplikasi',notes:'QA'}});
  assert.ok(data.licenses?.[0],`lisensi ${licenseType} dibuat: ${JSON.stringify(data)}`);
  return data.licenses[0];
}
const aktifkan=(s,kunci,installationId,platform)=>s.call('/activate',{method:'POST',
  body:{license_key:kunci.key,installation_id:installationId,platform}});
const aktifDi=(s,licenseId)=>s.db
  .prepare('SELECT installation_id,platform,slot FROM device_activations WHERE license_id=? AND is_active=1 ORDER BY activated_at')
  .all(licenseId).map(row=>({...row}));

/* ------------------------------------------------ 1-3. OWNER pada banyak perangkat Android */

for(const tipe of KELAS_PEMILIK)
test(`1-3. ${tipe}: Android A, B, dan C berhasil dengan kunci yang sama`,async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const kunci=await kunciPemilik(s,tipe);
  for(const [nomor,id] of [['A',A],['B',B],['C',C]]){
    const hasil=await aktifkan(s,kunci,id,'android');
    assert.equal(hasil.status,200,`Android ${nomor} diterima: ${JSON.stringify(hasil.data)}`);
    assert.equal(hasil.data.status,'ACTIVE');
  }
  const aktif=aktifDi(s,kunci.id);
  assert.equal(aktif.length,3,'tiga perangkat Android aktif sekaligus');
  assert.ok(aktif.every(row=>row.slot===null),'tidak satu pun memakai slot');
});

/* ------------------------------------------------ 4-5. OWNER pada banyak perangkat Windows */

for(const tipe of KELAS_PEMILIK)
test(`4-5. ${tipe}: Windows A dan Windows B berhasil`,async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const kunci=await kunciPemilik(s,tipe);
  for(const [nomor,id] of [['A',D],['B',E]]){
    const hasil=await aktifkan(s,kunci,id,'windows');
    assert.equal(hasil.status,200,`Windows ${nomor} diterima: ${JSON.stringify(hasil.data)}`);
  }
  assert.equal(aktifDi(s,kunci.id).length,2,'dua komputer Windows aktif sekaligus');
});

/* ------------------------------------------------ 6. Android dan Windows bersamaan */

for(const tipe of KELAS_PEMILIK)
test(`6. ${tipe}: Android dan Windows aktif bersamaan tanpa saling mengusir`,async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const kunci=await kunciPemilik(s,tipe);
  for(const [id,platform] of [[A,'android'],[B,'android'],[C,'windows'],[D,'windows'],[E,'ios'],[F,'web']])
    assert.equal((await aktifkan(s,kunci,id,platform)).status,200,`${platform} ${id} diterima`);
  const aktif=aktifDi(s,kunci.id);
  assert.equal(aktif.length,6,'enam perangkat aktif sekaligus');
  assert.ok(aktif.every(row=>row.slot===null));
  /* Tidak satu pun jawaban server menyebut slot penuh. */
  const ditolak=s.db.prepare("SELECT COUNT(*) AS n FROM license_events WHERE license_id=? AND type='ACTIVATION_REJECTED'").get(kunci.id);
  assert.equal(Number(ditolak.n),0,'tidak ada aktivasi yang ditolak');
});

/* ------------------------------------------------ 7. Reaktivasi idempotent */

for(const tipe of KELAS_PEMILIK)
test(`7. ${tipe}: reaktivasi perangkat yang sama idempotent`,async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const kunci=await kunciPemilik(s,tipe);
  for(let ulang=0;ulang<4;ulang++)
    assert.equal((await aktifkan(s,kunci,A,'android')).status,200,`aktivasi ke-${ulang+1} diterima`);
  const semua=s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=?').get(kunci.id);
  assert.equal(Number(semua.n),1,'7. tetap satu baris - tidak digandakan');
  /* Perangkat kedua tetap boleh menyusul sesudahnya. */
  assert.equal((await aktifkan(s,kunci,B,'windows')).status,200);
  assert.equal(aktifDi(s,kunci.id).length,2);
});

/* ------------------------------------------------ 8-9. Lisensi Pembelian/Guru TIDAK berubah */

test('8. Lisensi Pembelian/Guru tetap maksimal 1 Android + 1 Windows',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  assert.equal((await aktifkan(s,kunci,A,'android')).status,200,'slot Android terisi');
  assert.equal((await aktifkan(s,kunci,B,'windows')).status,200,'slot Windows terisi');
  const aktif=aktifDi(s,kunci.id);
  assert.equal(aktif.length,2,'8. tepat dua perangkat');
  assert.deepEqual(aktif.map(row=>row.slot).sort(),['android','windows'],
    'lisensi pembelian tetap memakai slot');
});

test('9. Perangkat kedua pada platform yang sama tetap ditolak untuk Pembelian/Guru',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  await aktifkan(s,kunci,A,'android');
  await aktifkan(s,kunci,B,'windows');
  for(const platform of ['android','windows']){
    const tolak=await aktifkan(s,kunci,C,platform);
    assert.equal(tolak.status,409,`9. slot ${platform} penuh`);
    assert.equal(tolak.data.error.code,'SLOT_TAKEN');
  }
  assert.equal(aktifDi(s,kunci.id).length,2,'penolakan tidak menggusur perangkat yang ada');
});

/* ------------------------------------------------ 10. Client tidak dapat mengaku OWNER */

test('10. Client tidak dapat memalsukan license_type menjadi OWNER',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [kunci]=await s.buatLisensi();
  await aktifkan(s,kunci,A,'android');
  await aktifkan(s,kunci,B,'windows');
  /* Klaim lewat HTTP. Jumlahnya sengaja ditahan di bawah pembatas laju aktivasi (8 per menit
     per IP) supaya yang diuji benar-benar keputusan lisensinya, bukan pembatas lajunya. */
  for(const klaim of [{license_type:'OWNER'},{licenseType:'OWNER'},
    {unlimited_devices:true,slot:null},{license_type:'DEVELOPER',unlimited_devices:true}]){
    const tolak=await s.call('/activate',{method:'POST',
      body:{license_key:kunci.key,installation_id:C,platform:'android',...klaim}});
    assert.equal(tolak.status,409,`klaim ${JSON.stringify(klaim)} tidak memberi hak apa pun`);
    assert.equal(tolak.data.error.code,'SLOT_TAKEN');
  }
  /* Sisanya diuji langsung pada layanannya, tanpa melewati pembatas laju - inilah lapisan yang
     benar-benar memutuskan, dan di sinilah pemalsuan harus gagal. */
  for(const klaim of [{license_type:'DEVELOPER'},{licenseType:'DEVELOPER'},{slot:null},
    {license_type:'OWNER',licenseType:'OWNER',unlimited_devices:true,slot:null}]){
    await assert.rejects(()=>lisensi.activateLicense(s.store,
      {license_key:kunci.key,installation_id:C,platform:'android',...klaim},s.secrets),
      /sudah dipakai perangkat lain/,`klaim ${JSON.stringify(klaim)} ditolak layanan`);
  }
  assert.equal(s.db.prepare('SELECT license_type FROM licenses WHERE id=?').get(kunci.id).license_type,
    'CUSTOMER','tipe di basis data tidak berubah oleh permintaan client');
  assert.equal(aktifDi(s,kunci.id).length,2,'jumlah perangkat aktif tidak bertambah');
  /* Dan tipe memang dibaca dari kolom database, bukan dari badan permintaan. */
  const sumber=readFileSync(new URL('../server/src/licenses.js',import.meta.url),'utf8');
  const fungsi=sumber.slice(sumber.indexOf('export async function activateLicense'),
    sumber.indexOf('export async function checkLicense'));
  assert.match(fungsi,/isUnlimitedLicenseType\(license\.license_type\)/,
    'kelas lisensi dibaca dari kolom license_type milik record');
  assert.equal(/input\?\.license_type|input\?\.licenseType|input\?\.unlimited/.test(fungsi),false,
    'tidak ada klaim tipe dari badan permintaan yang dibaca');
});

/* ------------------------------- Kompatibilitas data lama: baris bernomor slot pada OWNER */

test('Kunci pemilik lama yang barisnya terlanjur bernomor slot tetap lolos setelah migrasi',()=>{
  /* Keadaan basis data LAMA dibuat apa adanya: lisensi kelas pemilik yang baris aktifnya
     terlanjur memakai slot - persis yang dapat terjadi bila barisnya dibuat versi lama atau
     tipenya pernah berubah. Satu baris seperti itu cukup membuat perangkat kedua bertabrakan
     dengan ux_one_active_slot padahal seharusnya tanpa batas. */
  const db=openDatabase(':memory:');
  db.exec(`INSERT INTO licenses(id,license_hash,license_hint,status,license_type,created_at)
    VALUES('lic-owner','hash-owner','ERAPOR-••••-••••-RB9A','ACTIVE','DEVELOPER','2026-01-01T00:00:00.000Z')`);
  db.exec(`INSERT INTO device_activations(id,license_id,installation_id,platform,slot,activated_at,is_active)
    VALUES('act-lama','lic-owner','${A}','android','android','2026-01-01T00:00:00.000Z',1)`);
  const sebelum=db.prepare('SELECT slot FROM device_activations WHERE id=?').get('act-lama');
  assert.equal(sebelum.slot,'android','keadaan awal: baris lama memakai slot');
  db.close();

  /* Migrasi dijalankan ulang - persis yang terjadi saat server versi baru membuka database. */
  const berkas=`/tmp/erapor-owner-migrasi-${Date.now()}.sqlite`;
  const awal=openDatabase(berkas);
  awal.exec(`INSERT INTO licenses(id,license_hash,license_hint,status,license_type,created_at)
    VALUES('lic-owner','hash-owner','ERAPOR-••••-••••-RB9A','ACTIVE','DEVELOPER','2026-01-01T00:00:00.000Z')`);
  awal.exec(`INSERT INTO device_activations(id,license_id,installation_id,platform,slot,activated_at,is_active)
    VALUES('act-lama','lic-owner','${A}','android','android','2026-01-01T00:00:00.000Z',1)`);
  awal.close();

  const lagi=openDatabase(berkas);
  const baris=lagi.prepare('SELECT installation_id,platform,slot,is_active FROM device_activations WHERE id=?').get('act-lama');
  assert.equal(baris.slot,null,'slot pada lisensi kelas pemilik dikosongkan migrasi');
  /* BARISNYA TIDAK DIHAPUS dan riwayatnya utuh. */
  assert.equal(baris.installation_id,A,'perangkat lama tetap tercatat');
  assert.equal(baris.platform,'android','platform tetap tercatat');
  assert.equal(Number(baris.is_active),1,'aktivasi lama tetap aktif');
  assert.equal(Number(lagi.prepare('SELECT COUNT(*) AS n FROM device_activations').get().n),1,
    'tidak ada baris aktivasi yang dihapus');
  assert.equal(Number(lagi.prepare('SELECT COUNT(*) AS n FROM licenses').get().n),1,
    'tidak ada lisensi yang dihapus');
  lagi.close();
  rmSync(berkas,{force:true});
});

test('Setelah migrasi, kunci pemilik lama menerima perangkat kedua dan ketiga',async()=>{
  /* Rangkaian penuh di atas store yang sama dengan produksi. */
  const db=openDatabase(':memory:');
  const store=createSqliteStore(db);
  const {generateSigningKeyPair}=await import('../server/src/crypto.js');
  const {licenseHash}=await import('../server/src/crypto.js');
  const {privateKeyPem}=generateSigningKeyPair();
  const secrets={signingPrivateKeyPem:privateKeyPem,pepper:'pepper-uji',recoveryKey:'recovery-uji'};
  const kunciTeks='ERAPOR-7BAV-CPVP-RB9A';
  await store.run(`INSERT INTO licenses(id,license_hash,license_hint,status,license_type,created_at)
    VALUES($1,$2,$3,'ACTIVE','DEVELOPER',$4)`,
    ['lic-owner',licenseHash(kunciTeks,secrets.pepper),'ERAPOR-••••-••••-RB9A','2026-01-01T00:00:00.000Z']);
  /* Perangkat pertama sudah terikat sejak lama. */
  await store.run(`INSERT INTO device_activations(id,license_id,installation_id,platform,activated_at,is_active)
    VALUES('act-lama','lic-owner',$1,'android',$2,TRUE)`,[A,'2026-01-01T00:00:00.000Z']);

  for(const [id,platform] of [[B,'android'],[C,'android'],[D,'windows'],[E,'windows']]){
    const hasil=await lisensi.activateLicense(store,
      {license_key:kunciTeks,installation_id:id,platform},secrets);
    assert.equal(hasil.license.status,'ACTIVE',`${platform} ${id} diterima`);
  }
  const aktif=(await store.query('SELECT installation_id FROM device_activations WHERE license_id=$1 AND is_active=TRUE',['lic-owner'])).rows;
  assert.equal(aktif.length,5,'perangkat lama plus empat perangkat baru aktif bersamaan');
  assert.ok(aktif.some(row=>row.installation_id===A),'perangkat lama tidak diusir');
  db.close();
});
