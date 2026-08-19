/* Menyiapkan nilai untuk keempat GitHub Secrets dari android/signing.properties yang sudah ada
   di komputer ini. Berkas keystore tidak pernah dikirim ke mana pun: nilainya hanya disalin ke
   clipboard komputer sendiri, dan yang ditampilkan di layar hanya bentuk tersamar.

   Pemakaian:
     npm run signing:secrets                 -> ANDROID_KEYSTORE_BASE64 ke clipboard
     npm run signing:secrets storePassword   -> ANDROID_KEYSTORE_PASSWORD ke clipboard
     npm run signing:secrets keyAlias        -> ANDROID_KEY_ALIAS ke clipboard
     npm run signing:secrets keyPassword     -> ANDROID_KEY_PASSWORD ke clipboard
*/
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* fileURLToPath wajib dipakai: pathname dari URL pada Windows berbentuk "/C:/..." yang tidak
   dikenali path.resolve, sehingga lokasi proyek jadi salah. */
const AKAR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
/* --properties membawa nilai di belakangnya, sedangkan --tampilkan tidak. Keduanya harus
   dikeluarkan dari daftar argumen biasa supaya nilai path tidak terbaca sebagai nama bagian. */
const BEROPSI=new Set(['--properties']);
const masuk=process.argv.slice(2);
const argumen=[];const opsiNilai={};
for(let i=0;i<masuk.length;i+=1){
  const item=masuk[i];
  if(BEROPSI.has(item)){opsiNilai[item.slice(2)]=masuk[i+1];i+=1;continue;}
  if(item.startsWith('--'))continue;
  argumen.push(item);
}
const berkasProperties=opsiNilai.properties||path.join(AKAR,'android','signing.properties');

const BAGIAN={
  base64:{secret:'ANDROID_KEYSTORE_BASE64',sumber:'storeFile',rahasia:true},
  storePassword:{secret:'ANDROID_KEYSTORE_PASSWORD',sumber:'storePassword',rahasia:true},
  keyAlias:{secret:'ANDROID_KEY_ALIAS',sumber:'keyAlias',rahasia:false},
  keyPassword:{secret:'ANDROID_KEY_PASSWORD',sumber:'keyPassword',rahasia:true},
};

function berhenti(pesan,saran=[]){
  console.error(`\n  GAGAL: ${pesan}`);
  saran.forEach(baris=>console.error(`         ${baris}`));
  console.error('');
  process.exit(1);
}

/* Format Java Properties: "\" adalah escape, jadi dikembalikan apa adanya saat dibaca. */
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

function samarkan(nilai,rahasia){
  if(!rahasia)return nilai;
  if(nilai.length<=8)return `${'*'.repeat(nilai.length)} (${nilai.length} karakter)`;
  return `${nilai.slice(0,3)}${'*'.repeat(Math.min(20,nilai.length-6))}${nilai.slice(-3)} (${nilai.length} karakter)`;
}

/* Clipboard bawaan sistem. Tidak ada berkas perantara supaya tidak ada salinan yang tertinggal.
   Pada Windows nama berkasnya WAJIB ditulis lengkap "clip.exe": spawn tidak menambahkan sendiri
   ekstensi dari PATHEXT, sehingga "clip" saja selalu gagal dengan ENOENT. PowerShell disiapkan
   sebagai cadangan bila clip.exe tidak tersedia. */
function kandidatClipboard(){
  if(process.platform==='win32')return [['clip.exe',[]],['powershell.exe',['-NoProfile','-Command','$input | Set-Clipboard']]];
  if(process.platform==='darwin')return [['pbcopy',[]]];
  return [['xclip',['-selection','clipboard']],['xsel',['--clipboard','--input']],['wl-copy',[]]];
}
function coba(perintah,args,nilai){
  return new Promise(resolve=>{
    let anak;
    try{anak=spawn(perintah,args,{windowsHide:true});}catch{return resolve(false);}
    anak.once('error',()=>resolve(false));
    anak.once('exit',kode=>resolve(kode===0));
    anak.stdin.on('error',()=>{});
    anak.stdin.end(nilai);
  });
}
async function keClipboard(nilai){
  for(const [perintah,args] of kandidatClipboard())if(await coba(perintah,args,nilai))return true;
  return false;
}

const pilihan=argumen[0]||'base64';
if(pilihan!=='semua'&&!BAGIAN[pilihan])berhenti(`Bagian "${pilihan}" tidak dikenal.`,['Pilihan yang tersedia: semua, '+Object.keys(BAGIAN).join(', ')]);

if(!existsSync(berkasProperties))
  berhenti(`Berkas ${berkasProperties} tidak ditemukan.`,[
    'Berkas ini dibuat di komputer tempat APK rilis pernah dibangun.',
    'Cari juga berkas erapor-release.jks dan KEYSTORE-CREDENTIALS.txt di komputer ini.',
    'Lihat docs/BUILD-OTOMATIS.md bagian 1.0.',
  ]);

const properti=bacaProperties(readFileSync(berkasProperties,'utf8'));
const kurang=['storeFile','storePassword','keyAlias','keyPassword'].filter(kunci=>!properti[kunci]?.trim());
if(kurang.length)berhenti(`Baris berikut kosong pada ${berkasProperties}: ${kurang.join(', ')}.`);

function nilaiBagian(kunci){
  if(kunci!=='base64')return properti[BAGIAN[kunci].sumber];
  const keystore=path.resolve(path.dirname(berkasProperties),properti.storeFile);
  if(!existsSync(keystore))
    berhenti(`Berkas keystore tidak ada di ${keystore}.`,[
      'Baris storeFile pada signing.properties menunjuk ke lokasi itu.',
      'Kalau keystore-nya dipindah, perbarui dulu baris storeFile tersebut:',
      '  npm run signing:lokasi',
    ]);
  return readFileSync(keystore).toString('base64');
}

async function tampilkanSatu(kunci,urutan){
  const bagian=BAGIAN[kunci];
  const nilai=nilaiBagian(kunci);
  const tersalin=await keClipboard(nilai);
  /* Lebar label disamakan supaya kolom nilai tetap lurus pada kedua mode. */
  const lebar=urutan?16:10;
  console.log(`\n  ${(urutan?`Secret ${urutan} dari 4`:'Secret').padEnd(lebar)}: ${bagian.secret}`);
  console.log(`  ${'Nilai'.padEnd(lebar)}: ${samarkan(nilai,bagian.rahasia)}`);
  console.log(tersalin
    ? '  Sudah disalin ke clipboard. Tempel dengan Ctrl+V pada kotak Secret di GitHub.'
    : '  Clipboard tidak tersedia. Jalankan ulang dengan --tampilkan lalu salin manual.');
  /* Nilai penuh hanya dicetak bila memang diminta, supaya tidak ikut ter-screenshot. */
  if(process.argv.includes('--tampilkan'))console.log(`\n${nilai}\n`);
  return tersalin;
}

/* Mode "semua" menuntun keempat secret satu per satu supaya tidak ada yang terlewat. */
if(pilihan==='semua'){
  console.log('\n  Buka halaman ini lebih dulu, lalu klik "New repository secret":');
  console.log('    https://github.com/AqilahSwimmingClub/E-RAPOR-SDN-SATRIA-JAYA-01-CLOUD/settings/secrets/actions');
  const daftar=Object.keys(BAGIAN);
  const interaktif=process.stdin.isTTY&&process.stdout.isTTY;
  const tunggu=async pesan=>{
    if(!interaktif)return;
    const readline=await import('node:readline/promises');
    const rl=readline.createInterface({input:process.stdin,output:process.stdout});
    await rl.question(pesan);
    rl.close();
  };
  for(let i=0;i<daftar.length;i+=1){
    await tampilkanSatu(daftar[i],i+1);
    if(i<daftar.length-1)await tunggu('  Sudah ditempel dan disimpan? Tekan Enter untuk secret berikutnya ... ');
  }
  console.log('\n  Selesai. Periksa daftar secret di GitHub: harus ada tepat empat baris,');
  console.log('  yaitu ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,');
  console.log('  dan ANDROID_KEY_PASSWORD.\n');
}else{
  if(pilihan==='base64')console.log(`\n  Keystore  : ${path.resolve(path.dirname(berkasProperties),properti.storeFile)}`);
  await tampilkanSatu(pilihan,0);
  console.log('');
}
