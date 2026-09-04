import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, OWNER } from './helpers/license-server.js';
import { generateLicenseKey, normalizeLicenseKey, licenseHint, verifyActivationToken } from '../server/src/crypto.js';

/* Aturan komersial e-Rapor: satu License Key hanya boleh aktif pada satu perangkat.
   Seluruh keputusan berada di server; suite ini menjalankan server HTTP dan database
   sungguhan, bukan tiruan. */

const inst=huruf=>`inst_${huruf.repeat(32)}`;
const A=inst('a'),B=inst('b');

/* -------------------------------------------------------- 04-07, 09-11. Aturan aktivasi */

test('04. License Key baru dapat diaktivasi dan mengembalikan token bertanda tangan',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [lisensi]=await s.buatLisensi(1,{schoolName:'SDN Contoh Nusantara 02',npsn:'12345678'});
  const {status,data}=await s.call('/activate',{method:'POST',
    body:{license_key:lisensi.key,installation_id:A,platform:'windows',school_name:'SDN Contoh Nusantara 02',npsn:'12345678'}});
  assert.equal(status,200);
  assert.equal(data.status,'ACTIVE');
  assert.equal(data.license_hint,lisensi.hint);
  const klaim=verifyActivationToken(data.activation_token,s.publicJwk);
  assert.ok(klaim,'token dapat diverifikasi dengan kunci publik');
  assert.equal(klaim.installation_id,A);
  assert.equal(klaim.license_id,lisensi.id);
  assert.ok(klaim.next_check_at>klaim.issued_at);
});

test('05-06. Slot perangkat terikat ke satu instalasi dan ditolak pada instalasi lain',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [lisensi]=await s.buatLisensi();
  assert.equal((await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A,platform:'windows'}})).status,200);
  const kedua=await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:B,platform:'windows'}});
  assert.equal(kedua.status,409);
  assert.equal(kedua.data.error.code,'SLOT_TAKEN');
  const aktif=s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(lisensi.id);
  assert.equal(aktif.n,1,'hanya satu perangkat Windows aktif di database');
});

test('07. Perangkat yang sama dapat mengaktifkan ulang tanpa menambah slot',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [lisensi]=await s.buatLisensi();
  await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A}});
  const ulang=await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A}});
  assert.equal(ulang.status,200,'restart perangkat yang sama tetap sah');
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=?').get(lisensi.id).n,1);
});

test('09. Kunci tidak dikenal dan format salah ditolak',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const asing=await s.call('/activate',{method:'POST',body:{license_key:generateLicenseKey(),installation_id:A}});
  assert.equal(asing.data.error.code,'INVALID_KEY');
  for(const buruk of ['','ERAPOR-1111-1111-1111','bukan-kunci','ERAPOR-AAA-AAA-AAA']){
    const hasil=await s.call('/activate',{method:'POST',body:{license_key:buruk,installation_id:A}});
    assert.equal(hasil.data.error.code,'INVALID_KEY',`kunci "${buruk}" ditolak`);
  }
  const instalasiBuruk=await s.call('/activate',{method:'POST',body:{license_key:generateLicenseKey(),installation_id:'bukan-instalasi'}});
  assert.equal(instalasiBuruk.data.error.code,'INVALID_INSTALLATION');
});

test('10-11. Lisensi ditangguhkan dan dicabut melaporkan status yang tepat',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const token=await s.ownerToken();
  const [suspend,revoke]=await s.buatLisensi(2);
  await s.call(`/owner/licenses/${suspend.id}/suspend`,{method:'POST',token,body:{reason:'uji'}});
  await s.call(`/owner/licenses/${revoke.id}/revoke`,{method:'POST',token,body:{reason:'uji'}});
  assert.equal((await s.call('/activate',{method:'POST',body:{license_key:suspend.key,installation_id:A}})).data.error.code,'SUSPENDED');
  assert.equal((await s.call('/activate',{method:'POST',body:{license_key:revoke.key,installation_id:A}})).data.error.code,'REVOKED');
});

/* --------------------------------------------------------------- 23. Aktivasi serentak */

test('23. Dua perangkat menekan aktivasi bersamaan, hanya satu berhasil',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [lisensi]=await s.buatLisensi();
  const instalasi=Array.from({length:8},(_,i)=>`inst_${String(i).padStart(32,'0')}`);
  const hasil=await Promise.all(instalasi.map(id=>
    s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:id}})));
  const sukses=hasil.filter(item=>item.status===200);
  assert.equal(sukses.length,1,`tepat satu aktivasi berhasil, bukan ${sukses.length}`);
  assert.ok(hasil.filter(item=>item.status===409).length>=1);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(lisensi.id).n,1);
});

/* ------------------------------------------------------------ 16-18. Reset perangkat */

test('16-18. Reset device melepas perangkat lama lalu kunci dapat dipakai perangkat baru',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const token=await s.ownerToken();
  const [lisensi]=await s.buatLisensi();
  await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A}});

  const reset=await s.call(`/owner/licenses/${lisensi.id}/reset-device`,{method:'POST',token,body:{reason:'laptop rusak'}});
  assert.equal(reset.status,200);
  assert.equal(reset.data.result.released,A);
  const lama=s.db.prepare('SELECT * FROM device_activations WHERE license_id=? AND installation_id=?').get(lisensi.id,A);
  assert.equal(lama.is_active,0,'binding lama menjadi tidak aktif');
  assert.ok(lama.released_at,'waktu pelepasan tercatat');

  assert.equal((await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:B}})).status,200,
    'kunci dapat diaktifkan di perangkat baru');
  /* Perangkat lama tidak otomatis kembali sah tanpa otorisasi pemilik. */
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:A,license_id:lisensi.id}})).data.error.code,'NOT_BOUND');
  assert.equal((await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A}})).data.error.code,'SLOT_TAKEN');

  const jenis=s.db.prepare('SELECT type FROM license_events WHERE license_id=? ORDER BY created_at').all(lisensi.id).map(r=>r.type);
  assert.ok(jenis.includes('DEVICE_RESET'),'reset tercatat di audit log');
});

/* --------------------------------------------------------- 19-20. Pemulihan kunci hilang */

test('19-20. Recovery mengembalikan kunci tanpa menambah lisensi atau slot aktivasi',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const token=await s.ownerToken();
  const [lisensi]=await s.buatLisensi(1,{schoolName:'SDN Contoh Nusantara 02',npsn:'12345678'});
  await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A}});
  const sebelumLisensi=s.db.prepare('SELECT COUNT(*) AS n FROM licenses').get().n;
  const sebelumAktivasi=s.db.prepare('SELECT COUNT(*) AS n FROM device_activations').get().n;

  /* Pemilik menemukan lisensi lewat pencarian nama sekolah/NPSN, lalu memulihkan kuncinya. */
  const cari=await s.call('/owner/licenses?q=nusantara',{token});
  assert.equal(cari.data.licenses.length,1);
  const pulih=await s.call(`/owner/licenses/${lisensi.id}/recover`,{method:'POST',token,body:{reason:'pembeli kehilangan catatan'}});
  assert.equal(pulih.status,200);
  assert.equal(pulih.data.recovery.license_key,lisensi.key,'kunci utuh dipulihkan apa adanya');

  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM licenses').get().n,sebelumLisensi,'tidak ada lisensi baru dibuat');
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM device_activations').get().n,sebelumAktivasi,'tidak ada slot aktivasi bertambah');
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM device_activations WHERE license_id=? AND is_active=1').get(lisensi.id).n,1);
  const catatan=s.db.prepare("SELECT * FROM license_events WHERE license_id=? AND type='KEY_RECOVERED'").get(lisensi.id);
  assert.ok(catatan,'pemulihan tercatat di audit log');
  assert.equal(JSON.parse(catatan.detail).reason,'pembeli kehilangan catatan');
  assert.equal(catatan.actor,OWNER.username);
  assert.equal(catatan.detail.includes(lisensi.key),false,'kunci utuh tidak ikut ditulis ke audit log');
});

/* ------------------------------------------------------- 21-22. Mutu pembuatan kunci */

test('21-22. Kunci acak kriptografis, unik, dan tidak berurutan',()=>{
  const jumlah=800;
  const daftar=Array.from({length:jumlah},()=>generateLicenseKey());
  assert.equal(new Set(daftar).size,jumlah,'tidak ada kunci kembar');
  for(const key of daftar){
    assert.match(key,/^ERAPOR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(normalizeLicenseKey(key),key);
    assert.doesNotMatch(key.slice('ERAPOR-'.length),/[ILOU01]/,'huruf yang mudah tertukar tidak dipakai pada bagian acak');
  }
  /* Kunci berurutan akan menghasilkan awalan yang berulang; acak tidak. */
  const awalan=new Set(daftar.map(key=>key.slice(7,11)));
  assert.ok(awalan.size>jumlah*0.9,`awalan tersebar (${awalan.size} dari ${jumlah})`);
  /* Setiap posisi memakai lebih dari satu huruf, sehingga tidak ada bagian yang tetap. */
  for(let posisi=7;posisi<21;posisi++){
    if(daftar[0][posisi]==='-')continue;
    assert.ok(new Set(daftar.map(key=>key[posisi])).size>5,`posisi ${posisi} bervariasi`);
  }
});

test('22b. license_hash unik ditegakkan database',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [lisensi]=await s.buatLisensi();
  const row=s.db.prepare('SELECT license_hash FROM licenses WHERE id=?').get(lisensi.id);
  assert.throws(()=>s.db.prepare("INSERT INTO licenses(id,license_hash,license_hint,status,created_at) VALUES('x',?,'h','UNUSED','now')").run(row.license_hash),
    /UNIQUE/,'hash lisensi kembar ditolak database');
});

/* ------------------------------------------------------ 24-28. Kewenangan pemilik saja */

test('24-25. Tanpa sesi pemilik, tidak ada endpoint pemilik yang dapat dipakai',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [lisensi]=await s.buatLisensi();
  const percobaan=[
    ['POST','/owner/licenses',{count:5}],
    ['POST',`/owner/licenses/${lisensi.id}/reset-device`,{}],
    ['POST',`/owner/licenses/${lisensi.id}/suspend`,{}],
    ['POST',`/owner/licenses/${lisensi.id}/revoke`,{}],
    ['POST',`/owner/licenses/${lisensi.id}/recover`,{}],
    ['GET','/owner/licenses',null],
    ['GET','/owner/summary',null],
    ['GET','/owner/events',null],
  ];
  for(const [method,path,body] of percobaan){
    const tanpaToken=await s.call(path,{method,body});
    assert.equal(tanpaToken.status,401,`${method} ${path} menolak tanpa sesi`);
    const tokenPalsu=await s.call(path,{method,body,token:'token-karangan'});
    assert.equal(tokenPalsu.status,401,`${method} ${path} menolak token palsu`);
  }
  /* Kredensial Admin Sekolah bukan kredensial Pemilik. */
  const adminSekolah=await s.call('/owner/login',{method:'POST',body:{username:'admin',password:'admin'}});
  assert.equal(adminSekolah.status,401);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM licenses').get().n,1,'tidak ada lisensi terbuat oleh pihak tak berwenang');
});

test('26-28. Pemilik dapat suspend, reactivate, dan revoke dengan audit log',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const token=await s.ownerToken();
  const [lisensi]=await s.buatLisensi();
  await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A}});

  assert.equal((await s.call(`/owner/licenses/${lisensi.id}/suspend`,{method:'POST',token,body:{reason:'tunggakan'}})).data.license.status,'SUSPENDED');
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:A,license_id:lisensi.id}})).data.error.code,'SUSPENDED');
  assert.equal((await s.call(`/owner/licenses/${lisensi.id}/reactivate`,{method:'POST',token,body:{reason:'sudah dibayar'}})).data.license.status,'ACTIVE');
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:A,license_id:lisensi.id}})).status,200);
  assert.equal((await s.call(`/owner/licenses/${lisensi.id}/revoke`,{method:'POST',token,body:{reason:'pembatalan'}})).data.license.status,'REVOKED');
  assert.equal((await s.call('/check',{method:'POST',body:{installation_id:A,license_id:lisensi.id}})).data.error.code,'REVOKED');

  const jenis=s.db.prepare('SELECT type FROM license_events WHERE license_id=? ORDER BY created_at').all(lisensi.id).map(r=>r.type);
  for(const wajib of ['LICENSE_CREATED','ACTIVATION_CREATED','STATUS_SUSPENDED','STATUS_ACTIVE','STATUS_REVOKED'])
    assert.ok(jenis.includes(wajib),`audit log memuat ${wajib}`);
});

/* ------------------------------------------------------------- Data yang tidak dikirim */

test('Server lisensi tidak pernah menyimpan data siswa, nilai, atau absensi',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const [lisensi]=await s.buatLisensi();
  await s.call('/activate',{method:'POST',body:{license_key:lisensi.key,installation_id:A,
    school_name:'SDN Contoh Nusantara 02',npsn:'12345678',platform:'android',app_version:'1.2.1',
    students:[{name:'Tidak Boleh Masuk'}],scores:{mtk:90}}});
  const tabel=s.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  for(const dilarang of ['students','attendance','scores','reports'])
    assert.equal(tabel.includes(dilarang),false,`server lisensi tidak punya tabel ${dilarang}`);
  const isi=JSON.stringify(tabel.map(nama=>s.db.prepare(`SELECT * FROM ${nama}`).all()));
  assert.equal(isi.includes('Tidak Boleh Masuk'),false,'data siswa yang diselipkan tidak ikut tersimpan');
  assert.equal(isi.includes(lisensi.key),false,'License Key utuh tidak tersimpan sebagai teks biasa');
});

test('Rate limit menahan penebakan kunci beruntun',async t=>{
  const s=await startTestServer();t.after(()=>s.close());
  const kode=[];
  for(let i=0;i<14;i++){
    const {data}=await s.call('/activate',{method:'POST',body:{license_key:generateLicenseKey(),installation_id:A}});
    kode.push(data.error?.code);
  }
  assert.ok(kode.includes('RATE_LIMITED'),'percobaan beruntun akhirnya dibatasi');
});

test('Hint kunci hanya memperlihatkan empat huruf terakhir',()=>{
  const key=generateLicenseKey();
  const hint=licenseHint(key);
  assert.match(hint,/^ERAPOR-••••-••••-[A-Z0-9]{4}$/);
  assert.equal(hint.endsWith(key.slice(-4)),true);
  assert.equal(hint.includes(key.slice(7,11)),false,'grup awal kunci tidak pernah ditampilkan');
});
