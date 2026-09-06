import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { openDatabase } from '../server/src/db.js';
import { createSqliteStore } from '../server/src/store.js';
import { createApi, ensureOwnerAccount } from '../server/src/api.js';
import { generateSigningKeyPair } from '../server/src/crypto.js';
import * as pesanan from '../server/src/orders.js';
import * as unduhan from '../server/src/downloads.js';
import { createLicenses } from '../server/src/licenses.js';
import { buildOrderMessage, buildOrderPayload, newClientRef, normalizePaymentMethod, PAYMENT_CHOICES } from '../public/beli/order-form.js';
import { downloadMeta, downloadRows } from '../public/beli/unduhan.js';
import { orderErrorMessage } from '../public/beli/order-api.js';
import { LICENSE_SCOPE, PAYMENT_AMOUNT_NOTE, PAYMENT_METHODS, PAYMENT_METHOD_IDS, findPaymentMethod } from '../src/data/payment-config.js';
import { CONTACT_WHATSAPP } from '../src/data/app-identity.js';

/* WEB PEMBELIAN LISENSI 1.3.2.

   Tiga janji yang dijaga berkas ini, dan seluruh test di bawah hanyalah penjabarannya:

   1. PESANAN TERSIMPAN LEBIH DULU. WhatsApp adalah pemberitahuan, bukan tempat penyimpanan.
      Bila pesan WhatsApp tidak pernah terkirim, pesanannya tetap ada di server.
   2. NPSN BUKAN IDENTITAS TRANSAKSI. Satu sekolah boleh memesan berkali-kali; yang
      membedakan satu transaksi dari yang lain adalah Order ID.
   3. TIDAK ADA YANG DIKARANG. Nomor rekening, nomor GoPay, gambar QRIS, dan tautan unduhan
      seluruhnya berasal dari sumber resmi. Yang belum ada dinyatakan belum ada. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function siapkan(){
  const store=createSqliteStore(openDatabase(':memory:'));
  const secrets={signingPrivateKeyPem:generateSigningKeyPair().privateKeyPem,pepper:'lada',recoveryKey:'pulih'};
  return {store,secrets};
}
const isian=(ubah={})=>({schoolName:'SDN Contoh 01',npsn:'20123456',contactName:'Budi Santoso',
  whatsapp:'081234567890',city:'Kabupaten Bekasi',province:'Jawa Barat',konfirmasi:true,...ubah});

async function serverUji(){
  const {store,secrets}=siapkan();
  await ensureOwnerAccount(store,{username:'pemilik','password':'kataSandi123'});
  const handle=createApi({store,secrets,logger:()=>{}});
  const {createServer}=await import('node:http');
  const server=createServer(handle);
  await new Promise(selesai=>server.listen(0,'127.0.0.1',selesai));
  const alamat=`http://127.0.0.1:${server.address().port}`;
  const minta=async(jalur,opsi={})=>{
    const res=await fetch(alamat+jalur,opsi);
    return {status:res.status,headers:res.headers,data:await res.json().catch(()=>({}))};
  };
  const masuk=async()=>{
    const hasil=await minta('/api/v1/owner/login',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({username:'pemilik',password:'kataSandi123'})});
    return {authorization:`Bearer ${hasil.data.token}`,'content-type':'application/json'};
  };
  return {store,secrets,server,minta,masuk,tutup:()=>new Promise(selesai=>server.close(selesai))};
}

/* ==================================================== A. ORDER ID DAN MODEL PESANAN */

test('1. Order ID berbentuk ORD-YYYYMMDD-NNNNNN dan bertambah per hari',()=>{
  const kode=pesanan.formatOrderCode('2026-09-07T03:00:00.000Z',7);
  assert.match(kode,/^ORD-\d{8}-\d{6}$/,'bentuk Order ID persis seperti yang dijanjikan');
  assert.equal(kode,'ORD-20260907-000007');
  /* Bagian tanggal memakai WIB, bukan UTC, supaya nomor yang dibaca pembeli sama dengan
     tanggal yang ia lihat di layarnya. Pukul 20.00 UTC sudah tanggal berikutnya di Indonesia. */
  assert.equal(pesanan.formatOrderCode('2026-09-06T20:00:00.000Z',1),'ORD-20260907-000001');
  assert.equal(pesanan.orderCodePrefix('2026-09-07T03:00:00.000Z'),'ORD-20260907-');
});

test('2. Pesanan tersimpan di server dengan Order ID, bukan sekadar dikirim ke WhatsApp',async()=>{
  const {store}=siapkan();
  const {order,duplicate}=await pesanan.createOrder(store,{...isian(),clientRef:'ref-a'});
  assert.equal(duplicate,false);
  assert.match(order.order_code,/^ORD-\d{8}-\d{6}$/);
  assert.equal(order.status,'BARU');
  assert.equal(order.payment_status,'BELUM_BAYAR');
  assert.equal(order.school_name,'SDN Contoh 01');
  /* Nomor WhatsApp dinormalkan sehingga nomor yang sama tidak tersimpan dalam dua bentuk. */
  assert.equal(order.whatsapp,'6281234567890');
  const tersimpan=await store.one('SELECT * FROM license_orders WHERE order_code=$1',[order.order_code]);
  assert.ok(tersimpan,'pesanan benar-benar ada di database, bukan hanya di jawaban');
});

test('3. Menekan tombol dua kali tidak melahirkan dua pesanan',async()=>{
  const {store}=siapkan();
  const pertama=await pesanan.createOrder(store,{...isian(),clientRef:'ref-sama'});
  const kedua=await pesanan.createOrder(store,{...isian(),clientRef:'ref-sama'});
  assert.equal(kedua.duplicate,true,'kiriman kedua dikenali sebagai kiriman ulang');
  assert.equal(kedua.order.order_code,pertama.order.order_code,'Order ID-nya sama persis');
  assert.equal((await pesanan.listOrders(store)).length,1,'hanya satu pesanan yang tercatat');
});

test('4. NPSN yang sama TIDAK pernah memblokir pemesanan baru',async()=>{
  const {store}=siapkan();
  /* Satu sekolah wajar memesan lagi: untuk perangkat kedua, untuk tahun berikutnya, atau
     karena pesanan sebelumnya batal. NPSN adalah identitas SEKOLAH, bukan identitas transaksi. */
  const a=await pesanan.createOrder(store,{...isian(),clientRef:'r1'});
  const b=await pesanan.createOrder(store,{...isian(),clientRef:'r2'});
  const c=await pesanan.createOrder(store,{...isian(),contactName:'Siti',clientRef:'r3'});
  const kode=new Set([a,b,c].map(item=>item.order.order_code));
  assert.equal(kode.size,3,'tiga pesanan, tiga Order ID yang berbeda');
  assert.equal((await pesanan.listOrders(store,{q:'20123456'})).length,3);
  const skema=read('server/src/db.js');
  assert.equal(/UNIQUE[^\n]*license_orders\(npsn\)/i.test(skema),false,'NPSN tidak pernah dijadikan kunci unik');
});

test('5. Data pesanan yang kurang ditolak dengan sebutan kolomnya, bukan diterima diam-diam',async()=>{
  const {store}=siapkan();
  for(const [ubah,penggal] of [
    [{schoolName:''},'Nama Sekolah'],
    [{npsn:'123'},'NPSN'],
    [{contactName:''},'Nama Pemesan'],
    [{whatsapp:'bukan-nomor'},'Nomor WhatsApp'],
    [{city:''},'Kabupaten/Kota'],
    [{province:''},'Provinsi'],
  ]){
    await assert.rejects(()=>pesanan.createOrder(store,{...isian(),...ubah}),
      galat=>galat.code==='PESANAN_TIDAK_LENGKAP'&&galat.message.includes(penggal),
      `kekurangan ${penggal} disebutkan apa adanya`);
  }
  await assert.rejects(()=>pesanan.createOrder(store,{...isian(),email:'salah@'}),
    galat=>galat.code==='EMAIL_TIDAK_VALID');
});

/* ============================================ B. HUBUNGAN PESANAN DENGAN LISENSI */

test('6. Lisensi hanya terbit lewat Pemilik, dan satu pesanan hanya melahirkan satu lisensi',async()=>{
  const {store,secrets}=siapkan();
  const {order}=await pesanan.createOrder(store,{...isian(),clientRef:'r1'});
  const hasil=await pesanan.issueLicenseForOrder(store,order.id,{actor:'pemilik',createLicenses},secrets);
  assert.ok(hasil.license.key,'kunci utuh dikembalikan sekali kepada Pemilik');
  assert.equal(hasil.order.status,'LISENSI_DITERBITKAN');
  assert.equal(hasil.order.license_id,hasil.license.id,'pesanan menunjuk lisensinya');
  const detail=await pesanan.orderDetail(store,order.id);
  assert.equal(detail.license.id,hasil.license.id,'hubungannya terbaca dua arah');
  assert.equal(detail.license.npsn,'20123456','identitas sekolah ikut ke lisensinya');
  await assert.rejects(()=>pesanan.issueLicenseForOrder(store,order.id,{actor:'pemilik',createLicenses},secrets),
    galat=>galat.code==='ORDER_SUDAH_BERLISENSI','menekan dua kali tidak melahirkan lisensi kedua');
});

test('7. Pesanan yang lisensinya sudah terbit tidak dapat dimundurkan statusnya',async()=>{
  const {store,secrets}=siapkan();
  const {order}=await pesanan.createOrder(store,{...isian(),clientRef:'r1'});
  await pesanan.issueLicenseForOrder(store,order.id,{actor:'pemilik',createLicenses},secrets);
  /* Lisensinya sudah ada di tangan pembeli, jadi status pesanan tidak lagi menggambarkan
     apa pun bila diubah kembali menjadi "baru" atau "dibatalkan". */
  await assert.rejects(()=>pesanan.setOrderStatus(store,order.id,{status:'DIBATALKAN'}),
    galat=>galat.code==='ORDER_TERKUNCI');
});

test('8. Pesanan yang dibatalkan tidak dapat diterbitkan lisensinya sebelum dibuka kembali',async()=>{
  const {store,secrets}=siapkan();
  const {order}=await pesanan.createOrder(store,{...isian(),clientRef:'r1'});
  await pesanan.setOrderStatus(store,order.id,{status:'DIBATALKAN',paymentStatus:'DIBATALKAN'});
  await assert.rejects(()=>pesanan.issueLicenseForOrder(store,order.id,{actor:'pemilik',createLicenses},secrets),
    galat=>galat.code==='ORDER_DIBATALKAN');
  await pesanan.setOrderStatus(store,order.id,{status:'BARU',paymentStatus:'BELUM_BAYAR'});
  const hasil=await pesanan.issueLicenseForOrder(store,order.id,{actor:'pemilik',createLicenses},secrets);
  assert.ok(hasil.license.key,'setelah dibuka kembali, lisensinya dapat diterbitkan');
});

test('9. Pesanan lama tidak pernah dihapus - pembatalan hanya mengubah status',async()=>{
  const {store}=siapkan();
  const {order}=await pesanan.createOrder(store,{...isian(),clientRef:'r1'});
  await pesanan.setOrderStatus(store,order.id,{status:'DIBATALKAN',paymentStatus:'DIBATALKAN',reason:'salah isi'});
  const tetapAda=await store.one('SELECT * FROM license_orders WHERE id=$1',[order.id]);
  assert.ok(tetapAda,'barisnya tetap ada');
  assert.equal(tetapAda.status,'DIBATALKAN');
  const sumber=read('server/src/orders.js');
  assert.equal(/DELETE FROM license_orders/i.test(sumber),false,'tidak ada satu pun penghapusan pesanan');
  assert.equal(/DELETE FROM licenses/i.test(sumber),false,'tidak ada satu pun penghapusan lisensi');
});

test('10. Penyaringan pesanan bekerja untuk pencarian, status, dan status pembayaran',async()=>{
  const {store}=siapkan();
  const a=await pesanan.createOrder(store,{...isian(),clientRef:'r1'});
  await pesanan.createOrder(store,{...isian({schoolName:'SDN Lain 02',npsn:'20999999'}),clientRef:'r2'});
  await pesanan.setOrderStatus(store,a.order.id,{status:'DIVERIFIKASI',paymentStatus:'LUNAS'});
  assert.equal((await pesanan.listOrders(store,{q:'SDN Lain'})).length,1);
  assert.equal((await pesanan.listOrders(store,{q:a.order.order_code})).length,1);
  assert.equal((await pesanan.listOrders(store,{status:'DIVERIFIKASI'})).length,1);
  assert.equal((await pesanan.listOrders(store,{paymentStatus:'LUNAS'})).length,1);
  assert.equal((await pesanan.listOrders(store,{paymentStatus:'BELUM_BAYAR'})).length,1);
  const ringkas=await pesanan.ringkasanPesanan(store);
  assert.equal(ringkas.total,2);
  assert.equal(ringkas.per_status.DIVERIFIKASI,1);
});

/* ================================================== C. KEAMANAN ENDPOINT PESANAN */

test('11. Endpoint pesanan publik tidak pernah mengembalikan rahasia apa pun',async()=>{
  const uji=await serverUji();
  try{
    const hasil=await uji.minta('/api/v1/orders',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...isian(),clientRef:'r1'})});
    assert.equal(hasil.status,200);
    const kunci=Object.keys(hasil.data.order).sort();
    assert.deepEqual(kunci,['contact_name','created_at','npsn','order_code','payment_method','payment_status','school_name','status']);
    const teks=JSON.stringify(hasil.data).toLowerCase();
    for(const rahasia of ['license_key','activation_token','password','token','secret','pepper','recovery'])
      assert.equal(teks.includes(rahasia),false,`jawaban publik tidak memuat ${rahasia}`);
  }finally{await uji.tutup();}
});

test('12. Seluruh endpoint pesanan dan unduhan milik Pemilik menolak permintaan tanpa sesi',async()=>{
  const uji=await serverUji();
  try{
    assert.equal((await uji.minta('/api/v1/owner/orders')).status,401);
    assert.equal((await uji.minta('/api/v1/owner/downloads')).status,401);
    assert.equal((await uji.minta('/api/v1/owner/orders/ord_apa/issue-license',{method:'POST'})).status,401);
    assert.equal((await uji.minta('/api/v1/owner/orders/ord_apa/mark-paid',{method:'POST'})).status,401);
    assert.equal((await uji.minta('/api/v1/owner/downloads',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify({platform:'android',url:'https://a.b/c'})})).status,401);
    /* Sesi palsu pun tetap ditolak: tokennya dicocokkan ke tabel sesi, bukan sekadar dibaca. */
    assert.equal((await uji.minta('/api/v1/owner/orders',{headers:{authorization:'Bearer palsu'}})).status,401);
  }finally{await uji.tutup();}
});

test('13. Endpoint Pemilik tidak pernah dibuka lintas origin, endpoint publik dibuka',async()=>{
  const uji=await serverUji();
  try{
    const publik=await fetch(`http://127.0.0.1:${uji.server.address().port}/api/v1/orders`,{method:'OPTIONS'});
    assert.equal(publik.headers.get('access-control-allow-origin'),'*');
    const owner=await fetch(`http://127.0.0.1:${uji.server.address().port}/api/v1/owner/orders`,{method:'OPTIONS'});
    assert.equal(owner.status,405,'preflight untuk endpoint Pemilik tidak pernah dijawab');
  }finally{await uji.tutup();}
});

test('14. Alur Pemilik lengkap: verifikasi, tandai lunas, lalu buat lisensi',async()=>{
  const uji=await serverUji();
  try{
    const dibuat=await uji.minta('/api/v1/orders',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...isian(),clientRef:'r1'})});
    const sesi=await uji.masuk();
    const daftar=await uji.minta('/api/v1/owner/orders',{headers:sesi});
    assert.equal(daftar.data.orders.length,1);
    const id=daftar.data.orders[0].id;
    assert.equal(daftar.data.orders[0].order_code,dibuat.data.order.order_code);
    const verif=await uji.minta(`/api/v1/owner/orders/${id}/verify`,{method:'POST',headers:sesi,body:'{}'});
    assert.equal(verif.data.order.status,'DIVERIFIKASI');
    const lunas=await uji.minta(`/api/v1/owner/orders/${id}/mark-paid`,{method:'POST',headers:sesi,body:'{}'});
    assert.equal(lunas.data.order.payment_status,'LUNAS');
    const terbit=await uji.minta(`/api/v1/owner/orders/${id}/issue-license`,{method:'POST',headers:sesi,body:'{}'});
    assert.equal(terbit.data.order.status,'LISENSI_DITERBITKAN');
    assert.match(terbit.data.license.key,/^ERAPOR-/,'kunci utuh hanya dikembalikan di sini');
    const ulang=await uji.minta(`/api/v1/owner/orders/${id}/issue-license`,{method:'POST',headers:sesi,body:'{}'});
    assert.equal(ulang.status,409);
  }finally{await uji.tutup();}
});

/* ========================================================== D. DATA PEMBAYARAN */

test('15. Data pembayaran sama persis dengan yang diberikan pemilik aplikasi',()=>{
  /* Nilai-nilai ini diberikan langsung oleh pemilik aplikasi. Test ini adalah penjaganya:
     bila satu digit saja berubah, test gagal - bukan pembeli yang menemukannya. */
  assert.equal(findPaymentMethod('mandiri').accountNumber,'1560024948665');
  assert.equal(findPaymentMethod('gopay').accountNumber,'087776015915');
  for(const metode of PAYMENT_METHODS)assert.equal(metode.accountName,'FAHMI DJAWAS');
  assert.equal(findPaymentMethod('qris').image,'./assets/qris-fahmi-djawas.jpg');
  assert.equal(findPaymentMethod('qris').accountNumber,undefined,'QRIS tidak punya nomor rekening');
  assert.deepEqual(PAYMENT_METHODS.map(item=>item.id),['qris','gopay','mandiri']);
});

test('16. Nomor pembayaran hanya ditulis di satu berkas sumber, tidak di markup',()=>{
  const markup=read('public/beli/index.html');
  for(const nomor of ['1560024948665','087776015915'])
    assert.equal(markup.includes(nomor),false,`${nomor} tidak ditulis ulang di markup`);
  assert.equal(read('public/beli/beli.js').includes('1560024948665'),false);
  /* Satu-satunya tempat nomor itu ditulis. */
  assert.ok(read('src/data/payment-config.js').includes('1560024948665'));
});

test('17. Tidak ada nominal karangan di halaman pembelian',()=>{
  const sumber=read('src/data/payment-config.js');
  assert.equal(/Rp\s?\d/.test(sumber),false,'tidak ada angka rupiah yang ditanam');
  assert.match(PAYMENT_AMOUNT_NOTE,/dikonfirmasi/i,'nominal dinyatakan dikonfirmasi Developer, bukan ditebak');
  const markup=read('public/beli/index.html');
  assert.equal(/Rp\s?\d[\d.]{2,}/.test(markup),false,'tidak ada harga karangan di markup');
});

test('18. Berkas QRIS adalah berkas asli, tidak digambar ulang menjadi SVG',()=>{
  const berkas=new URL('public/beli/assets/qris-fahmi-djawas.jpg',root);
  const isi=readFileSync(berkas);
  assert.equal(createHash('md5').update(isi).digest('hex'),'bff5898ced5ae45ff06549866f6324a3',
    'berkas QRIS sama persis dengan yang dikirim pemilik aplikasi');
  assert.equal(isi.subarray(0,3).toString('hex'),'ffd8ff','berkasnya benar-benar JPEG, bukan SVG buatan');
  assert.ok(statSync(berkas).size>50_000,'gambarnya utuh, bukan gambar kosong');
  /* Tidak ada satu pun QRIS tiruan yang dibuat dengan kode. */
  const gaya=read('public/beli/beli.css');
  assert.match(gaya,/\.bayar-qris\{[^}]*object-fit:contain/,'gambar QRIS tidak pernah dipotong atau ditarik');
});

test('19a. Pilihan metode di formulir sama persis dengan metode pembayaran resmi',()=>{
  /* order-form.js sengaja tidak mengimpor payment-config.js supaya ia dapat diuji langsung di
     Node - alamat relatif ke src/ hanya benar setelah dibangun ke dist/. Test inilah yang
     menjaga kedua daftar tidak pernah berbeda. */
  assert.deepEqual([...PAYMENT_CHOICES],['belum-dipilih',...PAYMENT_METHOD_IDS]);
  /* Label yang dipakai pesan WhatsApp juga menutup seluruh metode resmi. */
  for(const id of PAYMENT_METHOD_IDS){
    const teks=buildOrderMessage(isian({paymentMethod:id}));
    assert.equal(teks.includes(id),false,`pesan memakai label yang dibaca manusia, bukan id "${id}"`);
    assert.match(teks,/Metode Pembayaran yang Dipilih:\n\S/,'metode selalu punya label');
  }
});

test('19. Metode pembayaran yang tidak dikenal dikembalikan ke "belum dipilih"',()=>{
  assert.equal(normalizePaymentMethod('qris'),'qris');
  assert.equal(normalizePaymentMethod('MANDIRI'),'mandiri');
  assert.equal(normalizePaymentMethod('bitcoin'),'belum-dipilih');
  assert.equal(normalizePaymentMethod(''),'belum-dipilih');
  assert.equal(normalizePaymentMethod(null),'belum-dipilih');
});

/* ================================================== E. URUTAN SIMPAN LALU WHATSAPP */

test('20. Halaman pembelian menyimpan ke server LEBIH DULU, WhatsApp sesudahnya',()=>{
  const sumber=read('public/beli/beli.js');
  const simpan=sumber.indexOf('await submitOrder(');
  const buka=sumber.indexOf('window.open(whatsappUrl(');
  assert.ok(simpan>0,'halaman benar-benar mengirim pesanan ke server');
  assert.ok(buka>simpan,'WhatsApp dibuka SESUDAH pesanan tersimpan, bukan sebelumnya');
  /* Kegagalan penyimpanan menghentikan alur: tidak ada WhatsApp yang terbuka membawa pesanan
     yang sebenarnya belum tercatat di mana pun. */
  const blokGagal=sumber.slice(sumber.indexOf('}catch(galat){'),buka);
  assert.match(blokGagal,/return;/,'kegagalan menyimpan menghentikan alur sebelum WhatsApp dibuka');
  assert.match(blokGagal,/Pesanan belum tersimpan/,'kegagalan dikatakan apa adanya kepada pembeli');
});

test('21. Pesan WhatsApp membawa Order ID begitu pesanannya tersimpan',()=>{
  const dengan=buildOrderMessage(isian(),{orderCode:'ORD-20260907-000012'});
  assert.match(dengan,/Order ID:\nORD-20260907-000012/,'Order ID menjadi bagian pesan');
  /* Bila pesanannya belum tersimpan, barisnya memang tidak ditulis. Lebih baik tidak ada
     daripada memuat nomor karangan. */
  const tanpa=buildOrderMessage(isian());
  assert.equal(tanpa.includes('Order ID'),false);
});

test('22. Pesan WhatsApp hanya memuat keterangan pembelian, tidak satu pun rahasia',()=>{
  const teks=buildOrderMessage(isian({email:'sekolah@contoh.sch.id',paymentMethod:'mandiri'}),
    {orderCode:'ORD-20260907-000001'}).toLowerCase();
  for(const bocor of ['password','token','secret','license key','activation','installation','pepper','database'])
    assert.equal(teks.includes(bocor),false,`pesan tidak memuat ${bocor}`);
  assert.match(teks,/bank mandiri/,'metode yang dipilih ikut disebut');
  /* Nomor rekening TIDAK ikut ke pesan: yang dikirim hanya pilihan metodenya. */
  assert.equal(teks.includes('1560024948665'),false);
});

test('23. Payload pesanan hanya memuat data pembelian, dan membawa penanda kiriman ganda',()=>{
  const payload=buildOrderPayload(isian({paymentMethod:'gopay'}),'ref-uji');
  assert.deepEqual(Object.keys(payload).sort(),
    ['city','clientRef','contactName','email','npsn','paymentMethod','province','schoolName','whatsapp']);
  assert.equal(payload.clientRef,'ref-uji');
  assert.equal(payload.whatsapp,'6281234567890','nomor sudah dinormalkan sebelum dikirim');
  assert.equal(payload.konfirmasi,undefined,'centang persetujuan tidak perlu ikut ke server');
  const dua=new Set([newClientRef(),newClientRef(),newClientRef()]);
  assert.equal(dua.size,3,'setiap isian formulir mendapat penanda yang berbeda');
});

test('24. Nomor WhatsApp tujuan berasal dari satu sumber resmi, bukan ditulis ulang',()=>{
  assert.equal(CONTACT_WHATSAPP,'6287776015915');
  const sumber=read('public/beli/beli.js');
  assert.equal(sumber.includes('6287776015915'),false,'nomor tidak ditulis ulang di halaman');
  assert.match(sumber,/whatsappUrl\(teks,CONTACT_WHATSAPP\)/);
});

/* ============================================================ F. BAGIAN UNDUHAN */

test('25. Platform tanpa alamat unduhan berkata "Belum tersedia", bukan disembunyikan',()=>{
  const kosong=downloadRows(null);
  assert.equal(kosong.length,2,'kedua platform tetap ditampilkan');
  assert.deepEqual(kosong.map(item=>item.platform),['android','windows']);
  for(const baris of kosong){
    assert.equal(baris.available,false);
    assert.equal(baris.url,'');
    assert.equal(baris.statusText,'Belum tersedia');
    assert.equal(baris.buttonText,'Belum tersedia');
  }
});

test('26. Alamat unduhan yang sah ditampilkan, yang berbahaya tidak pernah dipakai',()=>{
  const baris=downloadRows([
    {platform:'android',url:'https://www.mediafire.com/file/x/e-rapor.apk',version:'1.3.2',size_text:'22 MB'},
    {platform:'windows',url:'javascript:alert(1)'},
  ]);
  assert.equal(baris[0].available,true);
  assert.equal(baris[0].url,'https://www.mediafire.com/file/x/e-rapor.apk');
  assert.equal(downloadMeta(baris[0]),'Versi 1.3.2 • 22 MB');
  assert.equal(baris[1].available,false,'skema javascript: tidak pernah lolos menjadi tautan');
  assert.equal(baris[1].url,'');
});

test('27. Server pun menolak alamat unduhan yang bukan http/https',async()=>{
  const {store}=siapkan();
  for(const jahat of ['javascript:alert(1)','data:text/html,<script>','bukan url'])
    await assert.rejects(()=>unduhan.setDownload(store,{platform:'android',url:jahat}),
      galat=>galat.code==='URL_TIDAK_VALID',`${jahat} ditolak`);
  await assert.rejects(()=>unduhan.setDownload(store,{platform:'ios',url:'https://a.b/c'}),
    galat=>galat.code==='PLATFORM_TIDAK_DIKENAL');
});

test('28. Alamat unduhan dapat diatur Pemilik dan langsung terbaca publik',async()=>{
  const uji=await serverUji();
  try{
    const sebelum=await uji.minta('/api/v1/downloads');
    assert.deepEqual(sebelum.data.downloads.map(item=>item.available),[false,false]);
    const sesi=await uji.masuk();
    await uji.minta('/api/v1/owner/downloads',{method:'POST',headers:sesi,
      body:JSON.stringify({platform:'android',url:'https://www.mediafire.com/file/x/e-rapor.apk',version:'1.3.2'})});
    const sesudah=await uji.minta('/api/v1/downloads');
    const android=sesudah.data.downloads.find(item=>item.platform==='android');
    assert.equal(android.available,true);
    assert.equal(android.version,'1.3.2');
    assert.equal(sesudah.data.downloads.find(item=>item.platform==='windows').available,false,
      'platform lain tidak ikut berubah');
  }finally{await uji.tutup();}
});

test('29. Halaman pembelian tidak pernah mengarahkan pembeli ke GitHub',()=>{
  for(const berkas of ['public/beli/index.html','public/beli/beli.js','public/beli/unduhan.js','public/beli/order-api.js']){
    const isi=read(berkas);
    assert.equal(/github\.com/i.test(isi),false,`${berkas} tidak memuat tautan GitHub`);
  }
});

/* ====================================================== G. KEAMANAN DAN KEBERSIHAN */

test('30. Halaman pembelian tidak membawa satu pun credential ke peramban',()=>{
  for(const berkas of ['public/beli/beli.js','public/beli/order-api.js','public/beli/order-form.js',
    'public/beli/unduhan.js','src/data/payment-config.js']){
    const isi=read(berkas).replace(/\/\*[\s\S]*?\*\//g,'');
    for(const rahasia of ['MEDIAFIRE','OWNER_PASSWORD','DATABASE_URL','LICENSE_HASH_PEPPER',
      'LICENSE_RECOVERY_KEY','PRIVATE_KEY','api_secret','apiSecret'])
      assert.equal(isi.includes(rahasia),false,`${berkas} tidak memuat ${rahasia}`);
    assert.equal(/authorization\s*:/i.test(isi),false,`${berkas} tidak pernah mengirim header otorisasi`);
  }
});

test('31. Web Pembelian tidak punya akses tulis ke repositori maupun ke lisensi',()=>{
  const isi=[read('public/beli/beli.js'),read('public/beli/order-api.js')].join('\n');
  /* Satu-satunya endpoint yang disentuh halaman publik. Keduanya tidak dapat membuat lisensi,
     membaca daftar pesanan, maupun mengubah apa pun milik sekolah lain. */
  const jalur=[...isi.matchAll(/apiUrl\('([^']+)'/g)].map(cocok=>cocok[1]).sort();
  assert.deepEqual(jalur,['/api/v1/downloads','/api/v1/orders']);
  assert.equal(isi.includes('/owner/'),false,'halaman publik tidak menyentuh satu pun endpoint Pemilik');
  assert.equal(/api\.github\.com|git push|repos\//.test(isi),false,'tidak ada akses repositori sama sekali');
});

test('32. Hanya ada SATU web pembelian, tidak ada yang paralel',()=>{
  const daftar=readdirSync(new URL('public/',root),{withFileTypes:true})
    .filter(item=>item.isDirectory()).map(item=>item.name);
  assert.deepEqual(daftar,['beli'],'tidak ada direktori halaman pembelian kedua');
  const build=read('scripts/build-web.mjs');
  assert.equal((build.match(/public\/beli/g)||[]).length,2,'build menyalin satu halaman pembelian saja');
});

test('33. Tabel pesanan tidak pernah memuat data akademik sekolah',()=>{
  for(const berkas of ['server/src/db.js','server/src/pg.js','server/schema-postgres.sql']){
    const isi=read(berkas);
    const awal=isi.indexOf('license_orders(');
    assert.ok(awal>0,`${berkas} memuat definisi license_orders`);
    const blok=isi.slice(awal,isi.indexOf(')',isi.indexOf('updated_at',awal)));
    for(const kolom of ['student','siswa','nilai','grade','attendance','absensi','rapor','nisn','license_key','password'])
      assert.equal(new RegExp(kolom,'i').test(blok),false,`license_orders tidak punya kolom ${kolom}`);
  }
});

test('34. Skema pesanan dan unduhan bersifat menambah, tidak pernah membuang tabel',()=>{
  for(const berkas of ['server/src/db.js','server/src/pg.js','server/schema-postgres.sql']){
    const isi=read(berkas);
    assert.match(isi,/CREATE TABLE IF NOT EXISTS license_orders/);
    assert.match(isi,/CREATE TABLE IF NOT EXISTS release_downloads/);
    assert.equal(/DROP TABLE\s+(IF EXISTS\s+)?license_orders/i.test(isi),false);
    assert.equal(/DROP TABLE\s+(IF EXISTS\s+)?release_downloads/i.test(isi),false);
  }
  /* Skema SQLite dan PostgreSQL memuat kolom yang sama persis, sehingga pengembangan lokal
     tidak pernah berperilaku berbeda dari produksi. */
  const kolom=teks=>[...teks.slice(teks.indexOf('license_orders('),teks.indexOf('ix_orders_status'))
    .matchAll(/^\s{2,}([a-z_]+)\s/gm)].map(cocok=>cocok[1]);
  assert.deepEqual(kolom(read('server/src/db.js')),kolom(read('server/src/pg.js')));
});

test('35. Owner Panel punya halaman Pesanan dan Tautan Unduhan yang benar-benar terhubung',()=>{
  const panel=read('server/public/owner/app.js');
  assert.match(panel,/\['orders','Pesanan Lisensi'\]/);
  assert.match(panel,/\['downloads','Tautan Unduhan'\]/);
  assert.match(panel,/tab==='orders'\)await gambarPesanan/);
  assert.match(panel,/tab==='downloads'\)await gambarUnduhan/);
  /* Tombol yang benar-benar memanggil endpoint Pemilik, bukan tombol hiasan. */
  for(const aksi of ['verify','mark-paid','cancel','issue-license'])
    assert.ok(panel.includes(`data-pesanan="${aksi}"`),`tombol ${aksi} ada di panel`);
  assert.match(panel,/\/owner\/orders\/\$\{btn\.dataset\.id\}\/\$\{aksi\}/);
  /* Penerbitan lisensi tidak pernah terjadi karena salah tekan. */
  assert.match(panel,/'issue-license':'Terbitkan License Key/);
});

test('36. Cakupan lisensi yang dijanjikan halaman sama dengan yang berjalan di server',()=>{
  const teks=LICENSE_SCOPE.join(' ').toLowerCase();
  assert.match(teks,/satu android/,'dua slot perangkat memang aturan yang berjalan');
  assert.match(teks,/satu windows/);
  const server=read('server/src/licenses.js');
  assert.match(server,/DEVICE_SLOTS=Object\.freeze\(\['android','windows'\]\)/,
    'janji dua slot benar-benar ditegakkan server');
  /* Tidak ada satu pun janji fitur yang belum ada. */
  for(const janji of ['segera','coming soon','akan hadir','dalam pengembangan'])
    assert.equal(teks.includes(janji),false,`tidak ada janji "${janji}"`);
});

test('37. Pesan kegagalan pemesanan menjelaskan keadaan sebenarnya',()=>{
  assert.match(orderErrorMessage({code:'JARINGAN'}),/belum tersimpan/i);
  assert.match(orderErrorMessage({code:'RATE_LIMITED'}),/beberapa menit/i);
  assert.equal(orderErrorMessage({code:'PESANAN_TIDAK_LENGKAP',message:'Lengkapi data pemesanan: NPSN 8 digit.'}),
    'Lengkapi data pemesanan: NPSN 8 digit.');
  /* Kegagalan yang tidak dikenal TIDAK disembunyikan sebagai keberhasilan. */
  assert.match(orderErrorMessage({}),/belum tersimpan|coba lagi/i);
});

test('38. Markup halaman pembelian menyediakan tempat Order ID, pembayaran, dan unduhan',()=>{
  const markup=read('public/beli/index.html');
  for(const penanda of ['id="hasil-pesanan"','id="pilihan-bayar"','id="daftar-bayar"',
    'id="langkah-bayar"','id="daftar-unduh"','id="cakupan-lisensi-daftar"','id="catatan-nominal"'])
    assert.ok(markup.includes(penanda),`markup memuat ${penanda}`);
  /* Kotak hasil tetap kosong sampai server menjawab: Order ID tidak pernah ada sebelum
     pesanannya sungguh tersimpan. */
  assert.match(markup,/id="hasil-pesanan"[^>]*hidden/);
  assert.match(markup,/id="pembayaran"/);
  assert.match(markup,/id="unduh"/);
  /* Navigasi ikut diperbarui supaya bagian baru dapat dijangkau. */
  assert.match(markup,/data-nav="pembayaran"/);
  assert.match(markup,/data-nav="unduh"/);
});
