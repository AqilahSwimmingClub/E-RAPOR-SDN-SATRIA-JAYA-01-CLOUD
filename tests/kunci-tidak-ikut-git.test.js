import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* Repository ini publik. Bila keystore, signing.properties, atau catatan password ikut ter-commit,
   siapa pun dapat menandatangani aplikasi atas nama sekolah dan memasang pembaruan palsu ke HP
   guru. Menghapusnya kemudian tidak menolong karena riwayat git menyimpannya selamanya.

   Karena berkas itu wajar disalin ke folder proyek supaya mudah dicari, penjagaannya tidak boleh
   bergantung pada kehati-hatian saat menjalankan git add. Test ini gagal lebih dulu, sebelum
   apa pun sempat terkirim. */

const akar=fileURLToPath(new URL('../',import.meta.url));
const git=(...argumen)=>execFileSync('git',argumen,{cwd:akar,encoding:'utf8'});

/* Berkas rahasia dikenali dari bentuk namanya, bukan dari daftar nama tetap, supaya salinan
   seperti "erapor-release (1).jks" atau "secret-base64.txt" ikut tertangkap. */
const POLA_RAHASIA=[
  [/\.(jks|keystore|p12|pfx)$/i,'berkas keystore'],
  [/(^|\/)signing\.properties$/i,'signing.properties berisi password'],
  [/keystore-credentials/i,'catatan alias dan password'],
  [/(^|\/)secret-[^/]*\.txt$/i,'keluaran npm run signing:secrets --ke-berkas'],
  [/keystore-base64/i,'keystore utuh dalam bentuk base64'],
];

test('1. Tidak ada berkas kunci penandatanganan yang dilacak git',()=>{
  const terlacak=git('ls-files').split('\n').filter(Boolean);
  assert.ok(terlacak.length>0,'daftar berkas terbaca');
  const bocor=terlacak.flatMap(berkas=>{
    const cocok=POLA_RAHASIA.find(([pola])=>pola.test(berkas));
    return cocok?[`${berkas} (${cocok[1]})`]:[];
  });
  assert.deepEqual(bocor,[],`Berkas rahasia ikut dilacak git:\n  ${bocor.join('\n  ')}\n`
    +'Keluarkan dengan: git rm --cached <berkas>, lalu ganti keystore karena sudah dianggap bocor.');
});

test('2. Kunci yang disalin ke folder proyek tetap diabaikan git',()=>{
  /* git check-ignore bekerja pada nama berkas yang belum tentu ada, jadi ini menguji aturannya
     sendiri: seandainya berkas itu disalin ke sana, apakah git akan mengabaikannya. */
  const diabaikan=berkas=>{
    try{git('check-ignore','-q','--no-index',berkas);return true;}
    catch{return false;}
  };
  for(const berkas of [
    'erapor-release.jks','android/erapor-release.jks','dist/erapor-release.jks',
    'signing.properties','android/signing.properties','scripts/signing.properties',
    'KEYSTORE-CREDENTIALS.txt','e-Rapor-Keystore/KEYSTORE-CREDENTIALS.txt',
    'secret-base64.txt','secret-storePassword.txt','keystore-base64.txt',
    'kunci.keystore','kunci.p12',
  ])assert.ok(diabaikan(berkas),`${berkas} harus diabaikan git`);
});

test('3. Folder kerja saat ini bersih dari berkas rahasia yang belum diabaikan',()=>{
  /* Menangkap berkas yang sudah terlanjur ada di folder kerja namun lolos dari .gitignore,
     sehingga akan ikut terbawa oleh git add -A. */
  const belumTerlacak=git('status','--porcelain','--untracked-files=all').split('\n')
    .filter(baris=>baris.startsWith('?? ')).map(baris=>baris.slice(3).replace(/^"|"$/g,''));
  const bocor=belumTerlacak.filter(berkas=>POLA_RAHASIA.some(([pola])=>pola.test(berkas)));
  assert.deepEqual(bocor,[],`Berkas rahasia berikut belum diabaikan .gitignore:\n  ${bocor.join('\n  ')}`);
});
