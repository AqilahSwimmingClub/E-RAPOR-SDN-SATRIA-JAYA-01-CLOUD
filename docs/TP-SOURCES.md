# Sumber Tujuan Pembelajaran (TP) Bawaan e-Rapor

Dokumen ini menjelaskan dari mana TP bawaan aplikasi berasal, apa statusnya, dan apa yang
BUKAN dilakukan aplikasi terhadap TP.

## 1. Hal terpenting lebih dulu

**Pemerintah menetapkan Capaian Pembelajaran (CP), bukan Tujuan Pembelajaran.** TP disusun oleh
satuan pendidikan dan guru dengan menurunkannya dari CP, lalu dirangkai menjadi Alur Tujuan
Pembelajaran (ATP). Karena itu:

- Seluruh TP bawaan aplikasi berstatus **inspiratif / acuan**, bukan teks nasional yang wajib
  dipakai.
- Setiap butir **dapat diubah, ditambah, dinonaktifkan, atau dihapus** guru melalui menu
  Tujuan Pembelajaran.
- TP buatan guru selalu menang atas katalog bawaan. Katalog bawaan tidak pernah ditulis ke
  database dan tidak pernah menimpa TP sekolah.

## 2. TP adalah acuan penilaian, BUKAN nilai per TP

Aplikasi memakai TP sebagai **acuan** kompetensi dan sebagai bahan deskripsi rapor. Aplikasi
tidak pernah menyimpan angka per TP.

Nilai Akhir tetap berasal dari lima komponen yang sudah dipakai sekolah:

```
Formatif + Penilaian Harian + Penilaian Praktik
  + Sumatif Lingkup Materi + Sumatif Akhir Semester
  → (Bobot Penilaian) → SATU Nilai Akhir
```

Yang disimpan pada pemilihan TP hanyalah **daftar ID TP** yang dicentang guru pada menu
Tujuan Pembelajaran. Tidak ada satu pun angka di dalamnya.

## 3. Rujukan resmi

| Kelompok | Dokumen | Lembaga berwenang | Nomor keputusan | Tahun | Tautan |
| --- | --- | --- | --- | --- | --- |
| Mata pelajaran umum | Capaian Pembelajaran pada PAUD, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah | Badan Standar, Kurikulum, dan Asesmen Pendidikan, Kementerian Pendidikan Dasar dan Menengah | Keputusan Kepala BSKAP Nomor 046/H/KR/2025 | 2025 | https://kurikulum.kemdikbud.go.id/rujukan/regulasi-kurikulum-merdeka |
| Pendidikan Agama dan Budi Pekerti | Capaian Pembelajaran mata pelajaran Pendidikan Agama dan Budi Pekerti | BKPDM, Kementerian Pendidikan Dasar dan Menengah | Keputusan Kepala BKPDM Nomor 020 Tahun 2026 | 2026 | https://bkpdm.kemendikdasmen.go.id/publikasi/bkpdm-dan-kementerian-agama-tegaskan-perubahan-capaian-pembelajaran-hanya-berlaku-untuk-mata-pelajaran-pendidikan-agama-dan-budi-pekerti |
| Koding dan Kecerdasan Artifisial | Panduan Mata Pelajaran Koding dan Kecerdasan Artifisial | Pusat Kurikulum dan Pembelajaran, Kementerian Pendidikan Dasar dan Menengah | Panduan Mata Pelajaran Koding dan Kecerdasan Artifisial (Pusat Kurikulum dan Pembelajaran, 2025) | 2025 | https://kurikulum.kemendikdasmen.go.id/file/panduan/dokumen/33.%20Final%20Panduan%20Mata%20Pelajaran%20Panduan%20Mata%20Pelajaran%20Koding%20dan%20Kecerdasan%20Artifisial_12_Sep_2025_revisi%203.pdf |
| Muatan Lokal Jawa Barat | Kurikulum Muatan Lokal Bahasa Sunda Provinsi Jawa Barat | Pemerintah Provinsi Jawa Barat / Dinas Pendidikan Provinsi Jawa Barat | _belum diverifikasi_ | — | — |
| Inspirasi penurunan CP menjadi TP/ATP | Inspirasi Alur Tujuan Pembelajaran (ATP) — Referensi Penerapan Kurikulum | Ruang GTK, Kementerian Pendidikan Dasar dan Menengah | Ruang GTK Kemendikdasmen | 2026 | https://guru.kemendikdasmen.go.id/kurikulum/referensi-penerapan/capaian-pembelajaran/ |

Empat catatan atas tabel di atas:

- **Koding dan Kecerdasan Artifisial** tidak ditetapkan lewat keputusan CP umum melainkan lewat
  panduan mata pelajarannya sendiri. Pada jenjang SD mata pelajaran ini dimulai pada **Fase C**
  (kelas 5-6); Fase A dan Fase B sengaja tidak berkatalog karena CP-nya memang belum ada.
- **Bahasa Sunda** adalah Muatan Lokal Jawa Barat, bukan mata pelajaran nasional. Ia sengaja
  TIDAK memakai Keputusan Kepala BSKAP Nomor 046/H/KR/2025: menempelkan nomor keputusan
  nasional pada muatan lokal akan menjadikannya tampak sebagai CP nasional. Nomor regulasi dan
  naskahnya menunggu dokumen resmi Pemerintah Provinsi Jawa Barat.
- Kolom **naskah CP** pada seluruh baris masih `null`. Aplikasi menampilkan elemen CP dan
  kutipan regulasinya, tidak pernah teks pengganti. Jalankan `cpNaskahReport()` pada
  `src/data/curriculum-cp.js` untuk melihat daftar terkini beserta alasan tiap kekosongan.
- Sumber yang belum terverifikasi ditandai `verified:false` dan wajib mempunyai `decision`,
  `year`, serta `url` bernilai `null`. Kontrak itu dijaga `tests/tp-source-integrity.test.js`.

Catatan penting atas dokumen PABP: perubahan tahun 2026 hanya berlaku untuk mata pelajaran
Pendidikan Agama dan Budi Pekerti. Mata pelajaran lain tetap memakai CP yang ditetapkan
Keputusan Kepala BSKAP Nomor 046/H/KR/2025.

ATP yang diterbitkan pemerintah disediakan sebagai **inspirasi**, bukan kewajiban. Satuan
pendidikan tetap menyusun TP-nya sendiri.

## 4. Pemetaan fase

| Kelas | Fase |
| --- | --- |
| 1 dan 2 | A |
| 3 dan 4 | B |
| 5 dan 6 | C |

IPAS baru berdiri sebagai mata pelajaran tersendiri mulai **Fase B**, sehingga katalog sengaja
tidak memuat TP IPAS untuk Fase A. Mata pelajaran pilihan dan muatan lokal (Bahasa Inggris,
Bahasa Sunda, Koding dan Kecerdasan Artifisial, Seni) hanya muncul bila sekolah mengaktifkannya
melalui Mapping Mata Pelajaran.

## 5. Cara memakai dan mengganti

1. Buka menu **Tujuan Pembelajaran**, pilih mata pelajaran, lihat acuan CP-nya, lalu tekan
   **+ Tambah TP** dan centang TP yang dipakai. TP terpilih itulah yang menjadi TP sekolah, dan
   status Aktif/Nonaktifnya hanya diatur dari menu ini.
2. Buka menu **Penilaian** dan isi nilai seperti biasa. Penilaian **tidak memilih TP**: ia
   membaca TP aktif sebagai konteks. Nilai Akhir tidak terpengaruh oleh TP.
3. Buka menu **Intrakurikuler** dan pilih TP yang benar-benar diajarkan. Hanya TP **aktif** yang
   ditawarkan untuk input baru; TP yang sudah dinonaktifkan tetap aman pada riwayat lama.
4. Buat deskripsi rapor. Deskripsi diringkas dari TP yang dipilih beserta Nilai Akhir yang sudah
   ada, tanpa menambah kompetensi di luar TP pilihan guru.

## 6. Berkas terkait

- `src/data/learning-objective-defaults.js` — katalog TP bawaan beserta metadata sumber.
- `src/services/learning-objectives.js` — penggabungan TP sekolah dengan katalog dan penyimpanan
  pilihan TP (hanya daftar ID).
- `src/services/descriptions.js` — penyusunan deskripsi rapor dari TP terpilih.
- `tests/tp-source-integrity.test.js` — penjaga integritas katalog dan dokumen ini.
