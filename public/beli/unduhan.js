/* Aturan tampilan bagian Unduhan, tanpa satu pun sentuhan DOM.

   Satu hal yang dijaga di sini: TIDAK ADA TAUTAN KARANGAN. Bila server belum menyimpan alamat
   unduhan untuk sebuah platform, barisnya tetap ditampilkan tetapi berkata "Belum tersedia" -
   bukan disembunyikan, dan bukan diisi tautan contoh atau tautan halaman GitHub. */

export const PLATFORM_LABEL=Object.freeze({android:'Android (APK)',windows:'Windows (Installer)'});
export const PLATFORM_ORDER=Object.freeze(['android','windows']);

const PESAN_BELUM='Belum tersedia';

function amankanUrl(nilai){
  const teks=String(nilai||'').trim();
  if(!teks)return '';
  try{
    const url=new URL(teks);
    /* Skema selain http/https tidak pernah boleh sampai ke atribut href. */
    return ['http:','https:'].includes(url.protocol)?url.toString():'';
  }catch{return '';}
}

/* Menyusun baris yang siap digambar dari jawaban server. Jawaban yang kosong, gagal dimuat,
   atau tidak dikenal bentuknya tetap menghasilkan kedua platform dalam keadaan belum tersedia. */
export function downloadRows(daftar){
  const tersimpan=new Map((Array.isArray(daftar)?daftar:[])
    .filter(item=>item&&PLATFORM_ORDER.includes(item.platform))
    .map(item=>[item.platform,item]));
  return PLATFORM_ORDER.map(platform=>{
    const baris=tersimpan.get(platform);
    const url=amankanUrl(baris?.url);
    return {
      platform,
      label:PLATFORM_LABEL[platform],
      url,
      available:Boolean(url),
      version:String(baris?.version||'').trim(),
      sizeText:String(baris?.size_text||'').trim(),
      notes:String(baris?.notes||'').trim(),
      statusText:url?'Tersedia':PESAN_BELUM,
      buttonText:url?`Unduh ${PLATFORM_LABEL[platform]}`:PESAN_BELUM,
    };
  });
}

/* Keterangan versi dan ukuran hanya ditulis bila memang ada nilainya. */
export function downloadMeta(baris){
  return [baris?.version?`Versi ${baris.version}`:'',baris?.sizeText||''].filter(Boolean).join(' • ');
}
