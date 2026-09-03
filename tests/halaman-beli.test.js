import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTACT_WHATSAPP, whatsappUrl } from '../src/data/app-identity.js';
import { activeSectionId } from '../public/beli/nav.js';
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
  assert.match(aplikasi,/content="e-Rapor — Solusi Digital Pengelolaan Rapor Sekolah\."/);
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
  assert.match(teks,/PESAN LISENSI e-RAPOR VIA WHATSAPP/);
  for(const label of ['Nama Sekolah','NPSN','Nama Pemesan/Penanggung Jawab','Nomor WhatsApp',
    'Kabupaten/Kota','Provinsi'])
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
  assert.match(teks,/<span class="badge">Solusi untuk Sekolah Modern<\/span>/);
  assert.match(teks,/<h1>Kelola Rapor Sekolah<br\/><span class="emas">Lebih Mudah, Rapi,<br\/>dan Terintegrasi<\/span><\/h1>/);
  assert.match(teks,/e-Rapor membantu sekolah mengelola data siswa, penilaian,\s+kegiatan pembelajaran, rapor, dan leger dalam satu aplikasi yang praktis\./);
  assert.match(teks,/href="#form-pemesanan"[\s\S]{0,400}?Daftarkan Sekolah Anda/,'CTA utama menuju formulir');
  assert.match(teks,/data-wa-developer[\s\S]{0,400}?Hubungi Developer/,'CTA kedua menuju WhatsApp');
  for(const [judul,nota] of [['Aman &amp; Terpercaya','Data tetap milik sekolah'],
    ['Offline-first','Bisa digunakan tanpa internet'],['Mudah Digunakan','Antarmuka sederhana']]){
    assert.ok(teks.includes(`<strong>${judul}</strong><small>${nota}</small>`),`trust item ${judul}`);
  }
  /* Visual hero disusun sendiri, tanpa gambar stok maupun foto orang. Rinciannya diperiksa
     terpisah pada test panggung tiga perangkat di bawah. */
  assert.match(teks,/<div class="panggung">/);
  assert.equal(/<img[^>]+src="[^"]*\.(?:png|jpe?g|webp)"/i.test(teks),false,'tidak memakai gambar stok');

  /* Enam kartu keunggulan sesuai desain final. */
  for(const kelompok of ['Administrasi Sekolah','Penilaian','Kegiatan Pembelajaran',
    'Rapor &amp; Data','Lisensi &amp; Pembaruan','Data Aman di Sekolah'])
    assert.ok(teks.includes(`</span>${kelompok}</h3>`),`kartu "${kelompok}" tampil`);
  assert.equal((teks.match(/class="kartu warna-/g)||[]).length,6,'enam kartu berwarna lembut');
  for(const fitur of ['Identitas sekolah','Akun Admin &amp; Guru','Data siswa','Absensi',
    'Penilaian &amp; nilai akhir','TP semua mata pelajaran','Deskripsi rapor otomatis',
    'Intrakurikuler','Kokurikuler','Ekstrakurikuler','Cetak Rapor','Cetak Leger',
    'Backup &amp; Restore data','Offline-first','Sistem lisensi resmi','Pembaruan aplikasi resmi',
    'Data akademik tersimpan lokal di perangkat sekolah','Data tetap menjadi milik sekolah'])
    assert.ok(teks.includes(`<li>${fitur}</li>`),`fitur "${fitur}" tercantum`);

  /* Alur enam langkah bernomor beserta keterangannya. */
  assert.match(teks,/Cara Mendapatkan Lisensi e-Rapor/);
  assert.match(teks,/Proses mudah dan jelas untuk menggunakan e-Rapor di sekolah Anda\./);
  for(const [no,judul,teksLangkah] of [
    ['01','Isi Data Sekolah','Isi formulir pemesanan dengan data sekolah Anda.'],
    ['02','Kirim Pemesanan','Kirim permintaan melalui WhatsApp ke developer.'],
    ['03','Developer Memverifikasi','Data sekolah akan diverifikasi oleh developer.'],
    ['04','License Key Diberikan','Anda akan menerima License Key resmi.'],
    ['05','Aktivasi e-Rapor','Masukkan License Key pada aplikasi e-Rapor.'],
    ['06','Siap Digunakan','e-Rapor siap digunakan untuk mengelola data dan nilai sekolah Anda.']]){
    assert.ok(teks.includes(`<span class="langkah-no">${no}</span>`),`langkah ${no}`);
    assert.ok(teks.includes(`<strong>${judul}</strong>`),`judul langkah ${judul}`);
    assert.ok(teks.includes(teksLangkah),`keterangan langkah ${no}`);
  }

  /* Kartu privasi. */
  assert.match(teks,/Data Akademik Tetap Milik Sekolah/);
  assert.match(teks,/Data siswa, nilai, absensi, dan data akademik disimpan secara lokal pada perangkat sekolah\s+dan tidak dikirim ke server lisensi\./);
  for(const [poin,nota] of [['Data akademik lokal','Tersimpan di perangkat sekolah'],
    ['Lisensi resmi','Aman dan terpercaya'],['Backup &amp; Restore','Mudah dan aman']])
    assert.ok(teks.includes(`<strong>${poin}</strong><small>${nota}</small>`),`poin privasi "${poin}"`);

  /* Tidak menjanjikan pembayaran otomatis yang memang belum ada. */
  for(const klaim of ['pembayaran otomatis','bayar sekarang','checkout','kartu kredit','payment gateway'])
    assert.equal(new RegExp(klaim,'i').test(teks),false,`tidak menjanjikan ${klaim}`);
});

test('19. Tata letak mobile-first, modern, dan tidak meluber ke samping',()=>{
  const gaya=read('public/beli/beli.css');
  assert.match(gaya,/overflow-x:hidden/);
  assert.match(gaya,/\*\{box-sizing:border-box\}/);
  assert.match(gaya,/max-width:1200px/);
  /* Susunan dasar satu kolom; kolom tambahan baru muncul pada layar yang cukup lebar. */
  assert.match(gaya,/\.kartu-grid\{display:grid;grid-template-columns:1fr;/);
  assert.match(gaya,/\.langkah-baris\{display:grid;grid-template-columns:1fr;/);
  assert.match(gaya,/\.grid\{display:grid;grid-template-columns:1fr;/);
  for(const titik of ['560px','900px','1060px'])
    assert.ok(gaya.includes(`@media(min-width:${titik})`),`titik henti ${titik}`);
  /* Sasaran sentuh nyaman. */
  assert.match(gaya,/\.btn\{[^}]*min-height:52px/,'tombol utama');
  assert.match(gaya,/min-height:50px/,'kolom isian');
  assert.match(gaya,/\.persetujuan input\{[^}]*width:22px;height:22px/,'kotak centang');
  /* Identitas visual: navy, aksen emas, kartu membulat, bayangan lembut. */
  assert.match(gaya,/--navy:#0b1a2f/);
  assert.match(gaya,/--emas:#f5b301/);
  assert.match(gaya,/--radius:18px/);
  assert.match(gaya,/--bayang:0 8px 26px/);
  /* Times New Roman hanya untuk rapor; halaman ini memakai huruf antarmuka modern. Komentar
     dibuang lebih dulu supaya penjelasan yang menyebut larangan tidak dianggap pelanggaran. */
  assert.equal(/Times New Roman/i.test(gaya.replace(/\/\*[\s\S]*?\*\//g,'')),false,
    'landing page tidak memakai Times New Roman');
  assert.match(gaya,/font-family:"Segoe UI",system-ui/);
  /* Animasi ringan dan menghormati preferensi pengguna. */
  assert.match(gaya,/\.reveal\{opacity:0;transform:translateY\(16px\)/);
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

/* ------------------------------------------------------------------- Navigasi halaman */

test('25. Navbar memuat lambang aplikasi, empat menu, dan tombol Hubungi Developer',()=>{
  const teks=halaman();
  assert.match(teks,/<img class="nav-logo" src="\/assets\/app-icon\.svg"/,'lambang bawaan e-Rapor, bukan logo sekolah tertentu');
  assert.match(teks,/<span><strong>e-Rapor<\/strong><small>Solusi Digital Pengelolaan Rapor Sekolah<\/small><\/span>/);
  for(const [label,tujuan] of [['Beranda','beranda'],['Keunggulan','keunggulan'],
    ['Cara Pemesanan','cara-pemesanan'],['Tutorial','tutorial']]){
    assert.ok(teks.includes(`<a class="nav-tautan" href="#${tujuan}" data-nav="${tujuan}">${label}</a>`),
      `menu ${label} menuju #${tujuan}`);
    assert.ok(new RegExp(`id="${tujuan}"`).test(teks),`bagian #${tujuan} ada di halaman`);
  }
  assert.match(teks,/id="tautan-developer"[\s\S]{0,400}?Hubungi Developer/);
  assert.match(teks,/id="nav-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="nav-menu"/,'tombol menu ponsel');
});

test('26. Aturan menu aktif menentukan bagian yang sedang dibaca',()=>{
  const garis=74+Math.round(813*0.25);
  const bagian=(tops)=>['beranda','keunggulan','cara-pemesanan','tutorial']
    .map((id,i)=>({id,top:tops[i]}));
  assert.equal(activeSectionId(bagian([76,739,2056,2542]),{line:garis}),'beranda','di hero');
  assert.equal(activeSectionId(bagian([-563,100,1417,1903]),{line:garis}),'keunggulan');
  assert.equal(activeSectionId(bagian([-1880,-1217,100,586]),{line:garis}),'cara-pemesanan');
  assert.equal(activeSectionId(bagian([-2366,-1703,-386,100]),{line:garis}),'tutorial');
  /* Di dasar halaman bagian terakhir selalu aktif, meski batas atasnya belum terlewati. */
  assert.equal(activeSectionId(bagian([76,739,2056,2542]),{line:garis,atBottom:true}),'tutorial');
  /* Bagian yang jauh lebih tinggi daripada layar tetap terhitung benar. */
  assert.equal(activeSectionId([{id:'tutorial',top:-1800}],{line:garis}),'tutorial');
  assert.equal(activeSectionId([],{line:garis}),'','tanpa bagian tidak memaksakan apa pun');
});

test('27. Menu bekerja tanpa memuat ulang halaman dan menutup sendiri di ponsel',()=>{
  const skrip=read('public/beli/beli.js');
  /* Seluruh tautan menu hanyalah jangkar dalam halaman yang sama. */
  const tujuan=[...halaman().matchAll(/class="nav-tautan" href="([^"]+)"/g)].map(item=>item[1]);
  assert.deepEqual(tujuan,['#beranda','#keunggulan','#cara-pemesanan','#tutorial']);
  for(const jejak of ['location.href','location.assign','location.reload','window.location='])
    assert.equal(skrip.includes(jejak),false,`navigasi tidak memuat ulang halaman (${jejak})`);
  assert.match(skrip,/menu\?\.classList\.remove\('buka'\)/,'menu dapat ditutup');
  assert.match(skrip,/menu\?\.classList\.add\('buka'\)/,'menu dapat dibuka');
  assert.match(skrip,/for\(const tautan of menu\?\.querySelectorAll\('a'\)\|\|\[\]\)tautan\.addEventListener\('click',\(\)=>tutupMenu\(\)\)/,
    'menu menutup sendiri setelah satu menu dipilih');
  assert.match(skrip,/addEventListener\?\.\('scroll',hitungAktif,\{passive:true\}\)/,'menu aktif mengikuti gulir');
  assert.match(skrip,/new IntersectionObserver\(\(\)=>hitungAktif\(\)/,'pengamat ringan ikut memicu perhitungan');
  const gaya=read('public/beli/beli.css');
  assert.match(gaya,/scroll-behavior:smooth/,'gulir halus');
  assert.match(gaya,/scroll-padding-top:calc\(var\(--tinggi-nav\) \+ 12px\)/,'judul bagian tidak tertutup navbar');
  assert.match(gaya,/\.nav-tautan\.aktif\{color:var\(--emas-terang\);border-bottom-color:var\(--emas-terang\)\}/,
    'menu aktif emas dengan garis bawah');
  /* Hamburger hanya pada layar sempit; menu mendatar pada layar lebar. */
  assert.match(gaya,/@media\(min-width:1060px\)\{\s*\.nav-toggle\{display:none\}/);
});

/* ---------------------------------------------------------------------------- Tutorial */

test('28. Tutorial memuat tiga belas panduan dengan isi yang benar',()=>{
  const teks=halaman();
  assert.match(teks,/Panduan Tutorial Penggunaan e-Rapor/);
  assert.match(teks,/Panduan lengkap dari pembelian lisensi hingga mengelola nilai di aplikasi\./);
  const judul=[...teks.matchAll(/<span class="tutorial-no">(\d+)<\/span><h3>([^<]+)<\/h3>/g)]
    .map(item=>[item[1],item[2]]);
  assert.deepEqual(judul,[['1','Pemesanan Lisensi'],['2','Terima License Key'],['3','Aktivasi di Aplikasi'],
    ['4','Setup Awal Sekolah'],['5','Siapkan Admin &amp; Guru'],['6','Kelola Data Siswa'],
    ['7','Kelola Absensi'],['8','Mengelola Nilai'],['9','Pilih Tujuan Pembelajaran'],
    ['10','Intrakurikuler'],['11','Kegiatan Sekolah'],['12','Cetak Rapor &amp; Leger'],
    ['13','Backup Data']]);

  /* Contoh License Key hanya tersamar. */
  assert.ok(teks.includes('ERAPOR-XXXX-XXXX-XXXX'));
  assert.equal(/ERAPOR-(?!XXXX)[A-Z0-9]{4}-/.test(teks),false,'tidak ada License Key nyata');

  /* Aktivasi pertama butuh internet, seterusnya offline-first. */
  assert.match(teks,/Pastikan perangkat terhubung internet saat aktivasi pertama\./);
  assert.match(teks,/penggunaan sehari-hari tetap offline-first/);

  /* Setup awal: identitas dinamis, logo opsional dengan cadangan lambang netral. */
  assert.match(teks,/Logo sekolah bersifat opsional/);
  assert.match(teks,/lambang\s+bawaan e-Rapor yang netral/);
  assert.match(teks,/Nama sekolah juga dinamis/);
  assert.equal(/SDN Satria Jaya 01/.test(teks),false,'tidak menanamkan identitas sekolah tertentu');

  /* Komponen penilaian yang disebut memang komponen yang ada. */
  for(const komponen of ['Formatif','Harian','Praktik','Sumatif Lingkup Materi','Sumatif Akhir'])
    assert.ok(teks.includes(komponen),`komponen ${komponen}`);
  /* TP adalah acuan, bukan nilai per TP. */
  assert.match(teks,/TP tidak memiliki nilai sendiri-sendiri/);
  assert.match(teks,/SATU penilaian yang sudah ada/);
  /* Intrakurikuler: alur dan tiga predikat. */
  assert.match(teks,/pilih Mata Pelajaran, tandai TP, tentukan Predikat, lalu\s+deskripsi tersusun otomatis/);
  assert.match(teks,/Cukup, Baik, dan Sangat Baik/);
  assert.match(teks,/tidak membuat skor per TP/);
  /* Backup tidak membawa rahasia perangkat. */
  assert.match(teks,/tidak pernah memuat License Key, activation token,\s+maupun Installation ID/);
});

/* ------------------------------------------------------------------------------ Footer */

test('29. Footer memuat lambang, kontak WhatsApp, dan identitas pengembang',()=>{
  const teks=halaman();
  const kaki=teks.slice(teks.indexOf('<footer class="kaki">'));
  assert.match(kaki,/<img src="\/assets\/app-icon\.svg" alt="Lambang e-Rapor"/,'lambang e-Rapor di footer');
  assert.match(kaki,/<strong>e-Rapor<\/strong><span>Solusi Digital Pengelolaan Rapor Sekolah<\/span>/);
  assert.match(kaki,/class="kaki-wa-ikon"[\s\S]{0,200}?<use href="#ikon-wa"\/>/,'lambang WhatsApp di footer');
  assert.match(kaki,/<span class="kaki-label">WHATSAPP<\/span>/);
  assert.match(kaki,/id="tautan-wa" data-wa-developer/,'nomor diisi dari konfigurasi dan dapat diklik');
  assert.match(kaki,/Siap membantu Anda setiap hari/);
  for(const baris of ['Dirancang &amp; Dikembangkan oleh','FAHMI DJAWAS, S.Pd.',
    'Developer &amp; UI/UX Designer e-Rapor','© 2026 — Semua Hak Dilindungi'])
    assert.ok(kaki.includes(baris),`identitas pengembang: ${baris}`);
  assert.equal(/href="[^"]*owner/i.test(kaki),false,'tidak ada tautan Owner Panel');
});

test('30. Hak cipta menempel pada blok identitas pengembang, bukan baris footer terpisah',()=>{
  const teks=halaman();
  const blok=teks.slice(teks.indexOf('<div class="kaki-kredit">'),teks.indexOf('</footer>'));
  const penutup=blok.indexOf('</div>');
  const isiBlok=blok.slice(0,penutup);
  assert.ok(isiBlok.includes('Developer &amp; UI/UX Designer e-Rapor'),'peran ada di dalam blok');
  assert.ok(isiBlok.includes('© 2026 — Semua Hak Dilindungi'),'hak cipta ada di dalam blok yang sama');
  assert.ok(isiBlok.indexOf('Developer &amp; UI/UX Designer')<isiBlok.indexOf('© 2026'),
    'hak cipta berada di bawah baris peran');
  /* Tidak ada baris hak cipta lain di luar blok itu. */
  assert.equal((teks.match(/© 2026 — Semua Hak Dilindungi/g)||[]).length,1);
  /* Jaraknya rapat: 6–10px, bukan puluhan piksel. */
  const gaya=read('public/beli/beli.css');
  const aturan=gaya.match(/\.kaki-hak\{([^}]*)\}/)[1];
  const margin=Number(aturan.match(/margin-top:(\d+)px/)[1]);
  assert.ok(margin>=6&&margin<=10,`jarak hak cipta ${margin}px berada pada 6–10px`);
  assert.equal(/\.kaki>\.kaki-hak/.test(gaya),false,'bukan baris footer tersendiri');
});

/* --------------------------------------------------------- Panggung tiga perangkat hero */

test('31. Hero memuat laptop, tablet, dan ponsel Android sekaligus',()=>{
  const teks=halaman();
  const panggung=teks.slice(teks.indexOf('<div class="panggung">'),teks.indexOf('panggung-slogan'));
  for(const [kelas,nama] of [['alat laptop','laptop'],['alat tablet','tablet'],['alat hp','ponsel']])
    assert.ok(panggung.includes(`class="${kelas}"`),`${nama} ada di panggung`);
  /* Bingkainya dibangun dari elemen sendiri, bukan satu gambar perangkat. */
  for(const bagian of ['laptop-tutup','laptop-layar','laptop-alas','laptop-takik',
    'tablet-layar','tablet-kamera','hp-speaker','hp-layar'])
    assert.ok(panggung.includes(bagian),`bingkai ${bagian}`);
  /* Tidak ada tangkapan layar: satu-satunya gambar adalah lambang aplikasi. */
  const gambar=[...panggung.matchAll(/<img[^>]+src="([^"]+)"/g)].map(item=>item[1]);
  assert.ok(gambar.length>0);
  assert.ok(gambar.every(item=>item==='/assets/app-icon.svg'),'hanya lambang e-Rapor');
  /* Tidak ada bagian yang dapat diklik atau diisi di dalam panggung. */
  assert.equal(/<(?:a|button|input|select|textarea)\b/.test(panggung),false,'panggung tidak interaktif');
  assert.match(teks,/<div class="hero-visual reveal" aria-hidden="true">/,'panggung disembunyikan dari pembaca layar');
});

test('32. Isi ketiga layar berbeda sesuai fungsinya',()=>{
  const teks=halaman();
  const potong=(awal,akhir)=>teks.slice(teks.indexOf(awal),teks.indexOf(akhir));
  const laptop=potong('<div class="alat laptop">','<div class="alat tablet">');
  const tablet=potong('<div class="alat tablet">','<div class="alat hp">');
  const hp=potong('<div class="alat hp">','panggung-slogan');

  /* Laptop: dasbor lengkap dengan sidebar, sambutan, kartu ringkas, dua grafik, dan kegiatan. */
  for(const menu of ['Dashboard','Data Siswa','Guru','Kelas/Rombel','Mata Pelajaran','Penilaian',
    'Absensi','Rapor','Leger','Kegiatan','Pengaturan'])
    assert.ok(laptop.includes(`>${menu}</i>`),`menu dasbor ${menu}`);
  assert.match(laptop,/Selamat Datang,/);
  assert.match(laptop,/SDN Maju Jaya 01/);
  for(const kartu of ['Siswa','Guru','Kelas','Mata Pelajaran'])
    assert.ok(laptop.includes(`<small>${kartu}</small>`),`kartu ringkas ${kartu}`);
  assert.match(laptop,/Rekap Nilai Kelas/);
  assert.match(laptop,/Kehadiran Siswa/);
  assert.match(laptop,/Kegiatan &amp; Pengumuman/);
  assert.ok((laptop.match(/<i style="height:/g)||[]).length>=6,'grafik batang terisi');

  /* Tablet: halaman masuk. */
  assert.match(tablet,/Masuk ke e-Rapor/);
  assert.match(tablet,/<em>Username<\/em>/);
  assert.match(tablet,/<em>Password<\/em>/);
  assert.match(tablet,/Ingat saya/);
  assert.match(tablet,/class="tombol-utama">Masuk</);
  assert.equal(/Dashboard|Rekap Nilai/.test(tablet),false,'tablet bukan salinan dasbor');

  /* Ponsel: menu mobile, bukan salinan halaman masuk tablet. */
  for(const menu of ['Data Siswa','Absensi','Penilaian','Rapor','Kegiatan','Pengaturan'])
    assert.ok(hp.includes(`</i>${menu}</span>`),`menu ponsel ${menu}`);
  assert.match(hp,/class="hp-bawah"/,'ada navigasi bawah');
  assert.match(hp,/Ringkasan Kelas/);
  assert.equal(/Masuk ke e-Rapor|Ingat saya/.test(hp),false,'ponsel tidak menampilkan halaman masuk');
});

test('33. Komposisi perangkat berlapis dan mengecil serempak pada layar sempit',()=>{
  const gaya=read('public/beli/beli.css');
  /* Urutan lapisan: laptop di belakang, tablet lalu ponsel di depannya. */
  const z=nama=>Number(gaya.match(new RegExp(`\\.${nama}\\{[^}]*z-index:(\\d+)`))[1]);
  assert.ok(z('laptop')<z('tablet'),'tablet berada di depan laptop');
  assert.ok(z('tablet')<z('hp'),'ponsel paling depan');
  /* Tablet di kiri, ponsel di kanan. */
  assert.match(gaya,/\.tablet\{left:-?\d+%/,'tablet ditempatkan dari sisi kiri');
  assert.match(gaya,/\.hp\{right:-?\d+%/,'ponsel ditempatkan dari sisi kanan');
  /* Keduanya dimiringkan sedikit dan punya bayangan nyata. */
  assert.match(gaya,/\.tablet\{[^}]*transform:rotate\(-6deg\)/);
  assert.match(gaya,/\.hp\{[^}]*transform:rotate\(5deg\)/);
  assert.match(gaya,/\.laptop\{[^}]*transform:rotateX\(\d+deg\)/,'laptop diberi perspektif');
  assert.match(gaya,/\.panggung\{[^}]*perspective:\d+px/);
  /* Ukuran seluruh panggung mengikuti satu nilai font, sehingga mengecil serempak. */
  assert.match(gaya,/\.panggung\{[^}]*font-size:clamp\(/);
  for(const alat of ['tablet','hp'])
    assert.match(gaya,new RegExp(`\\.${alat}\\{[^}]*width:[\\d.]+em`),`${alat} berukuran em`);
  /* Tablet jelas lebih besar daripada ponsel. */
  const lebar=nama=>Number(gaya.match(new RegExp(`\\.${nama}\\{[^}]*width:([\\d.]+)em`))[1]);
  assert.ok(lebar('tablet')>lebar('hp'),'proporsi tablet berbeda dari ponsel');
});

test('34. Isi halaman tetap tampil walau pengamat kemunculan tidak melapor',()=>{
  const skrip=read('public/beli/beli.js');
  assert.match(skrip,/setTimeout\(tampilkanSemua,1200\)/,'ada jaring pengaman tanpa syarat');
  assert.match(skrip,/addEventListener\?\.\('load',tampilkanSemua\)/);
  assert.match(skrip,/else for\(const bagian of bagianMuncul\)bagian\.classList\.add\('tampil'\)/,
    'peramban tanpa IntersectionObserver langsung menampilkan isinya');
});
