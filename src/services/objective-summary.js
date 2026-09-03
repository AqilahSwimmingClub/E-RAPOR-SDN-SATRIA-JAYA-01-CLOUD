/* Peringkas Tujuan Pembelajaran, dipakai bersama.

   Deskripsi rapor maupun deskripsi Intrakurikuler sama-sama tidak boleh berisi TP yang
   ditempel mentah. Aturan meringkasnya ditulis satu kali di sini supaya keduanya berbunyi
   dengan cara yang sama.

   Bedanya hanya pada SUMBER TP-nya: rapor memakai seluruh TP aktif, Intrakurikuler memakai
   TP yang dipilih guru pada menu Intrakurikuler. */

function phrase(value){return String(value||'').trim().replace(/[.!?]+$/,'');}

const PENANDA_KETERANGAN=['dalam','pada','di','ke','dari','dengan','melalui','secara','tentang',
  'terhadap','mengenai','berdasarkan','sesuai','untuk','menggunakan','beserta','terkait','seperti'];
const POLA_KETERANGAN=new RegExp(`\\s+(?:${PENANDA_KETERANGAN.join('|')})\\s+.+$`,'i');

function intiKompetensi(teks){
  const bersih=phrase(teks).replace(/\s+/g,' ').trim();
  if(!bersih)return '';
  const cocok=bersih.match(POLA_KETERANGAN);
  if(cocok){
    const depan=bersih.slice(0,cocok.index).trim();
    const ekor=cocok[0].trim();
    /* Hanya pangkas bila keduanya benar-benar berdiri sendiri sebagai frasa. */
    if(depan.split(/\s+/).length>=3&&ekor.split(/\s+/).length>=3)return depan;
  }
  return bersih;
}

function hurufKecilAwal(teks){
  /* Kata pertama TP hampir selalu kata kerja berhuruf besar; di tengah kalimat ia mengecil.
     Singkatan seperti "IPA" dibiarkan agar tidak berubah arti. */
  if(!teks)return '';
  const pertama=teks.split(/\s+/)[0];
  if(pertama.length>1&&pertama===pertama.toUpperCase())return teks;
  return teks.charAt(0).toLowerCase()+teks.slice(1);
}

/* Satu TP, dua TP, atau lebih diringkas menjadi satu frasa. Inti yang sama tidak pernah
   disebut dua kali, dan tidak ada penomoran "TP-1, TP-2" yang ikut terbawa. */
export function ringkasObjectives(daftar){
  const inti=[];
  for(const item of daftar){
    const teks=hurufKecilAwal(intiKompetensi(item?.description??item));
    if(teks)inti.push(teks);
  }
  /* Dua TP yang intinya sama — persis maupun salah satunya hanya perpanjangan yang lain —
     cukup disebut satu kali, dan yang dipakai adalah bentuk terpendeknya. Tanpa ini deskripsi
     akan mengulang frasa yang sama dua kali. */
  const isi=[];
  for(const teks of inti){
    const kecil=teks.toLowerCase();
    if(isi.some(ada=>{
      const lain=ada.toLowerCase();
      return lain===kecil||kecil.startsWith(`${lain} `);
    }))continue;
    const indeks=isi.findIndex(ada=>ada.toLowerCase().startsWith(`${kecil} `));
    if(indeks>=0)isi[indeks]=teks;
    else isi.push(teks);
  }
  if(!isi.length)return '';
  if(isi.length===1)return isi[0];
  if(isi.length===2)return `${isi[0]} serta ${isi[1]}`;
  return `${isi.slice(0,-1).join(', ')}, serta ${isi[isi.length-1]}`;
}
