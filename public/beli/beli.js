import { CONTACT_WHATSAPP, CONTACT_WHATSAPP_DISPLAY, SUPPORT_URL, whatsappUrl } from '../src/data/app-identity.js';
import { LICENSE_SCOPE, PAYMENT_AMOUNT_NOTE, PAYMENT_METHODS, PAYMENT_STEPS } from '../src/data/payment-config.js';
import { activeSectionId } from './nav.js';
import { buildOrderMessage, buildOrderPayload, newClientRef, REQUIRED_FIELDS, validateOrder } from './order-form.js';
import { fetchDownloads, orderErrorMessage, submitOrder } from './order-api.js';
import { downloadMeta, downloadRows } from './unduhan.js';

/* Perekat halaman publik pemesanan.

   Halaman ini tidak mengenal apa pun dari aplikasi sekolah: tidak ada login, tidak ada database
   sekolah, dan tidak ada Owner API. Dua permintaan jaringan yang dilakukannya keduanya publik
   dan tanpa credential: MENYIMPAN PESANAN, dan membaca katalog unduhan resmi.

   URUTANNYA PENTING. Pesanan disimpan ke server LEBIH DULU dan mendapat Order ID; WhatsApp baru
   dibuka sesudahnya, membawa Order ID itu. WhatsApp bukan tempat penyimpanan pesanan - bila
   pesannya tidak pernah terkirim, pesanannya tetap ada di server.

   Nomor WhatsApp tidak ditulis di berkas ini. Ia diambil dari src/data/app-identity.js, sumber
   kontak resmi yang sama dengan yang dipakai halaman Tentang & Pembaruan.

   Alamat impor di atas relatif terhadap URL modul ini (/beli/beli.js), bukan terhadap alamat
   halaman, sehingga tetap benar baik ketika dibuka di /beli maupun /beli/. */

/* --------------------------------------------------------------------- Kontak resmi */

/* Seluruh tautan WhatsApp disusun dari konfigurasi, tidak satu pun ditulis di markup. */
for(const tautan of document.querySelectorAll('[data-wa-developer],#tautan-developer'))
  tautan.href=SUPPORT_URL;
const tautanWa=document.querySelector('#tautan-wa');
if(tautanWa)tautanWa.textContent=CONTACT_WHATSAPP_DISPLAY;

/* ------------------------------------------------------------------- Navigasi halaman */

const navbar=document.querySelector('#navbar');
const tombolMenu=document.querySelector('#nav-toggle');
const menu=document.querySelector('#nav-menu');
const tautanNav=[...document.querySelectorAll('.nav-tautan')];

function tutupMenu(){
  menu?.classList.remove('buka');
  tombolMenu?.setAttribute('aria-expanded','false');
  tombolMenu?.setAttribute('aria-label','Buka menu navigasi');
}
function bukaMenu(){
  menu?.classList.add('buka');
  tombolMenu?.setAttribute('aria-expanded','true');
  tombolMenu?.setAttribute('aria-label','Tutup menu navigasi');
}
tombolMenu?.addEventListener('click',()=>{
  if(tombolMenu.getAttribute('aria-expanded')==='true')tutupMenu();
  else bukaMenu();
});
/* Menu ponsel menutup sendiri begitu satu bagian dipilih, termasuk tombol Hubungi Developer. */
for(const tautan of menu?.querySelectorAll('a')||[])tautan.addEventListener('click',()=>tutupMenu());
/* Menu juga menutup saat layar melebar menjadi tampilan desktop, supaya tidak tertinggal terbuka. */
globalThis.matchMedia?.('(min-width:1060px)')?.addEventListener?.('change',peristiwa=>{
  if(peristiwa.matches)tutupMenu();
});

/* Menu yang sedang aktif mengikuti bagian yang sedang dibaca. Pergeserannya halus dan tidak
   pernah memuat ulang halaman: seluruh tautan hanyalah jangkar dalam halaman yang sama.

   Bagian aktif dihitung langsung dari posisi tiap bagian terhadap garis baca di bawah navbar,
   yaitu bagian TERAKHIR yang batas atasnya sudah terlewati. Cara ini pasti: hasilnya sama
   berapa pun tinggi bagiannya, termasuk bagian Tutorial yang jauh lebih tinggi daripada layar.
   IntersectionObserver dipakai sebagai pemicu yang murah, dan peristiwa scroll menjadi
   jaring pengaman bila pengamat belum sempat mengirim laporannya. */
function tandaiAktif(id){
  for(const tautan of tautanNav)tautan.classList.toggle('aktif',tautan.dataset.nav===id);
}
const bagianNav=tautanNav
  .map(tautan=>document.querySelector(`#${tautan.dataset.nav}`))
  .filter(Boolean);

function hitungAktif(){
  if(!bagianNav.length)return;
  const posisi=bagianNav.map(bagian=>({id:bagian.id,top:bagian.getBoundingClientRect().top}));
  const dasar=globalThis.innerHeight+globalThis.scrollY>=document.documentElement.scrollHeight-2;
  /* Garis baca diletakkan seperempat layar di bawah navbar, bukan tepat di bawahnya, supaya
     bagian yang baru saja dituju langsung terhitung aktif dan perpindahannya tidak terasa
     terlambat sewaktu menggulir perlahan. */
  const garis=(navbar?.offsetHeight||0)+Math.round((globalThis.innerHeight||0)*0.25);
  tandaiAktif(activeSectionId(posisi,{line:garis,atBottom:dasar}));
}

if(bagianNav.length){
  hitungAktif();
  /* Perhitungannya hanya membaca posisi empat bagian, jadi cukup murah untuk dijalankan
     langsung pada tiap peristiwa gulir tanpa penjadwalan tambahan yang bisa tidak terpanggil. */
  globalThis.addEventListener?.('scroll',hitungAktif,{passive:true});
  globalThis.addEventListener?.('resize',hitungAktif);
  if(typeof IntersectionObserver==='function'){
    const pengamatNav=new IntersectionObserver(()=>hitungAktif(),
      {rootMargin:'-80px 0px -40% 0px',threshold:[0,.25,.6,1]});
    for(const bagian of bagianNav)pengamatNav.observe(bagian);
  }
}

/* Munculnya bagian halaman dibuat halus dan sekali jalan. Bila peramban tidak mendukung
   IntersectionObserver, seluruh bagian langsung ditampilkan apa adanya. */
const bagianMuncul=[...document.querySelectorAll('.reveal')];
if(typeof IntersectionObserver==='function'){
  const pengamat=new IntersectionObserver(entri=>{
    for(const item of entri){
      if(!item.isIntersecting)continue;
      item.target.classList.add('tampil');
      pengamat.unobserve(item.target);
    }
  },{rootMargin:'0px 0px -8% 0px',threshold:.06});
  for(const bagian of bagianMuncul)pengamat.observe(bagian);
  /* Jaring pengaman: begitu halaman selesai dimuat, apa pun yang belum sempat dilaporkan
     pengamat tetap ditampilkan. Isi halaman tidak boleh tertinggal tak terlihat hanya karena
     laporan pengamat terlambat atau tidak pernah datang. */
  const tampilkanSemua=()=>{for(const bagian of bagianMuncul)bagian.classList.add('tampil');};
  /* Pengatur waktu biasa, tanpa syarat apa pun: bahkan bila peristiwa load tidak pernah tiba
     karena satu aset menggantung, isi halaman tetap muncul. */
  setTimeout(tampilkanSemua,1200);
  globalThis.addEventListener?.('load',tampilkanSemua);
}else for(const bagian of bagianMuncul)bagian.classList.add('tampil');

/* Tinggi navbar dipakai sebagai jarak henti gulir, supaya judul bagian tidak tertutup navbar. */
function selaraskanTinggiNav(){
  if(!navbar)return;
  document.documentElement.style.setProperty('--tinggi-nav',`${Math.round(navbar.offsetHeight)}px`);
}
selaraskanTinggiNav();
globalThis.addEventListener?.('resize',selaraskanTinggiNav);

/* ------------------------------------------------------------------------- Formulir */

const form=document.querySelector('#form-pesan');
const kotakPesan=document.querySelector('#pesan');
const tombol=document.querySelector('#tombol-pesan');
const catatan=document.querySelector('#catatan-tombol');
const persetujuan=document.querySelector('#konfirmasi');

const KOLOM=[...REQUIRED_FIELDS,'email'];
const kolom=nama=>form.elements[nama];

const pilihanBayar=document.querySelector('#pilihan-bayar');
const hasilPesanan=document.querySelector('#hasil-pesanan');

/* Pilihan metode pembayaran digambar dari payment-config.js, bukan ditulis di markup, sehingga
   tidak mungkin ada pilihan di halaman yang tidak dikenal server. */
function gambarPilihanBayar(){
  if(!pilihanBayar)return;
  const daftar=[{id:'belum-dipilih',label:'Belum menentukan'},
    ...PAYMENT_METHODS.map(item=>({id:item.id,label:item.label}))];
  pilihanBayar.innerHTML=daftar.map((item,urutan)=>`
    <label class="pilih-bayar-opsi${urutan===0?' terpilih':''}">
      <input type="radio" name="paymentMethod" value="${item.id}"${urutan===0?' checked':''}/>
      <span>${item.label}</span>
    </label>`).join('');
  pilihanBayar.addEventListener('change',()=>{
    for(const opsi of pilihanBayar.querySelectorAll('.pilih-bayar-opsi'))
      opsi.classList.toggle('terpilih',Boolean(opsi.querySelector('input')?.checked));
    segarkan();
  });
}
gambarPilihanBayar();

function metodeTerpilih(){
  return pilihanBayar?.querySelector('input[name="paymentMethod"]:checked')?.value||'belum-dipilih';
}

function bacaForm(){
  const isi={konfirmasi:persetujuan.checked,paymentMethod:metodeTerpilih()};
  for(const nama of KOLOM)isi[nama]=kolom(nama)?.value??'';
  return isi;
}

/* Pesan pratinjau selalu mengikuti isian, kecuali pengguna sudah menyuntingnya sendiri.
   Suntingan pengguna tidak pernah ditimpa. */
let disuntingPengguna=false;
kotakPesan.addEventListener('input',()=>{disuntingPengguna=true;});

/* Order ID hasil penyimpanan terakhir. Kosong berarti pesanannya BELUM tersimpan, dan selama
   kosong tidak ada satu pun nomor yang ditampilkan maupun dikirim ke WhatsApp. */
let orderCodeTersimpan='';
/* Satu penanda untuk satu isian formulir. Ia hanya diperbarui setelah pesanan benar-benar
   tersimpan, sehingga menekan tombol dua kali pada isian yang sama mengembalikan pesanan yang
   sama, bukan pesanan kedua. */
let clientRef=newClientRef();

function tampilkanGalat(errors){
  for(const nama of [...KOLOM,'konfirmasi']){
    const kotak=form.querySelector(`[data-galat="${nama}"]`);
    const kendali=nama==='konfirmasi'?persetujuan:kolom(nama);
    const pesan=errors[nama]||'';
    if(kotak){kotak.textContent=pesan;kotak.hidden=!pesan;}
    if(kendali&&kendali.setAttribute){
      if(pesan)kendali.setAttribute('aria-invalid','true');
      else kendali.removeAttribute('aria-invalid');
    }
  }
}

function segarkan({tampilkan=false}={}){
  const isi=bacaForm();
  const {valid,errors}=validateOrder(isi);
  if(!disuntingPengguna)kotakPesan.value=buildOrderMessage(isi,{orderCode:orderCodeTersimpan});
  tombol.disabled=!valid;
  catatan.textContent=valid
    ? 'Data sudah lengkap. Tombol di atas menyimpan pesanan Anda ke server lebih dulu, lalu membuka WhatsApp.'
    : 'Centang pernyataan di atas dan lengkapi data wajib untuk mengaktifkan tombol.';
  if(tampilkan)tampilkanGalat(errors);
  else tampilkanGalat({});
  return {valid,errors};
}

for(const nama of KOLOM)kolom(nama)?.addEventListener('input',()=>segarkan());
for(const nama of KOLOM)kolom(nama)?.addEventListener('blur',()=>segarkan({tampilkan:true}));
persetujuan.addEventListener('change',()=>segarkan());

/* Hanya angka yang masuk ke NPSN, supaya kesalahan ketik ketahuan sejak awal. */
kolom('npsn')?.addEventListener('input',event=>{
  const bersih=event.target.value.replace(/\D/g,'').slice(0,8);
  if(bersih!==event.target.value)event.target.value=bersih;
});

function tampilkanHasil({berhasil,judul,isi,orderCode=''}){
  if(!hasilPesanan)return;
  hasilPesanan.hidden=false;
  hasilPesanan.className=`hasil-pesanan ${berhasil?'berhasil':'gagal'}`;
  hasilPesanan.textContent='';
  const kepala=document.createElement('strong');
  kepala.textContent=judul;
  hasilPesanan.append(kepala);
  if(orderCode){
    const kode=document.createElement('span');
    kode.className='order-id';
    kode.textContent=orderCode;
    hasilPesanan.append(kode);
  }
  const keterangan=document.createElement('p');
  keterangan.textContent=isi;
  hasilPesanan.append(keterangan);
}

/* Penjaga tekan ganda di sisi halaman. Penjaga sebenarnya tetap ada di server lewat
   client_ref; yang ini hanya mencegah dua permintaan berangkat bersamaan. */
let sedangMengirim=false;

form.addEventListener('submit',async event=>{
  event.preventDefault();
  /* Validasi diulang di sini, bukan sekadar mengandalkan atribut HTML: tombol boleh saja
     diaktifkan lewat peralatan pengembang, tetapi pesanan tetap tidak akan terkirim. */
  const {valid,errors}=segarkan({tampilkan:true});
  if(!valid){
    const pertama=Object.keys(errors)[0];
    const kendali=pertama==='konfirmasi'?persetujuan:kolom(pertama);
    kendali?.focus?.();
    return;
  }
  if(sedangMengirim)return;

  const isi=bacaForm();
  sedangMengirim=true;
  tombol.disabled=true;
  const labelAsli=tombol.innerHTML;
  tombol.textContent='Menyimpan pesanan…';

  let kode='';
  try{
    /* LANGKAH 1: SIMPAN KE SERVER. Baru sesudah ini WhatsApp dibuka. */
    const hasil=await submitOrder(buildOrderPayload(isi,clientRef));
    kode=hasil.order.order_code;
    orderCodeTersimpan=kode;
    tampilkanHasil({berhasil:true,orderCode:kode,
      judul:hasil.duplicate?'Pesanan Anda sudah tersimpan sebelumnya.':'Pesanan Anda berhasil tersimpan.',
      isi:'Simpan Order ID di atas. Itulah identitas transaksi Anda, dan sebutkan pada setiap komunikasi berikutnya. WhatsApp akan terbuka membawa Order ID ini.'});
  }catch(galat){
    /* KEGAGALAN TIDAK DISEMBUNYIKAN dan WhatsApp TIDAK dibuka: membuka WhatsApp di sini akan
       membuat pembeli mengira pesanannya sudah tercatat padahal belum. */
    tampilkanHasil({berhasil:false,judul:'Pesanan belum tersimpan.',isi:orderErrorMessage(galat)});
    hasilPesanan?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    return;
  }finally{
    sedangMengirim=false;
    tombol.disabled=false;
    tombol.innerHTML=labelAsli;
  }

  /* LANGKAH 2: buka WhatsApp membawa Order ID. Bila pesan ini tidak pernah terkirim, pesanan
     tadi tetap ada di server - itulah gunanya urutan ini. */
  if(!disuntingPengguna)kotakPesan.value=buildOrderMessage(isi,{orderCode:kode});
  const teks=kotakPesan.value.trim()||buildOrderMessage(isi,{orderCode:kode});
  /* Isian berikutnya adalah pesanan yang berbeda, jadi penandanya diperbarui. */
  clientRef=newClientRef();
  window.open(whatsappUrl(teks,CONTACT_WHATSAPP),'_blank','noopener,noreferrer');
});

segarkan();

/* ------------------------------------------------------------------ Metode pembayaran

   Seluruh nomor dan gambar berasal dari payment-config.js. Tidak satu pun ditulis di berkas
   ini maupun di markup, sehingga tidak ada kemungkinan angka di halaman berbeda dengan angka
   di sumber resminya. */

const catatanNominal=document.querySelector('#catatan-nominal');
if(catatanNominal)catatanNominal.textContent=PAYMENT_AMOUNT_NOTE;

const daftarBayar=document.querySelector('#daftar-bayar');

/* ALAMAT ASET DISELESAIKAN TERHADAP MODUL INI, BUKAN TERHADAP ALAMAT HALAMAN.

   Inilah akar masalah QRIS rusak di produksi. `img.src='./assets/x.jpg'` diselesaikan browser
   terhadap URL DOKUMEN. Vercel menyajikan halaman ini lewat rewrite /beli -> /beli/index.html
   TANPA redirect, sehingga URL dokumennya tetap "/beli" tanpa garis miring. Basis untuk
   alamat relatif karena itu menjadi "/" dan './assets/qris-fahmi-djawas.jpg' berubah menjadi
   /assets/qris-fahmi-djawas.jpg - berkas yang tidak ada. Berkas yang sebenarnya ada di
   /beli/assets/qris-fahmi-djawas.jpg.

   Secara lokal hal ini tidak pernah terlihat karena halaman dibuka sebagai /beli/ (dengan
   garis miring), dan berkas CSS serta JS di index.html memang sudah memakai alamat absolut
   sehingga keduanya tidak ikut rusak - hanya gambar inilah yang dipasang lewat JavaScript.

   import.meta.url selalu menunjuk berkas modul ini (/beli/beli.js), jadi alamat yang
   dihasilkannya benar apa pun bentuk URL halaman: dengan garis miring maupun tanpa. */
const asetBeli=alamat=>new URL(alamat,import.meta.url).href;

/* Lambang metode. Berkas yang belum ada TIDAK pernah menjadi gambar rusak: elemennya dibuang
   dan kartu tetap tampil rapi dengan nama metode serta warna aksennya. */
function lambangMetode(metode){
  if(!metode.logo)return null;
  const gambar=document.createElement('img');
  gambar.className='bayar-logo';
  gambar.src=asetBeli(metode.logo);
  gambar.alt=metode.logoAlt||`Logo ${metode.label}`;
  gambar.loading='lazy';
  gambar.decoding='async';
  gambar.addEventListener('error',()=>gambar.remove());
  return gambar;
}

function kartuBayar(metode){
  const kartu=document.createElement('article');
  kartu.className='kartu-bayar reveal tampil';
  kartu.dataset.metode=metode.id;
  if(metode.brandColor)kartu.style.setProperty('--warna-metode',metode.brandColor);

  /* KEPALA: lambang di barisnya sendiri, lalu nama metode tepat di bawahnya, lalu keterangan
     singkat - ketiganya rapat sehingga terbaca sebagai satu kelompok. */
  const kepala=document.createElement('div');
  kepala.className='bayar-kepala';
  const lambang=lambangMetode(metode);
  if(lambang)kepala.append(lambang);
  const judul=document.createElement('h3');
  judul.textContent=metode.label;
  kepala.append(judul);
  kartu.append(kepala);

  const nota=document.createElement('p');
  nota.className='bayar-nota';
  nota.textContent=metode.subtitle;
  kartu.append(nota);

  if(metode.kind==='qris'){
    /* Kartu QRIS resmi, ditampilkan UTUH: tidak dipotong, tidak diregangkan, dan tidak
       dipaksa masuk kotak persegi. Perbandingan sisi aslinya dipakai apa adanya lewat
       atribut width/height, sehingga ruang yang dipesan browser persis sebesar gambarnya
       dan tidak ada pita kosong di atas maupun di bawah. */
    /* Gambarnya dibungkus tautan ke berkas aslinya sendiri, sehingga kartu QRIS dapat dibuka
       pada resolusi penuh (1135x1600) untuk dipindai atau dibaca dari layar. Ini hanya sebuah
       anchor - tidak ada komponen baru, tidak ada JavaScript tambahan, dan alamatnya pun
       berkas yang sama persis. */
    const bingkai=document.createElement('a');
    bingkai.className='bayar-qris-bingkai';
    bingkai.href=asetBeli(metode.image);
    bingkai.target='_blank';
    bingkai.rel='noopener noreferrer';
    bingkai.title='Buka kartu QRIS ukuran penuh';
    const gambar=document.createElement('img');
    gambar.className='bayar-qris';
    gambar.src=asetBeli(metode.image);
    gambar.alt=metode.imageAlt;
    gambar.width=1135;
    gambar.height=1600;
    gambar.loading='lazy';
    gambar.decoding='async';
    bingkai.append(gambar);
    kartu.append(bingkai);
    const petunjuk=document.createElement('p');
    petunjuk.className='bayar-qris-petunjuk';
    petunjuk.textContent='Ketuk kode untuk membukanya ukuran penuh';
    kartu.append(petunjuk);
  }

  if(metode.accountNumber){
    const kotak=document.createElement('div');
    kotak.className='bayar-nilai';
    const label=document.createElement('span');
    label.className='bayar-label-kecil';
    label.textContent=metode.kind==='rekening'?'Nomor Rekening':'Nomor';
    const nomor=document.createElement('span');
    nomor.className='bayar-nomor';
    nomor.textContent=metode.accountNumber;
    kotak.append(label,nomor);
    kartu.append(kotak);
  }

  /* Kaki kartu: nama pemilik dan tombol salin duduk berdampingan supaya tidak ada ruang
     kosong menganga di bawah kartu GoPay dan Mandiri. */
  const kaki=document.createElement('div');
  kaki.className='bayar-kaki';
  const atasNama=document.createElement('p');
  atasNama.className='bayar-atas-nama';
  atasNama.textContent=`a.n. ${metode.accountName}`;
  kaki.append(atasNama);

  if(metode.accountNumber&&navigator.clipboard?.writeText){
    const salin=document.createElement('button');
    salin.type='button';
    salin.className='btn-salin';
    salin.textContent='Salin nomor';
    salin.addEventListener('click',async()=>{
      try{
        await navigator.clipboard.writeText(metode.accountNumber);
        salin.textContent='Tersalin';
        salin.dataset.tersalin='ya';
        setTimeout(()=>{salin.textContent='Salin nomor';delete salin.dataset.tersalin;},2000);
      }catch{
        /* Peramban yang menolak akses papan klip tidak dibiarkan diam: nomornya tetap
           terbaca di layar dan dapat disalin manual. */
        salin.textContent='Salin manual dari layar';
      }
    });
    kaki.append(salin);
  }
  kartu.append(kaki);
  return kartu;
}
if(daftarBayar)for(const metode of PAYMENT_METHODS)daftarBayar.append(kartuBayar(metode));

const langkahBayar=document.querySelector('#langkah-bayar');
if(langkahBayar)for(const langkah of PAYMENT_STEPS){
  const item=document.createElement('li');
  item.textContent=langkah;
  langkahBayar.append(item);
}

const cakupanDaftar=document.querySelector('#cakupan-lisensi-daftar');
if(cakupanDaftar)for(const baris of LICENSE_SCOPE){
  const item=document.createElement('li');
  item.textContent=baris;
  cakupanDaftar.append(item);
}

/* ---------------------------------------------------------------------------- Unduhan

   Alamat unduhan dibaca dari server, bukan ditanam di halaman. Selama belum ada jawabannya -
   dan bila jawabannya gagal dimuat - kedua platform tetap digambar dalam keadaan
   "Belum tersedia". Tidak ada satu pun tautan karangan dan tidak ada tautan ke GitHub. */

const daftarUnduh=document.querySelector('#daftar-unduh');
function kartuUnduh(baris){
  const kartu=document.createElement('article');
  kartu.className='kartu-unduh reveal tampil';
  kartu.dataset.platform=baris.platform;

  const judul=document.createElement('h3');
  judul.textContent=baris.label;
  const status=document.createElement('span');
  status.className=`unduh-status ${baris.available?'ada':'belum'}`;
  status.textContent=baris.statusText;
  kartu.append(judul,status);

  const meta=downloadMeta(baris);
  if(meta){
    const keterangan=document.createElement('p');
    keterangan.className='unduh-meta';
    keterangan.textContent=meta;
    kartu.append(keterangan);
  }
  if(baris.notes){
    const catatanBaris=document.createElement('p');
    catatanBaris.className='unduh-meta';
    catatanBaris.textContent=baris.notes;
    kartu.append(catatanBaris);
  }

  const tautan=document.createElement('a');
  tautan.className='btn btn-hijau btn-blok btn-unduh';
  tautan.textContent=baris.buttonText;
  if(baris.available){
    tautan.href=baris.url;
    tautan.rel='noopener noreferrer';
    tautan.target='_blank';
  }else{
    /* Tombol yang belum punya berkas tetap terlihat, tetapi tidak dapat ditekan dan tidak
       membawa alamat apa pun. */
    tautan.setAttribute('aria-disabled','true');
    tautan.removeAttribute('href');
  }
  kartu.append(tautan);
  return kartu;
}
function gambarUnduhan(daftar){
  if(!daftarUnduh)return;
  daftarUnduh.textContent='';
  for(const baris of downloadRows(daftar))daftarUnduh.append(kartuUnduh(baris));
}
gambarUnduhan(null);
fetchDownloads().then(daftar=>{if(daftar)gambarUnduhan(daftar);}).catch(()=>{});
