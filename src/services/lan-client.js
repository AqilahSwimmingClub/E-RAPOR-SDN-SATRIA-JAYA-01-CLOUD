/* KLIEN LAN: DARI DOKUMEN UTUH MENJADI PERUBAHAN PER CATATAN.

   Aplikasi e-Rapor membaca dan menulis database sebagai satu dokumen utuh secara synchronous.
   Di komputer server sendiri itu tidak menjadi soal - dokumennya memang milik komputer itu.
   Di LAN, mengirim balik seluruh dokumen setiap kali guru menekan Simpan akan menghapus
   pekerjaan guru lain yang kebetulan menyimpan lebih dulu, karena dokumen yang dikirim
   dibangun dari salinan yang sudah basi.

   Berkas ini menutup jurang itu tanpa menyentuh satu pun dari 178 tempat pemanggil:

   - MEMBACA. Server mengirim PROYEKSI - dokumen berbentuk sama tetapi hanya berisi catatan
     yang menjadi hak pengguna. Bagi kode akademik ia tampak seperti database biasa.
   - MENULIS. Dokumen baru DIBANDINGKAN dengan proyeksi terakhir, dan yang dikirim hanya
     catatan yang benar-benar berubah. Guru 5B yang menyimpan nilai karena itu tidak pernah
     menyentuh satu kunci pun milik kelas 4A - bukan karena tampilannya menyembunyikannya,
     melainkan karena kunci itu tidak ikut terkirim.

   TIDAK ADA DATABASE AKADEMIK DI KLIEN. Kalau server tidak dapat dihubungi, penyimpanan
   GAGAL dan dikatakan gagal. Tidak ada penyimpanan diam-diam ke localStorage yang "nanti
   disinkronkan": sinkronisasi offline bukan bagian rilis ini, dan menyimpan setengah jalan
   tanpa memberi tahu justru cara paling halus untuk kehilangan nilai siswa. */

const PREFIX='/__erapor/lan/';

let transportUji=null;
export function pasangTransportLan(impl){transportUji=impl;lupakanLan();}

let memori={terhidrasi:false,rev:0,raw:null,proyeksi:null,sesi:null};
let csrf='';
let statusKoneksi={terhubung:true,pesan:''};

export function lupakanLan(){
  memori={terhidrasi:false,rev:0,raw:null,proyeksi:null,sesi:null};
  statusKoneksi={terhubung:true,pesan:''};
}
export function statusKoneksiLan(){return {...statusKoneksi};}
export function sesiLan(){return memori.sesi?{...memori.sesi}:null;}
export function tandaiCsrf(nilai){csrf=String(nilai||'');}

function metaKonten(nama){
  try{return globalThis.document?.querySelector?.(`meta[name="${nama}"]`)?.content||'';}
  catch{return '';}
}

export function modeLanAktif(){
  if(transportUji)return true;
  return metaKonten('erapor-desktop-db')==='lan'&&typeof globalThis.XMLHttpRequest==='function';
}

function panggil(method,aksi,muatan){
  if(transportUji)return transportUji({method,aksi,muatan,csrf});
  const permintaan=new globalThis.XMLHttpRequest();
  permintaan.open(method,`${PREFIX}${aksi}`,false);
  permintaan.setRequestHeader('Content-Type','application/json');
  /* Penanda CSRF dikirim sebagai header, bukan sebagai medan di badan permintaan: situs lain
     tidak dapat menambahkan header pada permintaan lintas-origin tanpa preflight yang tidak
     pernah dijawab server ini. */
  if(csrf)permintaan.setRequestHeader('x-erapor-csrf',csrf);
  try{permintaan.send(muatan===undefined?null:JSON.stringify(muatan));}
  catch(error){
    statusKoneksi={terhubung:false,pesan:'Server e-Rapor tidak dapat dihubungi.'};
    throw galat('Server e-Rapor tidak dapat dihubungi. Pastikan komputer server menyala dan berada pada jaringan yang sama.',{koneksi:true});
  }
  let isi=null;
  try{isi=permintaan.responseText?JSON.parse(permintaan.responseText):null;}catch{isi=null;}
  if(permintaan.status===0){
    statusKoneksi={terhubung:false,pesan:'Server e-Rapor tidak dapat dihubungi.'};
    throw galat('Server e-Rapor tidak dapat dihubungi. Pastikan komputer server menyala dan berada pada jaringan yang sama.',{koneksi:true});
  }
  statusKoneksi={terhubung:true,pesan:''};
  return {status:permintaan.status,isi};
}

function galat(pesan,tambahan={}){
  const error=new Error(pesan);
  Object.assign(error,{penyimpananAplikasi:true},tambahan);
  return error;
}

/* ------------------------------------------------------------------------- MASUK/KELUAR */

export function masukLan({username,password,role,semester,academicYear}){
  const jawaban=panggil('POST','login',{username,password,role,semester,academicYear});
  if(jawaban.status!==200||!jawaban.isi?.ok){
    const error=new Error(jawaban.isi?.error||'Login ke server e-Rapor gagal.');
    error.code=jawaban.isi?.kode||'LOGIN_GAGAL';
    throw error;
  }
  csrf=String(jawaban.isi.csrf||'');
  lupakanLan();
  csrf=String(jawaban.isi.csrf||'');
  memori.sesi=jawaban.isi.sesi;
  return jawaban.isi.sesi;
}

export function keluarLan(){
  try{panggil('POST','logout',{});}catch{/* sesi di server mungkin memang sudah berakhir */}
  csrf='';lupakanLan();
  return true;
}

/* ----------------------------------------------------------------------- BACA DAN TULIS */

function hidrasi(){
  const jawaban=panggil('GET','state');
  if(jawaban.status===401){
    /* BELUM MASUK BUKAN BERARTI GAGAL.

       Sebelum seorang guru login, klien LAN memang tidak berhak atas satu pun catatan
       akademik - tetapi halaman Login tetap perlu tampil, dan halaman itu membaca nama
       sekolah serta daftar semester dari database. Melempar di sini membuat aplikasi mati
       sebelum satu piksel pun muncul: yang dilihat guru hanyalah halaman kosong.

       Karena itu keadaan "belum masuk" dijawab dengan dokumen pra-login dari server: bentuknya
       sama, isinya hanya data rujukan yang memang publik. Begitu login berhasil, masukLan()
       melupakan hidrasi ini sehingga proyeksi sebenarnya diambil ulang. */
    const publik=panggil('GET','publik');
    if(publik.status===200&&typeof publik.isi?.database==='string'){
      const raw=publik.isi.database;
      return {terhidrasi:true,praLogin:true,rev:0,raw,proyeksi:JSON.parse(raw),sesi:null};
    }
    memori={terhidrasi:false,rev:0,raw:null,proyeksi:null,sesi:null};
    throw galat('Sesi Anda sudah berakhir. Masuk kembali untuk melanjutkan.',{sesiBerakhir:true});
  }
  if(jawaban.status!==200)
    throw galat(`Data sekolah tidak dapat dibaca dari server: ${jawaban.isi?.error||`server menjawab ${jawaban.status}`}`);
  const raw=String(jawaban.isi.database||'{}');
  return {terhidrasi:true,rev:Number(jawaban.isi.rev)||0,raw,proyeksi:JSON.parse(raw),sesi:jawaban.isi.sesi||memori.sesi};
}

function pastikanTerhidrasi(){
  if(memori.terhidrasi)return memori;
  memori=hidrasi();
  return memori;
}

export function bacaRawLan(){return pastikanTerhidrasi().raw;}

/* PEMBANDING HARUS BERUPA BENTUK YANG DILIHAT APLIKASI, BUKAN TEKS MENTAH DARI SERVER.

   loadDb() tidak mengembalikan dokumen apa adanya: ia menormalkan masterData - menggabungkan
   identitas sekolah dengan bawaannya, menyusun ulang daftar kelas dan guru, merapikan Data
   Referensi. Kalau perubahan dihitung terhadap teks mentah dari server, seluruh hasil
   normalisasi itu ikut terbaca sebagai "berubah", sehingga setiap kali guru menyimpan satu
   nilai ia juga tampak hendak mengubah data bersama sekolah - dan penyimpanannya ditolak
   otorisasi, padahal tidak ada yang salah dengan nilainya.

   Karena itu storage.js menyetel pembanding ini tepat setelah normalisasi. Sejak saat itu
   yang terkirim benar-benar hanya catatan yang diubah guru. */
export function tandaiProyeksiLan(dokumen){
  if(!memori.terhidrasi)return;
  memori.proyeksi=dokumen;
}

/* PERBANDINGAN YANG MENENTUKAN APA YANG TERKIRIM.

   Hanya koleksi berbentuk objek yang dibandingkan per kunci; nilai biasa seperti appVersion
   dan updatedAt dilewati dengan sengaja. Kalau updatedAt ikut dikirim, setiap penyimpanan
   akan menyentuh satu kunci bersama yang sama sehingga dua guru yang bekerja di kelas berbeda
   justru selalu bertabrakan - persis masalah yang hendak dihindari. */
const DILEWATI=new Set(['updatedAt','appVersion','appSchemaVersion','createdAt','schemaVersion']);

export function hitungPerubahan(lama,baru){
  const perubahan=[];
  for(const [koleksi,isiBaru] of Object.entries(baru||{})){
    if(DILEWATI.has(koleksi))continue;
    if(!isiBaru||typeof isiBaru!=='object'||Array.isArray(isiBaru))continue;
    const isiLama=(lama&&lama[koleksi]&&typeof lama[koleksi]==='object'&&!Array.isArray(lama[koleksi]))?lama[koleksi]:{};
    for(const [kunci,nilai] of Object.entries(isiBaru)){
      if(JSON.stringify(isiLama[kunci])!==JSON.stringify(nilai))perubahan.push({koleksi,kunci,nilai});
    }
    for(const kunci of Object.keys(isiLama)){
      if(!(kunci in isiBaru))perubahan.push({koleksi,kunci,nilai:null});
    }
  }
  return perubahan;
}

export function tulisRawLan(raw){
  const dasar=pastikanTerhidrasi();
  /* Dokumen pra-login hanya untuk MENAMPILKAN halaman Login. Menyimpan di atasnya tidak pernah
     boleh, dan ditolak di sini sebelum satu permintaan pun dikirim - server juga akan
     menolaknya, tetapi pesan yang jelas lebih berguna daripada 401 yang membingungkan. */
  if(dasar.praLogin)
    throw galat('Belum ada yang masuk pada perangkat ini, jadi tidak ada yang dapat disimpan.',{sesiBerakhir:true});
  const baru=JSON.parse(raw);
  const perubahan=hitungPerubahan(dasar.proyeksi,baru);
  if(!perubahan.length){
    /* Tidak ada catatan yang berubah - misalnya penyimpanan yang hanya menyentuh updatedAt.
       Mengirimkannya hanya akan menambah beban server tanpa mengubah apa pun. */
    memori={...dasar,raw,proyeksi:baru};
    return raw;
  }
  const jawaban=panggil('POST','mutate',{baseRev:dasar.rev,perubahan});

  if(jawaban.status===409){
    memori={terhidrasi:false,rev:0,raw:null,proyeksi:null,sesi:memori.sesi};
    throw galat(jawaban.isi?.error||'Data ini baru saja diubah dari perangkat lain, jadi penyimpanan diulang di atas data terbaru.',{konflikRevisi:true});
  }
  if(jawaban.status===401){
    memori={terhidrasi:false,rev:0,raw:null,proyeksi:null,sesi:null};
    throw galat('Sesi Anda sudah berakhir. Masuk kembali untuk melanjutkan.',{sesiBerakhir:true});
  }
  if(jawaban.status!==200||!jawaban.isi?.ok)
    throw galat(`Data GAGAL disimpan ke server: ${jawaban.isi?.error||`server menjawab ${jawaban.status}`}`);

  memori={terhidrasi:true,rev:Number(jawaban.isi.rev)||dasar.rev+1,raw,proyeksi:baru,sesi:memori.sesi};
  return raw;
}
