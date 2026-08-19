/* Mencari berkas keystore rilis dan membetulkan baris storeFile pada android/signing.properties.
   Dipakai ketika folder proyek dipindah atau diunduh ulang sehingga alamat lama tidak berlaku.

   Pemakaian:
     npm run signing:lokasi                                  -> mencari keystore di komputer ini
     npm run signing:lokasi "C:\\aman\\erapor-release.jks"     -> memakai alamat yang disebutkan

   Berkas keystore tidak pernah diubah oleh perintah ini. Yang diperbarui hanya satu baris pada
   signing.properties, itu pun setelah keystore terbukti terbuka dengan password yang tercatat.
*/
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AKAR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BEROPSI=new Set(['--properties','--keytool','--cari-di']);
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
const escape=nilai=>String(nilai).replace(/\\/g,'\\\\');

/* Penelusuran sengaja dibatasi: folder pengguna saja, kedalaman wajar, dan melewati folder besar
   yang pasti tidak memuat keystore. Tujuannya cepat selesai, bukan menyisir seluruh disk. */
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
      }else if(/^erapor-release\.jks$|^KEYSTORE-CREDENTIALS\.txt$/i.test(entri.name)){
        temuan.push(lengkap);
      }
    }
  }
  return temuan;
}

if(!existsSync(berkasProperties))berhenti(`Berkas ${berkasProperties} tidak ditemukan.`,['Lihat docs/BUILD-OTOMATIS.md bagian 1.0.']);
const properti=bacaProperties(readFileSync(berkasProperties,'utf8'));
const kurang=['storeFile','storePassword','keyAlias','keyPassword'].filter(kunci=>!properti[kunci]?.trim());
if(kurang.length)berhenti(`Baris berikut kosong pada ${berkasProperties}: ${kurang.join(', ')}.`);

let tujuan=argumen[0];
if(!tujuan){
  const akarCari=opsiNilai['cari-di']||homedir();
  console.log(`\n  Mencari erapor-release.jks di ${akarCari} ...`);
  const temuan=telusuri(akarCari);
  const keystore=temuan.filter(berkas=>/\.jks$/i.test(berkas));
  const catatan=temuan.filter(berkas=>/\.txt$/i.test(berkas));
  if(catatan.length){
    console.log('\n  Catatan credential ditemukan (berisi alias dan password):');
    catatan.forEach(berkas=>console.log(`    ${berkas}`));
  }
  if(!keystore.length)berhenti('Berkas erapor-release.jks tidak ditemukan di folder pengguna.',[
    'Periksa flashdisk, hard disk lain, atau folder cadangan.',
    'Bila memang hilang, lihat docs/BUILD-OTOMATIS.md bagian "Kalau berkas keystore tidak ditemukan".',
  ]);
  console.log('\n  Keystore ditemukan:');
  keystore.forEach((berkas,index)=>console.log(`    ${index+1}. ${berkas}  (${statSync(berkas).size} byte)`));
  if(keystore.length>1){
    console.log('\n  Lebih dari satu. Jalankan ulang dengan alamat yang dipilih, contoh:');
    console.log(`    npm run signing:lokasi "${keystore[0]}"\n`);
    process.exit(0);
  }
  tujuan=keystore[0];
}

const keystore=path.resolve(tujuan);
if(!existsSync(keystore))berhenti(`Berkas ${keystore} tidak ada.`);

/* Keystore harus benar-benar cocok dengan password yang tercatat, bukan sekadar ada berkasnya. */
const jalankanKeytool=args=>execFileSync(keytool,args,{stdio:['ignore','ignore','pipe'],encoding:'utf8'});
/* Varian yang menangkap keluaran keytool, dipakai untuk membaca sidik jari sertifikat. */
const bacaKeytool=args=>execFileSync(keytool,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8'});
try{jalankanKeytool(['-list','-keystore',keystore,'-storepass',properti.storePassword,'-alias',properti.keyAlias]);}
catch{berhenti('Keystore itu tidak cocok dengan password atau alias pada signing.properties.',[
  'Mungkin keystore milik proyek lain. Periksa KEYSTORE-CREDENTIALS.txt di folder yang sama.']);}
try{jalankanKeytool(['-certreq','-alias',properti.keyAlias,'-keystore',keystore,'-storepass',properti.storePassword,'-keypass',properti.keyPassword]);}
catch{berhenti('Password kunci pada signing.properties tidak cocok dengan keystore itu.');}

const lama=properti.storeFile;
const baru=keystore.replace(/\\/g,'/');
if(lama===baru){console.log(`\n  Alamat keystore sudah benar: ${baru}\n`);process.exit(0);}

const isiBaru=`storeFile=${escape(baru)}\nstorePassword=${escape(properti.storePassword)}\nkeyAlias=${escape(properti.keyAlias)}\nkeyPassword=${escape(properti.keyPassword)}\n`;
writeFileSync(`${berkasProperties}.sementara`,isiBaru,'utf8');
renameSync(`${berkasProperties}.sementara`,berkasProperties);

console.log(`\n  Alamat lama : ${lama}`);
console.log(`  Alamat baru : ${baru}`);
const sidikJari=(bacaKeytool(['-list','-v','-keystore',keystore,'-storepass',properti.storePassword,'-alias',properti.keyAlias]).match(/SHA256:\s*([0-9A-F:]+)/i)||[])[1];
console.log(`  Sidik jari  : ${sidikJari||'(tidak terbaca)'}`);
console.log('\n  signing.properties sudah diperbarui. Password dan alias tidak diubah.');
console.log('  Lanjutkan dengan:');
console.log('    npm run signing:ganti-password 230191\n');
