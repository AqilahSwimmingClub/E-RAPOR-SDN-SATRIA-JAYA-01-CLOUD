/* Perbandingan versi aplikasi.

   Satu-satunya tempat versi dibandingkan, dipakai bersama oleh aplikasi sekolah DAN server
   update. Keduanya mengimpor berkas ini supaya keputusan "sudah terbaru" atau "wajib update"
   tidak pernah berbeda antara klien dan server.

   Versi dibandingkan per angka, BUKAN sebagai teks. Perbandingan teks biasa keliru pada kasus
   nyata seperti 1.2.9 dengan 1.3.0 atau 1.9.9 dengan 2.0.0. */

const POLA=/^(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?$/;

export function isValidVersion(value){
  return POLA.test(String(value??'').trim());
}

/* Mengubah "1.2" menjadi [1,2,0] supaya versi bertingkat berapa pun tetap dapat dibandingkan. */
export function parseVersion(value){
  const cocok=String(value??'').trim().match(POLA);
  if(!cocok)return null;
  return [Number(cocok[1]),Number(cocok[2]||0),Number(cocok[3]||0)];
}

/* -1 bila a lebih lama, 0 bila sama, 1 bila a lebih baru. null bila salah satu tidak sah,
   sehingga pemanggil wajib memutuskan sendiri apa yang dilakukan pada versi tak dikenal —
   bukan diam-diam dianggap sama. */
export function compareVersions(a,b){
  const kiri=parseVersion(a),kanan=parseVersion(b);
  if(!kiri||!kanan)return null;
  for(let i=0;i<3;i+=1){
    if(kiri[i]>kanan[i])return 1;
    if(kiri[i]<kanan[i])return -1;
  }
  return 0;
}

export function isNewerVersion(kandidat,pembanding){return compareVersions(kandidat,pembanding)===1;}
export function isOlderVersion(kandidat,pembanding){return compareVersions(kandidat,pembanding)===-1;}
