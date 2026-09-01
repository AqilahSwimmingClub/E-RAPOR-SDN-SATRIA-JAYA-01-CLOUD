/* Mengganti password keystore rilis tanpa mengganti kunci penandatanganannya. Kunci, alias, dan
   sertifikatnya tetap sama persis, sehingga APK hasil build berikutnya tetap dapat dipasang
   menimpa aplikasi yang sudah terpasang di perangkat guru tanpa kehilangan data.

   Pemakaian:
     npm run signing:ganti-password 230191

   Keystore lama disalin lebih dulu. Bila keytool gagal di tengah jalan, salinan itu dikembalikan
   supaya keystore tidak pernah tertinggal dalam keadaan rusak.
*/
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AKAR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BEROPSI=new Set(['--properties','--keytool']);
const masuk=process.argv.slice(2);
const argumen=[];const opsiNilai={};
for(let i=0;i<masuk.length;i+=1){
  const item=masuk[i];
  if(BEROPSI.has(item)){opsiNilai[item.slice(2)]=masuk[i+1];i+=1;continue;}
  if(item.startsWith('--'))continue;
  argumen.push(item);
}
const berkasProperties=opsiNilai.properties||path.join(AKAR,'android','signing.properties');
const keytool=opsiNilai.keytool||'keytool';
const passwordBaru=argumen[0];

function berhenti(pesan,saran=[]){
  console.error(`\n  GAGAL: ${pesan}`);
  saran.forEach(baris=>console.error(`         ${baris}`));
  console.error('');
  process.exit(1);
}

function bacaProperties(isi){
  const hasil={};
  for(const baris of isi.split(/\r?\n/)){
    const bersih=baris.trim();
    if(!bersih||bersih.startsWith('#')||bersih.startsWith('!'))continue;
    const pisah=bersih.indexOf('=');
    if(pisah<0)continue;
    hasil[bersih.slice(0,pisah).trim()]=bersih.slice(pisah+1).replace(/\\(.)/g,'$1');
  }
  return hasil;
}
/* Format Java Properties memperlakukan "\" sebagai escape, jadi digandakan saat ditulis. */
const escape=nilai=>String(nilai).replace(/\\/g,'\\\\');
/* Hook --keytool juga menerima wrapper JavaScript agar simulasi kegagalan dapat berjalan sama
   di Windows dan Unix. Pemakaian produksi tetap langsung memanggil binary keytool. */
const jalankanKeytool=args=>keytool.endsWith('.mjs')
  ?execFileSync(process.execPath,[keytool,...args],{stdio:['ignore','ignore','pipe'],encoding:'utf8'})
  :execFileSync(keytool,args,{stdio:['ignore','ignore','pipe'],encoding:'utf8'});

if(!passwordBaru)berhenti('Password baru belum disebutkan.',['Contoh: npm run signing:ganti-password 230191']);
if(passwordBaru.length<6)berhenti(`Password "${passwordBaru}" hanya ${passwordBaru.length} karakter.`,['keytool mewajibkan minimal 6 karakter.']);
if(!existsSync(berkasProperties))berhenti(`Berkas ${berkasProperties} tidak ditemukan.`,['Lihat docs/BUILD-OTOMATIS.md bagian 1.0.']);

const properti=bacaProperties(readFileSync(berkasProperties,'utf8'));
const kurang=['storeFile','storePassword','keyAlias','keyPassword'].filter(kunci=>!properti[kunci]?.trim());
if(kurang.length)berhenti(`Baris berikut kosong pada ${berkasProperties}: ${kurang.join(', ')}.`);

const keystore=path.resolve(path.dirname(berkasProperties),properti.storeFile);
if(!existsSync(keystore))berhenti(`Berkas keystore tidak ada di ${keystore}.`,['Perbarui baris storeFile pada signing.properties.']);

const alias=properti.keyAlias;
const storeLama=properti.storePassword,keyLama=properti.keyPassword;

/* 1. Pastikan password yang tercatat sekarang memang benar sebelum apa pun diubah. */
try{jalankanKeytool(['-list','-keystore',keystore,'-storepass',storeLama,'-alias',alias]);}
catch{berhenti('Password keystore yang tercatat pada signing.properties tidak cocok.',[
  'Periksa berkas KEYSTORE-CREDENTIALS.txt yang dibuat bersama keystore.']);}
try{jalankanKeytool(['-certreq','-alias',alias,'-keystore',keystore,'-storepass',storeLama,'-keypass',keyLama]);}
catch{berhenti('Password kunci yang tercatat pada signing.properties tidak cocok.',[
  'Periksa berkas KEYSTORE-CREDENTIALS.txt yang dibuat bersama keystore.']);}

if(storeLama===passwordBaru&&keyLama===passwordBaru){
  console.log('\n  Password keystore dan kunci memang sudah sama dengan yang diminta. Tidak ada yang diubah.\n');
  process.exit(0);
}

/* 2. Salin keystore lama sebagai pengaman sebelum keytool menulis ulang berkasnya. */
const cadangan=`${keystore}.cadangan-${new Date().toISOString().replace(/[:.]/g,'-')}`;
copyFileSync(keystore,cadangan);
console.log(`\n  Keystore  : ${keystore}`);
console.log(`  Cadangan  : ${cadangan}`);

function batalkan(pesan,rincian){
  copyFileSync(cadangan,keystore);
  berhenti(pesan,[String(rincian||'').trim().split('\n')[0]||'',`Keystore sudah dikembalikan dari ${cadangan}.`].filter(Boolean));
}

/* 3. Ganti password store lebih dulu, baru password kunci. Kunci privat tidak dibuat ulang. */
if(storeLama!==passwordBaru){
  try{jalankanKeytool(['-storepasswd','-keystore',keystore,'-storepass',storeLama,'-new',passwordBaru]);}
  catch(error){batalkan('keytool gagal mengganti password keystore.',error.stderr);}
}
if(keyLama!==passwordBaru){
  try{jalankanKeytool(['-keypasswd','-alias',alias,'-keystore',keystore,'-storepass',passwordBaru,'-keypass',keyLama,'-new',passwordBaru]);}
  catch(error){batalkan('keytool gagal mengganti password kunci.',error.stderr);}
}

/* 4. Buktikan keystore benar-benar terbuka dengan password baru sebelum catatan diperbarui. */
try{
  jalankanKeytool(['-list','-keystore',keystore,'-storepass',passwordBaru,'-alias',alias]);
  jalankanKeytool(['-certreq','-alias',alias,'-keystore',keystore,'-storepass',passwordBaru,'-keypass',passwordBaru]);
}catch(error){batalkan('Keystore tidak dapat dibuka dengan password baru.',error.stderr);}

/* 5. Catatan diperbarui paling akhir, ditulis lewat berkas sementara agar tidak separuh jadi. */
const isiBaru=`storeFile=${escape(properti.storeFile)}\nstorePassword=${escape(passwordBaru)}\nkeyAlias=${escape(alias)}\nkeyPassword=${escape(passwordBaru)}\n`;
writeFileSync(`${berkasProperties}.sementara`,isiBaru,'utf8');
renameSync(`${berkasProperties}.sementara`,berkasProperties);

console.log(`\n  Selesai. Password keystore dan kunci sekarang sama: ${'*'.repeat(passwordBaru.length)} (${passwordBaru.length} karakter)`);
console.log(`  Alias tetap ${alias}, kunci penandatanganan tidak berubah, jadi APK baru tetap`);
console.log('  dapat dipasang menimpa aplikasi yang sudah ada tanpa kehilangan data.');
console.log('\n  LANGKAH BERIKUTNYA - perbarui TIGA GitHub Secrets, karena isi berkas keystore ikut berubah:');
console.log('    npm run signing:secrets                 -> ANDROID_KEYSTORE_BASE64');
console.log('    npm run signing:secrets storePassword   -> ANDROID_KEYSTORE_PASSWORD');
console.log('    npm run signing:secrets keyPassword     -> ANDROID_KEY_PASSWORD');
console.log('  ANDROID_KEY_ALIAS tidak berubah.');
console.log(`\n  Bila semuanya sudah terbukti benar, berkas cadangan boleh dihapus:\n    ${cadangan}\n`);
