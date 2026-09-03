import { CONTACT_WHATSAPP, CONTACT_WHATSAPP_DISPLAY, SUPPORT_URL, whatsappUrl } from '../src/data/app-identity.js';
import { activeSectionId } from './nav.js';
import { buildOrderMessage, REQUIRED_FIELDS, validateOrder } from './order-form.js';

/* Perekat halaman publik pemesanan.

   Halaman ini sengaja tidak mengenal apa pun dari aplikasi sekolah: tidak ada login, tidak ada
   database, tidak ada Owner API, dan tidak ada satu pun permintaan jaringan. Yang dilakukannya
   hanyalah menyusun pesan WhatsApp dari isian pengguna lalu membuka WhatsApp.

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

function bacaForm(){
  const isi={konfirmasi:persetujuan.checked};
  for(const nama of KOLOM)isi[nama]=kolom(nama)?.value??'';
  return isi;
}

/* Pesan pratinjau selalu mengikuti isian, kecuali pengguna sudah menyuntingnya sendiri.
   Suntingan pengguna tidak pernah ditimpa. */
let disuntingPengguna=false;
kotakPesan.addEventListener('input',()=>{disuntingPengguna=true;});

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
  if(!disuntingPengguna)kotakPesan.value=buildOrderMessage(isi);
  tombol.disabled=!valid;
  catatan.textContent=valid
    ? 'Data sudah lengkap. Tombol di atas membuka WhatsApp beserta pesan di atasnya.'
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

form.addEventListener('submit',event=>{
  event.preventDefault();
  /* Validasi diulang di sini, bukan sekadar mengandalkan atribut HTML: tombol boleh saja
     diaktifkan lewat peralatan pengembang, tetapi pesan tetap tidak akan terkirim. */
  const {valid,errors}=segarkan({tampilkan:true});
  if(!valid){
    const pertama=Object.keys(errors)[0];
    const kendali=pertama==='konfirmasi'?persetujuan:kolom(pertama);
    kendali?.focus?.();
    return;
  }
  const teks=kotakPesan.value.trim()||buildOrderMessage(bacaForm());
  window.open(whatsappUrl(teks,CONTACT_WHATSAPP),'_blank','noopener,noreferrer');
});

segarkan();
