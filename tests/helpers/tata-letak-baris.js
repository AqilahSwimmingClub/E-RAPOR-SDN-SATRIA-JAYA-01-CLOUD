/* MODEL TATA LETAK SATU BARIS TABEL RAPOR.

   Test yang membaca berkas CSS hanya membuktikan sebuah deklarasi tertulis di sana. Yang
   diminta lebih dari itu: HASIL tata letaknya. Modul ini menghitung posisi tegak isi setiap
   sel dari nilai CSS yang benar-benar menang, memakai aturan kotak sel tabel yang berlaku:

     tinggi konten sel = jumlah baris teks x ukuran huruf x line-height
     tinggi sel yang dibutuhkan = padding atas + tinggi konten + padding bawah
     tinggi baris = nilai terbesar di antara seluruh sel pada baris itu

   Lalu titik tengah tegak isi sel mengikuti vertical-align:

     top    -> paddingAtas + tinggiKonten / 2
     middle -> paddingAtas + (tinggiBaris - paddingAtas - paddingBawah) / 2
     bottom -> tinggiBaris - paddingBawah - tinggiKonten / 2

   Perbedaan `top` dan `middle` itulah gejala yang dilaporkan: ketika kolom Capaian Kompetensi
   memanjang menjadi beberapa baris, sel yang `top` tetap menempel ke atas sementara sel yang
   `middle` turun ke tengah, sehingga angka No dan Nilai Akhir tidak lagi sejajar dengan nama
   mata pelajaran. Model ini memunculkan selisih itu sebagai angka, bukan sebagai dugaan. */

/* Angka px dari nilai CSS; padding boleh ditulis ringkas (satu sampai empat nilai). */
export function px(nilai){
  const angka=Number.parseFloat(String(nilai));
  return Number.isFinite(angka)?angka:0;
}
export function paddingTegak(nilai){
  const bagian=String(nilai).trim().split(/\s+/).map(px);
  if(bagian.length===1)return{atas:bagian[0],bawah:bagian[0]};
  return{atas:bagian[0],bawah:bagian.length>2?bagian[2]:bagian[0]};
}

export function tinggiKonten(sel){
  return sel.barisTeks*sel.fontSize*sel.lineHeight;
}

/* Sel: {nama, barisTeks, fontSize, lineHeight, padding, verticalAlign}. */
export function tataLetakBaris(daftarSel){
  const sel=daftarSel.map(item=>{
    const pad=paddingTegak(item.padding);
    const konten=tinggiKonten(item);
    return{...item,pad,konten,butuh:pad.atas+konten+pad.bawah};
  });
  const tinggiBaris=Math.max(...sel.map(item=>item.butuh));
  const pusat={};
  const atasKonten={};
  for(const item of sel){
    const area=tinggiBaris-item.pad.atas-item.pad.bawah;
    let mulai;
    if(item.verticalAlign==='middle')mulai=item.pad.atas+(area-item.konten)/2;
    else if(item.verticalAlign==='bottom')mulai=tinggiBaris-item.pad.bawah-item.konten;
    else mulai=item.pad.atas;
    atasKonten[item.nama]=mulai;
    pusat[item.nama]=mulai+item.konten/2;
  }
  return{tinggiBaris,pusat,atasKonten};
}
