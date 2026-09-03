import { CONTACT_WHATSAPP, CONTACT_WHATSAPP_DISPLAY, SUPPORT_URL, whatsappUrl } from '../src/data/app-identity.js';
import { buildOrderMessage, REQUIRED_FIELDS, validateOrder } from './order-form.js';

/* Perekat halaman publik pemesanan.

   Halaman ini sengaja tidak mengenal apa pun dari aplikasi sekolah: tidak ada login, tidak ada
   database, tidak ada Owner API, dan tidak ada satu pun permintaan jaringan. Yang dilakukannya
   hanyalah menyusun pesan WhatsApp dari isian pengguna lalu membuka WhatsApp.

   Nomor WhatsApp tidak ditulis di berkas ini. Ia diambil dari src/data/app-identity.js, sumber
   kontak resmi yang sama dengan yang dipakai halaman Tentang & Pembaruan.

   Alamat impor di atas relatif terhadap URL modul ini (/beli/beli.js), bukan terhadap alamat
   halaman, sehingga tetap benar baik ketika dibuka di /beli maupun /beli/. */

const form=document.querySelector('#form-pesan');
const kotakPesan=document.querySelector('#pesan');
const tombol=document.querySelector('#tombol-pesan');
const catatan=document.querySelector('#catatan-tombol');
const persetujuan=document.querySelector('#konfirmasi');

/* Tautan kontak disusun dari konfigurasi, bukan ditulis di markup. */
const tautanDeveloper=document.querySelector('#tautan-developer');
if(tautanDeveloper)tautanDeveloper.href=SUPPORT_URL;
const tautanWa=document.querySelector('#tautan-wa');
if(tautanWa){tautanWa.href=SUPPORT_URL;tautanWa.textContent=CONTACT_WHATSAPP_DISPLAY;}

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
  },{rootMargin:'0px 0px -8% 0px',threshold:.08});
  for(const bagian of bagianMuncul)pengamat.observe(bagian);
}else for(const bagian of bagianMuncul)bagian.classList.add('tampil');

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
