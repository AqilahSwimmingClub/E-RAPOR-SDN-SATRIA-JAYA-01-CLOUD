import test from 'node:test';
import assert from 'node:assert/strict';
import { createLicenses, ensureCustomer, listCustomers, listLicenses,
  normalizeCustomerLinks, upsertCustomer } from '../server/src/licenses.js';
import { startTestServer } from './helpers/license-server.js';

/* OWNER PANEL: LISENSI DAN SEKOLAH/PEMBELI ADALAH SATU ALUR.

   Identitas sekolah sudah diketik Owner ketika membuat lisensi. Meminta Owner mengetiknya ulang
   pada menu Sekolah/Pembeli hanya melahirkan dua basis data yang mudah berbeda isinya.

   Suite ini menjaga empat hal:
   - membuat lisensi sekaligus membuat/menghubungkan sekolahnya;
   - NPSN adalah identitas sekolah, sehingga tidak pernah ada sekolah kembar;
   - satu sekolah boleh memiliki banyak lisensi, dan lisensinya tetap masing-masing;
   - data lisensi lama tidak rusak, hanya disambungkan. */

async function konteks(){
  const server=await startTestServer();
  return server;
}
const identitas=(npsn='12345678',schoolName='SDN SATRIA JAYA 01')=>
  ({count:1,buyerName:'Kepala Sekolah',schoolName,npsn,actor:'owner'});

test('26. Membuat lisensi otomatis membuat dan menghubungkan Sekolah/Pembeli',async t=>{
  const ctx=await konteks();t.after(()=>ctx.close());
  assert.equal((await listCustomers(ctx.store)).length,0,'belum ada sekolah sama sekali');

  const dibuat=await createLicenses(ctx.store,{...identitas(),recoverySecret:ctx.secrets});
  assert.equal(dibuat.length,1);

  const sekolah=await listCustomers(ctx.store);
  assert.equal(sekolah.length,1,'sekolah tercipta tanpa input kedua kali');
  assert.equal(sekolah[0].npsn,'12345678');
  assert.equal(sekolah[0].name,'SDN SATRIA JAYA 01');
  assert.equal(sekolah[0].license_count,1,'lisensinya langsung terhubung');

  const lisensi=await listLicenses(ctx.store,{});
  assert.equal(lisensi.rows?.length??lisensi.length,1);
  const baris=(lisensi.rows||lisensi)[0];
  assert.equal(baris.customer_id,sekolah[0].id,'lisensi menunjuk sekolahnya');
});

test('27-28. NPSN sama tidak menggandakan sekolah, dan satu sekolah boleh banyak lisensi',async t=>{
  const ctx=await konteks();t.after(()=>ctx.close());
  await createLicenses(ctx.store,{...identitas(),recoverySecret:ctx.secrets});
  /* Lisensi kedua, NPSN sama tetapi penulisan namanya berbeda: kapitalisasi dan spasi. */
  await createLicenses(ctx.store,{...identitas('12345678','  sdn   satria jaya 01 '),recoverySecret:ctx.secrets});
  /* Lisensi ketiga, NPSN sama persis. */
  await createLicenses(ctx.store,{...identitas('12345678'),recoverySecret:ctx.secrets});

  const sekolah=await listCustomers(ctx.store);
  assert.equal(sekolah.length,1,'tetap SATU sekolah, bukan tiga');
  assert.equal(sekolah[0].license_count,3,'ketiga lisensi menempel pada sekolah yang sama');
  assert.equal(sekolah[0].npsn,'12345678');

  /* Daftar Sekolah/Pembeli tidak menggandakan baris per lisensi, dan membawa ringkasan status. */
  assert.ok(sekolah[0].license_status,'status lisensi ikut dirangkum');
  assert.equal(Object.values(sekolah[0].license_status).reduce((a,b)=>a+b,0),3);

  /* NPSN berbeda tetap sekolah yang berbeda. */
  await createLicenses(ctx.store,{...identitas('87654321','SDN LAIN 02'),recoverySecret:ctx.secrets});
  assert.equal((await listCustomers(ctx.store)).length,2);
});

test('29. Lisensi tetap individual: kunci, status, dan ikatan perangkat tidak digabung',async t=>{
  const ctx=await konteks();t.after(()=>ctx.close());
  const a=await createLicenses(ctx.store,{...identitas(),recoverySecret:ctx.secrets});
  const b=await createLicenses(ctx.store,{...identitas(),recoverySecret:ctx.secrets});
  assert.notEqual(a[0].key,b[0].key,'kunci tetap berbeda');
  assert.notEqual(a[0].id,b[0].id);

  const baris=await ctx.store.query('SELECT id,status,customer_id FROM licenses');
  assert.equal(baris.rows.length,2);
  for(const row of baris.rows)assert.equal(row.status,'UNUSED','status masing-masing tidak tersentuh');
  assert.equal(new Set(baris.rows.map(row=>row.customer_id)).size,1,'keduanya menunjuk satu sekolah');
});

test('30. Pembaruan data pembeli tetap sinkron dan tidak mengosongkan isian lama',async t=>{
  const ctx=await konteks();t.after(()=>ctx.close());
  await createLicenses(ctx.store,{...identitas(),recoverySecret:ctx.secrets});
  await ensureCustomer(ctx.store,{name:'SDN SATRIA JAYA 01',npsn:'12345678',contact:'0811-1111',actor:'owner'});
  let sekolah=(await listCustomers(ctx.store))[0];
  assert.equal(sekolah.contact,'0811-1111','kontak terisi');

  /* Isian kosong tidak boleh menghapus kontak yang sudah ada. */
  await ensureCustomer(ctx.store,{name:'SDN SATRIA JAYA 01',npsn:'12345678',contact:'',actor:'owner'});
  sekolah=(await listCustomers(ctx.store))[0];
  assert.equal(sekolah.contact,'0811-1111','kontak lama tidak terhapus');
  assert.equal((await listCustomers(ctx.store)).length,1,'tetap satu sekolah');
});

test('31. Form manual mencegah duplikasi NPSN dan memvalidasinya',async t=>{
  const ctx=await konteks();t.after(()=>ctx.close());
  await createLicenses(ctx.store,{...identitas(),recoverySecret:ctx.secrets});
  /* Owner menambah lewat form manual dengan NPSN yang sudah ada: memperbarui, bukan menggandakan. */
  const hasil=await upsertCustomer(ctx.store,{name:'SDN Satria Jaya 01',npsn:'12345678',contact:'0812-2222',actor:'owner'});
  assert.ok(hasil.id);
  const sekolah=await listCustomers(ctx.store);
  assert.equal(sekolah.length,1,'tidak ada sekolah kedua');
  assert.equal(sekolah[0].contact,'0812-2222');
  await assert.rejects(()=>upsertCustomer(ctx.store,{name:'Sekolah Baru',npsn:'123',actor:'owner'}),/NPSN/i);
});

test('32. Lisensi dan customer lama tetap terbaca lalu disambungkan tanpa dirusak',async t=>{
  const ctx=await konteks();t.after(()=>ctx.close());
  /* Menirukan data lama: lisensi memuat identitas sekolah tetapi belum menunjuk customer. */
  await ctx.store.run(`INSERT INTO licenses(id,license_hash,license_hint,encrypted_recovery,status,customer_id,buyer_name,school_name,npsn,license_type,created_at)
    VALUES('lic-lama','hash-lama','HINT','enc','ACTIVE',NULL,'Pembeli Lama','SDN LAMA 09','99887766','CUSTOMER','2025-01-01T00:00:00.000Z')`);
  const sebelum=await ctx.store.one('SELECT * FROM licenses WHERE id=$1',['lic-lama']);

  const hasil=await normalizeCustomerLinks(ctx.store,{actor:'system'});
  assert.equal(hasil.terhubung,1);

  const sesudah=await ctx.store.one('SELECT * FROM licenses WHERE id=$1',['lic-lama']);
  /* HANYA customer_id yang berubah. Kunci, status, dan seluruh kolom lain tetap persis. */
  assert.ok(sesudah.customer_id,'kini menunjuk sekolahnya');
  assert.equal(sesudah.license_hash,sebelum.license_hash,'kunci tidak dibuat ulang');
  assert.equal(sesudah.status,'ACTIVE','status aktivasi tidak tersentuh');
  assert.equal(sesudah.school_name,sebelum.school_name);
  assert.equal(sesudah.created_at,sebelum.created_at);

  const sekolah=await listCustomers(ctx.store);
  assert.equal(sekolah.length,1);
  assert.equal(sekolah[0].npsn,'99887766');

  /* Idempotent: dijalankan lagi tidak menyambung apa pun dan tidak menggandakan sekolah. */
  assert.equal((await normalizeCustomerLinks(ctx.store,{actor:'system'})).terhubung,0);
  assert.equal((await listCustomers(ctx.store)).length,1);
});

test('33. Lisensi DEVELOPER tanpa identitas sekolah tidak melahirkan sekolah kosong',async t=>{
  const ctx=await konteks();t.after(()=>ctx.close());
  await createLicenses(ctx.store,{count:1,licenseType:'DEVELOPER',actor:'owner',recoverySecret:ctx.secrets});
  assert.equal((await listCustomers(ctx.store)).length,0,
    'lisensi internal tidak membuat record sekolah');
});
