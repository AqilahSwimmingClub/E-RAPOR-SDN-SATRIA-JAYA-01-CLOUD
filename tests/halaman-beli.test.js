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
  assert.match(teks,/Form Pemesanan Lisensi e-Rapor/i);
  for(const nama of REQUIRED_FIELDS)
    assert.match(teks,new RegExp(`id="${nama}"[^>]*required`),`field ${nama} wajib`);
  assert.match(teks,/id="email"/);
  assert.equal(/id="email"[^>]*required/.test(teks),false,'email tetap opsional');
  assert.match(teks,/Saya memastikan data sekolah yang saya isi sudah benar\./);
  assert.match(teks,/id="konfirmasi" name="konfirmasi" type="checkbox"/);
  assert.match(teks,/id="tombol-pesan" type="submit" disabled/,'tombol mati sebelum data sah');
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
  assert.match(skrip,/import \{ CONTACT_WHATSAPP, whatsappUrl \} from '\.\.\/src\/data\/app-identity\.js';/);
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
  assert.match(teks,/Pesan WhatsApp \(dapat Anda periksa dan ubah sebelum dikirim\)/);
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
  assert.match(teks,/Solusi Digital Pengelolaan Rapor Sekolah/);
  assert.match(teks,/DAFTARKAN SEKOLAH ANDA/);
  assert.match(teks,/Kelola administrasi dan penilaian sekolah dengan lebih praktis melalui e-Rapor\./);
  for(const fitur of ['Identitas sekolah dapat disesuaikan','Pengelolaan akun Admin &amp; Guru',
    'Data siswa dan administrasi kelas','Absensi','Penilaian dan Nilai Akhir','TP semua mata pelajaran',
    'Deskripsi rapor otomatis','Intrakurikuler','Kokurikuler','Ekstrakurikuler','Cetak Rapor',
    'Cetak Leger','Backup &amp; Restore data','Offline-first','Sistem lisensi resmi',
    'Sistem pembaruan aplikasi resmi','Data akademik tersimpan lokal di perangkat sekolah'])
    assert.ok(teks.includes(`<li>${fitur}</li>`),`keunggulan "${fitur}" tercantum`);
  assert.match(teks,/Cara Mendapatkan Lisensi/);
  for(const langkah of ['Isi Data Sekolah','Kirim Pemesanan melalui WhatsApp',
    'Developer Memverifikasi Pesanan','License Key Resmi Diberikan',
    'Aktivasi e-Rapor pada Perangkat Sekolah','e-Rapor Siap Digunakan'])
    assert.ok(teks.includes(langkah),`langkah "${langkah}" tercantum`);
  /* Tidak menjanjikan pembayaran otomatis yang memang belum ada. */
  for(const klaim of ['pembayaran otomatis','bayar sekarang','checkout','kartu kredit','payment gateway'])
    assert.equal(new RegExp(klaim,'i').test(teks),false,`tidak menjanjikan ${klaim}`);
  for(const baris of ['Dirancang &amp; Dikembangkan oleh','FAHMI DJAWAS, S.Pd.',
    'Developer &amp; UI/UX Designer e-Rapor','© 2026 — Semua Hak Dilindungi'])
    assert.ok(teks.includes(baris),`identitas pengembang: ${baris}`);
});

test('19. Tata letak mobile-first dan tidak meluber ke samping',()=>{
  const gaya=read('public/beli/beli.css');
  assert.match(gaya,/overflow-x:hidden/);
  assert.match(gaya,/\*\{box-sizing:border-box\}/);
  assert.match(gaya,/max-width:960px/);
  assert.match(gaya,/@media\(min-width:600px\)/,'kolom baru muncul pada layar lebih lebar');
  assert.match(gaya,/@media\(min-width:900px\)/);
  assert.match(gaya,/min-height:52px/,'tombol utama nyaman disentuh');
  assert.match(gaya,/min-height:50px/,'kolom isian nyaman disentuh');
  /* Susunan dasar satu kolom: layar sempit tidak pernah butuh geser mendatar. */
  assert.match(gaya,/\.grid\{display:grid;grid-template-columns:1fr/);
  assert.match(gaya,/\.fitur\{display:grid;grid-template-columns:1fr/);
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
    /* Aset yang dirujuk halaman tersedia pada hasil build. */
    for(const rujukan of [...halaman().matchAll(/(?:href|src)="([^"]+)"/g)].map(item=>item[1])){
      if(/^(https?:)?\/\/|^data:|^#/.test(rujukan))continue;
      const jalur=rujukan.startsWith('../')?join(temp,'dist',rujukan.slice(3)):join(temp,'dist/beli',rujukan.replace(/^\.\//,''));
      assert.ok(existsSync(jalur),`aset ${rujukan} tersedia di hasil build`);
    }
    assert.ok(existsSync(join(temp,'dist/beli/../src/data/app-identity.js')),'sumber kontak ikut dibangun');
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
