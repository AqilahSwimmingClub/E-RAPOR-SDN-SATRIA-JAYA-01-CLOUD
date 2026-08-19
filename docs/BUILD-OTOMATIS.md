# Build Otomatis APK Android dan Installer Windows

Dokumen ini menjelaskan cara membangun APK Android dan installer Windows langsung di GitHub,
tanpa perlu memasang Android Studio atau Node.js di komputer.

Workflow-nya ada di `.github/workflows/rilis.yml` dan hanya berjalan bila Bapak/Ibu menekan
tombolnya sendiri. Tidak ada build otomatis pada setiap push, sehingga keystore hanya dipakai
ketika memang sedang membuat rilis baru.

---

## Bagian 1 — Menyiapkan keystore (cukup sekali seumur proyek)

APK rilis harus ditandatangani dengan keystore **yang sama** seperti rilis sebelumnya. Kalau
keystore-nya berbeda, Android akan menolak memasang APK baru di atas aplikasi yang sudah ada dan
guru harus uninstall dulu — itu berarti seluruh data rapor terhapus. Jadi pakai keystore lama,
jangan membuat yang baru.

### 1.0 Ambil dulu nilainya dari `android/signing.properties`

Keempat nilai yang dibutuhkan sudah ada di komputer Bapak/Ibu, di berkas
`android/signing.properties` pada folder proyek. Buka dengan Notepad. Isinya seperti ini:

```properties
storeFile=C:/aman/erapor-release.jks
storePassword=RahasiaKeystore123
keyAlias=erapor-release
keyPassword=RahasiaKunci456
```

Pemetaannya satu lawan satu — tidak perlu menebak apa pun:

| Baris di `signing.properties` | Menjadi Secret              |
| ----------------------------- | --------------------------- |
| `storeFile=` (berkas `.jks`)  | diubah ke base64 → `ANDROID_KEYSTORE_BASE64` |
| `storePassword=`              | `ANDROID_KEYSTORE_PASSWORD` |
| `keyAlias=`                   | `ANDROID_KEY_ALIAS`         |
| `keyPassword=`                | `ANDROID_KEY_PASSWORD`      |

Kalau ragu dengan nama alias, periksa langsung ke keystore-nya:

```powershell
keytool -list -v -keystore "C:\aman\erapor-release.jks"
```

Cari baris `Alias name:` — itulah isi `ANDROID_KEY_ALIAS`.

#### Cara termudah: biarkan proyek yang menyiapkannya

Tidak perlu membuka berkas atau mengetik base64 sendiri. Di folder proyek, jalankan:

```powershell
npm run signing:secrets                       # ANDROID_KEYSTORE_BASE64
npm run signing:secrets storePassword         # ANDROID_KEYSTORE_PASSWORD
npm run signing:secrets keyAlias              # ANDROID_KEY_ALIAS
npm run signing:secrets keyPassword           # ANDROID_KEY_PASSWORD
```

Atau sekalian keempatnya, dituntun satu per satu supaya tidak ada yang terlewat:

```powershell
npm run signing:secrets semua
```

Setiap perintah membaca `android/signing.properties`, menyebutkan nama Secret yang harus dipakai,
lalu **menyalin nilainya langsung ke clipboard**. Tinggal Ctrl+V pada kotak **Secret** di GitHub.

Yang tampil di layar hanya bentuk tersamar seperti `Pw\*********3 x (15 karakter)`, jadi aman
walaupun layarnya terlihat orang lain. Jumlah karakternya tetap ditampilkan supaya bisa dipastikan
salinannya utuh. Tambahkan `--tampilkan` hanya bila memang perlu melihat nilai penuhnya.

#### Menyamakan password keystore agar mudah diingat

Password bawaan keystore ini dibuat acak sepanjang 28 karakter. Kalau ingin disamakan menjadi satu
password yang mudah diingat, jalankan di folder proyek:

```powershell
npm run signing:ganti-password 230191
```

Perintah ini mengganti password keystore **dan** password kunci sekaligus. Yang berubah hanya
passwordnya: kunci penandatanganan, alias, dan sertifikatnya tetap sama persis, sehingga APK hasil
build berikutnya **tetap dapat dipasang menimpa aplikasi yang sudah ada tanpa kehilangan data**.

Pengamannya: keystore lama disalin lebih dulu ke berkas `.cadangan-<waktu>`, password lama
diperiksa dulu sebelum apa pun diubah, dan bila `keytool` gagal di tengah jalan keystore langsung
dikembalikan dari salinan itu. Minimal 6 karakter — itu syarat `keytool`, bukan syarat aplikasi.

> Setelah password diganti, **isi berkas keystore ikut berubah**. Jadi tiga Secret harus
> diperbarui, bukan hanya dua: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, dan
> `ANDROID_KEY_PASSWORD`. Cukup jalankan lagi ketiga perintah `npm run signing:secrets` di atas,
> lalu tempel ulang di GitHub (klik nama secret yang sudah ada, isi nilai baru, Update secret).
> `ANDROID_KEY_ALIAS` tidak berubah.

> **Pertimbangan keamanan:** password pendek seperti enam digit mudah ditebak bila berkas `.jks`
> sampai bocor, dan siapa pun yang memegangnya bisa menandatangani APK atas nama aplikasi ini.
> Selama keystore hanya tersimpan di komputer sekolah dan di GitHub Secrets, risikonya kecil.
> Jangan menyimpan keystore di folder yang ikut tersinkron ke layanan berbagi pakai.

#### Kalau alamat keystore sudah tidak berlaku

Ketika folder proyek diunduh ulang atau dipindah, baris `storeFile` pada `signing.properties`
sering masih menunjuk ke folder proyek yang lama, sehingga muncul pesan
`GAGAL: Berkas keystore tidak ada di ...`. Betulkan dengan:

```powershell
npm run signing:lokasi
```

Perintah ini mencari `erapor-release.jks` di folder pengguna, menampilkan lokasinya beserta sidik
jari sertifikatnya, lalu memperbarui baris `storeFile` saja. Password dan alias tidak disentuh, dan
berkas keystore-nya sendiri tidak pernah diubah.

Kalau sudah tahu lokasinya, sebutkan langsung:

```powershell
npm run signing:lokasi "C:\Users\UsEr\Downloads\E-RAPOR-SDN-SATRIA-JAYA-01-CODEX-V1\release-signing\erapor-release.jks"
```

Keystore yang ternyata milik proyek lain akan ditolak, karena perintah ini memeriksa dulu apakah
keystore itu benar-benar terbuka dengan password dan alias yang tercatat.

#### Kalau berkas keystore tidak ditemukan

Cari dulu di seluruh komputer:

```powershell
Get-ChildItem -Path C:\ -Recurse -Filter "erapor-release.jks" -ErrorAction SilentlyContinue
Get-ChildItem -Path C:\ -Recurse -Filter "KEYSTORE-CREDENTIALS.txt" -ErrorAction SilentlyContinue
```

`KEYSTORE-CREDENTIALS.txt` dibuat berbarengan dengan keystore dan memuat alias serta kedua
passwordnya. Periksa juga flashdisk, Google Drive, atau folder cadangan.

> **Kalau keystore benar-benar hilang, APK baru tidak akan bisa memasang menimpa aplikasi yang
> sekarang** — Android menolak APK dengan tanda tangan berbeda. Urutan yang aman:
>
> **1. Backup dulu, di setiap perangkat Android.** Login sebagai **Admin** → menu **Backup &
> Restore** → **Download Backup**. Backup sebagai Admin mencakup seluruh database termasuk akun
> dan status aktivasi; backup sebagai Guru hanya satu kelas, satu semester, satu tahun ajaran.
> Salin berkasnya keluar dari perangkat, jangan hanya disimpan di perangkat yang akan dipasang
> ulang.
>
> **2. Buat keystore baru:**
>
> ```powershell
> npm run signing:baru 230191
> ```
>
> Perintah ini menelusuri komputer lebih dulu. Bila keystore lama ternyata masih ada, pembuatan
> dibatalkan dan penggunanya diarahkan memakai yang lama — karena memakai keystore lama berarti
> perangkat tidak perlu dipasang ulang sama sekali. Keystore baru disimpan di
> `%USERPROFILE%\e-Rapor-Keystore` yaitu **di luar folder proyek**, supaya tidak ikut hilang lagi
> ketika folder proyek diunduh ulang.
>
> **3. Perbarui keempat GitHub Secrets** dengan `npm run signing:secrets` (kali ini termasuk
> `ANDROID_KEY_ALIAS`), lalu jalankan workflow untuk membangun APK baru.
>
> **4. Di setiap perangkat:** uninstall aplikasi lama, pasang APK baru, lalu **Restore** dari
> berkas backup langkah 1.
>
> Setelah selesai, salin folder `e-Rapor-Keystore` ke flashdisk atau Google Drive. Isinya
> `erapor-release.jks` dan `KEYSTORE-CREDENTIALS.txt`; tanpa keduanya kejadian ini akan terulang.

### 1.1 Ubah berkas keystore menjadi teks base64

Keystore adalah berkas biner, sedangkan GitHub Secrets hanya menyimpan teks. Ubah dulu ke base64.

**Windows (PowerShell):**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\ke\erapor-release.jks")) | Set-Clipboard
```

Hasilnya langsung tersalin ke clipboard.

**Linux atau macOS:**

```bash
base64 -w0 ~/path/ke/erapor-release.jks > keystore-base64.txt
```

Lalu buka `keystore-base64.txt` dan salin seluruh isinya.

### 1.2 Masukkan sebagai Secret di GitHub

> ### ⚠️ Halaman yang benar
>
> Secret **BUKAN** dibuat di menu **Environments**. Kalau di layar tertulis
> "Environments / Add" dengan tombol hijau **Configure environment**, itu halaman yang salah —
> tekan tombol Back browser dan jangan lanjutkan.
>
> Cara paling aman: tempelkan alamat ini langsung ke address bar browser.
>
> ```
> https://github.com/AqilahSwimmingClub/E-RAPOR-SDN-SATRIA-JAYA-01-CLOUD/settings/secrets/actions
> ```
>
> Kalau ingin lewat menu: **Settings** → gulir sidebar kiri ke bawah sampai bagian
> **Security** → **Secrets and variables** → **Actions**. Judul halamannya
> "Actions secrets and variables" dan ada tombol hijau **New repository secret** di kanan atas.

Di halaman itu, klik **New repository secret**, isi kotak **Name** dan **Secret**, lalu
**Add secret**. Ulangi empat kali:

| Klik ke | Kotak **Name**              | Kotak **Secret** (contoh)                                   |
| ------- | --------------------------- | ------------------------------------------------------------ |
| ke-1    | `ANDROID_KEYSTORE_BASE64`   | `MIIKvgIBAzCCCngGCSqGSIb3DQEHAaCCCnkEggp1MIIKcTCCBe...` — teks panjang hasil langkah 1.1, satu baris tanpa spasi |
| ke-2    | `ANDROID_KEYSTORE_PASSWORD` | `RahasiaKeystore123` — isi `storePassword`                   |
| ke-3    | `ANDROID_KEY_ALIAS`         | `erapor-release` — isi `keyAlias`                            |
| ke-4    | `ANDROID_KEY_PASSWORD`      | `RahasiaKunci456` — isi `keyPassword`                        |

Nama harus ditulis persis seperti di kolom **Name** di atas: huruf besar semua, memakai garis
bawah, tanpa spasi. Salah satu huruf saja berbeda, build akan berhenti dengan pesan
"Secret berikut belum diisi".

Kalau sudah benar, halaman **Actions secrets and variables** akan menampilkan daftar berisi
tepat empat baris dengan keempat nama tersebut. Nilainya tidak ditampilkan — memang begitu
seharusnya.

> Kalau tadi sempat terbuat Environment bernama `ANDROID_KEYSTORE_BASE64`, hapus saja lewat
> **Settings → Environments** → tiga titik di sebelah namanya → **Delete**. Environment itu tidak
> dipakai workflow ini dan tidak berpengaruh apa-apa, hanya membingungkan nanti.

> **Penting:** setelah disimpan, isi secret tidak bisa dilihat lagi oleh siapa pun, termasuk oleh
> pemilik repository. GitHub juga menyensor nilainya bila sampai terbawa ke log. Jangan pernah
> menempelkan password ke Issue, Pull Request, atau chat.

Password boleh mengandung karakter apa pun, termasuk `\`, `:`, `=`, dan spasi — workflow sudah
menanganinya saat menulis `signing.properties` untuk Gradle.

Hapus `keystore-base64.txt` setelah selesai. Berkas itu setara dengan keystore aslinya.

---

## Bagian 2 — Menjalankan build

1. Buka repository di GitHub → tab **Actions**.
2. Pilih workflow **Rilis Aplikasi** pada daftar di kiri.
3. Klik tombol **Run workflow** di kanan.
4. Pilih yang ingin dibangun:
   - `semua` — APK Android dan installer Windows sekaligus
   - `android` — hanya APK
   - `windows` — hanya installer `.exe`
5. Klik **Run workflow** sekali lagi, lalu tunggu. Umumnya 10–20 menit.

Urutan kerjanya: workflow memeriksa sintaks seluruh berkas, menjalankan **semua test**, membangun
aset web, baru kemudian membangun aplikasi. Kalau ada test yang gagal, build dihentikan dan APK
tidak dibuat — jadi tidak mungkin keluar rilis dari kode yang rusak.

---

## Bagian 3 — Mengunduh hasilnya

Setelah build hijau (tanda centang), buka halaman run tersebut lalu gulir ke bawah ke bagian
**Artifacts**. Akan ada:

- `apk-android-v1.1.7` → berisi `E-RAPOR-SDN-SATRIA-JAYA-01-v1.1.7.apk`
- `installer-windows-v1.1.7` → berisi `E-RAPOR-SDN-SATRIA-JAYA-01-Setup-1.1.7.exe`

Klik namanya untuk mengunduh (berbentuk `.zip`, tinggal diekstrak). Artifact disimpan 30 hari.

---

## Bagian 4 — Memasang di perangkat

**Android.** Salin APK ke HP atau tablet, buka, lalu pasang. Karena `versionCode` selalu naik dan
tanda tangannya sama, APK baru **memasang menimpa** aplikasi lama. Tidak perlu uninstall dan
seluruh data rapor tetap utuh.

**Windows.** Jalankan `.exe`-nya langsung di atas instalasi lama. `appId`, `productName`, dan GUID
installer dikunci sama di setiap rilis, jadi Windows mengenalinya sebagai pembaruan. Folder data di
`%APPDATA%\e-Rapor SDN Satria Jaya 01` tidak pernah dihapus, bahkan saat uninstall.

Untuk memastikan yang terpasang benar-benar versi baru, buka **Pengaturan → Tentang Aplikasi** dan
periksa baris **BUILD VERIFIKASI**.

---

## Bagian 5 — Menaikkan versi sebelum rilis berikutnya

Nomor versi harus naik setiap kali membuat rilis baru, kalau tidak APK baru akan ditolak Android
karena `versionCode`-nya tidak lebih tinggi. Empat berkas ini harus diubah bersamaan:

| Berkas                     | Yang diubah                                          |
| -------------------------- | ---------------------------------------------------- |
| `src/data/version.js`      | `APP_VERSION`, `VERSION_CODE`, `BUILD_TAG`, `PREVIOUS_RELEASE` |
| `sw.js`                    | `APP_CACHE_VERSION` (format `versi-versionCode`)      |
| `package.json`             | `version`                                             |
| `android/app/build.gradle` | default `ERAPOR_VERSION_CODE` dan `ERAPOR_VERSION_NAME` |

`APP_SCHEMA_VERSION` **jangan** diubah selama format data lokal tidak berubah. Angka itulah yang
membuat rilis baru membaca database guru yang sudah ada apa adanya, tanpa migrasi paksa.

Test `tests/update-lama.test.js` dan `tests/migrations.test.js` sudah menjaga aturan ini: kalau
salah satu berkas lupa diperbarui, test gagal dan build berhenti sebelum menghasilkan APK.

---

## Bagian 6 — Kalau build gagal

| Pesan pada log                                       | Artinya dan cara memperbaiki                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Secret berikut belum diisi: ...`                    | Ada secret yang belum dibuat atau namanya salah ketik. Ulangi Bagian 1.2.                     |
| `Failed to read key ... wrong password`              | `ANDROID_KEYSTORE_PASSWORD` atau `ANDROID_KEY_PASSWORD` keliru.                              |
| `Keystore was tampered with, or password was incorrect` | Teks base64 tidak tersalin utuh. Ulangi Bagian 1.1, pastikan tanpa spasi atau baris baru terpotong. |
| `No key with alias ... found`                        | `ANDROID_KEY_ALIAS` keliru. Periksa dengan `keytool -list -v -keystore erapor-release.jks`.  |
| Test gagal                                           | Ada kode yang rusak. Perbaiki dulu, jangan lewati test — inilah yang menjaga data guru aman.  |

Keystore sementara pada runner selalu dihapus setelah build, baik berhasil maupun gagal.
