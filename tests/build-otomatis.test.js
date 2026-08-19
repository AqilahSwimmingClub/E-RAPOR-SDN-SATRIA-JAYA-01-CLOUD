import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { APP_VERSION, VERSION_CODE } from '../src/data/version.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const alur=()=>read('.github/workflows/rilis.yml');

/* ------------------------------------------------------- 1-2. Kapan build boleh berjalan */

test('1. Build rilis hanya berjalan bila diminta, bukan pada setiap push',()=>{
  const t=alur();
  assert.ok(existsSync(new URL('.github/workflows/rilis.yml',root)),'workflow rilis tersedia');
  assert.match(t,/^on:\n  workflow_dispatch:/m,'satu-satunya pemicu adalah tombol Run workflow');
  for(const pemicu of ['\n  push:','\n  pull_request:','\n  schedule:'])
    assert.equal(t.includes(pemicu),false,`pemicu ${pemicu.trim()} tidak dipakai agar keystore tidak terpakai tanpa diminta`);
  assert.match(t,/options:\n          - semua\n          - android\n          - windows/,'guru dapat memilih target build');
});

test('2. Workflow hanya diberi izin baca dan tidak menulis ke repository',()=>{
  assert.match(alur(),/permissions:\n  contents: read/,'izin dibatasi hanya membaca isi repository');
});

/* --------------------------------------------------- 3-4. Mutu kode diperiksa lebih dulu */

test('3. APK dan installer hanya dibangun setelah check dan seluruh test lulus',()=>{
  const t=alur();
  assert.match(t,/run: npm run check/,'sintaks diperiksa');
  assert.match(t,/run: npm test/,'seluruh test dijalankan');
  for(const pekerjaan of ['android:','windows:'])
    assert.match(t,new RegExp(`  ${pekerjaan}[\\s\\S]*?needs: periksa`),`${pekerjaan.replace(':','')} menunggu pemeriksaan lulus`);
});

test('4. Aset web dibangun ulang dan disalin ke proyek Android sebelum APK dibuat',()=>{
  const t=alur();
  /* Folder aset Android ada di .gitignore, jadi isinya wajib dibuat ulang di runner supaya APK
     benar-benar membawa kode terbaru, bukan sisa build lama. */
  assert.match(read('android/.gitignore'),/app\/src\/main\/assets\/public/,'aset Android memang tidak disimpan di git');
  const bagianAndroid=t.slice(t.indexOf('\n  android:'),t.indexOf('\n  windows:'));
  assert.match(bagianAndroid,/npm run build\n          npx cap sync android/,'build web lalu cap sync sebelum gradle');
  assert.ok(bagianAndroid.indexOf('npx cap sync android')<bagianAndroid.indexOf('assembleRelease'),'cap sync berjalan sebelum assembleRelease');
});

/* ------------------------------------------------------------- 5-8. Keamanan credential */

test('5. Keystore dibaca dari secret, bukan dari berkas di dalam repository',()=>{
  const t=alur();
  for(const kunci of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'])
    assert.match(t,new RegExp(`secrets\\.${kunci}`),`${kunci} dibaca dari GitHub Secrets`);
  assert.match(t,/Secret berikut belum diisi/,'build berhenti dengan pesan jelas bila secret kurang');
  /* Tidak ada credential yang ditulis apa adanya di dalam workflow. */
  assert.equal(/storePassword=[^$\n"]/.test(t),false,'password tidak pernah ditulis langsung');
  assert.equal(/\.jks["'\s]*$/m.test(t.replace(/\$\{?RUNNER_TEMP\}?\/erapor-release\.jks/g,'')),false,'tidak ada keystore yang ikut di repository');
});

test('6. Keystore sementara berada di luar folder repository dan selalu dihapus',()=>{
  const t=alur();
  assert.match(t,/base64 -d > "\$RUNNER_TEMP\/erapor-release\.jks"/,'keystore ditulis ke folder sementara runner');
  assert.match(t,/storeFile=\$RUNNER_TEMP\/erapor-release\.jks/,'gradle menunjuk ke berkas sementara itu');
  assert.match(t,/if: always\(\)\n        run: rm -f "\$RUNNER_TEMP\/erapor-release\.jks" android\/signing\.properties/,'dihapus walaupun build gagal');
  assert.match(read('.gitignore'),/android\/signing\.properties/,'signing.properties tidak pernah ikut ter-commit');
  assert.match(read('.gitignore'),/\*\.jks/,'berkas keystore tidak pernah ikut ter-commit');
});

test('7. Password bertanda garis miring terbalik tetap sampai utuh ke Gradle',()=>{
  const t=alur();
  /* signing.properties dibaca dengan java.util.Properties, dan di format itu "\" berarti escape.
     Tanpa penggandaan, password seperti "ra\hasia" akan berubah dan build gagal membuka keystore. */
  assert.ok(t.includes(String.raw`escape() { printf '%s' "$1" | sed 's/\\/\\\\/g'; }`),'ada fungsi escape yang menggandakan garis miring terbalik');
  for(const kunci of ['storePassword','keyAlias','keyPassword'])
    assert.match(t,new RegExp(`echo "${kunci}=\\$\\(escape "\\$[A-Z_]+"\\)"`),`${kunci} ditulis lewat escape`);
});

test('8. Isi secret tidak pernah ditampilkan ke log',()=>{
  const t=alur();
  for(const bocor of ['echo "$KEYSTORE_BASE64"','echo $KEYSTORE_BASE64','cat android/signing.properties','echo "$STORE_PASSWORD"','echo "$KEY_PASSWORD"'])
    assert.equal(t.includes(bocor),false,`workflow tidak boleh menampilkan ${bocor}`);
});

/* ---------------------------------------------------------- 9-10. Hasil build dan bukti */

test('9. APK diperiksa tanda tangan dan versinya, lalu diunggah dengan nama berversi',()=>{
  const t=alur();
  assert.match(t,/apksigner" verify --print-certs/,'tanda tangan APK dibuktikan, bukan diasumsikan');
  assert.match(t,/aapt" dump badging/,'versi di dalam APK ikut ditampilkan');
  assert.match(t,/E-RAPOR-SDN-SATRIA-JAYA-01-v\$VERSI\.apk/,'nama berkas memuat nomor versi');
  assert.match(t,/if-no-files-found: error/,'artifact kosong dianggap gagal, bukan lolos diam-diam');
});

test('10. Installer Windows dibangun dari perintah proyek yang sudah ada',()=>{
  const t=alur();
  assert.match(t,/runs-on: windows-latest/,'installer dibangun di Windows asli, tanpa emulasi');
  assert.match(t,/run: npm run desktop:win/,'memakai skrip rilis yang sama dengan build manual');
  assert.match(JSON.parse(read('package.json')).scripts['desktop:win'],/^npm run build &&/,'installer selalu dari source terbaru');
  assert.match(t,/path: release\/windows\/\*\.exe/);
});

/* -------------------------------------------------------------- 11-12. Panduan untuk guru */

test('11. Panduan build otomatis tersedia dan menyebut keempat secret',()=>{
  const doc=read('docs/BUILD-OTOMATIS.md');
  for(const kunci of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'])
    assert.ok(doc.includes(kunci),`panduan menyebut ${kunci}`);
  assert.match(doc,/keystore \*\*yang sama\*\*/,'panduan menegaskan keystore harus sama dengan rilis sebelumnya');
  assert.match(doc,/BUILD VERIFIKASI/,'panduan menunjukkan cara memastikan build terbaru benar terpasang');
});

test('12. Panduan menaikkan versi menyebut seluruh berkas yang harus ikut berubah',()=>{
  const doc=read('docs/BUILD-OTOMATIS.md');
  for(const berkas of ['src/data/version.js','sw.js','package.json','android/app/build.gradle'])
    assert.ok(doc.includes(berkas),`panduan menyebut ${berkas}`);
  assert.match(doc,/`APP_SCHEMA_VERSION` \*\*jangan\*\* diubah/,'panduan melarang mengubah schema tanpa alasan');
  /* Nomor versi pada panduan harus mengikuti versi aplikasi yang sedang berjalan. */
  assert.ok(doc.includes(`v${APP_VERSION}`),`panduan memakai contoh versi ${APP_VERSION}`);
  assert.ok(VERSION_CODE>0);
});
