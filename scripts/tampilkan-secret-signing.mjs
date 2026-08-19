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

/* Clipboard bawaan sistem. Tidak ada berkas perantara supaya tidak ada salinan yang tertinggal. */
function keClipboard(nilai){
  const perintah=process.platform==='win32'?['clip']
    :process.platform==='darwin'?['pbcopy']
    :['xclip',['-selection','clipboard']];
  return new Promise(resolve=>{
    let anak;
    try{anak=spawn(perintah[0],perintah[1]||[],{windowsHide:true});}catch{return resolve(false);}
    anak.once('error',()=>resolve(false));
    anak.once('exit',kode=>resolve(kode===0));
    anak.stdin.on('error',()=>{});
    anak.stdin.end(nilai);
  });
}

const pilihan=argumen[0]||'base64';
if(!BAGIAN[pilihan])berhenti(`Bagian "${pilihan}" tidak dikenal.`,['Pilihan yang tersedia: '+Object.keys(BAGIAN).join(', ')]);

if(!existsSync(berkasProperties))
  berhenti(`Berkas ${berkasProperties} tidak ditemukan.`,[
    'Berkas ini dibuat di komputer tempat APK rilis pernah dibangun.',
    'Cari juga berkas erapor-release.jks dan KEYSTORE-CREDENTIALS.txt di komputer ini.',
    'Lihat docs/BUILD-OTOMATIS.md bagian 1.0.',
  ]);

const properti=bacaProperties(readFileSync(berkasProperties,'utf8'));
const kurang=['storeFile','storePassword','keyAlias','keyPassword'].filter(kunci=>!properti[kunci]?.trim());
if(kurang.length)berhenti(`Baris berikut kosong pada ${berkasProperties}: ${kurang.join(', ')}.`);

const bagian=BAGIAN[pilihan];
let nilai;
if(pilihan==='base64'){
  const keystore=path.resolve(path.dirname(berkasProperties),properti.storeFile);
  if(!existsSync(keystore))
    berhenti(`Berkas keystore tidak ada di ${keystore}.`,[
      'Baris storeFile pada signing.properties menunjuk ke lokasi itu.',
      'Kalau keystore-nya dipindah, perbarui dulu baris storeFile tersebut.',
    ]);
  nilai=readFileSync(keystore).toString('base64');
  console.log(`\n  Keystore  : ${keystore}`);
}else{
  nilai=properti[bagian.sumber];
}

const tersalin=await keClipboard(nilai);
console.log(`\n  Secret    : ${bagian.secret}`);
console.log(`  Nilai     : ${samarkan(nilai,bagian.rahasia)}`);
console.log(tersalin
  ? '\n  Sudah disalin ke clipboard. Buka halaman New repository secret di GitHub,\n  isi Name dengan nama Secret di atas, lalu tempel dengan Ctrl+V pada kotak Secret.'
  : '\n  Clipboard tidak tersedia pada sistem ini. Jalankan ulang dengan --tampilkan\n  untuk mencetak nilainya, lalu salin manual.');
/* Nilai penuh hanya dicetak bila memang diminta, supaya tidak tidak sengaja ikut ter-screenshot. */
if(process.argv.includes('--tampilkan'))console.log(`\n${nilai}\n`);
console.log('');
