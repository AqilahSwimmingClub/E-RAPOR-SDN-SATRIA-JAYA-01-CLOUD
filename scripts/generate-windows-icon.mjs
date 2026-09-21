/* MEMBUAT IKON WINDOWS DARI MASTER IKON ANDROID.

   Windows sebelumnya memakai ikon bawaan Electron karena electron-builder tidak pernah diberi
   berkas ikon. Akibatnya aplikasi yang sama tampil dengan dua wajah berbeda: ikon e-Rapor di
   HP, dan ikon Electron generik di Desktop, Start Menu, dan taskbar.

   SUMBER KEBENARANNYA ADALAH assets/android-icon-master.png - berkas 1024x1024 yang dipakai
   membuat ikon launcher Android, dan yang isinya sudah generik: "e-Rapor - Solusi Digital
   Pengelolaan Rapor Sekolah", tanpa nama sekolah mana pun. Tidak ada gambar baru yang dibuat
   di sini dan tidak ada desain yang diubah; yang dikerjakan hanya mengubah ukuran.

   PENGUBAHAN UKURANNYA MEMAKAI CHROMIUM yang memang sudah ada di lingkungan build, lewat
   canvas dengan penghalusan kualitas tinggi. Itu menghindari menambah dependency pengolah
   gambar hanya untuk membuat satu berkas ikon.

   BERKAS .ico YANG DIHASILKAN BUKAN PNG YANG DIGANTI NAMANYA. Ia berisi tujuh gambar
   sekaligus - 16, 24, 32, 48, 64, 128, dan 256 piksel - sehingga Windows dapat memilih ukuran
   yang paling pas untuk setiap tempat: 16 untuk judul jendela, 32 untuk taskbar, 48 untuk
   Desktop, dan 256 untuk tampilan ikon besar. Berkas satu ukuran akan terlihat kabur atau
   bergerigi di sebagian tempat itu. */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const akar=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUMBER=path.join(akar,'assets','android-icon-master.png');
const TUJUAN=path.join(akar,'build','icon.ico');
const TUJUAN_PNG=path.join(akar,'build','icon.png');
const UKURAN=[16,24,32,48,64,128,256];
const CDP=process.env.ERAPOR_CDP||'http://127.0.0.1:9333';

async function ubahUkuranLewatChromium(pngSumber,ukuran){
  const target=await (await fetch(`${CDP}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  let id=0;const tunggu=new Map();
  await new Promise(r=>ws.addEventListener('open',r));
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&tunggu.has(m.id)){tunggu.get(m.id)(m);tunggu.delete(m.id);}});
  const kirim=(method,params={})=>new Promise(res=>{const n=++id;tunggu.set(n,res);ws.send(JSON.stringify({id:n,method,params}));});
  const ev=async expr=>{
    const r=await kirim('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
    if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description||'gagal');
    return r.result?.result?.value;
  };
  await kirim('Runtime.enable');
  const b64=pngSumber.toString('base64');
  const hasil=await ev(`(async()=>{
    const gambar=new Image();
    gambar.src='data:image/png;base64,${b64}';
    await gambar.decode();
    const keluaran={};
    for(const n of ${JSON.stringify(ukuran)}){
      const kanvas=document.createElement('canvas');
      kanvas.width=n;kanvas.height=n;
      const ctx=kanvas.getContext('2d');
      /* Penghalusan kualitas tinggi. Tanpa ini, pengecilan 1024 ke 16 piksel menghasilkan
         gambar bergerigi karena browser hanya mengambil sampel titik. */
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      /* Digambar memenuhi kotak persis, tanpa dipotong dan tanpa diregangkan: sumbernya
         memang sudah bujur sangkar 1024x1024. */
      ctx.drawImage(gambar,0,0,gambar.width,gambar.height,0,0,n,n);
      keluaran[n]=kanvas.toDataURL('image/png').split(',')[1];
    }
    return keluaran;
  })()`);
  ws.close();
  return Object.fromEntries(Object.entries(hasil).map(([n,b])=>[Number(n),Buffer.from(b,'base64')]));
}

/* Berkas ICO: satu kepala, satu entri per ukuran, lalu data gambarnya. Entri PNG di dalam ICO
   adalah bentuk yang didukung Windows Vista ke atas; e-Rapor memakai Electron yang memang
   hanya berjalan pada Windows 10 ke atas. */
function susunIco(gambar){
  const ukuran=Object.keys(gambar).map(Number).sort((a,b)=>a-b);
  const kepala=Buffer.alloc(6);
  kepala.writeUInt16LE(0,0);kepala.writeUInt16LE(1,2);kepala.writeUInt16LE(ukuran.length,4);
  const entri=[];const data=[];
  let offset=6+ukuran.length*16;
  for(const n of ukuran){
    const isi=gambar[n];
    const e=Buffer.alloc(16);
    e.writeUInt8(n>=256?0:n,0);      /* 0 berarti 256 - ukuran maksimum yang dapat disebut */
    e.writeUInt8(n>=256?0:n,1);
    e.writeUInt8(0,2);               /* palet: tidak dipakai pada gambar 32-bit */
    e.writeUInt8(0,3);
    e.writeUInt16LE(1,4);            /* bidang warna */
    e.writeUInt16LE(32,6);           /* 32 bit per piksel, dengan alpha */
    e.writeUInt32LE(isi.length,8);
    e.writeUInt32LE(offset,12);
    offset+=isi.length;
    entri.push(e);data.push(isi);
  }
  return Buffer.concat([kepala,...entri,...data]);
}

const sumber=fs.readFileSync(SUMBER);
if(sumber.readUInt32BE(16)<256)throw new Error('Master ikon terlalu kecil untuk ikon Windows 256 piksel.');
const gambar=await ubahUkuranLewatChromium(sumber,UKURAN);
for(const n of UKURAN){
  if(!gambar[n]||gambar[n].length<64)throw new Error(`Ukuran ${n} gagal dihasilkan.`);
  if(gambar[n].readUInt32BE(16)!==n)throw new Error(`Ukuran ${n} tidak sesuai permintaan.`);
}
fs.mkdirSync(path.dirname(TUJUAN),{recursive:true});
fs.writeFileSync(TUJUAN,susunIco(gambar));
/* Salinan PNG 256 piksel ikut disimpan: beberapa perkakas paket memakai PNG, dan berkas ini
   juga memudahkan pemeriksaan mata terhadap hasil pengecilan. */
fs.writeFileSync(TUJUAN_PNG,gambar[256]);
console.log(`ikon Windows dibuat: ${path.relative(akar,TUJUAN)} (${UKURAN.join(', ')} piksel, ${fs.statSync(TUJUAN).size} byte)`);
