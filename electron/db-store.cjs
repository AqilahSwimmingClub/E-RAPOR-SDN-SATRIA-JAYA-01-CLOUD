/* PENYIMPANAN AKADEMIK MILIK APLIKASI (WINDOWS, FASE 1).

   SEBELUM RILIS INI seluruh database sekolah tinggal di localStorage browser. Letak itu
   bukan milik aplikasi melainkan milik profil browser, dan akibatnya nyata: berganti dari
   Chrome ke Edge membuat data seolah hilang, membersihkan data situs menghapusnya, dan
   kuota localStorage (~5 MB) sudah ditolak jauh sebelum satu sekolah penuh tertampung.

   Berkas ini memindahkan kepemilikan itu ke aplikasi: satu berkas JSON di %APPDATA% yang
   ditulis, dicadangkan, dan diverifikasi oleh proses utama Electron.

   TIGA JAMINAN YANG DIKERJAKAN DI SINI:

   1. TULISAN TIDAK PERNAH SETENGAH JADI. Isi baru ditulis ke berkas sementara, di-fsync ke
      piringan, baru di-rename ke nama sebenarnya. Rename pada NTFS bersifat atomik, sehingga
      mati listrik di tengah penyimpanan meninggalkan berkas LAMA yang utuh - bukan berkas
      baru yang terpotong. Direktorinya ikut di-fsync supaya rename itu sendiri tahan mati
      listrik.

   2. SELALU ADA SATU GENERASI MUNDUR. Isi lama disalin ke .bak sebelum ditimpa. Kalau berkas
      utama ternyata tidak dapat dibaca, .bak yang dipakai.

   3. PENULIS BERSAMAAN TIDAK SALING MENIMPA DIAM-DIAM. Setiap penulisan menyebut revisi yang
      menjadi dasarnya. Revisi adalah SHA-256 dari isi yang sekarang tersimpan, jadi ia tidak
      perlu disimpan terpisah dan tidak bisa melenceng dari datanya. Bila revisi sudah
      berpindah - misalnya guru membuka dua tab - penulisan DITOLAK beserta isi terbarunya,
      bukan diterima lalu menghapus pekerjaan tab sebelah.

   YANG SENGAJA TIDAK ADA DI SINI: lisensi, Installation ID, dan aktivasi perangkat. Ketiganya
   tetap pada penyimpanannya sendiri. Database akademik dapat disalin, dicadangkan, dan
   dipulihkan antar komputer; identitas berlisensi tidak boleh ikut berpindah bersamanya. */

const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

const NAMA_BERKAS='erapor-db.json';
const NAMA_CADANGAN='erapor-db.json.bak';
const NAMA_STATE='migration-state.json';

/* Revisi = sidik isi. Berkas kosong/absen memakai string kosong sehingga klien dapat
   membedakan "belum ada database" dari "ada database yang kebetulan bernilai apa pun". */
const revisiDari=raw=>raw?createHash('sha256').update(raw).digest('hex'):'';

function createDbStore({baseDir,fsImpl=fs}={}){
  if(!baseDir)throw new Error('baseDir penyimpanan database wajib diisi.');
  const dataDir=path.join(baseDir,'data');
  const backupDir=path.join(baseDir,'backup');
  const berkas=path.join(dataDir,NAMA_BERKAS);
  const cadangan=path.join(dataDir,NAMA_CADANGAN);
  const berkasState=path.join(dataDir,NAMA_STATE);

  const pastikanFolder=dir=>fsImpl.mkdirSync(dir,{recursive:true});

  function fsyncFolder(dir){
    /* fsync direktori membuat rename-nya sendiri tahan mati listrik. Pada Windows pemanggilan
       ini tidak didukung dan melempar EPERM/EISDIR; itu bukan kegagalan penyimpanan, jadi
       diabaikan - isi berkasnya sendiri sudah di-fsync di atas. */
    let fd=null;
    try{fd=fsImpl.openSync(dir,'r');fsImpl.fsyncSync(fd);}
    catch{/* tidak didukung platform: isi berkas tetap sudah dipaksa ke piringan */}
    finally{if(fd!==null)try{fsImpl.closeSync(fd);}catch{/* deskriptor memang dilepas */}}
  }

  function tulisAtomik(target,isi){
    pastikanFolder(path.dirname(target));
    /* Berkas sementara bertetangga dengan tujuannya supaya rename selalu berada dalam satu
       volume - rename lintas volume tidak atomik. */
    const sementara=`${target}.tmp`;
    const fd=fsImpl.openSync(sementara,'w');
    try{fsImpl.writeFileSync(fd,isi);fsImpl.fsyncSync(fd);}
    finally{fsImpl.closeSync(fd);}
    fsImpl.renameSync(sementara,target);
    fsyncFolder(path.dirname(target));
  }

  function bacaBerkas(target){
    try{
      const isi=fsImpl.readFileSync(target,'utf8');
      if(!isi.trim())return null;
      /* Isi yang tidak dapat di-parse dianggap TIDAK ADA, bukan dianggap kosong. Bedanya
         menentukan nasib data: "kosong" akan membuat aplikasi memulai database baru di
         atasnya, sedangkan "tidak ada" membuat pembacaan jatuh ke .bak. */
      JSON.parse(isi);
      return isi;
    }catch{return null;}
  }

  return {
    paths:{dataDir,backupDir,berkas,cadangan,berkasState},

    /* Pembacaan selalu mencoba berkas utama dulu, lalu .bak. Nilai balik menyebut dari mana
       isinya datang supaya aplikasi dapat memberi tahu guru bahwa yang terbaca adalah
       cadangan. */
    baca(){
      const utama=bacaBerkas(berkas);
      if(utama!==null)return {raw:utama,rev:revisiDari(utama),sumber:'utama'};
      const salinan=bacaBerkas(cadangan);
      if(salinan!==null)return {raw:salinan,rev:revisiDari(salinan),sumber:'cadangan'};
      return {raw:null,rev:'',sumber:'kosong'};
    },

    /* Penulisan bersyarat. `revisiDasar` adalah revisi yang dilihat klien saat ia mulai
       mengubah. Bila revisi tersimpan sudah lain, penulisan ditolak DAN isi terbarunya ikut
       dikembalikan sehingga klien dapat mengulang perubahannya di atas data terbaru. */
    tulis(raw,revisiDasar){
      if(typeof raw!=='string'||!raw.trim())throw new Error('Isi database kosong tidak pernah ditulis.');
      /* Isi yang bukan JSON tidak pernah menyentuh piringan. Penjaga ini membuat berkas milik
         aplikasi selalu dapat dibaca kembali. */
      JSON.parse(raw);
      const sekarang=this.baca();
      if(String(revisiDasar??'')!==sekarang.rev)
        return {ok:false,konflik:true,rev:sekarang.rev,raw:sekarang.raw};
      pastikanFolder(dataDir);
      /* Cadangan dibuat dari isi LAMA sebelum ditimpa, sehingga .bak selalu satu generasi di
         belakang dan tidak pernah berisi tulisan yang sedang berlangsung. */
      if(sekarang.raw!==null)tulisAtomik(cadangan,sekarang.raw);
      tulisAtomik(berkas,raw);
      /* Verifikasi baca-ulang: yang dilaporkan berhasil adalah yang benar-benar terbaca
         kembali dari piringan, bukan sekadar panggilan tulis yang tidak melempar. */
      const kembali=bacaBerkas(berkas);
      if(kembali!==raw)throw new Error('Database gagal diverifikasi setelah ditulis ke penyimpanan aplikasi.');
      return {ok:true,konflik:false,rev:revisiDari(raw)};
    },

    /* Cadangan pra-migrasi. Namanya memuat waktu sehingga tidak pernah menimpa cadangan
       sebelumnya: satu migrasi yang gagal lalu diulang meninggalkan dua berkas, bukan satu
       yang tertimpa. */
    simpanCadanganMigrasi(raw,waktu){
      if(typeof raw!=='string'||!raw.trim())throw new Error('Cadangan pra-migrasi kosong ditolak.');
      pastikanFolder(backupDir);
      const nama=`pre-migration-${String(waktu||new Date().toISOString()).replace(/[:.]/g,'-')}.json`;
      const target=path.join(backupDir,nama);
      const fd=fsImpl.openSync(target,'w');
      try{fsImpl.writeFileSync(fd,raw);fsImpl.fsyncSync(fd);}
      finally{fsImpl.closeSync(fd);}
      fsyncFolder(backupDir);
      const kembali=bacaBerkas(target);
      if(kembali!==raw)throw new Error('Cadangan pra-migrasi gagal diverifikasi.');
      return {path:target,nama,bytes:Buffer.byteLength(raw,'utf8')};
    },

    bacaState(){
      try{return JSON.parse(fsImpl.readFileSync(berkasState,'utf8'));}
      catch{return {status:'NOT_STARTED'};}
    },
    tulisState(state){
      pastikanFolder(dataDir);
      tulisAtomik(berkasState,JSON.stringify({...state,updatedAt:new Date().toISOString()},null,2));
      return state;
    },
  };
}

module.exports={createDbStore,revisiDari,NAMA_BERKAS,NAMA_CADANGAN};
