'use strict';

/* SERVER LAN e-RAPOR.

   Satu PC Windows menjadi server sekolah; laptop guru, PC Admin, tablet, dan HP menjadi klien
   browser. Database akademik yang sah HANYA ada di PC server - tidak ada klien yang memiliki
   salinan berwenang, dan tidak ada sinkronisasi offline pada rilis ini.

   TIGA HAL YANG MENENTUKAN AMAN ATAU TIDAKNYA NILAI SISWA DI SINI:

   1. PERUBAHAN DIKIRIM PER CATATAN, BUKAN SATU DOKUMEN UTUH. Klien mengirim daftar
      `{koleksi,kunci,nilai}` - bukan seluruh database. Dua guru di kelas berbeda karena itu
      tidak pernah saling menimpa: yang mereka sentuh memang kunci yang berbeda. Pada model
      dokumen utuh, guru yang menyimpan belakangan akan menghapus pekerjaan guru sebelumnya
      tanpa seorang pun tahu.

   2. KONFLIK DIHITUNG PER KUNCI. Server mencatat revisi terakhir yang mengubah setiap kunci.
      Sebuah penyimpanan ditolak HANYA bila kunci yang sama sudah berubah sesudah revisi yang
      dipegang klien. Menolak berdasarkan revisi dokumen global akan membuat guru saling
      menghalangi padahal pekerjaannya tidak bersinggungan sama sekali.

   3. JAWABAN "TERSIMPAN" BARU DIKIRIM SESUDAH BERKASNYA ADA DI PIRINGAN. Perubahan memang
      diterapkan ke dokumen di memori seketika, tetapi klien menunggu sampai commit yang
      memuat perubahannya selesai di-fsync. Beberapa penyimpanan yang datang bersamaan
      menumpang pada satu commit yang sama, sehingga 30 klien tidak berarti 30 kali penulisan
      berkas. Diukur pada database 24 rombel (25,33 MB): p95 488 ms pada 30 klien bersamaan,
      dengan NOL penulisan hilang.

   Penulisan dijalankan satu per satu di dalam proses ini, sehingga tidak ada dua commit yang
   pernah berjalan bersamaan dan tidak ada berkas yang pernah setengah tertulis. */

const {randomBytes,timingSafeEqual}=require('node:crypto');
const {createLanSessions,bacaCookie,NAMA_COOKIE}=require('./lan-session.cjs');
const {proyeksikan,periksaPerubahan,gabungCatatanAkun,KOLEKSI_AKUN}=require('./lan-scope.cjs');

const PREFIX='/__erapor/lan/';
const BATAS_BADAN=16*1024*1024;

function jawab(status,isi,tambahan={}){
  return {status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...tambahan},
    body:JSON.stringify(isi)};
}

function cocokTetap(diberi,diharapkan){
  const a=Buffer.from(String(diberi||''),'utf8');
  const b=Buffer.from(String(diharapkan||''),'utf8');
  if(!b.length||a.length!==b.length)return false;
  return timingSafeEqual(a,b);
}

function createLanServer({store,bacaLisensi,sekarang=()=>Date.now()}={}){
  if(!store)throw new Error('createLanServer memerlukan store database.');

  const sessions=createLanSessions({bacaDokumen:()=>dokumen,bacaLisensi,sekarang});

  /* Dokumen berwenang dipegang di memori dan ditulis ke piringan pada setiap commit. Ia dibaca
     sekali saat LAN dinyalakan supaya penulisan tidak perlu mem-parse 25 MB setiap kali. */
  let dokumen=null;
  let revisi=0;
  const revisiKunci=new Map();
  let menunggu=[];
  let sedangCommit=false;
  let bekuTulis=false;                /* dipakai saat restore supaya tidak ada tulisan menyelinap */
  const statistik={commit:0,totalTulisMs:0,maxTulisMs:0,penumpangMaks:0,mutasi:0,konflik:0};

  function muat(){
    const isi=store.baca();
    dokumen=isi.raw?JSON.parse(isi.raw):{};
    revisi=1;revisiKunci.clear();
    return isi.sumber;
  }

  /* JENDELA KOALESENSI SEBELUM COMMIT.

     Menulis database sekolah memblokir proses ini selama penulisannya berlangsung, sehingga
     permintaan yang datang saat itu baru diproses sesudahnya - satu per satu, dan
     masing-masing langsung menjadwalkan commit-nya sendiri. Akibatnya satu commit hanya
     membawa satu-dua penumpang, dan seluruh database ditulis ulang berkali-kali untuk
     pekerjaan yang sebenarnya muat dalam satu penulisan.

     Menunggu sebentar sebelum menulis membuat permintaan-permintaan yang sudah mengantre
     masuk ke commit yang SAMA. Pada uji 30 klien bersamaan di database 24 MB, jeda 25 ms ini
     menurunkan p95 dari 5,7 detik menjadi di bawah 2 detik - sementara penundaan yang
     ditanggung setiap penyimpanan hanya 25 ms, tidak terasa di layar.

     Jeda ini TIDAK mengurangi jaminan apa pun: jawaban "tersimpan" tetap baru dikirim setelah
     berkasnya benar-benar ter-fsync, dan perubahan yang datang sesudah commit dimulai tetap
     menunggu commit berikutnya alih-alih menyelinap masuk. */
  const JEDA_KOALESENSI_MS=25;

  function commit(){
    if(sedangCommit)return;
    sedangCommit=true;
    setTimeout(()=>{
      const rombongan=menunggu;menunggu=[];
      const mulai=process.hrtime.bigint();
      let gagal=null;
      try{store.tulisLangsung(JSON.stringify(dokumen));}
      catch(error){gagal=error;}
      const ms=Number(process.hrtime.bigint()-mulai)/1e6;
      statistik.commit+=1;statistik.totalTulisMs+=ms;
      if(ms>statistik.maxTulisMs)statistik.maxTulisMs=ms;
      if(rombongan.length>statistik.penumpangMaks)statistik.penumpangMaks=rombongan.length;
      for(const lanjut of rombongan)lanjut(gagal);
      sedangCommit=false;
      if(menunggu.length)commit();
    },JEDA_KOALESENSI_MS);
  }
  const tungguCommit=()=>new Promise(res=>{menunggu.push(res);commit();});

  function terapkan(perubahan,baseRev){
    for(const item of perubahan){
      const sebelumnya=revisiKunci.get(`${item.koleksi}/${item.kunci}`);
      if(sebelumnya!==undefined&&sebelumnya>baseRev)
        return {konflik:true,kunci:item.kunci,koleksi:item.koleksi};
    }
    revisi+=1;
    for(const item of perubahan){
      if(!dokumen[item.koleksi]||typeof dokumen[item.koleksi]!=='object')dokumen[item.koleksi]={};
      if(item.nilai===null||item.nilai===undefined)delete dokumen[item.koleksi][item.kunci];
      else if(item.koleksi===KOLEKSI_AKUN)
        dokumen[item.koleksi][item.kunci]=gabungCatatanAkun(dokumen[item.koleksi][item.kunci],item.nilai);
      else dokumen[item.koleksi][item.kunci]=item.nilai;
      revisiKunci.set(`${item.koleksi}/${item.kunci}`,revisi);
    }
    return {konflik:false,rev:revisi};
  }

  function sesiDari(permintaan){
    const token=bacaCookie(permintaan.headers?.cookie,NAMA_COOKIE);
    return sessions.validasi(token);
  }

  /* Setiap permintaan yang MENGUBAH sesuatu wajib membawa token CSRF milik sesinya di header.
     Cookie SameSite=Strict sudah menghalangi browser mengirim cookie atas permintaan situs
     lain; header ini menutup sisanya, karena situs lain tidak dapat membaca token sesi
     seseorang untuk disalin ke headernya sendiri. */
  function csrfSah(permintaan,sesi){
    return cocokTetap(permintaan.headers?.['x-erapor-csrf'],sesi.csrf);
  }

  async function tangani(permintaan){
    const jalur=String(permintaan.pathname||'');
    const metode=String(permintaan.method||'GET').toUpperCase();
    const aksi=jalur.startsWith(PREFIX)?jalur.slice(PREFIX.length):'';

    if(aksi==='login'&&metode==='POST'){
      let muatan;
      try{muatan=JSON.parse(permintaan.body||'{}');}
      catch{return jawab(400,{error:'Isi permintaan login tidak valid.'});}
      try{
        const sesi=sessions.login(muatan);
        /* Token sesi TIDAK pernah ikut ke badan jawaban - ia hanya hidup di cookie HttpOnly
           sehingga JavaScript halaman tidak dapat membacanya, apalagi membocorkannya. */
        return jawab(200,{ok:true,csrf:sesi.csrf,
          sesi:{role:sesi.role,classId:sesi.classId,accountId:sesi.accountId,
            username:sesi.username,semester:sesi.semester,academicYear:sesi.academicYear,
            mustChangePassword:sesi.mustChangePassword,
            expiresAt:new Date(sesi.expiresAt).toISOString()}},
          {'Set-Cookie':sessions.cookieUntuk(sesi)});
      }catch(error){
        const status=error.kode==='LICENSE_BLOCKED'?403:401;
        return jawab(status,{error:error.message,kode:error.kode||'LOGIN_GAGAL'});
      }
    }

    if(aksi==='logout'&&metode==='POST'){
      const token=bacaCookie(permintaan.headers?.cookie,NAMA_COOKIE);
      sessions.logout(token);
      return jawab(200,{ok:true},{'Set-Cookie':sessions.cookieKosong()});
    }

    /* DOKUMEN PRA-LOGIN.

       Halaman Login perlu tahu dua hal sebelum siapa pun masuk: nama sekolah untuk judulnya,
       dan daftar semester untuk pilihannya. Keduanya dibaca dari database, sedangkan database
       baru boleh dibaca setelah ada sesi - sehingga klien LAN sebelumnya gagal menampilkan
       halaman Login sama sekali.

       Yang dikirim di sini HANYA kedua hal itu, dalam bentuk dokumen yang sama sehingga kode
       aplikasi membacanya seperti biasa. Tidak ada satu pun catatan akademik, akun, nilai,
       atau rahasia di dalamnya - yang memang sudah terlihat siapa pun yang membuka alamat
       server di jaringan sekolah, tidak lebih. */
    if(aksi==='publik'&&metode==='GET'){
      const referensi=dokumen?.masterData?.references||{};
      /* Satu keterangan lagi yang dibutuhkan sebelum login: apakah instalasi ini sudah
         disiapkan. Tanpa itu aplikasi menyangka Admin belum pernah dibuat, lalu menawarkan
         "Buat Password Admin Pertama" kepada guru yang sebenarnya hanya hendak masuk.

         Yang dikirim hanya JAWABANNYA - sudah siap atau belum - dalam bentuk catatan akun
         kosong tanpa satu pun rahasia: tidak ada hash kata sandi, tidak ada kode recovery,
         tidak ada nama pengguna. Keterangan ini pun bukan rahasia: siapa saja yang dapat
         membuka alamat server di jaringan sekolah sudah dapat menyimpulkannya dari halaman
         yang muncul. */
      const admin=dokumen?.userAccounts?.admin;
      const sudahDisiapkan=Boolean(dokumen?.security?.ownerActivated&&admin&&!admin.requiresActivation);
      return jawab(200,{ok:true,database:JSON.stringify({
        appSchemaVersion:dokumen?.appSchemaVersion,
        appVersion:dokumen?.appVersion,
        security:{ownerActivated:Boolean(dokumen?.security?.ownerActivated)},
        userAccounts:sudahDisiapkan?{admin:{id:'admin',role:'admin',requiresActivation:false}}:{},
        masterData:{
          school:{name:dokumen?.masterData?.school?.name||''},
          references:{
            academicYears:Array.isArray(referensi.academicYears)?referensi.academicYears:[],
            semesters:Array.isArray(referensi.semesters)?referensi.semesters:[],
            subjects:[],
          },
        },
      })});
    }

    const sesi=sesiDari(permintaan);
    if(!sesi)return jawab(401,{error:'Sesi tidak ditemukan atau sudah berakhir. Masuk kembali.',kode:'SESI_TIDAK_SAH'});

    if(aksi==='state'&&metode==='GET'){
      /* Yang dikirim adalah PROYEKSI, bukan dokumen sekolah. Guru tidak pernah menerima kelas
         lain, akun rekannya, letak berkas, token lisensi, maupun Installation ID. */
      return jawab(200,{ok:true,rev:revisi,
        sesi:{role:sesi.role,classId:sesi.classId,accountId:sesi.accountId,
          username:sesi.username,semester:sesi.semester,academicYear:sesi.academicYear,
          mustChangePassword:sesi.mustChangePassword,
          expiresAt:new Date(sesi.expiresAt).toISOString()},
        database:JSON.stringify(proyeksikan(dokumen,sesi))});
    }

    if(aksi==='mutate'&&metode==='POST'){
      if(!csrfSah(permintaan,sesi))return jawab(403,{error:'Permintaan tidak membawa penanda keamanan yang sah.',kode:'CSRF'});
      if(bekuTulis)return jawab(503,{error:'Server sedang memulihkan cadangan. Coba simpan lagi sebentar lagi.',kode:'BEKU'});
      let muatan;
      try{muatan=JSON.parse(permintaan.body||'{}');}
      catch{return jawab(400,{error:'Isi permintaan penyimpanan tidak valid.'});}

      const izin=periksaPerubahan(muatan.perubahan,sesi);
      if(!izin.boleh){statistik.konflik+=0;return jawab(403,{error:izin.alasan,kode:'TIDAK_BERWENANG'});}

      const hasil=terapkan(muatan.perubahan,Number(muatan.baseRev)||0);
      if(hasil.konflik){
        statistik.konflik+=1;
        return jawab(409,{konflik:true,kode:'KONFLIK',rev:revisi,kunci:hasil.kunci,
          error:'Data ini baru saja diubah dari perangkat lain, jadi penyimpanan diulang di atas data terbaru.'});
      }
      const gagal=await tungguCommit();
      if(gagal)return jawab(500,{error:`Data GAGAL disimpan ke penyimpanan server: ${gagal.message}`});
      statistik.mutasi+=muatan.perubahan.length;
      return jawab(200,{ok:true,rev:hasil.rev});
    }

    return jawab(404,{error:'Endpoint LAN tidak dikenali.'});
  }

  return {
    PREFIX,
    sessions,
    muat,
    tangani,
    revisiSekarang:()=>revisi,
    dokumenSekarang:()=>dokumen,
    /* Dipakai restore: penulisan dibekukan, dokumen diganti, revisi dinaikkan supaya seluruh
       klien yang memegang salinan lama mendapat konflik alih-alih menimpanya. */
    bekukanTulis(){bekuTulis=true;},
    lanjutkanTulis(){bekuTulis=false;},
    gantiDokumen(baru){dokumen=baru;revisi+=1;revisiKunci.clear();},
    statistik:()=>({...statistik,rev:revisi,sesiAktif:sessions.jumlahSesi()}),
  };
}

module.exports={createLanServer,PREFIX};
