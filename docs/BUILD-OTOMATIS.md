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

### 1.1 Ubah keystore menjadi teks base64

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
