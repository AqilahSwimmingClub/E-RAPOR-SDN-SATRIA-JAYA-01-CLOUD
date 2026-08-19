/* Membuat keystore rilis BARU dengan password pilihan sendiri.
   Dipakai hanya bila keystore lama benar-benar hilang.

   Pemakaian:
     npm run signing:baru 230191

   Sebelum membuat, perintah ini menelusuri komputer lebih dulu. Bila keystore lama masih ada,
   pembuatan dibatalkan dan penggunanya diarahkan memakai yang lama, karena keystore baru berarti
   aplikasi di perangkat harus dipasang ulang dari nol.

   Keystore disimpan DI LUAR folder proyek supaya tidak ikut hilang ketika folder proyek diunduh
   ulang atau dihapus. Folder proyek juga mengabaikan berkas .jks lewat .gitignore.
*/
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AKAR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BEROPSI=new Set(['--properties','--keytool','--output','--cari-di']);
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
const folderKeystore=opsiNilai.output||path.join(homedir(),'e-Rapor-Keystore');
const akarCari=opsiNilai['cari-di']||homedir();
const paksa=masuk.includes('--tetap-buat-baru');
const password=argumen[0];
const ALIAS='erapor-release';

function berhenti(pesan,saran=[]){
  console.error(`\n  GAGAL: ${pesan}`);
  saran.forEach(baris=>console.error(`         ${baris}`));
  console.error('');
  process.exit(1);
}
const escape=nilai=>String(nilai).replace(/\\/g,'\\\\');
const jalankanKeytool=args=>execFileSync(keytool,args,{stdio:['ignore','ignore','pipe'],encoding:'utf8'});
const bacaKeytool=args=>execFileSync(keytool,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8'});

/* Penelusuran sama seperti signing:lokasi: folder pengguna saja, dengan batas waktu dan kedalaman. */
const LEWATI=new Set(['node_modules','.git','AppData','Windows','Program Files','Program Files (x86)','$Recycle.Bin','ProgramData','.gradle','.npm','build','dist']);
function telusuri(akar,{kedalaman=6,batasWaktu=25000}={}){
  const temuan=[];const mulai=Date.now();const antrean=[[akar,0]];
  while(antrean.length){
    if(Date.now()-mulai>batasWaktu)break;
    const [folder,level]=antrean.shift();
    let isi;
    try{isi=readdirSync(folder,{withFileTypes:true});}catch{continue;}
    for(const entri of isi){
      const lengkap=path.join(folder,entri.name);
      if(entri.isDirectory()){
        if(level<kedalaman&&!LEWATI.has(entri.name)&&!entri.name.startsWith('.'))antrean.push([lengkap,level+1]);
      }else if(/^erapor-release\.jks$/i.test(entri.name))temuan.push(lengkap);
    }
  }
  return temuan;
}

if(!password)berhenti('Password belum disebutkan.',['Contoh: npm run signing:baru 230191']);
if(password.length<6)berhenti(`Password "${password}" hanya ${password.length} karakter.`,['keytool mewajibkan minimal 6 karakter.']);

/* Langkah pengaman: keystore lama jauh lebih berharga daripada yang baru. */
if(!paksa){
  console.log(`\n  Memastikan keystore lama benar-benar tidak ada. Menelusuri ${akarCari} ...`);
  const temuan=telusuri(akarCari);
  if(temuan.length){
    console.log('\n  Keystore lama TERNYATA MASIH ADA:');
    temuan.forEach(berkas=>console.log(`    ${berkas}`));
    berhenti('Pembuatan keystore baru dibatalkan.',[
      'Pakai keystore lama itu supaya aplikasi di perangkat tidak perlu dipasang ulang:',
      `  npm run signing:lokasi "${temuan[0]}"`,
      'Bila memang ingin tetap membuat yang baru, tambahkan --tetap-buat-baru.',
    ]);
  }
  console.log('  Tidak ditemukan. Melanjutkan pembuatan keystore baru.');
}

const keystore=path.join(folderKeystore,'erapor-release.jks');
const catatan=path.join(folderKeystore,'KEYSTORE-CREDENTIALS.txt');
if(existsSync(keystore))berhenti(`Sudah ada keystore di ${keystore}.`,[
  'Hapus atau pindahkan dulu bila memang ingin menggantinya,',
  `atau pakai yang itu: npm run signing:lokasi "${keystore}"`]);

mkdirSync(folderKeystore,{recursive:true});
/* Masa berlaku 10000 hari agar tidak kedaluwarsa selama umur pakai aplikasi sekolah. */
try{
  jalankanKeytool(['-genkeypair','-keystore',keystore,'-storetype','JKS','-alias',ALIAS,
    '-keyalg','RSA','-keysize','4096','-validity','10000','-storepass',password,'-keypass',password,
    '-dname','CN=e-Rapor SDN Satria Jaya 01, OU=Release, O=SDN Satria Jaya 01, L=Bekasi, ST=Jawa Barat, C=ID']);
}catch(error){berhenti('keytool gagal membuat keystore.',[String(error.stderr||'').trim().split('\n')[0]]);}

/* Dibuktikan dulu benar-benar bisa dipakai sebelum dicatat. */
try{
  jalankanKeytool(['-list','-keystore',keystore,'-storepass',password,'-alias',ALIAS]);
  jalankanKeytool(['-certreq','-alias',ALIAS,'-keystore',keystore,'-storepass',password,'-keypass',password]);
}catch(error){berhenti('Keystore baru tidak dapat dibuka kembali.',[String(error.stderr||'').trim().split('\n')[0]]);}

const sidikJari=(bacaKeytool(['-list','-v','-keystore',keystore,'-storepass',password,'-alias',ALIAS]).match(/SHA256:\s*([0-9A-F:]+)/i)||[])[1];

mkdirSync(path.dirname(berkasProperties),{recursive:true});
const isiBaru=`storeFile=${escape(keystore.replace(/\\/g,'/'))}\nstorePassword=${escape(password)}\nkeyAlias=${ALIAS}\nkeyPassword=${escape(password)}\n`;
writeFileSync(`${berkasProperties}.sementara`,isiBaru,'utf8');
renameSync(`${berkasProperties}.sementara`,berkasProperties);
writeFileSync(catatan,`RELEASE SIGNING e-Rapor SDN Satria Jaya 01\nDibuat: ${new Date().toISOString()}\nAlias: ${ALIAS}\nStore password: ${password}\nKey password: ${password}\nSidik jari SHA256: ${sidikJari||'-'}\n\nSimpan berkas ini dan erapor-release.jks di dua tempat terpisah.\nTanpa keduanya, aplikasi yang sudah terpasang tidak akan bisa diperbarui lagi.\n`,'utf8');

console.log(`\n  Keystore baru : ${keystore}`);
console.log(`  Catatan       : ${catatan}`);
console.log(`  Alias         : ${ALIAS}`);
console.log(`  Password      : ${'*'.repeat(password.length)} (${password.length} karakter, sama untuk keystore dan kunci)`);
console.log(`  Sidik jari    : ${sidikJari||'(tidak terbaca)'}`);
console.log(`\n  signing.properties sudah diperbarui: ${berkasProperties}`);
console.log('\n  PENTING - keystore ini BERBEDA dari yang dipakai APK yang sekarang terpasang.');
console.log('  Di setiap perangkat Android: pastikan sudah Backup, uninstall aplikasi lama,');
console.log('  pasang APK baru, lalu Restore dari berkas backup itu.');
console.log('\n  Langkah berikutnya - perbarui keempat GitHub Secrets:');
console.log('    npm run signing:secrets                 -> ANDROID_KEYSTORE_BASE64');
console.log('    npm run signing:secrets storePassword   -> ANDROID_KEYSTORE_PASSWORD');
console.log('    npm run signing:secrets keyAlias        -> ANDROID_KEY_ALIAS');
console.log('    npm run signing:secrets keyPassword     -> ANDROID_KEY_PASSWORD');
console.log(`\n  Simpan folder ${folderKeystore} di tempat lain juga (flashdisk atau Google Drive).\n`);
