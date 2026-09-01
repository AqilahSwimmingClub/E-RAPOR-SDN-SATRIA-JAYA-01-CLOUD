# Sinkronisasi Dapodik lewat Aplikasi Windows

Panduan ini untuk operator sekolah. Ikuti urutannya apa adanya: setiap langkah menjaga agar
data guru yang sudah tersimpan tidak pernah hilang.

## Sebelum mulai

- **Sinkronisasi Dapodik hanya berjalan di aplikasi Windows e-Rapor.** Dapodik adalah layanan
  lokal di komputer sekolah, sehingga browser di HP maupun aplikasi Android tidak dapat
  menghubunginya. Di perangkat itu menu Dapodik tetap terlihat, tetapi hanya menampilkan
  arahan ini dan tidak pernah mencoba menghubungi jaringan.
- **Token Dapodik adalah kredensial.** Jangan pernah menempelkannya ke tangkapan layar, isu,
  percakapan, email, atau catatan yang dibagikan. Token disimpan terenkripsi oleh Windows dan
  tidak pernah ditampilkan kembali oleh aplikasi, bahkan kepada Admin.
- Sinkronisasi hanya dapat dijalankan oleh **Admin**.

## Urutan aman

1. Buat **Backup & Restore → Backup Data** sebelum sinkronisasi pertama. Simpan berkasnya di
   luar komputer ini.
2. Buka aplikasi Windows e-Rapor pada komputer yang menjalankan atau dapat menjangkau Dapodik.
3. Isi URL lokal, NPSN, semester, dan token pada **Dapodik → Web Service Dapodik**, lalu
   Simpan Konfigurasi.
4. Pilih **Tes Koneksi**. Lanjutkan hanya bila nama sekolah, NPSN, dan semester sesuai. Selama
   tes belum cocok, tombol Ambil Data dan Kirim Nilai tetap terkunci.
5. Pilih **Ambil Data Dapodik**. Hasilnya adalah pratinjau; belum ada satu pun data yang
   berubah. Periksa seluruh baris pada kelompok **Perlu Diperiksa** terlebih dahulu, baru
   pilih **Terapkan Data**.
6. Periksa satu kelas dan satu siswa sebelum mengirim nilai.
7. Kirim satu batch terkontrol lewat **Kirim Nilai ke Dapodik**. Pastikan jumlah berhasil dan
   gagal sesuai dengan yang Anda harapkan.
8. Gunakan **Coba Ulang Data Gagal** untuk kegagalan. Jangan mengirim ulang record yang sudah
   berhasil; aplikasi memang sudah mencegahnya.
9. Bila muncul pesan bahwa bentuk respons tidak didukung, **hentikan proses**. Simpan pesan
   yang tampil apa adanya untuk pemeriksaan teknis; pesan itu memang sudah bebas dari token
   dan identitas siswa.

## Yang dijaga aplikasi untuk Anda

- **Pratinjau lebih dulu.** Ambil Data tidak pernah langsung mengubah data. Perubahan hanya
  terjadi setelah Anda menekan Terapkan Data dan menyetujui konfirmasinya.
- **Siswa manual aman.** Siswa yang diinput Admin atau wali kelas tidak pernah ditandai untuk
  dinonaktifkan hanya karena tidak ada di Dapodik.
- **Tidak ada penghapusan.** Siswa asal Dapodik yang hilang dari respons hanya dinonaktifkan,
  datanya tetap tersimpan.
- **Sekolah dan periode dicocokkan.** NPSN atau semester yang berbeda menghentikan proses
  sebelum ada perubahan apa pun.
- **Pemulihan otomatis.** Bila penerapan gagal di tengah jalan, basis data dikembalikan ke
  keadaan sebelum sinkronisasi dimulai.
- **Target dibatasi.** Aplikasi hanya mau menghubungi alamat lokal atau jaringan privat,
  sehingga token tidak mungkin terkirim ke internet karena salah ketik alamat.
- **Log aman.** Catatan sinkronisasi hanya memuat waktu, operasi, status, dan jumlah. Tidak ada
  token, nama siswa, NISN, alamat, atau potongan respons mentah.

## Bila terjadi masalah

| Pesan | Tindakan |
|---|---|
| Sinkronisasi Dapodik harus dijalankan melalui aplikasi Windows | Buka e-Rapor dari aplikasi Windows, bukan dari browser HP atau Android. |
| Token Dapodik ditolak | Perbarui token pada Web Service Dapodik. |
| URL Dapodik harus mengarah ke komputer lokal atau jaringan privat | Periksa alamat; gunakan alamat lokal seperti `http://localhost:5774`. |
| NPSN atau semester Dapodik berbeda | Perbaiki pengaturan agar cocok dengan sekolah dan periode aktif. |
| Format respons Dapodik tidak didukung | Hentikan proses dan laporkan ke teknis beserta pesannya. |
| Penyimpanan aman Windows tidak tersedia | Jalankan aplikasi pada akun Windows yang sama seperti saat dipasang. |

## Penerimaan di sekolah

Verifikasi terhadap instalasi Dapodik produksi dilakukan di komputer sekolah bersama operator,
mengikuti sembilan langkah di atas. Catat hanya **waktu, operasi, dan jumlah berhasil/gagal**.
Jangan menyalin token, nama siswa, NISN, respons mentah, atau tangkapan layar berisi kredensial
ke dalam repositori. Sinkronisasi produksi baru dianggap diterima setelah validasi identitas
sekolah, satu pratinjau penarikan, satu pemeriksaan kelas hasil penerapan, dan satu batch nilai
terkontrol semuanya berhasil.
