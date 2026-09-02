# e-Rapor SDN Satria Jaya 01

Aplikasi e-Rapor lokal untuk SDN Satria Jaya 01. Frontend yang sama digunakan untuk web/PWA, Android melalui Capacitor, dan Windows melalui Electron. Data disimpan lokal pada browser atau WebView perangkat; aplikasi tidak memakai Supabase, Firebase, atau layanan cloud. Sinkronisasi Dapodik tersedia khusus pada aplikasi Windows dan menghubungi layanan Dapodik lokal di komputer sekolah, bukan layanan internet.

Folder `design_reference/`, `docs/`, `tests/`, dan `src/` merupakan bagian project dan tidak boleh dihapus.

## Persyaratan

- Node.js 22 atau lebih baru.
- npm.
- Android Studio Otter 2025.2.1 atau lebih baru untuk Android Capacitor 8.
- JDK 21 untuk build Android release.
- Windows 10/11 untuk membuat dan menjalankan paket desktop Windows.
- macOS dengan Xcode 26 atau lebih baru untuk build iOS.

## Menjalankan versi web

```bash
npm install
npm run check
npm test
npm run start
```

Buka `http://localhost:4173`. Untuk membuat paket web statis di folder `dist/`:

```bash
npm run build
```

## Login awal

### Admin

1. Pada instalasi/browser baru, pilih **Admin**.
2. Klik **Aktivasi Admin Pertama**.
3. Impor Owner Activation Key dan masukkan Owner PIN dari media credential eksternal. Key dan PIN tidak ditanam atau disimpan sebagai plaintext di aplikasi.
4. Buat password minimal delapan karakter yang memuat huruf besar, huruf kecil, dan angka.
5. Simpan kode recovery yang ditampilkan satu kali di tempat aman di luar browser.

Tidak ada password Admin default di source. Jika lupa password, gunakan kode recovery lokal. Recovery menghasilkan kode baru dan membuat kode lama tidak berlaku.

### Guru/Wali Kelas

Tersedia 24 akun `Guru1A` sampai `Guru6D`. Credential bootstrap mengikuti rombel, misalnya:

- Username: `Guru1A`
- Password awal: `Kelas1a`

Guru harus mengganti password awal melalui **Profile** atau **Pengaturan Akun**. Admin dapat mereset password Guru melalui **Data Pengguna**; password sementara hanya ditampilkan sekali. Admin juga dapat menonaktifkan akun Guru.

## Logo Cover Rapor

Cover rapor memakai dua logo sesuai format resmi: logo Tut Wuri Handayani di atas judul **SEKOLAH DASAR ( SD )** dan lambang kota/kabupaten di bawahnya. Logo diambil berurutan dari:

1. Logo yang diunggah Admin melalui **Data Referensi → Sekolah** (disimpan pada database lokal, berlaku untuk perangkat tersebut).
2. Logo bawaan aplikasi pada folder `assets/`:

```text
assets/logo-tut-wuri-handayani.png
assets/logo-kabupaten-bekasi.png
```

Salin kedua file logo dengan nama persis seperti di atas ke folder `assets/`, lalu jalankan `npm run build` (dan `npm run cap:android` untuk Android). Format PNG atau JPG; gunakan gambar persegi untuk Tut Wuri Handayani dan gambar tegak (lebih tinggi daripada lebar) untuk lambang daerah. Proporsi asli tetap terjaga karena slot memakai `object-fit: contain`.

Selama file belum tersedia dan Admin belum mengunggah logo, slot hanya menampilkan penanda di layar dan tidak ikut tercetak.

## Penyimpanan, backup, dan restore

- Data tersimpan permanen pada storage lokal browser/WebView perangkat.
- Data tidak tersinkron otomatis antarperangkat.
- Backup Admin mencakup seluruh database lokal.
- Backup Guru hanya mencakup kelas, semester, dan tahun pelajaran akun aktif.
- Restore selalu melalui validasi, preview, dan konfirmasi.
- Sistem membuat safety snapshot sebelum restore.
- Snapshot dapat dibuat, dipreview, dan dipulihkan melalui **Pengaturan → Backup & Restore → Snapshot Pemulihan**.

Simpan file backup secara berkala di media lain. Menghapus data aplikasi/browser juga menghapus data lokal dan snapshot yang belum diekspor.

## Android

Project Android tersedia di folder `android/` dengan App ID:

```text
id.sch.sdn.satriajaya01.erapor
```

Setiap kali frontend berubah, build dan sinkronkan:

```bash
npm run cap:android
```

Buka Android Studio dengan salah satu cara:

```bash
npm run open:android
```

atau buka folder `android/` langsung dari Android Studio. Pilih emulator/perangkat Android API 24 atau lebih baru, tunggu Gradle sync, lalu tekan **Run**. Icon, splash screen, status bar, navigation bar, safe-area, serta aset web offline sudah dikonfigurasi.

Untuk build command-line apabila Android SDK/JDK sudah tersedia:

```bash
cd android
gradlew.bat assembleDebug
```

### Release signing dan update APK

Identitas produksi permanen aplikasi adalah `id.sch.sdn.satriajaya01.erapor`. Jangan pernah mengganti `applicationId` tersebut dan jangan mendistribusikan APK debug.

Build release membaca credential dari `android/signing.properties`, yang sudah diabaikan Git. Template tanpa rahasia tersedia di `android/signing.properties.example`. Keystore dan password harus berada di luar repository, disimpan terpisah, dan seluruh update wajib menggunakan keystore yang sama.

Untuk instalasi signing pertama kali, generator lokal dapat membuat keystore, credential terpisah, dan `android/signing.properties` tanpa menampilkan password ke terminal:

```powershell
node scripts/generate-release-signing.mjs --output 'D:\Backup-Keystore-eRapor' --properties "$PWD\android\signing.properties" --keytool 'C:\Program Files\Android\Android Studio1\jbr\bin\keytool.exe'
```

Jangan jalankan generator lagi setelah APK produksi dibagikan. Pulihkan keystore dan credential yang sama dari backup untuk seluruh update berikutnya.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio1\jbr'
npm run cap:android
cd android
.\gradlew.bat assembleRelease
```

Rilis Tahap 14 menggunakan `versionName 1.1.0`, `versionCode 3`, dan `schemaVersion 3`. Naikkan `versionCode` pada setiap rilis; nilainya tidak boleh pernah sama atau lebih kecil daripada APK yang sudah terpasang. Untuk build terkontrol tanpa mengubah default source:

```powershell
.\gradlew.bat assembleRelease '-PERAPOR_VERSION_CODE=4' '-PERAPOR_VERSION_NAME=1.1.1'
```

Selaraskan juga `APP_VERSION` dan `VERSION_CODE` di `src/data/version.js` sebelum rilis update, agar halaman **Pengaturan → Tentang Aplikasi** menampilkan versi APK yang sama. Jangan pernah menurunkan `versionCode`.

### Data lokal saat update

- Update harus dipasang langsung di atas APK lama; jangan uninstall dan jangan clear data aplikasi.
- Database menyimpan `appSchemaVersion` dan `appVersion` terpisah dari format backup.
- Startup menjalankan migration berurutan sebelum membaca session atau modul lain.
- Sebelum migration, sistem membuat safety snapshot dengan versi aplikasi lama/baru, schema lama/baru, dan tanggal migration.
- Migration hanya menambah atau mengubah field yang dibutuhkan; koleksi lama tidak diganti dengan database default.
- Hasil migration divalidasi sebelum commit. Jika gagal, database asli dipulihkan persis dan aplikasi menampilkan pesan aman.
- Simpan APK produksi lama di folder arsip; jangan menimpanya saat membuat rilis baru.

Backup keystore wajib dilakukan sebelum distribusi:

1. Salin keystore ke minimal dua media terenkripsi yang berbeda.
2. Simpan password dan alias di password manager atau media terpisah.
3. Catat fingerprint SHA-256 dengan `keytool -list -v -keystore <keystore>`.
4. Uji pemulihan salinan keystore dengan menandatangani build internal.

Kehilangan keystore atau password membuat APK berikutnya tidak dapat dipasang sebagai update di atas versi lama.

## Windows Desktop

Versi Windows menggunakan source frontend dan format data lokal yang sama tanpa menduplikasi modul aplikasi. Dialog buka/simpan file serta Cetak/Simpan PDF menggunakan bridge native Electron.

Jalankan aplikasi desktop untuk pengembangan:

```bash
npm run desktop:start
```

Buat installer Windows:

```bash
npm run desktop:make
```

Installer Squirrel tersedia di `out/make/squirrel.windows/x64/`. Installer rilis yang siap disalin berada di folder `release/`. Data desktop disimpan di direktori data aplikasi Windows dan dipertahankan saat aplikasi diperbarui.

## Sinkronisasi Dapodik (khusus Windows)

Menu **Dapodik** hanya berfungsi pada aplikasi Windows, karena Dapodik berjalan sebagai layanan
lokal di komputer sekolah. Pada web/PWA dan Android menu tetap terlihat, tetapi hanya
menampilkan arahan memakai Windows dan tidak pernah menghubungi jaringan.

- Konfigurasi dan sinkronisasi hanya dapat dijalankan oleh Admin.
- Token Dapodik disimpan terenkripsi lewat `safeStorage` Electron di direktori data aplikasi,
  tidak pernah masuk penyimpanan browser, backup, log, atau pesan kesalahan, dan tidak pernah
  dikembalikan ke halaman.
- Aplikasi hanya mau menghubungi alamat loopback atau jaringan privat.
- **Ambil Data Dapodik selalu menghasilkan pratinjau.** Data lokal berubah hanya setelah Admin
  menyetujuinya, dan siswa manual tidak pernah dihapus karena tidak ada di Dapodik.

Langkah lengkap beserta urutan pengamanannya ada di
[`docs/operator/dapodik-windows.md`](docs/operator/dapodik-windows.md).

## iOS

Project iOS Capacitor tersedia di folder `ios/` dan menggunakan Swift Package Manager. Sinkronkan frontend dengan:

```bash
npm run cap:ios
```

Build iOS hanya dapat dilakukan pada macOS dengan Xcode 26 atau lebih baru:

```bash
npm run open:ios
```

Pilih signing team dan provisioning profile di Xcode sebelum menjalankan aplikasi pada simulator/perangkat. Deployment target minimum adalah iOS 15.

## Perintah penting

```bash
npm run check       # Pemeriksaan sintaks source
npm test            # Automated test
npm run build       # Build web ke dist/
npm run cap:sync    # Build web dan sinkronkan Android+iOS
npm run cap:android # Build dan sinkronkan Android
npm run cap:ios     # Build dan sinkronkan iOS
npm run desktop:start   # Jalankan desktop Windows
npm run desktop:make    # Build installer Windows
```

## Keamanan operasional

- Password tersimpan sebagai salted PBKDF2 hash, bukan plaintext.
- Owner Activation Key dan PIN hanya disimpan pada media credential eksternal; repository hanya memuat verifier hash.
- Sesi lokal memiliki masa berlaku dan otomatis logout saat kedaluwarsa.
- Jangan membagikan file backup Admin karena file tersebut memuat seluruh data lokal dan hash akun.
- Simpan kode recovery Admin serta backup di media yang aman.
