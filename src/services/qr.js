/* PEMBUAT QR CODE SEDERHANA UNTUK ALAMAT SERVER LAN.

   Ditulis sendiri, bukan memakai pustaka pihak ketiga, dengan alasan yang jelas: yang
   dibutuhkan hanyalah menyandikan satu URL pendek seperti "http://192.168.1.10:5321", dan
   pustaka QR umum membawa penyandi untuk Kanji, mode campuran, serta delapan tingkat
   koreksi yang tidak satu pun dipakai di sini. Aplikasi ini dikirim sebagai modul ES tanpa
   bundler, sehingga setiap kilobyte pustaka menjadi berkas yang ikut diunduh setiap kali.

   Yang didukung memang sempat: mode BYTE, koreksi kesalahan tingkat M, versi 1 sampai 10
   (cukup untuk 213 karakter pada tingkat M). URL alamat LAN paling panjang pun jauh di
   bawahnya. Bila suatu saat isinya melebihi itu, fungsi ini MELEMPAR alih-alih menghasilkan
   QR yang salah - lebih baik tombolnya tidak muncul daripada guru memindai kode yang membawa
   alamat keliru.

   YANG DISANDIKAN HANYA URL. Tidak ada kata sandi, token sesi, token bridge, token lisensi,
   maupun Installation ID yang boleh masuk ke dalamnya: QR itu ditempel di dinding ruang guru,
   difoto, dan diteruskan lewat pesan - apa pun yang ada di dalamnya harus aman untuk dilihat
   siapa saja. */

const GALOIS_EXP=new Array(512);
const GALOIS_LOG=new Array(256);
(function siapkanGalois(){
  let x=1;
  for(let i=0;i<255;i+=1){GALOIS_EXP[i]=x;GALOIS_LOG[x]=i;x<<=1;if(x&0x100)x^=0x11d;}
  for(let i=255;i<512;i+=1)GALOIS_EXP[i]=GALOIS_EXP[i-255];
})();
const kali=(a,b)=>(a===0||b===0)?0:GALOIS_EXP[GALOIS_LOG[a]+GALOIS_LOG[b]];

function polinomGenerator(jumlah){
  let hasil=[1];
  for(let i=0;i<jumlah;i+=1){
    const berikut=new Array(hasil.length+1).fill(0);
    for(let j=0;j<hasil.length;j+=1){
      /* hasil[0] adalah koefisien derajat TERTINGGI. Mengalikan dengan x karena itu menahan
         koefisien di indeks yang sama, sedangkan mengalikan dengan akar menggesernya satu
         indeks ke kanan. Versi sebelumnya menukar keduanya, sehingga koefisien generator
         tersusun terbalik: datanya tetap terbaca karena codeword data memang dibaca apa
         adanya, tetapi codeword koreksi kesalahannya salah - dan pemindai sungguhan memeriksa
         koreksi kesalahan lalu menolak kodenya. Hanya pemeriksaan syndrome yang dapat
         menemukan ini; melihat gambarnya tidak. */
      berikut[j]^=hasil[j];
      berikut[j+1]^=kali(hasil[j],GALOI_AKAR(i));
    }
    hasil=berikut;
  }
  return hasil;
}
const GALOI_AKAR=i=>GALOIS_EXP[i];

function koreksiKesalahan(data,jumlah){
  const gen=polinomGenerator(jumlah);
  const sisa=new Array(jumlah).fill(0);
  for(const byte of data){
    const faktor=byte^sisa[0];
    sisa.shift();sisa.push(0);
    if(faktor!==0)for(let i=0;i<jumlah;i+=1)sisa[i]^=kali(gen[i+1],faktor);
  }
  return sisa;
}

/* Kapasitas mode BYTE dan parameter blok untuk tingkat koreksi M, versi 1..10.

   `dataKata` adalah jumlah codeword DATA - yaitu jumlah panjang seluruh blok - bukan seluruh
   codeword termasuk koreksi kesalahan. Memakai angka total di sini akan membuat pengisian
   berhenti di tempat yang salah. */
const VERSI_M=[
  {versi:1,kapasitas:14,dataKata:16,ecPerBlok:10,blok:[[1,16]]},
  {versi:2,kapasitas:26,dataKata:28,ecPerBlok:16,blok:[[1,28]]},
  {versi:3,kapasitas:42,dataKata:44,ecPerBlok:26,blok:[[1,44]]},
  {versi:4,kapasitas:62,dataKata:64,ecPerBlok:18,blok:[[2,32]]},
  {versi:5,kapasitas:84,dataKata:86,ecPerBlok:24,blok:[[2,43]]},
  {versi:6,kapasitas:106,dataKata:108,ecPerBlok:16,blok:[[4,27]]},
  {versi:7,kapasitas:122,dataKata:124,ecPerBlok:18,blok:[[4,31]]},
  {versi:8,kapasitas:152,dataKata:154,ecPerBlok:22,blok:[[2,38],[2,39]]},
  {versi:9,kapasitas:180,dataKata:182,ecPerBlok:22,blok:[[3,36],[2,37]]},
  {versi:10,kapasitas:213,dataKata:216,ecPerBlok:26,blok:[[4,43],[1,44]]},
];

const POLA_ALIGN=[[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

function bitDariTeks(teks,spek){
  const byte=new TextEncoder().encode(teks);
  if(byte.length>spek.kapasitas)throw new Error('Isi QR terlalu panjang.');
  const bit=[];
  const tulis=(nilai,panjang)=>{for(let i=panjang-1;i>=0;i-=1)bit.push((nilai>>i)&1);};
  tulis(0b0100,4);                                   /* mode BYTE */
  tulis(byte.length,spek.versi<10?8:16);
  for(const b of byte)tulis(b,8);
  const kapasitasBit=spek.dataKata*8;
  tulis(0,Math.min(4,kapasitasBit-bit.length));      /* terminator */
  while(bit.length%8)bit.push(0);
  const isi=[];
  for(let i=0;i<bit.length;i+=8)isi.push(parseInt(bit.slice(i,i+8).join(''),2));
  const PENGISI=[0xec,0x11];let n=0;
  while(isi.length<spek.dataKata)isi.push(PENGISI[n++%2]);
  return isi;
}

function susunKata(isi,spek){
  const blokData=[];const blokEc=[];let posisi=0;
  for(const [jumlah,panjang] of spek.blok){
    for(let i=0;i<jumlah;i+=1){
      const potong=isi.slice(posisi,posisi+panjang);posisi+=panjang;
      blokData.push(potong);blokEc.push(koreksiKesalahan(potong,spek.ecPerBlok));
    }
  }
  const hasil=[];
  const maksData=Math.max(...blokData.map(b=>b.length));
  for(let i=0;i<maksData;i+=1)for(const b of blokData)if(i<b.length)hasil.push(b[i]);
  for(let i=0;i<spek.ecPerBlok;i+=1)for(const b of blokEc)hasil.push(b[i]);
  return hasil;
}

function matriksKosong(ukuran){
  return Array.from({length:ukuran},()=>new Array(ukuran).fill(null));
}

function pasangPolaTetap(m,ukuran,versi){
  const finder=(baris,kolom)=>{
    for(let r=-1;r<=7;r+=1)for(let c=-1;c<=7;c+=1){
      const y=baris+r,x=kolom+c;
      if(y<0||x<0||y>=ukuran||x>=ukuran)continue;
      const luar=r>=0&&r<=6&&(c===0||c===6)||c>=0&&c<=6&&(r===0||r===6);
      const dalam=r>=2&&r<=4&&c>=2&&c<=4;
      m[y][x]=(luar||dalam)?1:0;
    }
  };
  finder(0,0);finder(0,ukuran-7);finder(ukuran-7,0);
  for(let i=8;i<ukuran-8;i+=1){const v=i%2===0?1:0;m[6][i]=v;m[i][6]=v;}
  for(const a of POLA_ALIGN[versi]||[])for(const b of POLA_ALIGN[versi]||[]){
    if((a===6&&b===6)||(a===6&&b===ukuran-7)||(a===ukuran-7&&b===6))continue;
    for(let r=-2;r<=2;r+=1)for(let c=-2;c<=2;c+=1)
      m[a+r][b+c]=(Math.abs(r)===2||Math.abs(c)===2||(r===0&&c===0))?1:0;
  }
  m[ukuran-8][8]=1;
}

/* Informasi format untuk tingkat M dengan mask 0, sudah termasuk BCH dan XOR bakunya. */
const FORMAT_M0=0b101010000010010;

/* PENEMPATAN INFORMASI FORMAT, DUA SALINAN.

   Versi pertama berkas ini keliru di sini dalam dua hal sekaligus, dan keduanya hanya
   ketahuan setelah matriks yang dihasilkan dibaca ulang oleh pembaca QR yang ditulis terpisah
   dari spesifikasi: sepuluh karakter pertama terbaca benar lalu sisanya berantakan.

   1. URUTAN BIT terbalik. Penempatan di bawah memakai penomoran dari bit paling KANAN (LSB),
      sedangkan larik sebelumnya diisi dari bit paling kiri.
   2. SATU MODUL TERLEWAT dan satu modul lain tertimpa. Kolom salinan kedua hanya memuat TUJUH
      bit - baris ukuran-8 pada kolom 8 bukan bit format melainkan modul gelap tetap - dan
      baris salinan kedua memuat DELAPAN bit mulai dari kolom ukuran-8. Versi sebelumnya
      membalik keduanya, sehingga satu modul di baris 8 tidak pernah diisi lalu terisi data,
      dan modul gelap tetapnya tertimpa bit format.

   Akibat modul yang terlewat itu, penulis dan pembaca tidak lagi sepakat di mana data
   dimulai - persis bentuk kerusakan yang terlihat pada hasil pembacaan. */
function pasangFormat(m,ukuran){
  const ambil=i=>(FORMAT_M0>>i)&1;
  /* Salinan pertama, mengelilingi pola pencari kiri-atas. */
  for(let i=0;i<=5;i+=1)m[8][i]=ambil(i);
  m[8][7]=ambil(6);m[8][8]=ambil(7);m[7][8]=ambil(8);
  for(let i=9;i<15;i+=1)m[14-i][8]=ambil(i);
  /* Salinan kedua: tujuh bit di kolom kiri-bawah, delapan bit di baris kanan-atas. */
  for(let i=0;i<7;i+=1)m[ukuran-1-i][8]=ambil(i);
  for(let i=7;i<15;i+=1)m[8][ukuran-15+i]=ambil(i);
}

export function buatMatriksQr(teks){
  const isi=String(teks||'');
  const spek=VERSI_M.find(v=>new TextEncoder().encode(isi).length<=v.kapasitas);
  if(!spek)throw new Error('Isi QR terlalu panjang untuk dibuat di dalam aplikasi.');
  const ukuran=spek.versi*4+17;
  const m=matriksKosong(ukuran);
  pasangPolaTetap(m,ukuran,spek.versi);
  pasangFormat(m,ukuran);
  const kata=susunKata(bitDariTeks(isi,spek),spek);
  const bit=[];
  for(const k of kata)for(let i=7;i>=0;i-=1)bit.push((k>>i)&1);
  let indeks=0,naik=true;
  for(let kolom=ukuran-1;kolom>0;kolom-=2){
    if(kolom===6)kolom-=1;
    for(let langkah=0;langkah<ukuran;langkah+=1){
      const baris=naik?ukuran-1-langkah:langkah;
      for(const k of [kolom,kolom-1]){
        if(m[baris][k]!==null)continue;
        let nilai=indeks<bit.length?bit[indeks]:0;
        indeks+=1;
        /* Mask 0: (baris+kolom) genap dibalik. Satu mask saja sudah memenuhi standar dan
           menghasilkan kode yang terbaca; memilih mask terbaik dari delapan hanya
           mengoptimalkan kontras. */
        if((baris+k)%2===0)nilai^=1;
        m[baris][k]=nilai;
      }
    }
    naik=!naik;
  }
  return m;
}

/* QR digambar sebagai SVG: tajam pada ukuran berapa pun, dapat dicetak, dan tidak memerlukan
   canvas maupun berkas gambar. */
export function qrSvg(teks,{ukuranPiksel=220,margin=4}={}){
  const m=buatMatriksQr(teks);
  const n=m.length;
  const total=n+margin*2;
  let jalur='';
  for(let y=0;y<n;y+=1)for(let x=0;x<n;x+=1)
    if(m[y][x])jalur+=`M${x+margin} ${y+margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${ukuranPiksel}" height="${ukuranPiksel}" role="img" aria-label="QR alamat server e-Rapor"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${jalur}" fill="#0b1a2f"/></svg>`;
}
