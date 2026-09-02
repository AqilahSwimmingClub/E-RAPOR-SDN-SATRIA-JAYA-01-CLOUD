import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { startTestServer } from './helpers/license-server.js';
import { APP_NAME, COPYRIGHT, DEVELOPER_CREDIT_LEAD, DEVELOPER_NAME, DEVELOPER_PHOTO, DEVELOPER_ROLE, FOOTER_CREDIT } from '../src/data/app-identity.js';

/* Audit keamanan sistem lisensi. Yang dijaga di sini adalah hal-hal yang, bila bocor sekali
   saja, membuat seluruh model komersial runtuh: kunci privat, rahasia server, jalan pintas
   aktivasi, dan kewenangan pemilik. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

/* Seluruh berkas yang benar-benar dikirim ke perangkat sekolah. */
function berkasClient(){
  const hasil=[];
  const telusuri=dir=>{
    for(const nama of readdirSync(new URL(dir,root))){
      const relatif=`${dir}/${nama}`;
      if(statSync(new URL(relatif,root)).isDirectory())telusuri(relatif);
      else if(/\.(js|css|html|json|webmanifest)$/.test(nama))hasil.push(relatif);
    }
  };
  telusuri('src');
  return [...hasil,'sw.js','index.html','manifest.webmanifest'];
}

/* --------------------------------------------- 31-32. Tidak ada rahasia di sisi client */

test('31. Kunci privat penandatangan tidak ada di sumber maupun bundle aplikasi sekolah',()=>{
  const pola=[/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/privateKeyPem/,/signActivationToken/,
    /LICENSE_SIGNING_PRIVATE_KEY/,/generateSigningKeyPair/];
  for(const berkas of berkasClient()){
    const isi=read(berkas);
    for(const larangan of pola)
      assert.doesNotMatch(isi,larangan,`${berkas} tidak memuat bahan kunci privat (${larangan})`);
  }
  /* Yang boleh ada di client hanyalah kunci PUBLIK. */
  const config=read('src/data/license-config.js');
  assert.match(config,/LICENSE_PUBLIC_JWK/,'client hanya memegang kunci publik');
  assert.equal(config.includes('PRIVATE'),false);
  /* Hasil build ikut diperiksa bila sudah pernah dibuat. */
  if(existsSync(new URL('dist/src/data/license-config.js',root))){
    const teks=readdirSync(new URL('dist/src/data',root)).map(nama=>read(`dist/src/data/${nama}`)).join('\n');
    assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(teks),false,'bundle hasil build bersih dari kunci privat');
  }
});

test('32. Rahasia server dan password pemilik tidak pernah ditanam di kode',()=>{
  const rahasia=['LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY','OWNER_PASSWORD','service_role','SERVICE_ROLE'];
  for(const berkas of berkasClient()){
    const isi=read(berkas);
    for(const nama of rahasia)assert.equal(isi.includes(nama),false,`${berkas} tidak memuat ${nama}`);
  }
  /* Server membaca seluruh rahasia dari environment dan menolak start bila kosong. */
  const config=read('server/src/config.js');
  for(const nama of ['LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY'])
    assert.match(config,new RegExp(`env\\.${nama}`),`${nama} dibaca dari environment`);
  assert.match(config,/belum diisi/,'server menolak berjalan tanpa rahasia');
  /* Tidak ada nilai rahasia contoh yang terisi di berkas contoh. */
  const contoh=read('server/.env.example');
  for(const baris of contoh.split('\n').filter(baris=>/^(LICENSE_HASH_PEPPER|LICENSE_RECOVERY_KEY|OWNER_PASSWORD|OWNER_USERNAME)=/.test(baris)))
    assert.match(baris,/=$/,`${baris.split('=')[0]} pada .env.example memang kosong`);
  /* Berkas rahasia sungguhan tidak boleh ada di repo dan sudah diabaikan Git. */
  const abaikan=read('.gitignore');
  for(const jalur of ['server/.env','server/secrets/','server/data/'])
    assert.ok(abaikan.includes(jalur),`${jalur} diabaikan Git`);
  for(const jalur of ['server/.env','server/secrets/license-signing-key.pem'])
    assert.equal(existsSync(new URL(jalur,root)),false,`${jalur} tidak ikut ter-commit`);
  const terlacak=execFileSync('git',['ls-files'],{cwd:new URL('.',root).pathname,encoding:'utf8'});
  for(const pola of [/server\/\.env$/m,/server\/secrets\//,/\.pem$/m])
    assert.doesNotMatch(terlacak,pola,`tidak ada berkas rahasia yang dilacak Git (${pola})`);
});

/* ------------------------------------------------ Tidak ada jalan pintas aktivasi apa pun */

test('Tidak ada kunci universal, bypass sekolah, atau bypass pengembang',()=>{
  const jalurLisensi=['src/services/license.js','src/services/installation.js','src/pages/license-activation.js',
    'src/app.js','server/src/licenses.js','server/src/api.js','server/src/crypto.js'];
  const larangan=[/SDN Satria Jaya/i,/FAHMI/i,/master[_ ]?activation/i,/universal/i,/bypass/i,
    /skipLicense/i,/DEV_LICENSE/i,/if\s*\(\s*school/i,/npsn\s*===/i];
  for(const berkas of jalurLisensi){
    const isi=read(berkas).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
    for(const pola of larangan)
      assert.doesNotMatch(isi,pola,`${berkas} tidak memuat jalan pintas (${pola})`);
  }
  /* Satu-satunya jalan menjadi ACTIVE adalah token bertanda tangan dari server. */
  const license=read('src/services/license.js');
  assert.match(license,/verifyActivationToken/,'status berasal dari token terverifikasi');
  assert.equal(/status\s*[:=]\s*'ACTIVE'/.test(license.replace(/\/\*[\s\S]*?\*\//g,'')),false,
    'client tidak pernah menetapkan sendiri status ACTIVE');
});

test('Instalasi lama SDN Satria Jaya 01 tunduk pada aturan lisensi yang sama',async t=>{
  /* Tidak ada perlakuan khusus di server untuk nama sekolah mana pun. */
  const server=await startTestServer();t.after(()=>server.close());
  const [lisensi]=await server.buatLisensi();
  const A=`inst_${'a'.repeat(32)}`,B=`inst_${'b'.repeat(32)}`;
  const pakaiNamaLama={license_key:lisensi.key,school_name:'SDN Satria Jaya 01',npsn:'20218098'};
  assert.equal((await server.call('/activate',{method:'POST',body:{...pakaiNamaLama,installation_id:A}})).status,200);
  const kedua=await server.call('/activate',{method:'POST',body:{...pakaiNamaLama,installation_id:B}});
  assert.equal(kedua.status,409,'nama sekolah lama tidak memberi keistimewaan apa pun');
  /* Tanpa lisensi, sekolah mana pun ditolak, termasuk yang memakai nama lama. */
  const tanpaKunci=await server.call('/activate',{method:'POST',body:{...pakaiNamaLama,license_key:'ERAPOR-2222-3333-4444',installation_id:B}});
  assert.equal(tanpaKunci.data.error.code,'INVALID_KEY');
});

/* ---------------------------------------------------- 33-34. Identitas pengembang tetap */

test('33-34. Identitas pengembang tetap permanen dan di luar data sekolah',()=>{
  assert.equal(DEVELOPER_NAME,'FAHMI DJAWAS, S.Pd.');
  assert.equal(DEVELOPER_CREDIT_LEAD,'Dirancang & Dikembangkan oleh');
  assert.equal(DEVELOPER_ROLE,'Developer & UI/UX Designer e-Rapor');
  assert.equal(COPYRIGHT,'© 2026 — Semua Hak Dilindungi');
  assert.equal(FOOTER_CREDIT,'Dashboard didesain oleh FAHMI DJAWAS. © 2026 Semua hak dilindungi');
  assert.equal(DEVELOPER_PHOTO,'./assets/fahmi-djawas.jpg');
  assert.equal(existsSync(new URL('assets/fahmi-djawas.jpg',root)),true);
  assert.equal(APP_NAME,'e-Rapor');

  /* Halaman aktivasi lisensi ikut menampilkan identitas pembuat. */
  const aktivasi=read('src/pages/license-activation.js');
  for(const konstanta of ['DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT'])
    assert.ok(aktivasi.includes(konstanta),`halaman aktivasi memakai ${konstanta}`);
  /* Owner Panel juga membawanya, dan panel itu tidak pernah masuk ke aplikasi sekolah. */
  assert.match(read('server/public/owner/index.html'),/FAHMI DJAWAS, S\.Pd\./);
  for(const berkas of berkasClient())
    assert.equal(read(berkas).includes('owner/app.js'),false,`${berkas} tidak membundel Owner Panel`);

  /* Identitas pengembang tetap tidak berasal dari database dan tidak dapat diedit Admin. */
  const identitas=read('src/data/app-identity.js').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  for(const larangan of ['loadDb(','localStorage','import ','masterData'])
    assert.equal(identitas.includes(larangan),false,`sumber identitas pembuat tidak memakai ${larangan}`);
});

/* ------------------------------------------------- Owner Panel terpisah dari aplikasi */

test('Owner Panel terpisah dan tidak pernah ikut ke aplikasi sekolah',()=>{
  assert.equal(existsSync(new URL('server/public/owner/index.html',root)),true);
  /* Panel tidak menyimpan rahasia apa pun; kewenangannya diperiksa server tiap permintaan. */
  const panel=read('server/public/owner/app.js');
  for(const larangan of ['PRIVATE KEY','LICENSE_HASH_PEPPER','LICENSE_RECOVERY_KEY','OWNER_PASSWORD'])
    assert.equal(panel.includes(larangan),false,`panel tidak memuat ${larangan}`);
  assert.match(panel,/authorization:`Bearer/,'panel memakai sesi pemilik dari server');
  /* Navigasi aplikasi sekolah tidak pernah memuat menu pemilik. */
  const navigasi=read('src/data/navigation.js');
  for(const larangan of ['owner','lisensi','license'])
    assert.equal(navigasi.toLowerCase().includes(larangan),false,`menu sekolah tidak memuat ${larangan}`);
});

test('Tahap 9 belum dikerjakan: hanya skema versi aplikasi yang disiapkan',async t=>{
  const server=await startTestServer();t.after(()=>server.close());
  const {data}=await server.call('/updates/latest');
  assert.equal(data.implemented,false,'endpoint update belum aktif');
  const tabel=server.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  assert.ok(tabel.includes('app_versions'),'skema app_versions sudah disiapkan');
  /* Tidak ada updater apa pun di aplikasi sekolah. */
  for(const berkas of berkasClient()){
    const isi=read(berkas);
    for(const larangan of ['autoUpdater','downloadUpdate','installApk','checkForUpdates'])
      assert.equal(isi.includes(larangan),false,`${berkas} tidak memuat updater (${larangan})`);
  }
});
