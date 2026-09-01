import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSION_CODE } from '../src/data/version.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const alur=()=>read('.github/workflows/rilis.yml');

test('1. Build rilis hanya berjalan bila diminta, bukan pada setiap push',()=>{
  const t=alur();
  assert.ok(existsSync(new URL('.github/workflows/rilis.yml',root)),'workflow rilis tersedia');
  assert.match(t,/^on:\n  workflow_dispatch:/m,'satu-satunya pemicu adalah tombol Run workflow');
  for(const pemicu of ['\n  push:','\n  pull_request:','\n  schedule:'])assert.equal(t.includes(pemicu),false,`pemicu ${pemicu.trim()} tidak dipakai agar keystore tidak terpakai tanpa diminta`);
  assert.match(t,/options:\n          - semua\n          - android\n          - windows/,'guru dapat memilih target build');
});

test('2. Workflow hanya diberi izin baca dan tidak menulis ke repository',()=>{assert.match(alur(),/permissions:\n  contents: read/,'izin dibatasi hanya membaca isi repository');});

test('3. APK dan installer hanya dibangun setelah check dan seluruh test lulus',()=>{
  const t=alur();assert.match(t,/run: npm run check/,'sintaks diperiksa');assert.match(t,/run: npm test/,'seluruh test dijalankan');
  for(const pekerjaan of ['android:','windows:'])assert.match(t,new RegExp(`  ${pekerjaan}[\\s\\S]*?needs: periksa`),`${pekerjaan.replace(':','')} menunggu pemeriksaan lulus`);
});

test('4. Aset web dibangun ulang dan disalin ke proyek Android sebelum APK dibuat',()=>{
  const t=alur();assert.match(read('android/.gitignore'),/app\/src\/main\/assets\/public/,'aset Android memang tidak disimpan di git');
  const bagianAndroid=t.slice(t.indexOf('\n  android:'),t.indexOf('\n  windows:'));
  assert.match(bagianAndroid,/npm run build\n          npx cap sync android/,'build web lalu cap sync sebelum gradle');
  assert.ok(bagianAndroid.indexOf('npx cap sync android')<bagianAndroid.indexOf('assembleRelease'),'cap sync berjalan sebelum assembleRelease');
});

test('5. Keystore dibaca dari secret, bukan dari berkas di dalam repository',()=>{
  const t=alur();for(const kunci of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'])assert.match(t,new RegExp(`secrets\\.${kunci}`),`${kunci} dibaca dari GitHub Secrets`);
  assert.match(t,/Secret berikut belum diisi/,'build berhenti dengan pesan jelas bila secret kurang');
  assert.equal(/storePassword=[^$\n"]/.test(t),false,'password tidak pernah ditulis langsung');
  assert.equal(/\.jks["'\s]*$/m.test(t.replace(/\$\{?RUNNER_TEMP\}?\/erapor-release\.jks/g,'')),false,'tidak ada keystore yang ikut di repository');
});

test('6. Keystore sementara berada di luar folder repository dan selalu dihapus',()=>{
  const t=alur();assert.match(t,/base64 -d > "\$RUNNER_TEMP\/erapor-release\.jks"/);assert.match(t,/storeFile=\$RUNNER_TEMP\/erapor-release\.jks/);
  assert.match(t,/if: always\(\)\n        run: rm -f "\$RUNNER_TEMP\/erapor-release\.jks" android\/signing\.properties/);
  assert.match(read('.gitignore'),/^signing\.properties$/m);assert.match(read('.gitignore'),/^\*\.jks$/m);
});

test('7. Password bertanda garis miring terbalik tetap sampai utuh ke Gradle',()=>{
  const t=alur();assert.ok(t.includes(String.raw`escape() { printf '%s' "$1" | sed 's/\\/\\\\/g'; }`));
  for(const kunci of ['storePassword','keyAlias','keyPassword'])assert.match(t,new RegExp(`echo "${kunci}=\\$\\(escape "\\$[A-Z_]+"\\)"`));
});

test('8. Isi secret tidak pernah ditampilkan ke log',()=>{const t=alur();for(const bocor of ['echo "$KEYSTORE_BASE64"','echo $KEYSTORE_BASE64','cat android/signing.properties','echo "$STORE_PASSWORD"','echo "$KEY_PASSWORD"'])assert.equal(t.includes(bocor),false);});

test('8b. Keempat secret diperiksa lebih dulu dengan pesan yang menunjuk secret keliru',()=>{
  const t=alur();const bagian=t.slice(t.indexOf('Periksa keempat secret'),t.indexOf('Bangun APK rilis'));
  assert.ok(t.indexOf('Periksa keempat secret')<t.indexOf('./gradlew --no-daemon assembleRelease'));
  for(const [petunjuk,secret] of [[/kosong atau bukan base64 yang utuh/,'ANDROID_KEYSTORE_BASE64'],[/Keystore tidak dapat dibuka/,'ANDROID_KEYSTORE_PASSWORD'],[/Alias tidak ada di dalam keystore/,'ANDROID_KEY_ALIAS'],[/Kunci privat tidak dapat dibuka/,'ANDROID_KEY_PASSWORD']]){assert.match(bagian,petunjuk);assert.ok(bagian.includes(secret));}
  assert.match(bagian,/keytool -list -v .*grep -i 'SHA256:'/);assert.match(bagian,/-storepass "\$STORE_PASSWORD"/);
});

test('8c. gradlew dapat dijalankan di runner Linux',()=>{const mode=execFileSync('git',['ls-files','-s','android/gradlew'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim().split(/\s+/)[0];assert.equal(mode,'100755');assert.match(alur(),/chmod \+x gradlew\n          \.\/gradlew --no-daemon assembleRelease/);});

test('9. APK diperiksa tanda tangan dan versinya, lalu diunggah dengan nama berversi',()=>{const t=alur();assert.match(t,/apksigner" verify --print-certs/);assert.match(t,/aapt" dump badging/);assert.match(t,/E-RAPOR-SDN-SATRIA-JAYA-01-v\$VERSI\.apk/);assert.match(t,/if-no-files-found: error/);});

test('10. Installer Windows dibangun dari perintah proyek yang sudah ada',()=>{const t=alur();assert.match(t,/runs-on: windows-latest/);assert.match(t,/run: npm run desktop:win/);assert.match(JSON.parse(read('package.json')).scripts['desktop:win'],/^npm run build &&/);assert.match(t,/path: release\/windows\/\*\.exe/);});

test('11. Panduan build otomatis tersedia dan menyebut keempat secret',()=>{const doc=read('docs/BUILD-OTOMATIS.md');for(const kunci of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'])assert.ok(doc.includes(kunci));assert.match(doc,/keystore \*\*yang sama\*\*/);assert.match(doc,/BUILD VERIFIKASI/);});

test('12. Panduan menunjuk halaman secret yang benar, bukan halaman Environments',()=>{
  const doc=read('docs/BUILD-OTOMATIS.md');assert.match(doc,/settings\/secrets\/actions/);assert.match(doc,/BUKAN\*\* dibuat di menu \*\*Environments\*\*/);assert.match(doc,/New repository secret/);
  for(const baris of ['storePassword','keyAlias','keyPassword','storeFile'])assert.ok(doc.includes(baris));
  for(const perintah of ['npm run signing:secrets','npm run signing:secrets semua','npm run signing:secrets storePassword','npm run signing:secrets keyAlias','npm run signing:secrets keyPassword'])assert.ok(doc.includes(perintah));
  assert.match(doc,/erapor-release\.jks/);assert.match(doc,/KEYSTORE-CREDENTIALS\.txt/);assert.match(doc,/keystore benar-benar hilang/);assert.ok(doc.includes('npm run signing:ganti-password'));assert.ok(doc.includes('npm run signing:lokasi'));assert.match(doc,/GAGAL: Berkas keystore tidak ada di/);assert.match(doc,/isi berkas keystore ikut berubah\*\*\. Jadi tiga Secret harus/);assert.match(doc,/Pertimbangan keamanan/);assert.match(doc,/Backup dulu, di setiap perangkat Android\.\*\*/);assert.ok(doc.includes('npm run signing:baru'));assert.match(doc,/backup sebagai Guru hanya satu kelas, satu semester/);
});

test('13. Panduan menaikkan versi menyebut seluruh berkas yang harus ikut berubah',()=>{
  const doc=read('docs/BUILD-OTOMATIS.md');for(const berkas of ['src/data/version.js','sw.js','package.json','android/app/build.gradle'])assert.ok(doc.includes(berkas),`panduan menyebut ${berkas}`);
  assert.match(doc,/`APP_SCHEMA_VERSION` \*\*jangan\*\* diubah/,'panduan melarang mengubah schema tanpa alasan');
  assert.match(doc,/apk-android-v\d+\.\d+\.\d+/,'panduan memberi contoh nama artifact berversi');
  assert.ok(VERSION_CODE>0);
});
