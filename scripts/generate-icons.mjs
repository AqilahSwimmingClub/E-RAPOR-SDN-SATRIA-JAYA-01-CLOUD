/* Membuat seluruh ikon turunan dari DUA berkas master.

   Aturannya sederhana dan sengaja kaku: hanya ada satu master untuk aplikasi umum dan satu
   master untuk Owner Panel. Semua ukuran lain dihasilkan dari keduanya, tidak pernah
   digambar ulang atau disunting satu per satu, sehingga ikon di Android, PWA, dan Windows
   tidak mungkin berbeda-beda.

   Jalankan: npm run icons                                                              */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bacaPng, tulisPng, ubahUkuran, beriMargin, bersihkanLatarTepi } from './lib/png.mjs';

const akar=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const jalur=nama=>resolve(akar,nama);

export const MASTER_APLIKASI='assets/brand/e-rapor-logo.png';
export const MASTER_OWNER='assets/brand/owner-erapor-logo.png';

/* Kepadatan layar Android beserta ukuran ic_launcher-nya. */
export const MIPMAP=Object.freeze({ldpi:36,mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192});

/* Adaptive icon dipangkas sistem menjadi lingkaran/kotak membulat, jadi logonya diberi ruang
   kosong di tepi supaya tidak ada bagian yang terpotong. */
const SISI_FOREGROUND=432;
const RASIO_ISI_FOREGROUND=0.66;

export function rencanaKeluaran(){
  const aplikasi=[];
  for(const [kepadatan,ukuran] of Object.entries(MIPMAP)){
    aplikasi.push({berkas:`android/app/src/main/res/mipmap-${kepadatan}/ic_launcher.png`,ukuran});
    aplikasi.push({berkas:`android/app/src/main/res/mipmap-${kepadatan}/ic_launcher_round.png`,ukuran});
    aplikasi.push({berkas:`android/app/src/main/res/mipmap-${kepadatan}/ic_launcher_foreground.png`,
      ukuran:SISI_FOREGROUND,margin:RASIO_ISI_FOREGROUND});
  }
  aplikasi.push({berkas:'assets/android-icon-master.png',ukuran:1024});
  aplikasi.push({berkas:'assets/icon-only.png',ukuran:1024});
  aplikasi.push({berkas:'assets/app-icon-192.png',ukuran:192});
  aplikasi.push({berkas:'assets/app-icon-512.png',ukuran:512});
  const owner=[
    {berkas:'server/public/owner/icons/owner-icon-192.png',ukuran:192},
    {berkas:'server/public/owner/icons/owner-icon-512.png',ukuran:512},
    {berkas:'server/public/owner/icons/owner-icon-maskable.png',ukuran:512,margin:RASIO_ISI_FOREGROUND},
  ];
  return {aplikasi,owner};
}

function muatMaster(nama){
  const penuh=jalur(nama);
  if(!existsSync(penuh))
    throw new Error(`Berkas master ${nama} belum ada.\n`
      +`Simpan logo final yang sudah disetujui di ${nama} (PNG 8-bit, persegi, minimal 1024x1024).`);
  const gambar=bacaPng(readFileSync(penuh));
  if(gambar.lebar!==gambar.tinggi)
    throw new Error(`${nama} harus persegi, sekarang ${gambar.lebar}x${gambar.tinggi}.`);
  if(gambar.lebar<512)
    throw new Error(`${nama} terlalu kecil (${gambar.lebar}px); minimal 512px, idealnya 1024px.`);
  /* Master dikirim tanpa alfa dan masih membawa bidang rata di luar bentuk membulatnya.
     Bidang itu ditembuskan supaya ikon tampil sebagai lambang, bukan sebagai kotak berlatar. */
  return bersihkanLatarTepi(gambar);
}

export function buatIkon({tulis=true}={}){
  const master={aplikasi:muatMaster(MASTER_APLIKASI),owner:muatMaster(MASTER_OWNER)};
  const rencana=rencanaKeluaran();
  const hasil=[];
  for(const [jenis,daftar] of [['aplikasi',rencana.aplikasi],['owner',rencana.owner]]){
    for(const {berkas,ukuran,margin} of daftar){
      const gambar=margin
        ? beriMargin(master[jenis],ukuran,margin)
        : ubahUkuran(master[jenis],ukuran,ukuran);
      const isi=tulisPng(gambar);
      if(tulis){
        mkdirSync(dirname(jalur(berkas)),{recursive:true});
        writeFileSync(jalur(berkas),isi);
      }
      hasil.push({berkas,ukuran,isi});
    }
  }
  return hasil;
}

if(process.argv[1]&&process.argv[1].endsWith('generate-icons.mjs')){
  try{
    const hasil=buatIkon();
    for(const {berkas,ukuran} of hasil)console.log(`  ${String(ukuran).padStart(4)}px  ${berkas}`);
    console.log(`\n${hasil.length} ikon dibuat dari ${MASTER_APLIKASI} dan ${MASTER_OWNER}.`);
  }catch(error){console.error(error.message);process.exit(1);}
}
