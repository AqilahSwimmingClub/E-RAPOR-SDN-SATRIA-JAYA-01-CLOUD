import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresStore } from '../server/src/store.js';
import { applySchema, POSTGRES_SCHEMA } from '../server/src/pg.js';
import * as lisensi from '../server/src/licenses.js';
import { generateSigningKeyPair, verifyActivationToken } from '../server/src/crypto.js';

/* Aturan komersial dijalankan di atas PostgreSQL sungguhan. PGlite adalah PostgreSQL yang
   dikompilasi ke WebAssembly, jadi constraint, transaksi, dan partial unique index berperilaku
   persis seperti Neon di produksi. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const inst=huruf=>`inst_${huruf.repeat(32)}`;

async function siapkan(){
  const pg=new PGlite();
  const store=createPostgresStore({client:pg});
  await applySchema(store);
  const {privateKeyPem}=generateSigningKeyPair();
  const secrets={signingPrivateKeyPem:privateKeyPem,pepper:`pepper-${Math.random()}`,recoveryKey:`recovery-${Math.random()}`};
  return {pg,store,secrets,
    async close(){await pg.close();},
    async buat(jumlah=1,extra={}){return lisensi.createLicenses(store,{count:jumlah,actor:'uji',recoverySecret:secrets,...extra});}};
}

test('Skema PostgreSQL menegakkan satu perangkat aktif lewat partial unique index',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  /* Index parsial itu yang menjadi penjaga sesungguhnya, bukan pemeriksaan di kode. */
  assert.match(POSTGRES_SCHEMA,/CREATE UNIQUE INDEX[\s\S]*device_activations\s*\(\s*license_id\s*\)\s*WHERE\s+is_active\s*=\s*TRUE/i);
  const index=await s.store.query(`SELECT indexdef FROM pg_indexes WHERE tablename='device_activations' AND indexname='ux_one_active_device'`);
  assert.equal(index.rows.length,1,'index terpasang di database');
  assert.match(index.rows[0].indexdef,/WHERE \(is_active = true\)/i);

  const [lic]=await s.buat();
  await s.store.run(`INSERT INTO device_activations(id,license_id,installation_id,activated_at,is_active)
    VALUES($1,$2,$3,now(),TRUE)`,['act-1',lic.id,inst('a')]);
  await assert.rejects(()=>s.store.run(`INSERT INTO device_activations(id,license_id,installation_id,activated_at,is_active)
    VALUES($1,$2,$3,now(),TRUE)`,['act-2',lic.id,inst('b')]),/unique|duplicate/i,'perangkat aktif kedua ditolak database');
});

test('Skema memakai foreign key dan batasan status lisensi',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  await assert.rejects(()=>s.store.run(`INSERT INTO device_activations(id,license_id,installation_id,activated_at,is_active)
    VALUES($1,$2,$3,now(),TRUE)`,['act-x','lic-tidak-ada',inst('c')]),/foreign key/i);
  await assert.rejects(()=>s.store.run(`INSERT INTO licenses(id,license_hash,license_hint,status,created_at)
    VALUES($1,$2,$3,$4,now())`,['lic-x','hash-x','hint','TIDAK_DIKENAL']),/check constraint|violates/i);
});

test('Aktivasi di PostgreSQL: satu perangkat, perangkat kedua ditolak, token terverifikasi',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  const [lic]=await s.buat(1,{schoolName:'SDN Contoh Nusantara 02',npsn:'12345678'});
  const hasil=await lisensi.activateLicense(s.store,{license_key:lic.key,installation_id:inst('a'),platform:'windows'},s.secrets);
  assert.equal(hasil.license.status,'ACTIVE');
  const klaim=verifyActivationToken(hasil.token,await import('../server/src/crypto.js').then(m=>m.publicJwkFromPrivatePem(s.secrets.signingPrivateKeyPem)));
  assert.equal(klaim.installation_id,inst('a'));

  await assert.rejects(()=>lisensi.activateLicense(s.store,{license_key:lic.key,installation_id:inst('b')},s.secrets),
    /sudah terikat pada perangkat lain/);
  /* Perangkat yang sama boleh mengaktifkan ulang tanpa menambah slot. */
  await lisensi.activateLicense(s.store,{license_key:lic.key,installation_id:inst('a')},s.secrets);
  const jumlah=await s.store.query('SELECT COUNT(*)::int AS n FROM device_activations WHERE license_id=$1',[lic.id]);
  assert.equal(jumlah.rows[0].n,1);
});

test('Reset, suspend, revoke, dan recovery berjalan sama di PostgreSQL',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  const [lic]=await s.buat();
  await lisensi.activateLicense(s.store,{license_key:lic.key,installation_id:inst('a')},s.secrets);

  const reset=await lisensi.resetDevice(s.store,lic.id,{actor:'pemilik',reason:'laptop rusak'});
  assert.equal(reset.released,inst('a'));
  const lama=await s.store.one('SELECT * FROM device_activations WHERE license_id=$1 AND installation_id=$2',[lic.id,inst('a')]);
  assert.equal(lama.is_active,false);
  assert.ok(lama.released_at);
  await lisensi.activateLicense(s.store,{license_key:lic.key,installation_id:inst('b')},s.secrets);
  await assert.rejects(()=>lisensi.checkLicense(s.store,{installation_id:inst('a'),license_id:lic.id},s.secrets),/tidak lagi terdaftar/);

  await lisensi.setStatus(s.store,lic.id,'SUSPENDED',{actor:'pemilik',reason:'tunggakan'});
  await assert.rejects(()=>lisensi.checkLicense(s.store,{installation_id:inst('b'),license_id:lic.id},s.secrets),/ditangguhkan/);
  await lisensi.setStatus(s.store,lic.id,'REVOKED',{actor:'pemilik'});
  await assert.rejects(()=>lisensi.activateLicense(s.store,{license_key:lic.key,installation_id:inst('c')},s.secrets),/dicabut/);

  const pulih=await lisensi.recoverLicenseKey(s.store,lic.id,{actor:'pemilik',reason:'kunci hilang'},s.secrets);
  assert.equal(pulih.license_key,lic.key);
  const jenis=(await s.store.query('SELECT type FROM license_events WHERE license_id=$1 ORDER BY created_at',[lic.id])).rows.map(r=>r.type);
  for(const wajib of ['LICENSE_CREATED','ACTIVATION_CREATED','DEVICE_RESET','STATUS_SUSPENDED','STATUS_REVOKED','KEY_RECOVERED'])
    assert.ok(jenis.includes(wajib),`audit log memuat ${wajib}`);
});

test('Aktivasi serentak di PostgreSQL: hanya satu perangkat yang berhasil',async t=>{
  const s=await siapkan();t.after(()=>s.close());
  const [lic]=await s.buat();
  const perangkat=Array.from({length:6},(_,i)=>`inst_${String(i).padStart(32,'0')}`);
  const hasil=await Promise.allSettled(perangkat.map(id=>
    lisensi.activateLicense(s.store,{license_key:lic.key,installation_id:id},s.secrets)));
  const sukses=hasil.filter(item=>item.status==='fulfilled');
  assert.equal(sukses.length,1,`tepat satu aktivasi berhasil, bukan ${sukses.length}`);
  const aktif=await s.store.query('SELECT COUNT(*)::int AS n FROM device_activations WHERE license_id=$1 AND is_active=TRUE',[lic.id]);
  assert.equal(aktif.rows[0].n,1);
});

test('Adapter PostgreSQL tidak mengandalkan berkas atau proses yang menetap',()=>{
  const pg=read('server/src/pg.js'),store=read('server/src/store.js');
  for(const berkas of [pg,store]){
    for(const larangan of ['readFileSync','writeFileSync','mkdirSync','node:sqlite','process.cwd()'])
      assert.equal(berkas.includes(larangan),false,`adapter tidak memakai ${larangan}`);
  }
  /* Connection string hanya dari environment, tidak pernah ditanam di kode. */
  assert.match(store,/DATABASE_URL/);
  assert.equal(/postgres(ql)?:\/\/[^$'"`\s]+:[^$'"`\s]+@/.test(store+pg),false,'tidak ada kredensial database di kode');
});

/* Tahap 9: kolom katalog versi ditambahkan ke instalasi yang SUDAH berjalan. Diuji di atas
   PostgreSQL sungguhan karena inilah yang akan terjadi pada database Neon milik pemilik. */
test('Migrasi app_versions menambah kolom tanpa menghilangkan baris yang sudah ada',async()=>{
  const pg=new PGlite();
  const store=createPostgresStore({client:pg});
  try{
    /* Bentuk tabel persis seperti Tahap 8, beserta satu baris yang sudah tersimpan. */
    await pg.exec(`CREATE TABLE app_versions(id TEXT PRIMARY KEY,platform TEXT NOT NULL,version TEXT NOT NULL,
      version_code INTEGER,min_supported_version TEXT,notes TEXT,released_at TIMESTAMPTZ);
      INSERT INTO app_versions(id,platform,version) VALUES('lama','android','1.2.0');`);

    await applySchema(store);

    const kolom=(await pg.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name='app_versions'`)).rows.map(baris=>baris.column_name);
    for(const nama of ['download_url','published','created_at','created_by'])
      assert.ok(kolom.includes(nama),`kolom ${nama} ditambahkan`);

    const baris=(await pg.query('SELECT id,platform,version,published FROM app_versions')).rows;
    assert.equal(baris.length,1,'baris lama tidak hilang');
    assert.equal(baris[0].id,'lama');
    assert.equal(baris[0].version,'1.2.0');
    assert.equal(baris[0].published,false,'baris lama tidak diterbitkan tanpa diminta');

    /* Menjalankan skema berkali-kali adalah hal biasa pada Vercel: setiap instance dingin
       memanggilnya lagi. Karena itu ia wajib idempotent. */
    await applySchema(store);
    await applySchema(store);
    assert.equal((await pg.query('SELECT COUNT(*)::int AS c FROM app_versions')).rows[0].c,1);

    const indeks=(await pg.query(`SELECT indexname FROM pg_indexes WHERE tablename='app_versions'`))
      .rows.map(item=>item.indexname);
    assert.ok(indeks.includes('ux_app_versions_platform_version'),'satu versi per platform dijaga database');
    await assert.rejects(()=>store.run(
      `INSERT INTO app_versions(id,platform,version) VALUES($1,$2,$3)`,['kembar','android','1.2.0']),
      /unique|duplicate/i,'versi kembar ditolak database');
  }finally{await pg.close();}
});
