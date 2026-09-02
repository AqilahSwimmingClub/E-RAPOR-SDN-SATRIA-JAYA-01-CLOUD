# Tahap 9 — Pembaruan Resmi, Tentang & Pembaruan, dan Pembelian Lisensi

Dokumen singkat untuk Pemilik aplikasi dan sekolah pengguna. Bagian lisensi ada di
[LICENSE-SYSTEM.md](LICENSE-SYSTEM.md).

## 1. Prinsip

- **Pembaruan terpisah dari lisensi.** Gagal memeriksa pembaruan tidak pernah berarti lisensi
  dicabut, aplikasi ilegal, atau database rusak. Tidak ada satu baris pun pada jalur pembaruan
  yang menyentuh lisensi, ikatan perangkat, atau database sekolah.
- **Aplikasi tidak pernah memasang sendiri.** Yang dilakukan aplikasi hanyalah membuka alamat
  rilis resmi. Pemasangannya tetap keputusan pengguna dan sistem operasi, sehingga data e-Rapor
  yang sudah ada tidak pernah dihapus oleh pembaruan.
- **Hanya sumber resmi.** Alamat unduhan wajib `https` dan berada pada host rilis resmi. Aturan
  itu ditegakkan dua kali: server menolak menyimpannya, dan aplikasi menolak menampilkannya.

## 2. Menu Tentang & Pembaruan

Tersedia untuk Admin dan Guru pada kelompok menu **AKUN**. Halaman ini tetap dapat dibuka saat
aplikasi berada dalam mode terbatas, justru karena di saat itulah sekolah perlu melihat versinya
dan menghubungi pengembang.

Yang ditampilkan: Versi Terpasang, Versi Terbaru, Status Pembaruan, Tanggal Rilis, dan Catatan
Pembaruan, beserta tombol **Periksa Pembaruan** dan — bila ada — **Unduh Pembaruan**.

Status yang mungkin muncul:

| Status | Arti |
| --- | --- |
| Versi Terbaru | Versi terpasang sama dengan rilis terbaru |
| Pembaruan Tersedia | Ada rilis lebih baru, aplikasi tetap dapat dipakai penuh |
| Pembaruan Wajib | Versi terpasang di bawah versi minimum yang didukung |
| Tidak Dapat Memeriksa Pembaruan | Server belum dikonfigurasi, atau platform belum didukung |
| Sedang Offline | Perangkat tidak dapat menghubungi server pembaruan |

Pemeriksaan otomatis dibatasi satu kali per 12 jam supaya aplikasi tidak terus-menerus
menghubungi server. Tombol Periksa Pembaruan tetap dapat ditekan kapan saja.

## 3. Sumber versi

`src/data/version.js` adalah satu-satunya sumber versi aplikasi, dan `package.json` serta
`versionName` Android dijaga selaras dengannya oleh test. Perbandingan versi memakai
`src/data/version-compare.js` — dibandingkan per angka, bukan sebagai teks, sehingga
`1.2.9 < 1.3.0` dan `1.9.9 < 2.0.0` diputuskan dengan benar. Berkas comparator yang sama
diimpor server, jadi keputusannya tidak mungkin berbeda antara klien dan server.

## 4. Endpoint

```
GET /api/v1/updates/latest?platform=android&version=1.2.1
```

`platform` wajib `android` atau `windows`; `version` wajib berbentuk angka. Keduanya divalidasi
server — data dari client tidak dipercaya begitu saja.

```json
{
  "implemented": true,
  "platform": "android",
  "installedVersion": "1.2.1",
  "latestVersion": "1.2.2",
  "minimumSupportedVersion": "1.2.0",
  "updateAvailable": true,
  "mandatory": false,
  "releasedAt": "2026-09-01T00:00:00.000Z",
  "notes": "…",
  "downloadUrl": "https://github.com/…/e-rapor-1.2.2.apk"
}
```

**Update wajib** hanya terjadi bila versi terpasang berada DI BAWAH `minimumSupportedVersion`.
Contoh: terpasang 1.1.0, terbaru 1.3.0, minimum 1.2.0 → wajib. Terpasang 1.2.1 pada minimum yang
sama → opsional.

## 5. Owner Panel — Versi Aplikasi

Tab **Versi Aplikasi** hanya dapat dibuka Pemilik; seluruh endpointnya menuntut sesi Pemilik dan
menjawab `401` untuk siapa pun yang lain. Admin sekolah dan Guru tidak punya akses sama sekali.

| Endpoint | Guna |
| --- | --- |
| `GET /api/v1/owner/app-versions` | Daftar seluruh versi |
| `POST /api/v1/owner/app-versions` | Tambah versi (tersimpan sebagai draf) |
| `POST /api/v1/owner/app-versions/:id/publish` | Terbitkan ke sekolah |
| `POST /api/v1/owner/app-versions/:id/unpublish` | Tarik kembali |
| `POST /api/v1/owner/app-versions/:id/delete` | Hapus catatan versi |

Versi baru selalu berstatus **draf**; sekolah hanya menerima versi yang sudah diterbitkan. Versi
tanpa alamat unduhan resmi tidak dapat diterbitkan, supaya sekolah tidak pernah melihat
"Pembaruan Tersedia" tanpa cara mendapatkannya. Setiap tindakan tercatat di Riwayat/audit log.

Host rilis resmi dapat ditambah lewat environment server `UPDATE_DOWNLOAD_HOSTS` (dipisah koma)
bila kelak rilis dipindahkan — tetap daftar-putih, tetap server-side.

## 6. Android dan Windows

Identitas paket **tidak berubah pada tahap ini** dan dijaga test:

- Android `applicationId` tetap `id.sch.sdn.satriajaya01.erapor`.
- Windows `appId` tetap `id.sch.sdn.satriajaya01.erapor`, `productName` tetap
  `e-Rapor SDN Satria Jaya 01`, NSIS `guid` tetap `9a3f0d21-6c4b-5e88-9d17-2f6a1b7c4e30`, dan
  lokasi `userData` tetap sama.

Selama identitas dan penandatanganan itu tidak berubah, APK dan installer berikutnya terpasang
sebagai pembaruan atas aplikasi lama, bukan sebagai aplikasi berbeda — dan data pengguna tetap
di tempatnya. Aplikasi tidak pernah menghapus APK, installer, maupun data lama.

## 7. Pembelian lisensi dan kontak

Nomor WhatsApp resmi ditulis **satu kali saja**, di `src/data/app-identity.js`
(`CONTACT_WHATSAPP`). Seluruh tombol menyusun tautannya dari sana, sehingga penggantian nomor
cukup dilakukan pada satu baris. Test menjaga agar nomor itu tidak tersebar ke berkas lain.

Pesan WhatsApp memuat **identitas sekolah dan versi aplikasi saja**, dan pengguna dapat
mengubahnya di kotak teks sebelum mengirim. Tidak pernah ikut: nama siswa, NISN, nilai, absensi,
password, token lisensi, Installation ID, maupun License Key.

Informasi pembelian hanya ada di halaman Tentang & Pembaruan. Tidak ada popup saat login, tidak
ada banner di Dashboard, dan tidak ada apa pun yang ikut tercetak ke rapor, leger, cover, atau
PDF.

## 8. Yang tidak berubah

`DB_KEY` tetap `erapor_satria_jaya_01_v1`. Tidak ada `localStorage.clear()`, tidak ada migrasi
destruktif. Kolom baru `app_versions` ditambahkan dengan `ALTER TABLE … ADD COLUMN`, bukan
dengan membuat ulang tabel, dan diuji di atas PostgreSQL sungguhan agar baris lama tetap utuh.
Hasil pemeriksaan pembaruan disimpan pada kunci `erapor_update_v1` — di luar `DB_KEY` — sehingga
tidak pernah ikut ke berkas backup akademik.

Tampilan rapor tetap terkunci pada baseline `d093b99` dan dijaga
`tests/report-layout-lock.test.js`.
