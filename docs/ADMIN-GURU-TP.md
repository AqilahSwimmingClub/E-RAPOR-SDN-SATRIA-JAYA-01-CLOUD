# Tahap 8B–8E — Kendali Admin, Serah Terima Siswa, dan Tujuan Pembelajaran

Dokumen singkat untuk Admin sekolah dan Guru. Bagian lisensi ada di
[LICENSE-SYSTEM.md](LICENSE-SYSTEM.md); asal TP bawaan ada di [TP-SOURCES.md](TP-SOURCES.md).

## 8B — Admin Lokal dan Kendali Penggunaan Guru

Admin sekolah menentukan kapan Guru boleh mulai memakai e-Rapor pada satu tahun pelajaran dan
semester. Statusnya tersimpan di database sekolah pada perangkat itu, ikut backup akademik
seperti data lain, dan **tidak ada hubungannya dengan lisensi**.

Buka **Status Penilaian** sebagai Admin. Di sana ada checklist enam butir:

1. Identitas sekolah (nama dan NPSN)
2. Kepala sekolah (nama dan NIP)
3. Tahun pelajaran dan semester aktif
4. Rombel dan wali kelas
5. Mapping mata pelajaran
6. Bobot penilaian dan KKTP

Setelah keenamnya lengkap, tombol **Aktifkan e-Rapor untuk Guru** dapat ditekan. Sebelum itu,
Guru hanya dapat membuka Dashboard, Profil, Pengaturan Akun, Backup, dan Tujuan Pembelajaran.

**Perangkat yang sudah dipakai sebelumnya tidak ikut terkunci.** Bila pada periode itu sudah ada
nilai, rapor, absensi, atau sikap yang tersimpan, menu Guru tetap terbuka seperti sebelumnya
sampai Admin memutuskan lain. Menonaktifkan penggunaan **tidak pernah menghapus data apa pun**.

## 8C — Serah Terima Data Siswa

Menu **Serah Terima Data Siswa** memindahkan biodata siswa antar rombel, antar tahun pelajaran,
dan antar perangkat, tanpa mengetik ulang.

- Yang ikut hanya **biodata**: NIS, NISN, nama, jenis kelamin, tempat dan tanggal lahir, agama,
  nama orang tua, telepon, alamat, dan foto.
- Yang **tidak pernah ikut**: nilai, absensi, rapor, deskripsi, sikap, dan lisensi.
- Impor bersifat **menambah**. Siswa yang NIS atau NISN-nya sudah ada pada periode tujuan
  dilewati, bukan ditimpa.
- Ada **pratinjau** sebelum menyimpan: berapa siswa masuk, berapa dilewati, dan alasannya.
- Kenaikan kelas ditebak otomatis (1A → 2A, dan seterusnya). Kelas 6 tidak punya kelas tujuan.

## 8D — Tujuan Pembelajaran sebagai acuan Penilaian Umum

Pada menu **Penilaian** ada bagian **Acuan Tujuan Pembelajaran**. Guru mencentang TP mana yang
menjadi acuan mata pelajaran itu.

**TP adalah acuan, bukan nilai.** Tidak ada kotak angka per TP. Nilai Akhir tetap dihitung
seperti sebelumnya:

```
Formatif + Penilaian Harian + Penilaian Praktik
  + Sumatif Lingkup Materi + Sumatif Akhir Semester
  → (Bobot Penilaian) → SATU Nilai Akhir
```

TP yang dicentang dipakai saat menyusun **deskripsi rapor**: deskripsi menyebut setiap TP
terpilih tepat satu kali, dengan tingkat capaian yang mengikuti Nilai Akhir dan KKTP. Tidak ada
kompetensi yang ditambahkan di luar TP pilihan guru.

Bila sekolah belum membuat TP sendiri, aplikasi memakai katalog bawaan berstatus
**inspiratif/acuan** yang dapat disesuaikan lewat menu Tujuan Pembelajaran. Begitu sekolah punya
TP sendiri untuk satu mata pelajaran, katalog bawaan berhenti dipakai untuk mata pelajaran itu.

## 8E — Intrakurikuler: Mapel → TP → Predikat → Deskripsi

Menu **Input Nilai Intrakurikuler** kini mengikuti alur:

1. **Mata Pelajaran** — hanya mapel aktif rombel yang punya TP pada fasenya. IPAS tidak muncul
   pada Fase A karena baru berdiri sebagai mapel tersendiri mulai Fase B. Mapel pilihan dan
   muatan lokal muncul bila sekolah mengaktifkannya.
2. **Tujuan Pembelajaran** — centang satu atau beberapa TP.
3. **Predikat** — Cukup, Baik, atau Sangat Baik.
4. **Deskripsi** — tersusun otomatis dan ikut menyesuaikan bila pilihan berubah. Kalimat yang
   sudah ditulis guru sendiri tidak pernah ditimpa.

Intrakurikuler tidak menghasilkan angka. Pilihan mapel dan TP-nya disimpan pada catatan
intrakurikuler siswa sendiri, terpisah dari Penilaian Umum dan Kokurikuler, sehingga ketiganya
tidak pernah saling menimpa. Catatan lama yang hanya berisi nama kegiatan tetap terbaca, dan
halaman kembali ke alur kegiatan lama bila rombel belum punya mapel ber-TP.

## Yang tidak berubah

Tampilan rapor terkunci pada baseline `d093b99` dan dijaga
`tests/report-layout-lock.test.js`: Times New Roman, ukuran huruf, posisi teks dan angka,
perataan mendatar dan tegak, nomor urut, lebar kolom, spasi, struktur tabel, header, pemisah
halaman, urutan bagian, dan format dua halaman A4. Tahap 8D dan 8E hanya mengubah **sumber isi**
yang masuk ke tata letak itu.
