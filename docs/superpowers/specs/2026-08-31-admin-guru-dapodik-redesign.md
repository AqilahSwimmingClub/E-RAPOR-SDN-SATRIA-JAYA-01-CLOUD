# Rancangan Admin, Guru/Wali Kelas, dan Dapodik — v1.2.0

Tanggal: 31 Agustus 2026  
Status: Disetujui secara konseptual; menunggu persetujuan dokumen sebelum implementasi  
Basis kode: `main` pada commit `a4872a032d91807cc61f58f8486b51fe38b3f814`

## 1. Tujuan

Versi 1.2.0 memperluas proyek e-Rapor SDN Satria Jaya 01 agar alur Admin dan Guru/Wali Kelas mengikuti seluruh referensi layar yang diberikan, tanpa membuat menu ganda dan tanpa menghapus data lama. Proyek tetap satu basis kode untuk Web/PWA, Android Capacitor, dan Windows Electron.

Hasil utama:

- navigasi Admin dan Guru/Wali Kelas yang terkelompok dan tidak duplikat;
- pengelolaan Kokurikuler dan Intrakurikuler sebagai dua domain data terpisah;
- Guru/Wali Kelas dapat menambah siswa manual pada kelas tugasnya;
- integrasi Dapodik lokal yang berfungsi pada aplikasi Windows;
- alur nilai, pemeriksaan, perkembangan, transkrip, dan cetak yang konsisten;
- migrasi basis data lokal dari skema 4 ke skema 5 tanpa kehilangan data.

## 2. Versi rilis

- Versi aplikasi: `1.2.0`
- Android `versionCode`: `12`
- Versi skema data: `5`
- Build tag: `1.2.0-ADMIN-GURU-DAPODIK`

## 3. Batasan

Rilis ini tidak:

- menghapus data, koleksi, atau mesin perhitungan lama;
- menyalin identitas/branding aplikasi pemerintah; identitas tetap milik SDN Satria Jaya 01;
- menambahkan sinkronisasi cloud atau ketergantungan Firebase/Supabase;
- menjalankan komunikasi Dapodik langsung dari Android atau browser/PWA;
- mengirim data ke Dapodik sebelum koneksi, NPSN, semester, dan bentuk respons tervalidasi.

## 4. Navigasi

Navigasi menggunakan grup yang dapat dibuka/tutup. Satu fitur hanya memiliki satu entri menu utama. Rute lama yang masih diperlukan tetap dapat dibuka melalui redirect ke rute baru agar bookmark dan data lama tidak rusak.

### 4.1 Admin

1. Dashboard
2. Profil
3. Dapodik
   - Web Service Dapodik
   - Ambil Data Dapodik
   - Kirim Nilai ke Dapodik
4. Data Pengguna
5. Data Referensi
   - Data Sekolah
   - Data Guru
   - Data Siswa
   - Data Kelas/Rombel
   - Mata Pelajaran
   - Pembelajaran
   - Mapping Mata Pelajaran
   - Logo dan Tanda Tangan
   - Tanggal Rapor
6. Data Kokurikuler
7. Data Intrakurikuler
8. Status Penilaian
   - Status Penilaian
   - Statistik Nilai
9. Perkembangan Nilai
   - Perkembangan Nilai
   - Grafik Nilai
10. Transkrip Ijazah
    - Import Nomor Ijazah
    - Setting Transkrip
    - Mapping Mapel
    - Input Nilai Transkrip
    - Import Nilai Transkrip
    - Cetak Transkrip Nilai
11. Cetak Nilai
    - Leger Rapor
    - Pelengkap Rapor
    - Nilai Rapor
12. Backup & Restore
13. Pengaturan Akun

### 4.2 Guru/Wali Kelas

1. Dashboard
2. Profil
3. Tujuan Pembelajaran
4. Input Nilai Rapor
   - Input Nilai Rapor
   - Import Nilai Rapor
5. Nilai Tersimpan
   - Cek Nilai Rapor
   - Cek Deskripsi Rapor
6. Cek Penilaian
   - Status Penilaian
   - Capaian Nilai Rapor
   - Grafik Nilai Rapor
7. Input Kelengkapan
   - Update Data Siswa
   - Input Kehadiran
   - Input Nilai Ekskul
   - Input Nilai Kokurikuler
   - Input Nilai Intrakurikuler
   - Input Catatan Wali Kelas
   - Input Kenaikan Kelas
8. Cek Penilaian Kelas
   - Status Penilaian
   - Statistik Nilai Rapor
9. Perkembangan Nilai
   - Perkembangan Nilai
   - Grafik Nilai Rapor
10. Transkrip Ijazah
    - Input Nilai Transkrip
    - Import Nilai Transkrip
    - Cetak Transkrip Nilai
11. Cetak Nilai
    - Leger Rapor
    - Pelengkap Rapor
    - Nilai Rapor
12. Backup
13. Pengaturan Akun

Entri lama `Cetak Nilai`, `Cek Penilaian Kelas`, `Transkrip Ijazah`, `Perkembangan Nilai`, `Input Kelengkapan`, `Mapping Mata Pelajaran`, `Cek Penilaian`, `Input Nilai Rapor`, `Nilai Tersimpan`, dan `Dimensi Penilaian` dihapus dari posisi lama pada sidebar Guru/Wali Kelas. Mesin dan datanya tidak dihapus; fitur yang masih dipakai dipindahkan ke kelompok kanonis di atas. `Dimensi Penilaian` dan `Mapping Mata Pelajaran` dikelola Admin sehingga tidak muncul sebagai menu terpisah untuk Guru.

## 5. Arsitektur

### 5.1 Navigasi dan rute

- Konfigurasi menu dipisahkan dari renderer halaman.
- Setiap item memiliki `id`, label, ikon, rute, role, dan children.
- Router mempertahankan alias rute lama dan mengarahkannya ke rute baru.
- Pemeriksaan role dilakukan pada router, bukan hanya dengan menyembunyikan menu.
- State grup sidebar disimpan lokal per pengguna.

### 5.2 Domain penilaian

- Nilai mapel/rapor tetap memakai layanan penilaian yang ada.
- Ekskul tetap memakai koleksi ekskul yang ada.
- Kokurikuler tetap memakai layanan dan koleksi Kokurikuler yang ada.
- Intrakurikuler mendapat layanan, halaman, dan koleksi sendiri.
- Data Kokurikuler tidak dipakai sebagai penyimpanan Intrakurikuler, dan sebaliknya.
- Rekap, status, grafik, transkrip, dan cetak membaca data melalui adapter domain agar rumus tidak digandakan antarhalaman.

### 5.3 Dapodik

Integrasi terdiri dari:

- halaman Admin untuk URL, NPSN, semester, status koneksi, pratinjau, hasil, dan log;
- layanan aplikasi yang menormalisasi data sekolah, guru, siswa, rombel, mapel, dan pembelajaran;
- bridge Electron melalui `preload` dan IPC;
- klien HTTP hanya di proses utama Electron agar pembatasan browser tidak mengganggu koneksi lokal;
- penyimpanan token terenkripsi dengan Electron `safeStorage`;
- adapter respons yang menerima bentuk respons Dapodik yang didukung dan menolak bentuk yang belum dikenal sebelum mutasi data.

Pada Android dan Web/PWA, menu Dapodik tetap terlihat. Tombol sinkronisasi dinonaktifkan dengan penjelasan bahwa proses harus dilakukan melalui aplikasi Windows pada komputer yang terhubung ke Dapodik.

Profil koneksi lokal mendukung host loopback atau jaringan privat, termasuk pola `http://localhost:5774`. Uji koneksi membaca identitas sekolah terlebih dahulu; NPSN dan semester harus cocok sebelum tombol Ambil Data atau Kirim Nilai aktif.

## 6. Model data dan migrasi

Skema 5 menambah koleksi berikut tanpa menghapus koleksi lama:

- `intracurricularActivities`
- `intracurricularScores`
- `dapodikSyncState`
- `dapodikSyncLogs`
- `dapodikMappings`
- `publishedReports`

Token Dapodik tidak masuk basis data aplikasi, ekspor, backup, log, atau laporan kesalahan.

### 6.1 Identitas siswa

Siswa memiliki metadata tambahan:

- `origin`: `dapodik`, `manual-admin`, atau `manual-teacher`;
- `dapodikId`: opsional;
- `createdBy`, `createdAt`, `updatedAt`;
- `syncState`: `local`, `synced`, `changed`, atau `archived`;
- `isActive`.

Urutan pencocokan sinkronisasi adalah `dapodikId`, lalu NISN yang telah dinormalisasi. NISN ganda ditolak. Data manual yang belum ada di Dapodik tidak dihapus. Data impor yang tidak lagi muncul di Dapodik hanya dinonaktifkan setelah Admin menyetujui pratinjau perubahan.

### 6.2 Hak Guru menambah siswa

Guru/Wali Kelas dapat menambah siswa hanya ke rombel yang menjadi tugasnya. Form minimal memvalidasi nama, jenis kelamin, tingkat, kelas, dan NISN/NIS sesuai aturan yang tersedia. Sumber otomatis dicatat sebagai `manual-teacher`. Admin dapat melihat, mengedit, memindahkan, menonaktifkan, atau mencocokkan siswa tersebut dengan data Dapodik.

### 6.3 Migrasi aman

- snapshot dibuat sebelum migrasi;
- koleksi lama disalin tanpa perubahan nilai;
- koleksi baru diinisialisasi kosong;
- jumlah record penting dibandingkan sebelum/sesudah;
- kegagalan memulihkan snapshot dan mempertahankan skema 4;
- backup dari skema lama tetap dapat dipulihkan lalu dimigrasikan.

## 7. Alur utama

### 7.1 Tambah siswa manual oleh Guru

1. Guru membuka Input Kelengkapan → Update Data Siswa.
2. Sistem membatasi pilihan ke kelas tugas Guru.
3. Guru mengisi dan menyimpan data.
4. Sistem memeriksa duplikasi NISN/NIS.
5. Siswa langsung tersedia untuk kehadiran dan penilaian di kelas tersebut.
6. Admin melihat label `Input Manual Guru` pada daftar siswa.

### 7.2 Sinkronisasi Dapodik

1. Admin membuka Dapodik → Web Service.
2. Admin mengisi URL, token, NPSN, dan semester.
3. Uji koneksi memvalidasi identitas sekolah.
4. Ambil Data menampilkan pratinjau tambah/ubah/nonaktif/konflik.
5. Admin memilih Terapkan.
6. Transaksi lokal dijalankan dengan snapshot dan log tanpa token.
7. Kirim Nilai menampilkan jumlah siap kirim, ditolak, berhasil, dan gagal; kegagalan sebagian dapat dicoba ulang tanpa mengirim ulang record berhasil.

### 7.3 Publikasi dan cetak

- Wali memilih kelas serta pengaturan A4, margin, tanda tangan, posisi kepala sekolah, nama wali kelas, dan halaman pertama.
- PDF dapat dibuat per siswa atau seluruh kelas.
- Pelengkap rapor, nilai rapor, leger, dan transkrip memakai format terpisah.
- Aksi `Tampilkan kepada Siswa` mencatat publikasi per siswa/semester dan dapat dibatalkan.
- PDF harus bisa dibuat ulang dari data tersimpan; berkas biner tidak menjadi sumber kebenaran nilai.

## 8. Keamanan dan penanganan kesalahan

- hanya Admin dapat mengubah koneksi dan menjalankan Dapodik;
- URL Dapodik dibatasi ke loopback/jaringan privat dan skema HTTP/HTTPS;
- token ditampilkan tersamarkan dan tidak pernah dikirim ke renderer setelah disimpan;
- setiap proses sinkronisasi memiliki timeout, pembatalan, progres, dan ringkasan;
- respons tidak dikenal, NPSN berbeda, semester berbeda, atau validasi gagal menghentikan proses sebelum data berubah;
- log menyimpan jenis operasi, waktu, pengguna, jumlah record, dan pesan aman;
- backup/restore dan migrasi tidak menyertakan rahasia Dapodik.

## 9. Tampilan dan responsivitas

- identitas visual SDN Satria Jaya 01 dipertahankan;
- layout mengikuti pola referensi: header, sidebar terkelompok, kartu/filter, tabel, dan area hasil;
- tidak menyalin logo atau identitas resmi aplikasi lain;
- desktop menjadi target utama tabel dan cetak;
- tablet/Android memakai sidebar drawer, tabel scroll, filter bertumpuk, dan tombol ramah sentuh;
- semua halaman memiliki state kosong, loading, sukses, dan gagal.

## 10. Pengujian

### 10.1 Unit

- pembentukan menu berdasarkan role;
- redirect rute lama;
- validasi dan deduplikasi siswa;
- pemisahan Kokurikuler/Intrakurikuler;
- normalisasi respons Dapodik;
- merge/pratinjau sinkronisasi;
- aturan publikasi dan perhitungan rekap;
- migrasi skema 4 → 5 dan rollback.

### 10.2 Integrasi

- tambah siswa Guru hanya pada kelas tugas;
- Admin mengelola siswa manual;
- alur uji koneksi → pratinjau → terapkan menggunakan mock Dapodik;
- kirim nilai dengan sukses penuh, gagal sebagian, dan retry;
- token tidak muncul pada DB, backup, log, atau renderer;
- cetak per siswa dan per kelas.

### 10.3 Platform

- Web/PWA dan Android menampilkan pesan Dapodik Windows tanpa mencoba koneksi;
- Windows Electron dapat mengakses mock server lokal;
- build Web, Android, dan Windows berhasil;
- navigasi keyboard, fokus, label form, kontras, dan ukuran sentuh diperiksa.

Verifikasi langsung terhadap instalasi Dapodik produksi dilakukan terakhir pada komputer sekolah karena lingkungan tersebut tidak tersedia di CI. Aplikasi tidak dianggap siap sinkronisasi produksi sebelum uji NPSN/semester, ambil data percobaan, dan kirim satu batch terkontrol berhasil.

## 11. Kriteria penerimaan

Rilis diterima bila:

- menu Admin dan Guru sesuai struktur di bagian 4 dan tidak ada entri ganda;
- data lama tetap tersedia setelah migrasi;
- Kokurikuler dan Intrakurikuler dapat dibuat, dinilai, direkap, dan disimpan terpisah;
- Guru dapat menambah siswa manual hanya pada kelas tugasnya;
- Admin dapat menambah dan mengelola siswa manual maupun hasil Dapodik;
- Dapodik Windows memiliki uji koneksi, pratinjau perubahan, penerapan aman, pengiriman nilai, retry, dan log;
- Android/PWA memberi arahan jelas untuk memakai Windows;
- semua alur transkrip dan cetak pada referensi tersedia;
- seluruh pengujian otomatis dan build target lulus;
- tidak ada token, NISN, atau data pribadi sensitif pada log pengembangan.

## 12. Urutan implementasi

1. versi, skema 5, migrasi, dan tes preservasi data;
2. model navigasi baru, role guard, dan redirect rute lama;
3. siswa manual Admin/Guru;
4. Intrakurikuler dan pemisahan domain kegiatan;
5. penyusunan halaman penilaian, kelengkapan, pemeriksaan, perkembangan, transkrip, dan cetak;
6. Dapodik Electron bridge, UI Admin, mock, merge, dan kirim nilai;
7. responsivitas, aksesibilitas, regresi, build seluruh platform, dan dokumentasi operator.
