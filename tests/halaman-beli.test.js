import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTACT_WHATSAPP, whatsappUrl } from '../src/data/app-identity.js';
import { buildOrderMessage, normalizeWhatsapp, REQUIRED_FIELDS, validateOrder } from '../public/beli/order-form.js';

/* Halaman publik /beli.

   Halaman ini dibuka calon pembeli yang belum punya apa pun: tanpa login, tanpa lisensi, tanpa
   akses Owner Panel. Suite ini menjaga dua batas sekaligus — halaman tidak pernah menyentuh
   Owner API atau lisensi, dan formulirnya tidak pernah meminta data siswa. */

const root=new URL('../',import.meta.url);
const rootPath=fileURLToPath(root);
const read=path=>readFileSync(new URL(path,root),'utf8');
const halaman=()=>read('public/beli/index.html');

const LENGKAP=Object.freeze({
  schoolName:'SD NEGERI CONTOH NUSANTARA 02',npsn:'20223344',contactName:'Budi Santosa, S.Pd.',
  whatsapp:'081234567890',city:'Kabupaten Bekasi',province:'Jawa Barat',
  email:'sdn@contoh.sch.id',konfirmasi:true,
});

/* Build dijalankan pada salinan proyek supaya dist milik proyek tidak dihapus di tengah jalan
   oleh test lain yang membacanya. */
function bangunDiDirektoriSementara(){
  const temp=mkdtempSync(join(tmpdir(),'erapor-beli-'));
  mkdirSync(join(temp,'scripts'),{recursive:true});
  cpSync(join(rootPath,'scripts/build-web.mjs'),join(temp,'scripts/build-web.mjs'));
  for(const berkas of ['index.html','manifest.webmanifest','sw.js'])
    cpSync(join(rootPath,berkas),join(temp,berkas));
  for(const direktori of ['assets','src'])symlinkSync(join(rootPath,direktori),join(temp,direktori),'dir');
  cpSync(join(rootPath,'server/public'),join(temp,'server/public'),{recursive:true});
  cpSync(join(rootPath,'public'),join(temp,'public'),{recursive:true});
  execFileSync(process.execPath,[join(temp,'scripts/build-web.mjs')],{cwd:temp,stdio:'pipe'});
  return temp;
}

/* ------------------------------------------------------------------ 1-3. Route publik */

test('1. Halaman /beli berdiri sendiri, tanpa login dan tanpa pengalihan ke #login',()=>{
  const teks=halaman();
  assert.match(teks,/<title>e-Rapor — Solusi Digital Pengelolaan Rapor Sekolah<\/title>/);
  /* Tidak memuat aplikasi sekolah sama sekali: tidak ada router, tidak ada sesi. */
  assert.equal(teks.includes('src/app.js'),false,'tidak memuat aplikasi sekolah');
  for(const jejak of ['#login','#dashboard','location.hash','renderLogin','initRouter'])
    assert.equal(teks.includes(jejak),false,`halaman publik tidak menyentuh ${jejak}`);
  const skrip=read('public/beli/beli.js');
  for(const jejak of ['#login','location.hash','loadDb','localStorage','sessionStorage'])
    assert.equal(skrip.includes(jejak),false,`beli.js tidak menyentuh ${jejak}`);
});

test('2. Rewrite /beli dan /beli/ tersedia dan rewrite lama tidak berubah',()=>{
  const konfigurasi=JSON.parse(read('vercel.json'));
  const rewrite=Object.fromEntries(konfigurasi.rewrites.map(item=>[item.source,item.destination]));
  assert.equal(rewrite['/beli'],'/beli/index.html');
  assert.equal(rewrite['/beli/'],'/beli/index.html');
  assert.equal(rewrite['/owner'],'/owner/index.html','rewrite Owner Panel tidak berubah');
  assert.equal(rewrite['/owner/'],'/owner/index.html');
  assert.equal(rewrite['/api/v1/:path*'],'/api/[...route]','rewrite API lisensi tidak berubah');
});

test('3. Metadata halaman layak dibagikan dan metadata aplikasi tidak diubah',()=>{
  const teks=halaman();
  assert.match(teks,/<meta name="description" content="Kelola data siswa, penilaian, kegiatan pembelajaran, rapor dan leger sekolah dengan e-Rapor\."\/>/);
  assert.match(teks,/property="og:title" content="e-Rapor — Solusi Digital Pengelolaan Rapor Sekolah"/);
  assert.match(teks,/<html lang="id">/);
  assert.match(teks,/name="viewport" content="width=device-width, initial-scale=1/);
  /* Judul dan deskripsi aplikasi sekolah tetap seperti semula. */
  const aplikasi=read('index.html');
  assert.match(aplikasi,/<title>e-Rapor<\/title>/);
  assert.match(aplikasi,/content="Aplikasi e-Rapor sekolah, berjalan penuh secara lokal\."/);
});

/* -------------------------------------------------------------------- 4-9. Formulir */

test('4. Formulir memuat seluruh field wajib beserta persetujuan',()=>{
  const teks=halaman();
  assert.match(teks,/<h2 id="judul-form">Daftarkan Sekolah Anda<\/h2>/);
  assert.match(teks,/Isi data berikut untuk mendapatkan informasi pembelian lisensi e-Rapor\./);
  for(const nama of REQUIRED_FIELDS)
    assert.match(teks,new RegExp(`id="${nama}"[^>]*required`),`field ${nama} wajib`);
  assert.match(teks,/id="email"/);
  assert.equal(/id="email"[^>]*required/.test(teks),false,'email tetap opsional');
  assert.match(teks,/Saya memastikan data sekolah yang saya isi sudah benar\./);
  assert.match(teks,/id="konfirmasi" name="konfirmasi" type="checkbox"/);
  assert.match(teks,/id="tombol-pesan" type="submit" disabled/,'tombol mati sebelum data sah');
  assert.match(teks,/PESAN LISENSI VIA WHATSAPP/);
  for(const label of ['Nama Sekolah','NPSN','Nama Pemesan / Penanggung Jawab','Nomor WhatsApp',
    'Kabupaten / Kota','Provinsi'])
    assert.ok(teks.includes(label),`label ${label} tampil`);
});

test('5. NPSN wajib delapan digit angka',()=>{
  /* Spasi yang tidak sengaja terketik dirapikan, bukan ditolak: "2022 3344" jelas bermaksud
     NPSN 20223344. Yang ditolak adalah panjang dan karakter yang memang salah. */
  for(const npsn of ['20223344','00000001','2022 3344'])
    assert.equal(validateOrder({...LENGKAP,npsn}).valid,true,`${npsn} sah`);
  assert.equal(validateOrder({...LENGKAP,npsn:'2022 3344'}).values.npsn,'20223344');
  for(const npsn of ['','1234567','123456789','2022334A','abcdefgh'])
    assert.match(validateOrder({...LENGKAP,npsn}).errors.npsn,/8 digit/,`${npsn} ditolak`);
});

test('6. Nomor WhatsApp dinormalkan dan yang tidak masuk akal ditolak',()=>{
  for(const nomor of ['081234567890','+62 812-3456-7890','6281234567890','81234567890','0812 3456 7890'])
    assert.equal(normalizeWhatsapp(nomor),'6281234567890',`${nomor} dinormalkan`);
  for(const nomor of ['','12345','abc','+1 555 0100','620'])
    assert.equal(normalizeWhatsapp(nomor),'',`${nomor} ditolak`);
  assert.equal(validateOrder({...LENGKAP,whatsapp:''}).errors.whatsapp,'Nomor WhatsApp wajib diisi.');
  assert.match(validateOrder({...LENGKAP,whatsapp:'12345'}).errors.whatsapp,/tidak dikenali/);
  assert.equal(validateOrder({...LENGKAP,whatsapp:'+62 812-3456-7890'}).values.whatsapp,'6281234567890');
});

test('7. Email opsional tetapi wajib berbentuk email bila diisi',()=>{
  assert.equal(validateOrder({...LENGKAP,email:''}).valid,true,'email boleh kosong');
  assert.equal(validateOrder({...LENGKAP,email:'sdn@contoh.sch.id'}).valid,true);
  for(const email of ['bukan-email','a@b','a@b.c','@contoh.id','a b@contoh.id'])
    assert.match(validateOrder({...LENGKAP,email}).errors.email,/Format email/,`${email} ditolak`);
});

test('8. Persetujuan dan seluruh field wajib menentukan sahnya pemesanan',()=>{
  assert.equal(validateOrder(LENGKAP).valid,true);
  assert.match(validateOrder({...LENGKAP,konfirmasi:false}).errors.konfirmasi,/Centang pernyataan/);
  for(const nama of REQUIRED_FIELDS){
    const hasil=validateOrder({...LENGKAP,[nama]:''});
    assert.equal(hasil.valid,false,`${nama} kosong membuat pemesanan tidak sah`);
    assert.ok(hasil.errors[nama],`${nama} punya pesan galat`);
  }
});

test('9. Validasi JavaScript dijalankan ulang saat tombol ditekan',()=>{
  const skrip=read('public/beli/beli.js');
  assert.match(skrip,/form\.addEventListener\('submit'/);
  assert.match(skrip,/event\.preventDefault\(\)/);
  assert.match(skrip,/const \{valid,errors\}=segarkan\(\{tampilkan:true\}\);/);
  assert.match(skrip,/if\(!valid\)\{/,'pemesanan berhenti bila data tidak sah');
  assert.match(halaman(),/<form id="form-pesan" novalidate>/,'validasi tidak diserahkan ke HTML saja');
});

/* ------------------------------------------------------- 10-15. Pesan WhatsApp dan privasi */

test('10. Tujuan WhatsApp adalah nomor resmi dari satu sumber konfigurasi',()=>{
  assert.equal(CONTACT_WHATSAPP,'6287776015915');
  const skrip=read('public/beli/beli.js');
  assert.match(skrip,/^import \{[^}]*CONTACT_WHATSAPP[^}]*whatsappUrl[^}]*\} from '\.\.\/src\/data\/app-identity\.js';/m,
    'seluruh kontak diambil dari satu sumber');
  assert.match(skrip,/whatsappUrl\(teks,CONTACT_WHATSAPP\)/);
  /* Nomor tidak ditulis ulang di berkas halaman publik mana pun. */
  for(const berkas of ['public/beli/index.html','public/beli/beli.js','public/beli/beli.css','public/beli/order-form.js'])
    assert.equal(/6287776015915|0877-?7601-?5915/.test(read(berkas)),false,`${berkas} tidak menulis ulang nomor`);
  assert.match(whatsappUrl('uji'),/^https:\/\/wa\.me\/6287776015915\?text=uji$/);
});

test('11. Pesan memuat seluruh data sekolah yang diisi',()=>{
  const pesan=buildOrderMessage(LENGKAP);
  assert.match(pesan,/^Halo Pak Fahmi,/);
  assert.match(pesan,/Saya ingin melakukan pemesanan lisensi e-Rapor\./);
  for(const [label,nilai] of [['Nama Sekolah:',LENGKAP.schoolName],['NPSN:',LENGKAP.npsn],
    ['Nama Pemesan\\/Penanggung Jawab:',LENGKAP.contactName],['WhatsApp:','6281234567890'],
    ['Email:',LENGKAP.email],['Kabupaten\\/Kota:',LENGKAP.city],['Provinsi:',LENGKAP.province]])
    assert.match(pesan,new RegExp(`${label}\\n${nilai.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`),`${label} tercantum`);
  assert.match(pesan,/Mohon informasi selanjutnya mengenai pembelian dan aktivasi lisensi e-Rapor\./);
  assert.match(pesan,/Terima kasih\.$/);
  /* Email kosong tetap menghasilkan pesan yang rapi. */
  assert.match(buildOrderMessage({...LENGKAP,email:''}),/Email:\n-\n/);
});

test('12. Pesan tidak pernah memuat data siswa maupun rahasia perangkat',()=>{
  const pesan=buildOrderMessage(LENGKAP);
  for(const terlarang of ['NIS','NISN','nilai','absensi','password','username','License Key',
    'Activation Token','Installation ID','activation_token','inst_','ERAPOR-'])
    assert.equal(pesan.includes(terlarang),false,`pesan tidak memuat ${terlarang}`);
  /* Formulirnya sendiri tidak punya kolom untuk apa pun dari daftar itu. */
  const teks=halaman();
  for(const kolom of ['nis','nisn','siswa','nilai','absensi','password','licenseKey','token','backup'])
    assert.equal(new RegExp(`(?:id|name)="${kolom}`,'i').test(teks),false,`tidak ada kolom ${kolom}`);
  const kolomForm=[...teks.matchAll(/<(?:input|textarea|select)[^>]*\bname="([^"]+)"/g)].map(item=>item[1]);
  assert.deepEqual(kolomForm.sort(),
    ['city','contactName','email','konfirmasi','npsn','pesan','province','schoolName','whatsapp'],
    'hanya kolom pembelian yang ada di formulir');
});

test('13. Pengguna dapat memeriksa dan mengubah pesan sebelum dikirim',()=>{
  const teks=halaman();
  assert.match(teks,/Pratinjau Pesan WhatsApp/);
  assert.match(teks,/Dapat Anda periksa dan ubah sebelum dikirim/);
  assert.match(teks,/<textarea id="pesan" name="pesan"/);
  const skrip=read('public/beli/beli.js');
  assert.match(skrip,/kotakPesan\.addEventListener\('input',\(\)=>\{disuntingPengguna=true;\}\)/);
  assert.match(skrip,/if\(!disuntingPengguna\)kotakPesan\.value=buildOrderMessage\(isi\)/,
    'suntingan pengguna tidak pernah ditimpa');
  assert.match(skrip,/const teks=kotakPesan\.value\.trim\(\)/,'yang dikirim adalah pesan yang terlihat');
});

/* --------------------------------------------- 16-18. Owner Panel dan lisensi tidak tersentuh */

test('14. Halaman publik tidak mengenal Owner Panel maupun API lisensi',()=>{
  /* Kode halaman tidak boleh menyentuh apa pun milik Pemilik atau lisensi. Komentar dibuang
     lebih dulu supaya penjelasan yang justru MENYEBUT larangan tidak dianggap pelanggaran. */
  for(const berkas of ['public/beli/beli.js','public/beli/order-form.js']){
    const isi=read(berkas).replace(/\/\*[\s\S]*?\*\//g,'');
    for(const jejak of ['/owner','owner/app-versions','OWNER_USERNAME','/api/v1','fetch(',
      'XMLHttpRequest','license','License Key','activation','Installation'])
      assert.equal(isi.includes(jejak),false,`${berkas} tidak menyentuh ${jejak}`);
  }
  /* Halaman boleh MENJELASKAN alur License Key kepada pembeli, tetapi tidak boleh memuat
     alamat Owner Panel, endpoint API, maupun nama pengguna Pemilik. */
  const teks=halaman();
  for(const jejak of ['/owner','/api/v1','OWNER_USERNAME','app-versions','Bearer','erapor_owner_session'])
    assert.equal(teks.includes(jejak),false,`halaman publik tidak memuat ${jejak}`);
});

test('15. Halaman publik tidak melakukan permintaan jaringan apa pun',()=>{
  const skrip=`${read('public/beli/beli.js')}\n${read('public/beli/order-form.js')}`;
  for(const jejak of ['fetch(','navigator.sendBeacon','WebSocket','EventSource','import(','eval('])
    assert.equal(skrip.includes(jejak),false,`halaman publik tidak memakai ${jejak}`);
  /* Satu-satunya tindakan keluar adalah membuka WhatsApp. */
  const keluar=[...read('public/beli/beli.js').matchAll(/window\.open\(([\s\S]*?)\);/g)].map(item=>item[1]);
  assert.equal(keluar.length,1,'hanya satu jalur keluar');
  assert.match(keluar[0],/whatsappUrl\(teks,CONTACT_WHATSAPP\)/);
});

test('16. Owner Panel tetap tertutup dan tidak pernah ditautkan dari halaman publik',()=>{
  const teks=halaman();
  assert.equal(/href="[^"]*owner/i.test(teks),false,'tidak ada tautan ke Owner Panel');
  /* Endpoint pemilik tetap menuntut sesi Pemilik; ini dijaga penuh oleh suite lisensi. */
  const api=read('server/src/api.js');
  assert.match(api,/async function wajibOwner\(req\)\{/);
  assert.match(api,/throw new LicenseError\('UNAUTHORIZED','Akses ini hanya untuk Pemilik aplikasi\.',401\)/);
  assert.match(api,/'GET \/api\/v1\/owner\/app-versions':async\(req,res,body,url\)=>\{\s*await wajibOwner\(req\);/);
});

test('17. Pemesanan tidak membuat lisensi, kunci, maupun ikatan perangkat',()=>{
  const skrip=`${read('public/beli/beli.js')}\n${read('public/beli/order-form.js')}`;
  for(const jejak of ['createLicense','licenses','activate','device_activations','ERAPOR-'])
    assert.equal(skrip.includes(jejak),false,`pemesanan tidak menyentuh ${jejak}`);
  const hasil=validateOrder(LENGKAP);
  assert.equal(Object.hasOwn(hasil.values,'licenseKey'),false);
  assert.equal(Object.hasOwn(hasil.values,'installationId'),false);
  assert.match(halaman(),/tidak membuat License Key sendiri dan tidak mengaktifkan lisensi apa pun/);
});

/* ------------------------------------------------------ 19-23. Isi halaman dan hasil build */

test('18. Isi promosi, alur pembelian, dan identitas pengembang tampil',()=>{
  const teks=halaman();
  /* Hero. */
  assert.match(teks,/<span class="badge">e-Rapor Sekolah<\/span>/);
  assert.match(teks,/Kelola Rapor Sekolah Lebih Mudah, Rapi, dan Terintegrasi/);
  assert.match(teks,/e-Rapor membantu sekolah mengelola data siswa, penilaian, kegiatan\s+pembelajaran, rapor, dan leger dalam satu aplikasi yang praktis\./);
  assert.match(teks,/href="#form-pemesanan">Daftarkan Sekolah Anda<\/a>/,'CTA utama menuju formulir');
  assert.match(teks,/id="tautan-developer"[^>]*>Hubungi Developer<\/a>/);
  /* Mockup disusun dari elemen sendiri, bukan gambar. */
  assert.match(teks,/<div class="mock">/);
  assert.equal(/<img[^>]+src="[^"]*\.(?:png|jpe?g|webp)"/i.test(teks),false,'tidak memakai gambar stok');

  /* Keunggulan dikelompokkan menjadi kartu, bukan satu daftar panjang. */
  for(const kelompok of ['Administrasi Sekolah','Penilaian','Kegiatan Pembelajaran',
    'Rapor &amp; Data','Lisensi &amp; Pembaruan'])
    assert.ok(teks.includes(`<h3>${kelompok}</h3>`),`kelompok "${kelompok}" tampil sebagai kartu`);
  for(const fitur of ['Identitas sekolah','Admin &amp; Guru','Data siswa','Absensi',
    'Penilaian &amp; nilai akhir','TP mata pelajaran','Deskripsi otomatis',
    'Intrakurikuler','Kokurikuler','Ekstrakurikuler','Cetak Rapor','Cetak Leger',
    'Backup &amp; Restore','Offline-first','Sistem lisensi resmi','Pembaruan aplikasi resmi'])
    assert.ok(teks.includes(`<li>${fitur}</li>`),`fitur "${fitur}" tercantum`);
  assert.equal((teks.match(/class="kartu reveal"/g)||[]).length,5,'lima kartu keunggulan');

  /* Alur enam langkah bernomor. */
  assert.match(teks,/Cara Mendapatkan Lisensi/);
  for(const [no,judul] of [['01','Isi Data Sekolah'],['02','Kirim Pemesanan'],
    ['03','Developer Memverifikasi'],['04','License Key Diberikan'],
    ['05','Aktivasi e-Rapor'],['06','Siap Digunakan']]){
    assert.ok(teks.includes(`<span class="langkah-no">${no}</span><strong>${judul}</strong>`),
      `langkah ${no} ${judul}`);
  }

  /* Kartu privasi. */
  assert.match(teks,/Data Akademik Tetap Milik Sekolah/);
  assert.match(teks,/Data siswa, nilai, absensi, dan data akademik disimpan secara lokal pada perangkat\s+sekolah dan tidak dikirim ke server lisensi\./);
  for(const poin of ['Data akademik lokal','Aktivasi lisensi resmi','Backup &amp; Restore'])
    assert.ok(teks.includes(`<li>${poin}</li>`),`poin privasi "${poin}"`);

  /* Tidak menjanjikan pembayaran otomatis yang memang belum ada. */
  for(const klaim of ['pembayaran otomatis','bayar sekarang','checkout','kartu kredit','payment gateway'])
    assert.equal(new RegExp(klaim,'i').test(teks),false,`tidak menjanjikan ${klaim}`);

  /* Footer: merek, kontak, dan identitas pengembang. */
  assert.match(teks,/Solusi Digital Pengelolaan Rapor Sekolah/);
  assert.match(teks,/id="tautan-wa"/,'nomor WhatsApp diisi dari konfigurasi, bukan ditulis di markup');
  for(const baris of ['Dirancang &amp; Dikembangkan oleh','FAHMI DJAWAS, S.Pd.',
    'Developer &amp; UI/UX Designer e-Rapor','© 2026 — Semua Hak Dilindungi'])
    assert.ok(teks.includes(baris),`identitas pengembang: ${baris}`);
});

test('19. Tata letak mobile-first, modern, dan tidak meluber ke samping',()=>{
  const gaya=read('public/beli/beli.css');
  assert.match(gaya,/overflow-x:hidden/);
  assert.match(gaya,/\*\{box-sizing:border-box\}/);
  assert.match(gaya,/max-width:1180px/);
  /* Susunan dasar satu kolom; kolom tambahan baru muncul pada layar yang cukup lebar. */
  assert.match(gaya,/\.kartu-grid\{display:grid;grid-template-columns:1fr;/);
  assert.match(gaya,/\.langkah-grid\{display:grid;grid-template-columns:1fr;/);
  assert.match(gaya,/\.grid\{display:grid;grid-template-columns:1fr;/);
  for(const titik of ['560px','760px','1040px'])
    assert.ok(gaya.includes(`@media(min-width:${titik})`),`titik henti ${titik}`);
  /* Sasaran sentuh nyaman. */
  assert.match(gaya,/min-height:54px/,'tombol utama');
  assert.match(gaya,/min-height:52px/,'kolom isian');
  assert.match(gaya,/\.persetujuan input\{[^}]*width:22px;height:22px/,'kotak centang');
  /* Identitas visual: navy, aksen emas, kartu membulat, bayangan lembut. */
  assert.match(gaya,/--navy:#0b1a2f/);
  assert.match(gaya,/--emas:#f2b705/);
  assert.match(gaya,/--radius:20px/);
  assert.match(gaya,/--bayang:0 10px 30px/);
  /* Times New Roman hanya untuk rapor; halaman ini memakai huruf antarmuka modern. Komentar
     dibuang lebih dulu supaya penjelasan yang menyebut larangan tidak dianggap pelanggaran. */
  assert.equal(/Times New Roman/i.test(gaya.replace(/\/\*[\s\S]*?\*\//g,'')),false,
    'landing page tidak memakai Times New Roman');
  assert.match(gaya,/font-family:"Segoe UI",system-ui/);
  /* Animasi ringan dan menghormati preferensi pengguna. */
  assert.match(gaya,/\.reveal\{opacity:0;transform:translateY\(18px\)/);
  assert.match(gaya,/@media\(prefers-reduced-motion:reduce\)/);
});

test('20. Build production menghasilkan /beli lengkap tanpa mengganggu bagian lain',()=>{
  const temp=bangunDiDirektoriSementara();
  try{
    assert.ok(existsSync(join(temp,'dist/beli/index.html')),'dist/beli/index.html wajib ada');
    const sumber=readdirSync(join(rootPath,'public/beli')).sort();
    assert.deepEqual(readdirSync(join(temp,'dist/beli')).sort(),sumber,'seluruh berkas halaman tersalin');
    for(const berkas of sumber)
      assert.equal(readFileSync(join(temp,'dist/beli',berkas),'utf8'),read(`public/beli/${berkas}`),
        `${berkas} tersalin apa adanya`);
    /* Seluruh aset dirujuk dengan alamat absolut dari akar situs, sehingga tersedia baik
       ketika halaman dibuka di /beli maupun /beli/. */
    for(const rujukan of [...halaman().matchAll(/(?:href|src)="([^"]+)"/g)].map(item=>item[1])){
      if(/^(https?:)?\/\/|^data:|^#/.test(rujukan))continue;
      assert.ok(rujukan.startsWith('/'),`aset ${rujukan} wajib memakai alamat absolut`);
      assert.ok(existsSync(join(temp,'dist',rujukan.slice(1))),`aset ${rujukan} tersedia di hasil build`);
    }
    assert.ok(existsSync(join(temp,'dist/src/data/app-identity.js')),'sumber kontak ikut dibangun');
    /* Owner Panel dan aplikasi sekolah tetap utuh. */
    assert.ok(existsSync(join(temp,'dist/owner/index.html')));
    for(const berkas of ['index.html','manifest.webmanifest','sw.js'])
      assert.ok(existsSync(join(temp,'dist',berkas)));
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('21. Halaman publik tidak menggeser kerangka offline aplikasi sekolah',()=>{
  const sw=read('sw.js');
  assert.match(sw,/function isAppNavigation\(url\)/);
  assert.match(sw,/\\\/\(\?:beli\|owner\)/,'navigasi /beli dan /owner dibiarkan lewat');
  assert.match(sw,/if\(!isAppNavigation\(event\.request\.url\)\)return;/);
  assert.match(sw,/caches\.match\(OFFLINE_SHELL\)/,'kerangka offline aplikasi tetap ada');
});

/* ------------------------------------------------- Regresi: aset harus tetap termuat di /beli

   Vercel me-REWRITE /beli ke /beli/index.html tanpa mengubah alamat di bilah peramban. Karena
   itu alamat relatif seperti ./beli.css pada halaman /beli dicari di /beli.css — bukan
   /beli/beli.css — lalu gagal, dan halaman tampil tanpa gaya sekaligus tanpa JavaScript.
   Inilah yang pernah terjadi di produksi. Alamat absolut menutup celah itu. */

/* Meniru cara peramban menyelesaikan alamat aset terhadap alamat halaman. */
function resolusi(alamatHalaman,rujukan){return new URL(rujukan,`https://contoh.id${alamatHalaman}`).pathname;}

test('22. Aset halaman tetap benar dibuka di /beli, /beli/, maupun /beli/index.html',()=>{
  const rujukan=[...halaman().matchAll(/(?:href|src)="([^"]+)"/g)].map(item=>item[1])
    .filter(item=>!/^(https?:)?\/\/|^data:|^#/.test(item));
  assert.ok(rujukan.length>=3,'halaman memuat ikon, CSS, dan JS');
  for(const item of rujukan)
    assert.ok(item.startsWith('/'),`aset ${item} wajib absolut, bukan relatif`);
  /* Alamat yang sama harus dihasilkan dari ketiga cara halaman ini dibuka. */
  for(const item of rujukan){
    const hasil=['/beli','/beli/','/beli/index.html'].map(alamat=>resolusi(alamat,item));
    assert.equal(new Set(hasil).size,1,`aset ${item} menghasilkan alamat berbeda: ${hasil.join(' vs ')}`);
  }
  assert.ok(rujukan.includes('/beli/beli.css'),'stylesheet dirujuk absolut');
  assert.ok(rujukan.includes('/beli/beli.js'),'skrip dirujuk absolut');
});

test('23. Alamat relatif pada halaman /beli memang akan salah, sehingga dilarang',()=>{
  /* Bukti mengapa aturan di atas ada: bentuk relatif menghasilkan alamat berbeda. */
  assert.equal(resolusi('/beli','./beli.css'),'/beli.css');
  assert.equal(resolusi('/beli/','./beli.css'),'/beli/beli.css');
  assert.notEqual(resolusi('/beli','./beli.css'),resolusi('/beli/','./beli.css'));
  /* Sedangkan bentuk absolut selalu sama. */
  assert.equal(resolusi('/beli','/beli/beli.css'),'/beli/beli.css');
  assert.equal(resolusi('/beli/','/beli/beli.css'),'/beli/beli.css');
  /* Modul JavaScript menyelesaikan impornya terhadap alamat MODUL, bukan alamat halaman,
     sehingga impor relatif di beli.js tetap benar pada kedua alamat. */
  const skrip=read('public/beli/beli.js');
  assert.match(skrip,/from '\.\.\/src\/data\/app-identity\.js'/);
  assert.match(skrip,/from '\.\/order-form\.js'/);
  assert.equal(resolusi('/beli/beli.js','../src/data/app-identity.js'),'/src/data/app-identity.js');
  assert.equal(resolusi('/beli/beli.js','./order-form.js'),'/beli/order-form.js');
});

test('24. Berkas hasil build dilayani dengan tipe konten yang benar',()=>{
  /* Tipe konten ditentukan oleh ekstensi berkas; yang perlu dijaga adalah ekstensinya tetap
     .css dan .js sehingga peramban tidak menolak stylesheet maupun modul. */
  const temp=bangunDiDirektoriSementara();
  try{
    for(const [berkas,tipe] of [['beli.css','text/css'],['beli.js','javascript'],['order-form.js','javascript']]){
      assert.ok(existsSync(join(temp,'dist/beli',berkas)),`${berkas} ada di hasil build`);
      assert.ok(/\.(css|js)$/.test(berkas),`${berkas} berekstensi yang dikenali sebagai ${tipe}`);
    }
    const isi=readFileSync(join(temp,'dist/beli/index.html'),'utf8');
    assert.match(isi,/<link rel="stylesheet" href="\/beli\/beli\.css"\/>/);
    assert.match(isi,/<script type="module" src="\/beli\/beli\.js"><\/script>/);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
