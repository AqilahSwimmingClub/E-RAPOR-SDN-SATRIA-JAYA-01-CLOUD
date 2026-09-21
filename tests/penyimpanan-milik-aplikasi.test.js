import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { APP_SCHEMA_VERSION } from '../src/data/version.js';
import { bacaRawServer, lupakanHidrasi, pasangTransportPenyimpanan, penyimpananServerAktif, statusPenyimpanan, tulisRawServer } from '../src/services/db-backend.js';
import { invalidateDbCache, loadDb, saveDb, storageKey, updateDb } from '../src/services/storage.js';

const require=createRequire(import.meta.url);
const {createDbStore,revisiDari}=require('../electron/db-store.cjs');

const root=new URL('../',import.meta.url);
const baca=berkas=>fs.readFileSync(new URL(berkas,root),'utf8');

/* Setiap test memakai folder %APPDATA% tiruannya sendiri sehingga tidak ada test yang
   mewarisi berkas milik test sebelumnya. */
function folderBaru(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'erapor-uji-'));
  test.after(()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{/* sudah bersih */}});
  return dir;
}
const tokoBaru=()=>createDbStore({baseDir:folderBaru()});

/* Database sungguhan dengan bentuk record yang dipakai aplikasi, bukan string acak. Kunci
   bercakupan, nilai penilaian, dan nilai rapor semuanya ikut supaya test kehilangan data
   benar-benar memeriksa nilai siswa, bukan sekadar panjang teks. */
function databaseSekolah(jumlah=40){
  const scope='2025/2026|Ganjil 2025/2026|2A';
  const db={appSchemaVersion:APP_SCHEMA_VERSION,students:{},assessmentScores:{},reportScores:{}};
  for(let i=0;i<jumlah;i+=1){
    db.students[`${scope}|s${i}`]={id:`s${i}`,nis:`100${i}`,nisn:`00100${i}`,name:`Siswa Nomor ${i}`,classId:'2A'};
    db.assessmentScores[`${scope}|agama|formative|s${i}`]={studentId:`s${i}`,subjectId:'agama',assessmentType:'formative',score:70+(i%30)};
    db.reportScores[`${scope}|agama|s${i}`]={studentId:`s${i}`,subjectId:'agama',finalScore:75+(i%20)};
  }
  return JSON.stringify(db);
}

/* Transport palsu yang MERUTEKAN ke store sungguhan. Dengan begitu yang diuji adalah
   perilaku klien dan penyimpanan yang sebenarnya dipakai di Windows - bukan tiruan keduanya
   yang bisa sama-sama salah tanpa ketahuan. */
function transportKeToko(toko,opsi={}){
  const jejak=[];
  const impl=({method,jalur,muatan})=>{
    jejak.push({method,jalur,token:opsi.token!==false});
    if(opsi.gagalkan&&opsi.gagalkan({method,jalur,muatan}))
      return {status:500,isi:{error:'piringan penuh'}};
    if(jalur==='/__erapor/db'&&method==='GET'){
      const isi=toko.baca();
      return {status:200,isi:{rev:isi.rev,database:isi.raw,sumber:isi.sumber,migrasi:toko.bacaState()}};
    }
    if(jalur==='/__erapor/db'&&method==='PUT'){
      try{
        const hasil=toko.tulis(String(muatan?.database||''),muatan?.baseRev??'');
        if(hasil.konflik)return {status:409,isi:{konflik:true,rev:hasil.rev,database:hasil.raw}};
        /* Piringan yang melaporkan berhasil tetapi menyimpan isi yang berbeda. Kegagalan
           seperti ini - sektor rusak, kabel longgar, penyimpanan jaringan yang memutus
           tulisan - tidak pernah melempar; satu-satunya yang dapat menemukannya adalah
           membaca ulang lalu membandingkan. */
        if(opsi.rusakkanSaatTulis)fs.writeFileSync(toko.paths.berkas,opsi.rusakkanSaatTulis);
        return {status:200,isi:{ok:true,rev:hasil.rev}};
      }catch(error){return {status:500,isi:{error:error.message}};}
    }
    if(jalur==='/__erapor/db/backup'&&method==='POST'){
      try{const hasil=toko.simpanCadanganMigrasi(String(muatan?.database||''),muatan?.waktu);
        return {status:200,isi:{ok:true,nama:hasil.nama,bytes:hasil.bytes}};
      }catch(error){return {status:500,isi:{error:error.message}};}
    }
    if(jalur==='/__erapor/db/state'&&method==='POST'){toko.tulisState(muatan||{});return {status:200,isi:{ok:true}};}
    return {status:405,isi:{error:'metode tidak didukung'}};
  };
  impl.jejak=jejak;
  return impl;
}

function localStorageMemori(awal={}){
  const nilai=new Map(Object.entries(awal));
  globalThis.localStorage={
    getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),
    removeItem:k=>nilai.delete(k),
    clear:()=>nilai.clear(),
  };
  return nilai;
}

function pakaiBackend(toko,opsi={}){
  const transport=transportKeToko(toko,opsi);
  pasangTransportPenyimpanan(transport);
  invalidateDbCache();
  test.after(()=>{pasangTransportPenyimpanan(null);invalidateDbCache();});
  return transport;
}

/* ======================================================= A. PENYIMPANAN MILIK APLIKASI */

test('A1. Database yang ditulis terbaca kembali persis sama',()=>{
  const toko=tokoBaru();const isi=databaseSekolah();
  const hasil=toko.tulis(isi,'');
  assert.equal(hasil.ok,true);
  const kembali=toko.baca();
  assert.equal(kembali.raw,isi,'isi yang terbaca harus identik karakter per karakter');
  assert.equal(kembali.sumber,'utama');
  assert.equal(kembali.rev,revisiDari(isi));
});

test('A2. Penulisan tidak meninggalkan berkas sementara',()=>{
  const toko=tokoBaru();
  toko.tulis(databaseSekolah(),'');
  toko.tulis(databaseSekolah(50),toko.baca().rev);
  const berkas=fs.readdirSync(toko.paths.dataDir);
  assert.equal(berkas.some(nama=>nama.endsWith('.tmp')),false,`berkas sementara tertinggal: ${berkas.join(', ')}`);
});

test('A3. Cadangan berisi generasi sebelumnya, bukan yang sedang ditulis',()=>{
  const toko=tokoBaru();
  const pertama=databaseSekolah(10);const kedua=databaseSekolah(20);
  toko.tulis(pertama,'');
  toko.tulis(kedua,revisiDari(pertama));
  assert.equal(fs.readFileSync(toko.paths.berkas,'utf8'),kedua,'berkas utama berisi yang terbaru');
  assert.equal(fs.readFileSync(toko.paths.cadangan,'utf8'),pertama,'cadangan berisi satu generasi sebelumnya');
});

test('A4. Berkas utama rusak: data diambil dari cadangan, bukan dianggap hilang',()=>{
  const toko=tokoBaru();
  const asli=databaseSekolah(12);
  toko.tulis(asli,'');
  toko.tulis(databaseSekolah(13),revisiDari(asli));
  /* Mati listrik di tengah penulisan generasi berikutnya ditiru dengan berkas terpotong. */
  fs.writeFileSync(toko.paths.berkas,'{"students":{"a":');
  const hasil=toko.baca();
  assert.equal(hasil.sumber,'cadangan','pembacaan jatuh ke cadangan');
  assert.equal(hasil.raw,asli,'isi cadangan utuh');
  assert.equal(JSON.parse(hasil.raw).students['2025/2026|Ganjil 2025/2026|2A|s5'].name,'Siswa Nomor 5');
});

test('A5. Berkas utama dan cadangan sama-sama rusak: dilaporkan kosong, tidak mengarang data',()=>{
  const toko=tokoBaru();
  toko.tulis(databaseSekolah(),'');
  toko.tulis(databaseSekolah(5),toko.baca().rev);
  fs.writeFileSync(toko.paths.berkas,'rusak');
  fs.writeFileSync(toko.paths.cadangan,'rusak juga');
  const hasil=toko.baca();
  assert.equal(hasil.raw,null,'tidak ada isi yang dikarang');
  assert.equal(hasil.sumber,'kosong');
  assert.equal(hasil.rev,'');
});

test('A6. Penulisan dengan revisi basi DITOLAK dan tidak mengubah berkas',()=>{
  const toko=tokoBaru();
  const asli=databaseSekolah(8);
  toko.tulis(asli,'');
  const revAsli=revisiDari(asli);
  toko.tulis(databaseSekolah(9),revAsli);
  const sesudah=fs.readFileSync(toko.paths.berkas,'utf8');
  /* Penulis kedua masih memegang revisi lama - persis keadaan dua tab browser. */
  const hasil=toko.tulis(databaseSekolah(99),revAsli);
  assert.equal(hasil.ok,false);
  assert.equal(hasil.konflik,true);
  assert.equal(fs.readFileSync(toko.paths.berkas,'utf8'),sesudah,'berkas TIDAK berubah oleh penulisan yang ditolak');
});

test('A7. Penolakan revisi mengirimkan isi terbaru supaya perubahan dapat diulang di atasnya',()=>{
  const toko=tokoBaru();
  const asli=databaseSekolah(4);const baru=databaseSekolah(6);
  toko.tulis(asli,'');
  toko.tulis(baru,revisiDari(asli));
  const hasil=toko.tulis(databaseSekolah(7),revisiDari(asli));
  assert.equal(hasil.raw,baru,'isi terbaru ikut dikembalikan');
  assert.equal(hasil.rev,revisiDari(baru));
});

test('A8. Isi yang bukan JSON tidak pernah menyentuh piringan',()=>{
  const toko=tokoBaru();
  const asli=databaseSekolah(3);
  toko.tulis(asli,'');
  assert.throws(()=>toko.tulis('{bukan json',revisiDari(asli)));
  assert.equal(fs.readFileSync(toko.paths.berkas,'utf8'),asli,'berkas lama tetap utuh');
});

test('A9. Isi kosong ditolak sehingga database tidak pernah terhapus oleh penulisan kosong',()=>{
  const toko=tokoBaru();
  const asli=databaseSekolah(3);
  toko.tulis(asli,'');
  for(const kosong of ['','   ',null,undefined])
    assert.throws(()=>toko.tulis(kosong,revisiDari(asli)),/kosong/i);
  assert.equal(toko.baca().raw,asli);
});

test('A10. Cadangan pra-migrasi ditulis, diverifikasi, dan tidak menimpa cadangan sebelumnya',()=>{
  const toko=tokoBaru();
  const isi=databaseSekolah(15);
  const satu=toko.simpanCadanganMigrasi(isi,'2026-09-21T10:00:00.000Z');
  const dua=toko.simpanCadanganMigrasi(isi,'2026-09-21T11:00:00.000Z');
  assert.notEqual(satu.nama,dua.nama,'nama cadangan memuat waktu sehingga tidak bertabrakan');
  assert.equal(fs.readFileSync(satu.path,'utf8'),isi);
  assert.equal(fs.readFileSync(dua.path,'utf8'),isi);
  assert.equal(fs.readdirSync(toko.paths.backupDir).length,2,'kedua cadangan tetap ada');
});

test('A11. Status migrasi tersimpan dan terbaca kembali',()=>{
  const toko=tokoBaru();
  assert.equal(toko.bacaState().status,'NOT_STARTED','tanpa berkas status dianggap belum mulai');
  toko.tulisState({status:'COMPLETED',cadangan:'pre-migration-x.json'});
  assert.equal(toko.bacaState().status,'COMPLETED');
  assert.equal(toko.bacaState().cadangan,'pre-migration-x.json');
});

test('A12. Revisi adalah sidik isi sehingga tidak dapat melenceng dari datanya',()=>{
  const a=databaseSekolah(5);const b=databaseSekolah(6);
  assert.equal(revisiDari(a),revisiDari(a),'isi sama selalu memberi revisi sama');
  assert.notEqual(revisiDari(a),revisiDari(b),'isi berbeda memberi revisi berbeda');
  assert.equal(revisiDari(''),'','tidak ada database berarti tidak ada revisi');
});

/* ================================================== B. BACKEND HALAMAN DAN MIGRASI */

test('B1. Tanpa penanda launcher, penyimpanan server TIDAK aktif (Android dan web tidak berubah)',()=>{
  pasangTransportPenyimpanan(null);
  assert.equal(penyimpananServerAktif(),false);
  assert.deepEqual(statusPenyimpanan(storageKey()),{aktif:false,sumber:'browser'});
});

test('B2. Data lama di browser dipindahkan: dicadangkan dulu, ditulis, lalu diverifikasi',()=>{
  const toko=tokoBaru();
  const lama=databaseSekolah(30);
  localStorageMemori({[storageKey()]:lama});
  const transport=pakaiBackend(toko);
  const terbaca=bacaRawServer(storageKey());
  assert.equal(terbaca,lama,'data yang dipakai aplikasi sama persis dengan data lama');
  assert.equal(toko.baca().raw,lama,'berkas milik aplikasi berisi data lama');
  assert.equal(toko.bacaState().status,'COMPLETED');
  const urutan=transport.jejak.map(item=>`${item.method} ${item.jalur}`);
  assert.ok(urutan.indexOf('POST /__erapor/db/backup')<urutan.indexOf('PUT /__erapor/db'),
    'cadangan WAJIB dibuat sebelum data ditulis ke penyimpanan aplikasi');
  assert.equal(fs.readdirSync(toko.paths.backupDir).length,1,'ada tepat satu cadangan pra-migrasi');
});

test('B3. Migrasi TIDAK menghapus dan TIDAK mengubah data lama di browser',()=>{
  const toko=tokoBaru();
  const lama=databaseSekolah(20);
  const nilai=localStorageMemori({[storageKey()]:lama});
  pakaiBackend(toko);
  bacaRawServer(storageKey());
  assert.equal(nilai.get(storageKey()),lama,'data lama tetap utuh sebagai jalur pemulihan terakhir');
  /* Penyimpanan berikutnya pun tidak boleh menyentuhnya. */
  tulisRawServer(storageKey(),databaseSekolah(21));
  assert.equal(nilai.get(storageKey()),lama,'penyimpanan baru tidak menulis balik ke browser');
});

test('B4. Cadangan gagal: migrasi DIBATALKAN dan data lama dibiarkan utuh',()=>{
  const toko=tokoBaru();
  const lama=databaseSekolah(18);
  const nilai=localStorageMemori({[storageKey()]:lama});
  pakaiBackend(toko,{gagalkan:({jalur})=>jalur==='/__erapor/db/backup'});
  assert.throws(()=>bacaRawServer(storageKey()),/tidak dapat dicadangkan|dibatalkan/i);
  assert.equal(toko.baca().raw,null,'tidak ada apa pun yang ditulis ke penyimpanan aplikasi');
  assert.equal(nilai.get(storageKey()),lama,'data lama utuh');
  assert.equal(toko.bacaState().status,'FAILED');
  assert.equal(toko.bacaState().langkah,'BACKUP');
});

test('B5. Penulisan migrasi gagal: dilaporkan GAGAL, cadangan dan data lama tetap ada',()=>{
  const toko=tokoBaru();
  const lama=databaseSekolah(14);
  const nilai=localStorageMemori({[storageKey()]:lama});
  pakaiBackend(toko,{gagalkan:({method,jalur})=>method==='PUT'&&jalur==='/__erapor/db'});
  assert.throws(()=>bacaRawServer(storageKey()),/gagal dipindahkan/i);
  assert.equal(nilai.get(storageKey()),lama);
  assert.equal(fs.readdirSync(toko.paths.backupDir).length,1,'cadangan pra-migrasi tetap tersimpan');
  assert.equal(toko.bacaState().status,'FAILED');
  assert.equal(toko.bacaState().langkah,'IMPORT');
});

test('B6. Penyimpanan aplikasi sudah berisi data: tidak ada migrasi, isi yang ada dipakai',()=>{
  const toko=tokoBaru();
  const diServer=databaseSekolah(25);
  toko.tulis(diServer,'');
  const lamaDiBrowser=databaseSekolah(3);
  localStorageMemori({[storageKey()]:lamaDiBrowser});
  const transport=pakaiBackend(toko);
  assert.equal(bacaRawServer(storageKey()),diServer,'isi penyimpanan aplikasi yang dipakai');
  assert.equal(transport.jejak.some(item=>item.jalur==='/__erapor/db/backup'),false,'tidak ada migrasi kedua');
  assert.equal(toko.baca().raw,diServer,'data lama browser TIDAK menimpa data aplikasi');
});

test('B7. Instalasi baru: tidak ada data di mana pun, tidak ada migrasi yang dijalankan',()=>{
  const toko=tokoBaru();
  localStorageMemori({});
  const transport=pakaiBackend(toko);
  assert.equal(bacaRawServer(storageKey()),null);
  assert.equal(transport.jejak.filter(item=>item.method!=='GET').length,0,'tidak ada penulisan apa pun');
  assert.equal(toko.bacaState().status,'NOT_STARTED');
});

test('B8. Berganti browser: browser baru langsung memakai data sekolah yang sudah ada',()=>{
  const toko=tokoBaru();
  const sekolah=databaseSekolah(22);
  toko.tulis(sekolah,'');
  /* Browser kedua punya localStorage kosong sendiri - inilah keadaan yang sebelumnya
     membuat data sekolah seolah hilang saat guru berpindah dari Chrome ke Edge. */
  localStorageMemori({});
  pakaiBackend(toko);
  assert.equal(bacaRawServer(storageKey()),sekolah,'data sekolah tetap terbaca di browser lain');
  assert.equal(statusPenyimpanan(storageKey()).terisi,true);
});

test('B9. Penyimpanan gagal MELEMPAR, tidak pernah diam-diam dianggap berhasil',()=>{
  const toko=tokoBaru();
  localStorageMemori({});
  pakaiBackend(toko,{gagalkan:({method})=>method==='PUT'});
  assert.throws(()=>tulisRawServer(storageKey(),databaseSekolah(5)),/GAGAL disimpan/);
});

test('B10. Setiap permintaan membawa token peluncuran',()=>{
  const toko=tokoBaru();
  localStorageMemori({[storageKey()]:databaseSekolah(5)});
  const transport=pakaiBackend(toko);
  bacaRawServer(storageKey());
  tulisRawServer(storageKey(),databaseSekolah(6));
  assert.ok(transport.jejak.length>=4);
  assert.equal(transport.jejak.every(item=>item.token),true,'tidak ada permintaan tanpa token');
});

test('B11. Lisensi dan Installation ID tidak pernah ikut ke penyimpanan akademik',()=>{
  const toko=tokoBaru();
  const nilai=localStorageMemori({
    [storageKey()]:databaseSekolah(10),
    erapor_license_v1:JSON.stringify({token:'RAHASIA-LISENSI'}),
    erapor_installation_v1:JSON.stringify({id:'RAHASIA-INSTALASI'}),
  });
  pakaiBackend(toko);
  bacaRawServer(storageKey());
  const tertulis=fs.readFileSync(toko.paths.berkas,'utf8');
  const cadangan=fs.readdirSync(toko.paths.backupDir).map(nama=>fs.readFileSync(path.join(toko.paths.backupDir,nama),'utf8')).join('');
  for(const rahasia of ['RAHASIA-LISENSI','RAHASIA-INSTALASI','erapor_license_v1','erapor_installation_v1']){
    assert.equal(tertulis.includes(rahasia),false,`${rahasia} tidak boleh masuk berkas database`);
    assert.equal(cadangan.includes(rahasia),false,`${rahasia} tidak boleh masuk cadangan`);
  }
  /* Keduanya tetap di tempatnya semula. */
  assert.ok(nilai.get('erapor_license_v1').includes('RAHASIA-LISENSI'));
  assert.ok(nilai.get('erapor_installation_v1').includes('RAHASIA-INSTALASI'));
});

test('B12. Piringan menyimpan isi berbeda diam-diam: migrasi dinyatakan GAGAL, bukan berhasil',()=>{
  const toko=tokoBaru();
  const lama=databaseSekolah(16);
  const rusak=JSON.stringify({students:{},assessmentScores:{},reportScores:{}});
  const nilai=localStorageMemori({[storageKey()]:lama});
  pakaiBackend(toko,{rusakkanSaatTulis:rusak});
  /* Penulisan melaporkan berhasil. Hanya pembacaan ulang yang dapat membongkarnya, dan
     tanpa pembacaan ulang itu aplikasi akan menyatakan seluruh nilai sekolah sudah pindah
     padahal berkasnya kosong. */
  assert.throws(()=>bacaRawServer(storageKey()),/tidak sama persis|GAGAL/i);
  assert.equal(toko.bacaState().status,'FAILED');
  assert.equal(toko.bacaState().langkah,'VERIFY');
  assert.equal(nilai.get(storageKey()),lama,'data lama di browser tetap utuh untuk diulang');
  assert.equal(fs.readdirSync(toko.paths.backupDir).length,1,'cadangan pra-migrasi tetap ada');
});

/* ============================================ C. KONTRAK SYNCHRONOUS DAN ZERO DATA LOSS */

test('C1. loadDb, saveDb, dan updateDb tetap synchronous - tidak ada Promise yang bocor',()=>{
  const toko=tokoBaru();
  localStorageMemori({});
  pakaiBackend(toko);
  const db=loadDb();
  assert.equal(db instanceof Promise,false);
  assert.equal(typeof db.students,'object');
  const disimpan=saveDb({...db,settings:{uji:1}});
  assert.equal(disimpan instanceof Promise,false);
  assert.equal(disimpan.settings.uji,1);
  const hasil=updateDb(draft=>{draft.settings.dua=2;return draft;});
  assert.equal(hasil instanceof Promise,false);
  assert.equal(loadDb().settings.dua,2);
});

test('C2. Nilai siswa yang disimpan lewat updateDb benar-benar ada di berkas milik aplikasi',()=>{
  const toko=tokoBaru();
  localStorageMemori({});
  pakaiBackend(toko);
  const scope='2025/2026|Ganjil 2025/2026|2A';
  updateDb(draft=>{
    draft.reportScores[`${scope}|agama|s1`]={studentId:'s1',subjectId:'agama',finalScore:88};
    return draft;
  });
  const diPiringan=JSON.parse(fs.readFileSync(toko.paths.berkas,'utf8'));
  assert.equal(diPiringan.reportScores[`${scope}|agama|s1`].finalScore,88,
    'nilai rapor benar-benar tertulis ke berkas, bukan hanya ke memori');
  invalidateDbCache();
  assert.equal(loadDb().reportScores[`${scope}|agama|s1`].finalScore,88);
});

test('C3. Penyimpanan yang gagal MELEMPAR sehingga pemanggil tidak pernah menampilkan "berhasil"',()=>{
  const toko=tokoBaru();
  localStorageMemori({});
  pakaiBackend(toko,{gagalkan:({method})=>method==='PUT'});
  /* Inilah pola yang dipakai seluruh halaman aplikasi. */
  let pesanBerhasil=null,pesanGagal=null;
  try{
    updateDb(draft=>{draft.reportScores.x={finalScore:90};return draft;});
    pesanBerhasil='Nilai berhasil disimpan.';
  }catch(error){pesanGagal=error.message;}
  assert.equal(pesanBerhasil,null,'tidak boleh ada pemberitahuan berhasil');
  assert.match(pesanGagal,/GAGAL disimpan/);
});

test('C4. Dua jendela menulis bersamaan: perubahan diulang di atas data terbaru, tidak ada yang hilang',()=>{
  const toko=tokoBaru();
  localStorageMemori({});
  pakaiBackend(toko);
  updateDb(draft=>{draft.settings.awal=true;return draft;});

  /* Jendela lain menulis tepat sebelum penyimpanan jendela ini selesai. Mutator di bawah
     menyentuh kunci yang BERBEDA, persis seperti dua guru mengisi mata pelajaran berbeda. */
  let sudahDisela=false;
  const hasil=updateDb(draft=>{
    if(!sudahDisela){
      sudahDisela=true;
      const luar=JSON.parse(toko.baca().raw);
      luar.reportScores.dariJendelaLain={finalScore:77};
      toko.tulis(JSON.stringify(luar),toko.baca().rev);
    }
    draft.reportScores.dariJendelaIni={finalScore:88};
    return draft;
  });
  assert.equal(sudahDisela,true,'penyelaan memang terjadi');
  assert.equal(hasil.reportScores.dariJendelaLain.finalScore,77,'pekerjaan jendela lain tidak terhapus');
  assert.equal(hasil.reportScores.dariJendelaIni.finalScore,88,'pekerjaan jendela ini tersimpan');
  const diPiringan=JSON.parse(fs.readFileSync(toko.paths.berkas,'utf8'));
  assert.equal(diPiringan.reportScores.dariJendelaLain.finalScore,77);
  assert.equal(diPiringan.reportScores.dariJendelaIni.finalScore,88);
});

test('C5. Konflik yang tidak kunjung reda dilaporkan, bukan diulang tanpa akhir',()=>{
  const toko=tokoBaru();
  localStorageMemori({});
  pakaiBackend(toko);
  updateDb(draft=>{draft.settings.awal=true;return draft;});
  let percobaan=0;
  assert.throws(()=>updateDb(draft=>{
    /* Setiap percobaan selalu kalah cepat oleh jendela lain. */
    percobaan+=1;
    const luar=JSON.parse(toko.baca().raw);
    luar.settings.putaran=percobaan;
    toko.tulis(JSON.stringify(luar),toko.baca().rev);
    draft.settings.milikSaya=percobaan;
    return draft;
  }),/berubah dari jendela lain/);
  assert.ok(percobaan<=4,`pengulangan dibatasi, tercatat ${percobaan} percobaan`);
});

test('C6. Saat penyimpanan aplikasi aktif, localStorage TIDAK pernah ditulisi',()=>{
  const toko=tokoBaru();
  const nilai=localStorageMemori({});
  pakaiBackend(toko);
  updateDb(draft=>{draft.reportScores.a={finalScore:91};return draft;});
  updateDb(draft=>{draft.reportScores.b={finalScore:92};return draft;});
  assert.equal(nilai.has(storageKey()),false,'tidak ada salinan kedua yang ikut berubah di browser');
  assert.equal(JSON.parse(fs.readFileSync(toko.paths.berkas,'utf8')).reportScores.b.finalScore,92);
});

test('C7. Tanpa penyimpanan aplikasi, perilaku localStorage lama tidak berubah sama sekali',()=>{
  pasangTransportPenyimpanan(null);
  const nilai=localStorageMemori({});
  invalidateDbCache();
  updateDb(draft=>{draft.reportScores.lama={finalScore:80};return draft;});
  assert.ok(nilai.has(storageKey()),'Android dan web tetap menulis ke localStorage');
  assert.equal(JSON.parse(nilai.get(storageKey())).reportScores.lama.finalScore,80);
});

test('C8. Seluruh nilai siswa selamat melewati migrasi, satu per satu',()=>{
  const toko=tokoBaru();
  const lama=databaseSekolah(60);
  localStorageMemori({[storageKey()]:lama});
  pakaiBackend(toko);
  invalidateDbCache();
  const sesudah=loadDb();
  const sebelum=JSON.parse(lama);
  assert.equal(Object.keys(sesudah.students).length,Object.keys(sebelum.students).length);
  for(const [kunci,catatan] of Object.entries(sebelum.reportScores))
    assert.equal(sesudah.reportScores[kunci].finalScore,catatan.finalScore,`nilai rapor ${kunci} berubah`);
  for(const [kunci,catatan] of Object.entries(sebelum.assessmentScores))
    assert.equal(sesudah.assessmentScores[kunci].score,catatan.score,`nilai penilaian ${kunci} berubah`);
  for(const [kunci,catatan] of Object.entries(sebelum.students))
    assert.equal(sesudah.students[kunci].name,catatan.name,`nama siswa ${kunci} berubah`);
});

/* ======================================================== D. KEAMANAN DAN BATAS RILIS */

test('D1. Endpoint penyimpanan tetap loopback dan tidak melonggarkan penjagaan yang ada',()=>{
  const t=baca('electron/main.cjs');
  assert.match(t,/const HOST='127\.0\.0\.1'/,'tetap bind loopback');
  assert.equal(/0\.0\.0\.0/.test(t),false,'tidak pernah membuka seluruh antarmuka jaringan');
  assert.match(t,/if\(host&&!\['127\.0\.0\.1','localhost','\[::1\]','::1'\]\.includes\(host\)\)/,'Host protection lama utuh');
  assert.match(t,/function layaniDatabase\(request,response,jalur\)\{[\s\S]*?\['127\.0\.0\.1','localhost','\[::1\]','::1'\]/,'endpuan database memeriksa host sendiri');
  assert.match(t,/if\(!tokenPermintaanCocok\(request\)\)/,'token peluncuran wajib');
  assert.equal(/Access-Control-Allow/.test(t),false,'tidak ada izin lintas-origin');
});

test('D2. Letak berkas database tidak pernah dikirim ke halaman',()=>{
  const t=baca('electron/main.cjs');
  const fungsi=t.slice(t.indexOf('function layaniDatabase'),t.indexOf('function handleRequest'));
  assert.equal(/paths\.|dbStore\.paths|userDataPath/.test(fungsi),false,'path %APPDATA% tidak ikut dikirim');
  assert.match(fungsi,/nama:hasil\.nama/,'hanya nama cadangan yang dikembalikan, bukan path lengkapnya');
  /* Berkas statis tetap terkurung di dalam dist sehingga folder data tidak dapat diminta. */
  assert.match(t,/return target\.startsWith\(distPath\)\?target:null/);
});

test('D3. Service worker tidak pernah menyentuh endpoint penyimpanan',()=>{
  const t=baca('sw.js');
  assert.match(t,/function isStorageEndpoint\(url\)\{return new URL\(url\)\.pathname\.startsWith\('\/__erapor\/'\);\}/);
  assert.match(t,/addEventListener\('fetch',event=>\{if\(isStorageEndpoint\(event\.request\.url\)\)return;/,
    'pengecualian diperiksa PALING AWAL, sebelum cabang cache mana pun');
  assert.equal(t.includes("'./src/services/db-backend.js'"),true,'berkas baru ikut app shell');
});

test('D4. Android tidak ikut dipindahkan pada rilis ini',()=>{
  const t=baca('src/services/storage.js');
  assert.match(t,/penyimpananServerAktif\(\)\?bacaRawServer\(DB_KEY\):localStorage\.getItem\(DB_KEY\)/,
    'tanpa penanda launcher, pembacaan tetap localStorage');
  const backend=baca('src/services/db-backend.js');
  assert.match(backend,/metaKonten\('erapor-desktop-db'\)!=='server'\)return false/,
    'penyimpanan server hanya aktif pada launcher Windows versi ini');
});

test('D5. Schema akademik TIDAK berubah pada rilis ini',()=>{
  /* Rilis ini memindahkan LETAK database, bukan bentuknya. Tidak ada koleksi baru, tidak ada
     kolom baru, dan tidak ada catatan lama yang ditulis ulang - berkas milik aplikasi berisi
     teks JSON yang sama persis dengan yang sebelumnya ada di localStorage. Menaikkan schema
     akan memicu migration yang tidak mengerjakan apa pun. */
  assert.equal(APP_SCHEMA_VERSION,5);
  const toko=tokoBaru();
  const lama=databaseSekolah(10);
  localStorageMemori({[storageKey()]:lama});
  pakaiBackend(toko);
  assert.equal(bacaRawServer(storageKey()),lama,'teks database tidak diubah sedikit pun oleh perpindahan');
});
