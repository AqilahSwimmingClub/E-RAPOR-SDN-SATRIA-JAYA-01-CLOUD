'use strict';

/* PROYEKSI DAN OTORISASI PER CAKUPAN.

   MASALAH YANG DISELESAIKAN DI SINI. Seluruh aplikasi e-Rapor membaca database sebagai satu
   dokumen utuh secara synchronous di 178 tempat. Kalau dokumen itu dikirim apa adanya ke
   laptop setiap guru, maka guru kelas 5B memegang salinan lengkap nilai seluruh sekolah -
   termasuk kelas yang bukan urusannya dan hash kata sandi rekan-rekannya - dan menyembunyikan
   kelas lain lewat tampilan tidak mengubah kenyataan itu sedikit pun.

   Jalan keluarnya BUKAN menulis ulang 178 tempat itu, melainkan mengubah apa yang disebut
   "seluruh dokumen" bagi setiap pengguna. Server menyusun PROYEKSI: dokumen dengan bentuk yang
   sama persis - koleksi yang sama, bentuk kunci yang sama - tetapi hanya berisi catatan yang
   memang menjadi hak pengguna itu. Kode akademik berjalan tanpa perubahan karena ia memang
   tidak pernah membaca kunci di luar cakupannya sendiri.

   DASAR PENYARINGANNYA ADALAH BENTUK KUNCI, BUKAN DAFTAR KOLEKSI YANG DITULIS TANGAN. Seluruh
   catatan bercakupan pada aplikasi ini berkunci `${tahun}|${semester}|${kelas}|...`, sehingga
   satu aturan yang sama berlaku untuk students, assessmentScores, attendance, reportScores,
   dan seterusnya - termasuk koleksi yang ditambahkan di kemudian hari. Daftar yang ditulis
   tangan akan lupa diperbarui; bentuk kunci tidak.

   DUA ATURAN YANG SENGAJA BERBEDA KETATNYA:

   - MEMBACA. Guru menerima catatan kelasnya sendiri DITAMBAH catatan bersama yang memang
     dibutuhkan untuk bekerja: identitas sekolah, daftar mapel, tahun pelajaran, tanggal rapor.
     Catatan milik kelas LAIN tidak pernah ikut.
   - MENULIS. Guru hanya boleh menulis catatan yang berada di dalam cakupannya sendiri. Bahkan
     catatan bersama yang boleh ia BACA tidak boleh ia UBAH; itu wewenang Admin.

   ADMIN tetap seperti sebelumnya. Menu Admin - Leger, Status Rombel, Transkrip, Cetak - memang
   bekerja lintas kelas, jadi membatasinya akan merusak fungsi yang sudah dipakai sekolah.
   Yang tetap tertutup bagi siapa pun, termasuk Admin, adalah berkas mentah database: endpoint
   berkas mentah hanya melayani komputer server itu sendiri. */

const KELAS_SAH=[];
for(const tingkat of [1,2,3,4,5,6])for(const huruf of ['A','B','C','D'])KELAS_SAH.push(`${tingkat}${huruf}`);
const SET_KELAS=new Set(KELAS_SAH);

/* Koleksi yang memuat rahasia akun. Keduanya tidak pernah dikirim utuh kepada Guru. */
const KOLEKSI_AKUN='userAccounts';

function cakupanDariKunci(kunci){
  /* Kunci bercakupan selalu `tahun|semester|kelas|sisa`. Kunci yang dua bagian pertamanya ada
     tetapi bagian ketiganya bukan nama kelas - misalnya `2025/2026|Ganjil 2025/2026` milik
     tanggal rapor - BUKAN milik kelas mana pun, jadi ia catatan bersama. */
  const bagian=String(kunci).split('|');
  if(bagian.length<3)return null;
  return SET_KELAS.has(bagian[2])?`${bagian[0]}|${bagian[1]}|${bagian[2]}`:null;
}

function awalanCakupan(session){
  return `${session.academicYear}|${session.semester}|${session.classId}`;
}

/* Satu-satunya tempat yang memutuskan "kunci ini milik cakupan itu". */
function kunciDalamCakupan(kunci,awalan){
  const teks=String(kunci);
  return teks===awalan||teks.startsWith(`${awalan}|`);
}

/* ------------------------------------------------------------------ PROYEKSI (MEMBACA) */

function akunUntukGuru(semua,accountId){
  /* Guru menerima catatan akunnya SENDIRI saja. Catatan itu memang masih membawa hash kata
     sandinya sendiri, dan itu disengaja: halaman Ganti Password existing memverifikasi kata
     sandi lama dari catatan ini. Mengetahui hash kata sandi sendiri bukan peningkatan hak -
     yang bersangkutan sudah tahu kata sandinya. Yang tidak pernah ia terima adalah catatan
     akun orang lain. */
  const milik=semua?.[accountId];
  return milik?{[accountId]:milik}:{};
}

function proyeksikan(doc,session){
  if(!doc||typeof doc!=='object')return {};
  if(session.role==='admin')return doc;

  const awalan=awalanCakupan(session);
  const hasil={};
  for(const [koleksi,isi] of Object.entries(doc)){
    if(koleksi===KOLEKSI_AKUN){hasil[koleksi]=akunUntukGuru(isi,session.accountId);continue;}
    /* Nilai non-objek (appVersion, appSchemaVersion, createdAt) dan array (backupHistory)
       diteruskan apa adanya: tidak ada kunci bercakupan di dalamnya. */
    if(!isi||typeof isi!=='object'||Array.isArray(isi)){hasil[koleksi]=isi;continue;}
    const saring={};
    for(const [kunci,nilai] of Object.entries(isi)){
      const cakupan=cakupanDariKunci(kunci);
      /* Tidak bercakupan = catatan bersama, boleh dibaca. Bercakupan = hanya miliknya sendiri. */
      if(cakupan===null||cakupan===awalan)saring[kunci]=nilai;
    }
    hasil[koleksi]=saring;
  }
  return hasil;
}

/* ------------------------------------------------------------------ OTORISASI (MENULIS) */

/* Setiap perubahan diperiksa satu per satu. Satu perubahan yang tidak sah membatalkan SELURUH
   permintaan, bukan hanya perubahan itu: menerima sebagian membuat guru menyimpan sesuatu yang
   separuhnya diam-diam tidak tersimpan. */
function periksaPerubahan(perubahan,session){
  if(!Array.isArray(perubahan)||!perubahan.length)
    return {boleh:false,alasan:'Tidak ada perubahan yang dikirim.'};

  if(session.role==='admin'){
    for(const item of perubahan){
      if(!item||typeof item.koleksi!=='string'||typeof item.kunci!=='string')
        return {boleh:false,alasan:'Bentuk perubahan tidak dikenali.'};
    }
    return {boleh:true};
  }

  if(session.role!=='teacher'||!SET_KELAS.has(session.classId))
    return {boleh:false,alasan:'Peran atau rombel pada sesi ini tidak sah.'};

  const awalan=awalanCakupan(session);
  for(const item of perubahan){
    if(!item||typeof item.koleksi!=='string'||typeof item.kunci!=='string')
      return {boleh:false,alasan:'Bentuk perubahan tidak dikenali.'};

    if(item.koleksi===KOLEKSI_AKUN){
      /* Guru hanya boleh mengubah akunnya sendiri - itulah jalur Ganti Password. Menulis akun
         orang lain berarti mengganti kata sandi rekannya. */
      if(item.kunci!==session.accountId)
        return {boleh:false,alasan:'Akun pengguna lain tidak dapat diubah dari sesi Guru.'};
      continue;
    }

    const cakupan=cakupanDariKunci(item.kunci);
    if(cakupan===null)
      return {boleh:false,alasan:`Data bersama sekolah hanya dapat diubah Admin: ${item.koleksi}.`};
    if(cakupan!==awalan){
      /* Cakupan terdiri dari tahun, semester, DAN rombel. Menyebut "rombel" untuk setiap
         penolakan menyesatkan guru yang sebenarnya salah semester: ia melihat namanya sendiri
         pada pesan dan mengira aplikasi rusak. Sebut bagian yang benar-benar berbeda. */
      const milikKunci=cakupan.split('|');
      if(milikKunci[2]!==session.classId)
        return {boleh:false,alasan:`Sesi ini hanya berwenang atas rombel ${session.classId}.`};
      return {boleh:false,alasan:`Sesi ini masuk pada ${session.semester}, sehingga data ${milikKunci[1]} tidak dapat diubah. Keluar lalu masuk kembali pada semester tersebut.`};
    }
  }
  return {boleh:true};
}

/* Catatan akun tidak boleh kehilangan rahasianya hanya karena klien mengirim salinan yang
   sudah disaring. Halaman Admin menulis ulang catatan Guru dengan sebaran objek
   (`{...catatanLama, active:true}`); kalau salinan di klien tidak membawa passwordHash, hasil
   sebarannya akan MENGHAPUS kata sandi guru tersebut. Karena itu nilai lama dipertahankan
   ketika yang masuk tidak menyebutkannya. */
function gabungCatatanAkun(lama,baru){
  if(!baru||typeof baru!=='object')return baru;
  const hasil={...baru};
  for(const medan of ['passwordHash','recoveryHash']){
    const masuk=hasil[medan];
    if((masuk===undefined||masuk===null)&&lama&&lama[medan]!==undefined&&lama[medan]!==null)
      hasil[medan]=lama[medan];
  }
  return hasil;
}

module.exports={proyeksikan,periksaPerubahan,cakupanDariKunci,kunciDalamCakupan,
  awalanCakupan,gabungCatatanAkun,KELAS_SAH,KOLEKSI_AKUN};
