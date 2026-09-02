import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { compareVersions, isValidVersion, parseVersion } from '../src/data/version-compare.js';
import { isOfficialDownloadUrl, isSupportedPlatform, UPDATE_PLATFORMS,
  UPDATE_STATUS, UPDATE_STORAGE_KEY } from '../src/data/update-config.js';
import { APP_VERSION } from '../src/data/version.js';
import { CONTACT_WHATSAPP, PROMO_HIGHLIGHTS, PURCHASE_URL, SUPPORT_URL,
  whatsappUrl } from '../src/data/app-identity.js';
import { checkForUpdates, detectPlatform, getUpdateStatus, sanitizeUpdatePayload,
  shouldCheckNow, UPDATE_MESSAGES } from '../src/services/updates.js';
import { purchaseMessage } from '../src/pages/about-updates.js';
import { startTestServer, installBrowserEnv } from './helpers/license-server.js';

/* Tahap 9 — sistem pembaruan resmi, Tentang & Pembaruan, dan informasi pembelian lisensi.

   Dua batas yang dijaga sepanjang suite ini: pembaruan tidak pernah menyentuh lisensi maupun
   data akademik, dan tautan pembelian tidak pernah membawa data siswa. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const RILIS='https://github.com/AqilahSwimmingClub/E-RAPOR-SDN-SATRIA-JAYA-01-CLOUD/releases/download/v1.2.2/e-rapor.apk';

async function serverDenganVersi(daftar=[]){
  const s=await startTestServer();
  const token=await s.ownerToken();
  for(const entri of daftar){
    const {data,status}=await s.call('/owner/app-versions',{method:'POST',token,body:entri});
    assert.equal(status,200,`gagal menyimpan versi: ${JSON.stringify(data)}`);
    if(entri.publish!==false)
      await s.call(`/owner/app-versions/${data.version.id}/publish`,{method:'POST',token});
  }
  return {s,token};
}

/* ------------------------------------------------------------------ 3. Perbandingan versi */

test('1. Versi dibandingkan sebagai angka, bukan sebagai teks',()=>{
  assert.equal(compareVersions('1.2.1','1.2.2'),-1);
  assert.equal(compareVersions('1.2.9','1.3.0'),-1);
  assert.equal(compareVersions('1.9.9','2.0.0'),-1);
  assert.equal(compareVersions('1.10.0','1.9.9'),1,'perbandingan teks biasa akan keliru di sini');
  assert.equal(compareVersions('1.2.1','1.2.1'),0);
  assert.equal(compareVersions('1.2','1.2.0'),0);
  assert.deepEqual(parseVersion('2.0'),[2,0,0]);
  assert.equal(compareVersions('bukan-versi','1.0.0'),null,'versi tak sah tidak diam-diam dianggap sama');
  assert.equal(isValidVersion('1.2.3'),true);
  assert.equal(isValidVersion('1.2.3-beta'),false);
});

test('2. Versi aplikasi hanya punya satu sumber dan tidak dibuat terpisah',()=>{
  const versi=read('src/data/version.js');
  assert.match(versi,/export const APP_VERSION='\d+\.\d+\.\d+'/);
  assert.equal(JSON.parse(read('package.json')).version,APP_VERSION,'package.json selaras');
  assert.match(read('android/app/build.gradle'),new RegExp(`'${APP_VERSION.replace(/\./g,'\\.')}'`),'versionName Android selaras');
  for(const berkas of ['src/services/updates.js','src/pages/about-updates.js']){
    assert.match(read(berkas),/from '\.\.\/data\/version\.js'/,`${berkas} memakai sumber versi resmi`);
    assert.equal(/APP_VERSION\s*=\s*'/.test(read(berkas)),false,`${berkas} tidak membuat versi sendiri`);
  }
});

/* -------------------------------------------------------------------- 5. Endpoint pembaruan */

test('3. Endpoint pembaruan melayani versi terbaru per platform',async()=>{
  const {s}=await serverDenganVersi([
    {platform:'android',version:'1.2.2',versionCode:14,minSupportedVersion:'1.2.0',
      notes:'Perbaikan absensi.',downloadUrl:RILIS},
    {platform:'windows',version:'1.3.0',minSupportedVersion:'1.2.0',downloadUrl:RILIS},
  ]);
  try{
    const android=await s.call('/updates/latest?platform=android&version=1.2.1');
    assert.equal(android.status,200);
    assert.equal(android.data.implemented,true);
    assert.equal(android.data.platform,'android');
    assert.equal(android.data.latestVersion,'1.2.2');
    assert.equal(android.data.minimumSupportedVersion,'1.2.0');
    assert.equal(android.data.updateAvailable,true);
    assert.equal(android.data.mandatory,false);
    assert.equal(android.data.downloadUrl,RILIS);
    assert.match(android.data.notes,/absensi/i);
    assert.ok(android.data.releasedAt);

    const windows=await s.call('/updates/latest?platform=windows&version=1.2.1');
    assert.equal(windows.data.latestVersion,'1.3.0','Android dan Windows dibedakan');
    assert.notEqual(windows.data.latestVersion,android.data.latestVersion);
  }finally{await s.close();}
});

test('4. Update opsional dan update wajib dibedakan dengan benar',async()=>{
  const {s}=await serverDenganVersi([
    {platform:'android',version:'1.3.0',minSupportedVersion:'1.2.0',downloadUrl:RILIS},
  ]);
  try{
    const opsional=await s.call('/updates/latest?platform=android&version=1.2.1');
    assert.equal(opsional.data.updateAvailable,true);
    assert.equal(opsional.data.mandatory,false,'1.2.1 masih di atas minimum 1.2.0');

    const wajib=await s.call('/updates/latest?platform=android&version=1.1.0');
    assert.equal(wajib.data.updateAvailable,true);
    assert.equal(wajib.data.mandatory,true,'1.1.0 berada di bawah minimum 1.2.0');

    const terbaru=await s.call('/updates/latest?platform=android&version=1.3.0');
    assert.equal(terbaru.data.updateAvailable,false);
    assert.equal(terbaru.data.mandatory,false);
  }finally{await s.close();}
});

test('5. Metadata pembaruan yang tidak sah ditolak server',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const tolak=async(body,pola)=>{
      const {status,data}=await s.call('/owner/app-versions',{method:'POST',token,body});
      assert.equal(status,400,`seharusnya ditolak: ${JSON.stringify(body)}`);
      assert.match(data.error.message,pola);
    };
    await tolak({platform:'linux',version:'1.0.0'},/Platform/i);
    await tolak({platform:'android',version:'satu.dua'},/Versi/i);
    await tolak({platform:'android',version:'1.0.0',minSupportedVersion:'2.0.0'},/minimum/i);
    await tolak({platform:'android',version:'1.0.0',versionCode:'-3'},/Version code/i);
    await tolak({platform:'android',version:'1.0.0',downloadUrl:'http://github.com/a.apk'},/host resmi/i);
    await tolak({platform:'android',version:'1.0.0',downloadUrl:'https://github.com.jahat.id/a.apk'},/host resmi/i);
    await tolak({platform:'android',version:'1.0.0',releasedAt:'bukan-tanggal'},/tanggal/i);

    /* Permintaan dari aplikasi juga divalidasi, bukan dipercaya begitu saja. */
    assert.equal((await s.call('/updates/latest?platform=ios&version=1.0.0')).status,400);
    assert.equal((await s.call('/updates/latest?platform=android&version=1.0.0-rc')).status,400);
    assert.equal((await s.call('/updates/latest')).status,400,'platform wajib disebutkan');
  }finally{await s.close();}
});

test('6. Hanya versi yang diterbitkan yang sampai ke sekolah',async()=>{
  const {s}=await serverDenganVersi([
    {platform:'android',version:'1.2.2',downloadUrl:RILIS},
    {platform:'android',version:'1.4.0',downloadUrl:RILIS,publish:false},
  ]);
  try{
    const hasil=await s.call('/updates/latest?platform=android&version=1.2.1');
    assert.equal(hasil.data.latestVersion,'1.2.2','versi draf tidak dilayani');
  }finally{await s.close();}
});

test('7. Versi tanpa alamat unduhan resmi tidak dapat diterbitkan',async()=>{
  const s=await startTestServer();
  try{
    const token=await s.ownerToken();
    const {data}=await s.call('/owner/app-versions',{method:'POST',token,
      body:{platform:'android',version:'1.5.0'}});
    const terbit=await s.call(`/owner/app-versions/${data.version.id}/publish`,{method:'POST',token});
    assert.equal(terbit.status,400);
    assert.match(terbit.data.error.message,/alamat unduhan/i);
  }finally{await s.close();}
});

/* --------------------------------------------------------- 10. Kewenangan pengelolaan versi */

test('8. Hanya Pemilik yang dapat mengelola katalog versi',async()=>{
  const {s,token}=await serverDenganVersi([{platform:'android',version:'1.2.2',downloadUrl:RILIS}]);
  try{
    for(const [method,path] of [['GET','/owner/app-versions'],['POST','/owner/app-versions']]){
      const tanpa=await s.call(path,{method,body:method==='POST'?{platform:'android',version:'9.9.9'}:null});
      assert.equal(tanpa.status,401,`${method} ${path} menolak permintaan tanpa sesi Pemilik`);
      const palsu=await s.call(path,{method,token:'token-admin-sekolah-palsu',
        body:method==='POST'?{platform:'android',version:'9.9.9'}:null});
      assert.equal(palsu.status,401,'token karangan Admin/Guru ditolak');
    }
    const {data}=await s.call('/owner/app-versions',{token});
    assert.equal(data.versions.length,1);
    const id=data.versions[0].id;
    for(const aksi of ['publish','unpublish','delete']){
      const tanpa=await s.call(`/owner/app-versions/${id}/${aksi}`,{method:'POST'});
      assert.equal(tanpa.status,401,`aksi ${aksi} tertutup bagi non-Pemilik`);
    }
    /* Aplikasi sekolah sendiri tidak memuat satu pun endpoint pengelolaan versi. */
    for(const berkas of ['src/services/updates.js','src/pages/about-updates.js'])
      assert.equal(/owner\/app-versions/.test(read(berkas)),false,`${berkas} tidak menyentuh endpoint Pemilik`);
  }finally{await s.close();}
});

test('9. Tindakan Pemilik atas katalog versi tercatat di audit log',async()=>{
  const {s,token}=await serverDenganVersi([{platform:'android',version:'1.2.2',downloadUrl:RILIS}]);
  try{
    const {data}=await s.call('/owner/events',{token});
    const jenis=data.events.map(item=>item.type);
    assert.ok(jenis.includes('APP_VERSION_CREATED'));
    assert.ok(jenis.includes('APP_VERSION_PUBLISH'));
  }finally{await s.close();}
});

/* --------------------------------------------------- 7-8. Keamanan dan perilaku offline-first */

test('10. Alamat unduhan hanya diterima dari host resmi',()=>{
  assert.equal(isOfficialDownloadUrl(RILIS),true);
  for(const jahat of ['http://github.com/a.apk','https://github.com.jahat.id/a.apk',
    'https://user:sandi@github.com/a.apk','https://contoh.id/a.apk','javascript:alert(1)','',null])
    assert.equal(isOfficialDownloadUrl(jahat),false,`${jahat} ditolak`);
  /* Tidak ada satu pun jalur yang mengeksekusi isi berkas pembaruan. */
  const layanan=read('src/services/updates.js');
  for(const berbahaya of ['eval(','new Function(','import(','document.write','innerHTML'])
    assert.equal(layanan.includes(berbahaya),false,`layanan pembaruan tidak memakai ${berbahaya}`);
});

test('11. Gagal memeriksa pembaruan tidak pernah menjadi masalah lisensi',async()=>{
  installBrowserEnv();
  const gagal=async()=>{throw new Error('jaringan mati');};
  const hasil=await checkForUpdates({force:true,fetchImpl:gagal,apiBase:'https://contoh.invalid',
    platform:'android',version:'1.2.1'});
  assert.equal(hasil.status,UPDATE_STATUS.OFFLINE);
  assert.equal(hasil.message,UPDATE_MESSAGES.OFFLINE);
  assert.match(hasil.message,/tetap dapat digunakan secara offline/i);
  /* Layanan pembaruan tidak menyentuh lisensi, perangkat, maupun database sekolah. */
  const layanan=read('src/services/updates.js').replace(/\/\*[\s\S]*?\*\//g,'');
  for(const terlarang of ['clearLicense','LICENSE_STORAGE_KEY','license.js','storage.js','updateDb','loadDb','localStorage.clear'])
    assert.equal(layanan.includes(terlarang),false,`layanan pembaruan tidak menyentuh ${terlarang}`);
});

test('12. Pemeriksaan otomatis dibatasi jedanya, tombol manual tetap bebas',async()=>{
  const simpanan=installBrowserEnv();
  let panggilan=0;
  const fetchPalsu=async()=>{panggilan+=1;return {ok:true,json:async()=>({implemented:true,platform:'android',
    latestVersion:'1.2.2',minimumSupportedVersion:'1.2.0',releasedAt:'2026-09-01T00:00:00.000Z',
    notes:'Perbaikan.',downloadUrl:RILIS})};};
  const opsi={fetchImpl:fetchPalsu,apiBase:'https://contoh.vercel.app',platform:'android',version:'1.2.1'};
  assert.equal(shouldCheckNow(),true,'pemeriksaan pertama selalu boleh');
  await checkForUpdates({...opsi});
  assert.equal(panggilan,1);
  await checkForUpdates({...opsi});
  assert.equal(panggilan,1,'pemeriksaan kedua ditahan oleh jeda');
  await checkForUpdates({...opsi,force:true});
  assert.equal(panggilan,2,'tombol Periksa Pembaruan tetap dapat dipakai kapan saja');
  /* Hasil pemeriksaan disimpan di kunci sendiri, bukan di dalam database sekolah. */
  assert.ok(simpanan.has(UPDATE_STORAGE_KEY));
  assert.equal(simpanan.has('erapor_satria_jaya_01_v1'),false);
});

test('13. Status pembaruan meliputi kelima keadaan yang didukung',async()=>{
  installBrowserEnv();
  const jawab=payload=>async()=>({ok:true,json:async()=>payload});
  const dasar={platform:'android',apiBase:'https://contoh.vercel.app',force:true};
  const terbaru=await checkForUpdates({...dasar,version:'1.3.0',
    fetchImpl:jawab({latestVersion:'1.3.0',minimumSupportedVersion:'1.2.0',downloadUrl:RILIS})});
  assert.equal(terbaru.status,UPDATE_STATUS.LATEST);
  assert.equal(terbaru.label,'Versi Terbaru');

  const tersedia=await checkForUpdates({...dasar,version:'1.2.1',
    fetchImpl:jawab({latestVersion:'1.3.0',minimumSupportedVersion:'1.2.0',downloadUrl:RILIS})});
  assert.equal(tersedia.status,UPDATE_STATUS.AVAILABLE);
  assert.equal(tersedia.label,'Pembaruan Tersedia');

  const wajib=await checkForUpdates({...dasar,version:'1.1.0',
    fetchImpl:jawab({latestVersion:'1.3.0',minimumSupportedVersion:'1.2.0',downloadUrl:RILIS})});
  assert.equal(wajib.status,UPDATE_STATUS.MANDATORY);
  assert.equal(wajib.label,'Pembaruan Wajib');

  installBrowserEnv();
  const takTahu=await checkForUpdates({...dasar,version:'1.2.1',apiBase:'',fetchImpl:jawab({})});
  assert.equal(takTahu.status,UPDATE_STATUS.UNKNOWN);
  assert.equal(takTahu.label,'Tidak Dapat Memeriksa Pembaruan');

  const offline=await checkForUpdates({...dasar,version:'1.2.1',
    fetchImpl:async()=>{throw new Error('mati');}});
  assert.equal(offline.status,UPDATE_STATUS.OFFLINE);
});

test('14. Jawaban server dibersihkan sebelum dipakai aplikasi',()=>{
  installBrowserEnv();
  const kotor=sanitizeUpdatePayload({platform:'android',latestVersion:'1.3.0',
    minimumSupportedVersion:'1.2.0',downloadUrl:'https://situs-tidak-resmi.example/e-rapor.apk',
    notes:'x'.repeat(9000)},{platform:'android',version:'1.2.1'});
  assert.equal(kotor.downloadUrl,null,'alamat di luar host resmi dibuang, bukan disembunyikan');
  assert.equal(kotor.notes.length,4000,'catatan dibatasi panjangnya');
  const palsu=sanitizeUpdatePayload({latestVersion:'sembarang',mandatory:true,updateAvailable:true},
    {platform:'android',version:'1.2.1'});
  assert.equal(palsu.latestVersion,null);
  assert.equal(palsu.updateAvailable,false,'klaim server dihitung ulang dari angka versi');
  assert.equal(palsu.mandatory,false);
});

test('15. Platform yang belum didukung tidak membuat aplikasi gagal',async()=>{
  installBrowserEnv();
  assert.deepEqual([...UPDATE_PLATFORMS],['android','windows']);
  assert.equal(isSupportedPlatform('ios'),false);
  const hasil=await checkForUpdates({force:true,apiBase:'https://contoh.vercel.app',platform:'',
    version:'1.2.1',fetchImpl:async()=>{throw new Error('tidak boleh dipanggil');}});
  assert.equal(hasil.status,UPDATE_STATUS.UNKNOWN);
  assert.match(hasil.message,/tetap dapat digunakan/i);
  assert.equal(detectPlatform({navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14)'}}),'android');
  assert.equal(detectPlatform({navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0)'}}),'windows');
  assert.equal(detectPlatform({navigator:{userAgent:'Mozilla/5.0 (iPhone)'}}),'');
});

/* ------------------------------------------------- 15-19. Pembelian lisensi dan kontak resmi */

test('16. Tautan pembelian memakai WhatsApp resmi dari satu sumber',()=>{
  assert.equal(CONTACT_WHATSAPP,'6287776015915');
  assert.equal(PURCHASE_URL,'https://wa.me/6287776015915?text=Halo%2C%20saya%20ingin%20membeli%20lisensi%20e-Rapor%20untuk%20sekolah%20saya.');
  assert.match(SUPPORT_URL,/^https:\/\/wa\.me\/6287776015915\?text=Halo%20Pak%20Fahmi/);
  assert.match(whatsappUrl('uji'),/^https:\/\/wa\.me\/6287776015915\?text=uji$/);
});

test('17. Nomor WhatsApp hanya ditulis di satu berkas',()=>{
  const nomor=/6287776015915|0877-?7601-?5915|087776015915/;
  const sumber=['src','server/public','server/src','api','electron','index.html','sw.js'];
  const temuan=[];
  const walk=(dir)=>{
    for(const entri of readdirSync(new URL(dir,root),{withFileTypes:true})){
      const jalur=`${dir}/${entri.name}`;
      if(entri.isDirectory()){walk(jalur);continue;}
      if(!/\.(js|html|css|json|mjs|cjs)$/.test(entri.name))continue;
      if(nomor.test(read(jalur)))temuan.push(jalur);
    }
  };
  for(const awal of sumber){
    try{
      if(awal.includes('.')){if(nomor.test(read(awal)))temuan.push(awal);}
      else walk(awal);
    }catch{}
  }
  assert.deepEqual(temuan,['src/data/app-identity.js'],
    `nomor WhatsApp hanya boleh ada di satu berkas, ditemukan di: ${temuan.join(', ')}`);
});

test('18. Pesan WhatsApp tidak pernah membawa data siswa atau rahasia',()=>{
  const pesan=purchaseMessage({schoolName:'SD NEGERI CONTOH 01',npsn:'20223344',version:'1.2.1'});
  assert.match(pesan,/^Halo, saya ingin membeli lisensi e-Rapor untuk sekolah saya\./);
  assert.match(pesan,/Nama Sekolah: SD NEGERI CONTOH 01/);
  assert.match(pesan,/NPSN: 20223344/);
  assert.match(pesan,/Versi e-Rapor: 1\.2\.1/);
  /* Komentar dibuang lebih dulu supaya penjelasan yang justru MENYEBUT larangan tidak dianggap
     pelanggaran; yang diperiksa adalah kode yang benar-benar dijalankan. */
    const halaman=read('src/pages/about-updates.js').replace(/\/\*[\s\S]*?\*\//g,'');
  for(const terlarang of ['listStudents','nisn','NISN','assessmentScores','attendance','license_key',
    'activation_token','getInstallationId','password'])
    assert.equal(halaman.includes(terlarang),false,`pesan pembelian tidak menyentuh ${terlarang}`);
  /* Tanpa identitas sekolah pun pesan tetap sah dan tetap tanpa data pribadi. */
  assert.equal(purchaseMessage({version:'1.2.1'}).includes('Nama Sekolah'),false);
});

test('19. Promosi hanya menyebut fitur yang benar-benar ada dan tidak mengganggu',()=>{
  assert.equal(PROMO_HIGHLIGHTS.length,14);
  for(const teks of ['TP semua mata pelajaran','Intrakurikuler','Kokurikuler','Ekstrakurikuler',
    'Cetak Rapor & Leger','Backup & Restore data','Sistem lisensi resmi','Pembaruan aplikasi resmi',
    'Offline-first','Data akademik tetap tersimpan lokal di perangkat'])
    assert.ok(PROMO_HIGHLIGHTS.includes(teks),`${teks} tercantum`);
  /* Tidak ada promosi di luar halaman Tentang & Pembaruan. */
  const halamanLain=['src/pages/dashboard.js','src/pages/login.js','src/pages/print.js',
    'src/pages/reports.js','src/ui/layout.js','src/services/documents.js'];
  for(const berkas of halamanLain){
    const isi=read(berkas);
    for(const jejak of ['PURCHASE_URL','PROMO_','wa.me','Beli Lisensi'])
      assert.equal(isi.includes(jejak),false,`${berkas} tidak memuat promosi (${jejak})`);
  }
});

/* ------------------------------------------ 13-14. Data, lisensi, dan identitas setelah update */

test('20. Identitas pengembang tetap permanen dan tidak berasal dari database',()=>{
  const identitas=read('src/data/app-identity.js');
  const kode=identitas.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.match(identitas,/DEVELOPER_NAME='FAHMI DJAWAS, S\.Pd\.'/);
  assert.match(identitas,/DEVELOPER_ROLE='Developer & UI\/UX Designer e-Rapor'/);
  assert.match(identitas,/DEVELOPER_CREDIT_LEAD='Dirancang & Dikembangkan oleh'/);
  assert.match(identitas,/COPYRIGHT='© 2026 — Semua Hak Dilindungi'/);
  assert.equal(/import .* from/.test(kode),false,'tidak mengimpor apa pun, termasuk database');
  for(const jejak of ['loadDb','masterData','localStorage','getSchoolMaster'])
    assert.equal(kode.includes(jejak),false,`identitas tidak dibaca dari ${jejak}`);
  /* Halaman Tentang menampilkannya dari sumber permanen, bukan dari form mana pun. */
  const halaman=read('src/pages/about-updates.js');
  assert.match(halaman,/DEVELOPER_NAME/);
  assert.equal(/DEVELOPER_NAME\s*=[^=]/.test(halaman),false,'tidak dapat ditimpa halaman');
});

test('21. Tahap 9 tidak menyentuh DB_KEY, tidak menghapus data, dan tidak mengubah identitas paket',()=>{
  assert.match(read('src/services/storage.js'),/const DB_KEY = 'erapor_satria_jaya_01_v1'/);
  const berkasBaru=['src/services/updates.js','src/pages/about-updates.js','src/data/update-config.js',
    'src/data/version-compare.js','server/src/updates.js'];
  for(const berkas of berkasBaru){
    const isi=read(berkas);
    for(const merusak of ['localStorage.clear','removeItem(\'erapor_satria','DROP TABLE','DELETE FROM licenses',
      'DELETE FROM device_activations','clearLicense'])
      assert.equal(isi.includes(merusak),false,`${berkas} tidak memuat ${merusak}`);
  }
  /* Identitas paket Android dan Windows dikunci apa adanya: menggantinya membuat sistem
     menganggap aplikasi ini instalasi yang berbeda, sehingga data pengguna terlihat hilang. */
  assert.match(read('android/app/build.gradle'),/applicationId "id\.sch\.sdn\.satriajaya01\.erapor"/);
  const builder=read('electron-builder.yml');
  assert.match(builder,/^appId: id\.sch\.sdn\.satriajaya01\.erapor$/m);
  assert.match(builder,/^productName: e-Rapor SDN Satria Jaya 01$/m);
  assert.match(builder,/guid: 9a3f0d21-6c4b-5e88-9d17-2f6a1b7c4e30/);
  assert.match(read('electron/main.cjs'),/USER_DATA_FOLDER=/);
});

test('22. Simulasi pembaruan aplikasi mempertahankan data, lisensi, dan Installation ID',async()=>{
  const simpanan=installBrowserEnv();
  const DB='erapor_satria_jaya_01_v1';
  const sebelum={
    masterData:{school:{name:'SD NEGERI CONTOH 01',npsn:'20223344'}},
    students:{'2025/2026|Ganjil|5B|s1':{id:'s1',name:'Siswa Contoh',nis:'5B-1'}},
    assessmentScores:{'2025/2026|Ganjil|5B|mtk|formative|s1':{studentId:'s1',score:88}},
    attendance:{'2025/2026|Ganjil|5B|s1|2026-01-05':{status:'Hadir'}},
    userAccounts:{admin:{username:'admin'}},
  };
  simpanan.set(DB,JSON.stringify(sebelum));
  simpanan.set('erapor_installation_v1',JSON.stringify({installation_id:'inst_tetap_sama'}));
  simpanan.set('erapor_license_v1',JSON.stringify({activation_token:'token-lama',status:'ACTIVE',
    next_check_at:'2099-01-01T00:00:00.000Z'}));

  /* Pembaruan aplikasi = kode baru berjalan di atas penyimpanan yang sama. Yang dijalankan di
     sini adalah seluruh jalur pembaruan Tahap 9, termasuk yang gagal karena offline. */
  await checkForUpdates({force:true,apiBase:'https://contoh.vercel.app',platform:'android',
    version:'1.2.1',fetchImpl:async()=>{throw new Error('offline saat update');}});
  await checkForUpdates({force:true,apiBase:'https://contoh.vercel.app',platform:'android',version:'1.2.1',
    fetchImpl:async()=>({ok:true,json:async()=>({latestVersion:'1.3.0',minimumSupportedVersion:'1.2.9',
      downloadUrl:RILIS,notes:'Wajib.'})})});
  const status=getUpdateStatus({platform:'android',version:'1.2.1'});
  assert.equal(status.status,UPDATE_STATUS.MANDATORY,'kondisi update wajib memang tercapai');

  assert.deepEqual(JSON.parse(simpanan.get(DB)),sebelum,'seluruh data sekolah tetap sama persis');
  assert.equal(JSON.parse(simpanan.get('erapor_installation_v1')).installation_id,'inst_tetap_sama');
  assert.equal(JSON.parse(simpanan.get('erapor_license_v1')).activation_token,'token-lama');
  assert.equal(JSON.parse(simpanan.get('erapor_license_v1')).status,'ACTIVE');
});

test('23. Hasil pemeriksaan pembaruan tidak ikut ke backup akademik',()=>{
  const konfigurasi=read('src/data/update-config.js');
  assert.match(konfigurasi,/UPDATE_STORAGE_KEY='erapor_update_v1'/);
  assert.notEqual(UPDATE_STORAGE_KEY,'erapor_satria_jaya_01_v1');
  const backup=read('src/services/backup.js');
  for(const kunci of ['erapor_update_v1','erapor_license_v1','erapor_installation_v1'])
    assert.equal(backup.includes(kunci),false,`backup tidak menyentuh ${kunci}`);
});

/* ------------------------------------------ 21-23. Bagian lama tetap utuh setelah Tahap 9 */

test('24. Endpoint kesehatan dan lisensi tetap berjalan berdampingan dengan pembaruan',async()=>{
  const {s,token}=await serverDenganVersi([{platform:'android',version:'1.2.2',downloadUrl:RILIS}]);
  try{
    const sehat=await s.call('/health');
    assert.equal(sehat.status,200);
    assert.equal(sehat.data.ok,true);

    /* Aktivasi satu perangkat tetap berlaku persis seperti Tahap 8. */
    const [lisensi]=await s.buatLisensi(1,{schoolName:'SD NEGERI CONTOH 01'});
    const pertama=await s.call('/activate',{method:'POST',
      body:{license_key:lisensi.key,installation_id:`inst_${'a'.repeat(32)}`,platform:'android'}});
    assert.equal(pertama.status,200);
    assert.equal(pertama.data.status,'ACTIVE');
    const kedua=await s.call('/activate',{method:'POST',
      body:{license_key:lisensi.key,installation_id:`inst_${'b'.repeat(32)}`,platform:'android'}});
    assert.equal(kedua.status>=400,true,'satu lisensi tetap hanya untuk satu perangkat aktif');

    /* Katalog versi tidak menyentuh lisensi maupun perangkat. */
    const detail=await s.call(`/owner/licenses/${pertama.data.license_id}`,{token});
    assert.equal(detail.data.license.status,'ACTIVE');
    assert.equal(detail.data.devices.filter(item=>item.is_active===true||item.is_active===1).length,1);
  }finally{await s.close();}
});

test('25. Tabel app_versions tidak pernah memuat data akademik sekolah',()=>{
  const skema=read('server/schema-postgres.sql');
  const blok=skema.slice(skema.indexOf('CREATE TABLE IF NOT EXISTS app_versions'));
  for(const kolom of ['student','siswa','nilai','score','attendance','absensi','rapor','npsn','nisn'])
    assert.equal(new RegExp(kolom,'i').test(blok),false,`app_versions tidak punya kolom ${kolom}`);
  const layanan=read('server/src/updates.js');
  for(const tabel of ['students','assessment','attendance','report'])
    assert.equal(layanan.includes(tabel),false,`layanan pembaruan tidak menyentuh ${tabel}`);
  /* Aplikasi hanya mengirim platform dan versi, tidak ada data sekolah sama sekali. */
  const klien=read('src/services/updates.js');
  const permintaan=klien.slice(klien.indexOf('const alamat='),klien.indexOf('const res=await fetchImpl'));
  assert.match(permintaan,/platform=|version=/);
  for(const bocor of ['npsn','schoolName','license','installation','student'])
    assert.equal(permintaan.includes(bocor),false,`permintaan pembaruan tidak membawa ${bocor}`);
});

test('26. Migrasi app_versions bersifat menambah kolom, bukan membuat ulang tabel',()=>{
  for(const berkas of ['server/schema-postgres.sql','server/src/pg.js']){
    const isi=read(berkas);
    assert.match(isi,/ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS download_url/);
    assert.match(isi,/ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS published/);
    assert.equal(/DROP TABLE\s+(IF EXISTS\s+)?app_versions/i.test(isi),false,`${berkas} tidak membuang tabel`);
  }
  const sqlite=read('server/src/db.js');
  assert.match(sqlite,/PRAGMA table_info\(app_versions\)/,'SQLite hanya menambah kolom yang belum ada');
  assert.equal(/DROP TABLE/i.test(sqlite),false);
});

test('27. Menu Tentang & Pembaruan tersedia bagi Admin dan Guru serta tetap terbuka saat terbatas',()=>{
  const navigasi=read('src/data/navigation.js');
  assert.equal((navigasi.match(/'about-updates'/g)||[]).length,4,'satu entri untuk Admin dan satu untuk Guru');
  assert.match(navigasi,/item\('about-updates','Tentang & Pembaruan'/);
  const aplikasi=read('src/app.js');
  assert.match(aplikasi,/case 'about-updates': return renderAboutUpdates\(session\)/);
  assert.match(aplikasi,/TEACHER_ALWAYS_OPEN_ROUTES=new Set\(\[[^\]]*'about-updates'/);
  assert.match(aplikasi,/READ_ONLY_SAFE_ROUTES=new Set\(\[[^\]]*'about-updates'/);
});
