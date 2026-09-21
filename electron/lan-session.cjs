'use strict';

/* AUTENTIKASI DAN SESSION SISI SERVER UNTUK MODE LAN.

   SEBELUM RILIS INI login e-Rapor dikerjakan SELURUHNYA di browser: halaman membaca
   `userAccounts` dari database lokal, memverifikasi PBKDF2 sendiri, lalu menyimpan sebuah
   objek JSON biasa ke sessionStorage. Selama database hanya ada di komputer itu sendiri, itu
   memadai - yang memegang berkasnya memang sudah memegang segalanya.

   Begitu database dilayani ke komputer lain lewat LAN, model itu runtuh. Session yang hanya
   berupa JSON di browser dapat disunting sendiri oleh pemiliknya: cukup ubah `role` menjadi
   "admin" atau `classId` menjadi kelas lain, dan aplikasi yang percaya pada session itu akan
   menurut. Karena itu di mode LAN keputusan siapa-boleh-apa dipindahkan ke sini, dan browser
   tidak lagi menjadi batas keamanan.

   YANG SENGAJA TIDAK BERUBAH: algoritma hash-nya. Akun sekolah yang sudah ada tetap memakai
   PBKDF2-SHA-256 120.000 iterasi dengan salt dan hash base64 yang sama persis, dan sudah
   dibuktikan bahwa hash buatan WebCrypto browser terverifikasi identik oleh crypto Node. Tidak
   ada guru yang perlu mengganti kata sandinya karena rilis ini, dan tidak ada kata sandi yang
   pernah disimpan sebagai teks biasa.

   ATURAN LOGIN-nya pun disalin apa adanya dari jalur yang sudah dipakai sekolah - nama
   pengguna Admin, pengenalan akun Guru lewat `guru<kelas>` maupun kata sandi awal, pemeriksaan
   akun nonaktif SESUDAH kata sandi terbukti benar, dan Admin yang belum diaktivasi pemilik.
   Menyusun ulang aturannya akan membuat sekolah yang sudah berjalan tiba-tiba tidak bisa
   masuk. */

const {pbkdf2Sync,randomBytes,timingSafeEqual}=require('node:crypto');

const NAMA_COOKIE='erapor_lan_session';
const DURASI_BAWAAN_MS=8*60*60*1000;
const KELAS_SAH=[];
for(const tingkat of [1,2,3,4,5,6])for(const huruf of ['A','B','C','D'])KELAS_SAH.push(`${tingkat}${huruf}`);

function kunciGuru(classId){return `teacher:${classId}`;}
function kataSandiAwal(classId){return `Kelas${String(classId).toLowerCase()}`;}
function normalkanNama(value){return String(value||'').trim().toLowerCase();}

/* Verifikasi kata sandi dengan perbandingan waktu-tetap. Catatan yang bukan PBKDF2-SHA-256
   ditolak apa adanya, bukan dianggap cocok - akun tanpa kata sandi tidak boleh bisa masuk. */
function kataSandiCocok(kataSandi,catatan){
  if(!catatan||!catatan.salt||!catatan.hash||catatan.algorithm!=='PBKDF2-SHA-256')return false;
  try{
    const salt=Buffer.from(String(catatan.salt),'base64');
    const diharapkan=Buffer.from(String(catatan.hash),'base64');
    const iterasi=Number(catatan.iterations)||120000;
    const dihitung=pbkdf2Sync(String(kataSandi),salt,iterasi,diharapkan.length,'sha256');
    if(dihitung.length!==diharapkan.length)return false;
    return timingSafeEqual(dihitung,diharapkan);
  }catch{return false;}
}

/* Pengenalan akun Guru mengikuti jalur existing: `guru5b` menunjuk kelasnya langsung,
   sedangkan `guru` polos dikenali dari kata sandinya. Akun NONAKTIF tetap ikut dicocokkan di
   sini; statusnya baru diperiksa setelah kata sandinya terbukti benar, supaya guru yang
   kata sandinya benar tidak menerima pesan "password tidak sesuai" yang menyesatkan. */
function cariAkunGuru(doc,username,kataSandi){
  const akun=doc.userAccounts||{};
  const langsung=String(username||'').match(/^guru([1-6][a-d])$/i);
  if(langsung)return akun[kunciGuru(langsung[1].toUpperCase())]||null;
  if(normalkanNama(username)!=='guru')return null;
  const awal=String(kataSandi||'').match(/^kelas([1-6][a-d])$/i);
  if(awal)return akun[kunciGuru(awal[1].toUpperCase())]||null;
  for(const classId of KELAS_SAH){
    const catatan=akun[kunciGuru(classId)];
    if(catatan&&kataSandiCocok(kataSandi,catatan.passwordHash))return catatan;
  }
  return null;
}

/* TAHUN PELAJARAN DITENTUKAN SERVER, BUKAN DIKIRIM KLIEN.

   Cakupan data seorang guru adalah `tahun|semester|kelas`, jadi tahun pelajaran ikut
   menentukan apa yang boleh ia lihat. Kalau nilainya diambil dari permintaan, seorang guru
   dapat menyebut tahun mana pun dan menerima proyeksi tahun itu.

   Lagi pula klien memang TIDAK BISA menghitungnya sendiri sebelum masuk: tahun pelajaran
   dibaca dari Data Referensi di dalam database, dan database baru dapat dibaca setelah ada
   sesi. Server memegang dokumen yang sama, jadi ia melakukan pencarian yang persis sama -
   dari sumber yang sama - tanpa lingkaran itu. */
function tahunUntukSemester(doc,semester){
  const daftar=doc?.masterData?.references?.semesters;
  if(!Array.isArray(daftar))throw galat('Data Referensi semester belum tersedia di server.','SEMESTER_TIDAK_ADA');
  const catatan=daftar.find(item=>item&&item.label===semester&&item.active!==false);
  if(!catatan)throw galat('Semester login tidak tersedia pada Data Referensi sekolah.','SEMESTER_TIDAK_ADA');
  return String(catatan.academicYear||'');
}

function galat(pesan,kode){
  const error=new Error(pesan);
  error.kode=kode||'LOGIN_GAGAL';
  return error;
}

function createLanSessions({bacaDokumen,bacaLisensi,durasiMs=DURASI_BAWAAN_MS,sekarang=()=>Date.now()}={}){
  if(typeof bacaDokumen!=='function')throw new Error('createLanSessions memerlukan bacaDokumen.');
  /* Session disimpan HANYA di memori proses server. Mematikan e-Rapor karena itu otomatis
     memutus seluruh sesi guru - tidak ada token yang tertinggal di piringan dan bisa dipakai
     ulang diam-diam setelah aplikasi ditutup. */
  const sesi=new Map();

  function bersihkanKedaluwarsa(now){
    for(const [token,isi] of sesi)if(isi.expiresAt<=now)sesi.delete(token);
  }

  function gerbangLisensi(){
    /* Lisensi diperiksa di SERVER, bukan di browser guru. Tanpa ini, satu sekolah yang
       lisensinya dicabut cukup memakai browser guru mana pun untuk terus masuk. */
    if(typeof bacaLisensi!=='function')return;
    const lisensi=bacaLisensi()||{};
    if(lisensi.canUseApp===true)return;
    throw galat(
      lisensi.message||'Lisensi komputer server tidak berlaku, sehingga e-Rapor LAN tidak dapat digunakan.',
      'LICENSE_BLOCKED');
  }

  return {
    NAMA_COOKIE,

    /* Login menghasilkan token BARU setiap kali. Token yang mungkin sudah dipegang penyerang
       sebelum korban masuk karena itu tidak pernah berubah menjadi sesi yang sah - inilah
       penjagaan terhadap session fixation. */
    login({username,password,role,semester}={}){
      gerbangLisensi();
      const doc=bacaDokumen()||{};
      const tahun=tahunUntukSemester(doc,semester);
      const akunSemua=doc.userAccounts||{};
      let akun=null;
      let kataSandiDiverifikasi=String(password||'');

      if(role==='admin'){
        if(normalkanNama(username)!=='admin')throw galat('Username atau password Admin tidak sesuai.');
        akun=akunSemua.admin;
        if(akun?.requiresActivation||!doc.security?.ownerActivated)
          throw galat('Akun Admin belum diaktivasi oleh pemilik aplikasi.','ADMIN_BELUM_AKTIVASI');
      }else if(role==='teacher'){
        akun=cariAkunGuru(doc,username,kataSandiDiverifikasi);
        if(akun?.bootstrapCredential&&kataSandiDiverifikasi.toLowerCase()===kataSandiAwal(akun.classId).toLowerCase())
          kataSandiDiverifikasi=kataSandiAwal(akun.classId);
      }else throw galat('Pilih peran login terlebih dahulu.');

      if(!akun||!kataSandiCocok(kataSandiDiverifikasi,akun.passwordHash))
        throw galat(role==='teacher'?'Username atau password Guru tidak sesuai.':'Username atau password Admin tidak sesuai.');

      if(!akun.active)
        throw galat(role==='teacher'
          ? 'Akun Guru ini belum diaktifkan Admin sekolah. Hubungi Admin untuk mengaktifkannya melalui Akun Guru & Penugasan.'
          : 'Akun Admin sedang dinonaktifkan.','ACCOUNT_INACTIVE');

      const now=sekarang();
      bersihkanKedaluwarsa(now);
      const token=randomBytes(32).toString('hex');
      const csrf=randomBytes(32).toString('hex');
      /* KELAS DIAMBIL DARI AKUN, BUKAN DARI PERMINTAAN. Inilah sebabnya `classId` yang dikirim
         browser tidak pernah dapat memindahkan seorang guru ke kelas lain. */
      const isi={
        token,csrf,
        accountId:akun.id,
        role:akun.role,
        classId:akun.role==='teacher'?akun.classId:null,
        username:akun.username,
        semester:String(semester||''),
        academicYear:tahun,
        mustChangePassword:Boolean(akun.mustChangePassword),
        createdAt:now,
        expiresAt:now+durasiMs,
      };
      sesi.set(token,isi);
      return isi;
    },

    /* Session yang kedaluwarsa DIHAPUS saat diperiksa, bukan sekadar ditolak, sehingga token
       lama tidak menumpuk di memori dan tidak mungkin hidup kembali. */
    validasi(token){
      const now=sekarang();
      const isi=token?sesi.get(String(token)):null;
      if(!isi)return null;
      if(isi.expiresAt<=now){sesi.delete(String(token));return null;}
      return isi;
    },

    logout(token){
      if(!token)return false;
      return sesi.delete(String(token));
    },

    /* Dipakai saat lisensi dicabut atau LAN dimatikan: seluruh guru yang sedang masuk langsung
       kehilangan aksesnya tanpa perlu menunggu sesinya kedaluwarsa sendiri. */
    hapusSemua(){const jumlah=sesi.size;sesi.clear();return jumlah;},

    jumlahSesi(){bersihkanKedaluwarsa(sekarang());return sesi.size;},

    /* Cookie sengaja dibuat HttpOnly supaya JavaScript halaman tidak dapat membacanya, dan
       SameSite=Strict supaya browser tidak pernah mengirimkannya atas permintaan situs lain.
       Secure TIDAK dipasang karena LAN sekolah berjalan di http:// tanpa sertifikat; memasang
       Secure justru membuat cookie tidak pernah terkirim sama sekali. */
    cookieUntuk(isi){
      const umur=Math.max(1,Math.floor((isi.expiresAt-sekarang())/1000));
      return `${NAMA_COOKIE}=${isi.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${umur}`;
    },
    cookieKosong(){return `${NAMA_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;},
  };
}

function bacaCookie(header,nama){
  const isi=String(header||'');
  for(const bagian of isi.split(';')){
    const potong=bagian.indexOf('=');
    if(potong<0)continue;
    if(bagian.slice(0,potong).trim()===nama)return bagian.slice(potong+1).trim();
  }
  return '';
}

module.exports={createLanSessions,bacaCookie,kataSandiCocok,NAMA_COOKIE,KELAS_SAH};
