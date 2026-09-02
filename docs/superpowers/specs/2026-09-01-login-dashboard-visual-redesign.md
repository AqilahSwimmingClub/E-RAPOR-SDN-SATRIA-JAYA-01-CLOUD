# Login + Dashboard Visual Redesign v1.2.1

## Goal
Menyegarkan tampilan login serta dashboard Admin/Guru e-Rapor v1.2.1 tanpa mengubah fungsi, penyimpanan, autentikasi, routing, atau struktur menu aplikasi.

## Login
- Animasi pembuka/login lama tetap dipertahankan dan tidak diganti.
- Yang diubah hanya halaman/form login setelah animasi lama selesai.
- Tampilan mengikuti referensi video terbaru pengguna: modern, cinematic, dark navy, glassmorphism, aksen cyan/blue, panel login beranimasi halus.
- Form tetap menyediakan peran Admin/Guru, sekolah, semester aktif, username, password, tampil/sembunyikan password, Masuk, Aktivasi Admin Pertama bila relevan, dan Lupa Password.
- Seluruh fungsi `authenticate`, aktivasi admin, recovery, bootstrap keamanan, penyimpanan session, dan pemilihan semester tetap memakai implementasi v1.2.1.
- Aset foto/identitas yang sudah menjadi bawaan aplikasi dipertahankan; tidak membuat identitas/foto generik baru.
- Animasi UI dibatasi pada transform/opacity/glow agar ringan di Android.

## Dashboard Admin dan Guru
- Tema visual dark navy-neon yang elegan: background navy gelap, card glass/dark, aksen cyan/teal/purple secukupnya.
- Sidebar dan topbar mengikuti tema baru dan tetap responsif.
- Menu tidak boleh dibuat ulang secara manual di dashboard. `src/data/navigation.js` tetap menjadi satu-satunya sumber menu sehingga Admin dan Guru selalu menampilkan menu v1.2.1 yang sebenarnya.
- Tidak menambah Portal Orang Tua atau menu lain yang tidak ada di navigation v1.2.1.
- Dashboard memakai data lokal asli aplikasi. Tidak menampilkan angka/statistik palsu.
- Admin mempertahankan statistik rombel, siswa, guru/wali kelas, mata pelajaran, progress nilai/deskripsi/kelengkapan dan data master yang memang tersedia.
- Guru mempertahankan rombel aktif, jumlah siswa, kehadiran hari ini, kelengkapan rapor, status kelengkapan dan data master yang memang tersedia.
- Grafik/progress boleh diperindah secara visual tetapi nilai tetap berasal dari service yang saat ini digunakan `dashboard.js`.

## Navigation v1.2.1
- Admin mempertahankan kelompok UTAMA, Dapodik, DATA PENGGUNA, Data Referensi, KEGIATAN, Status Penilaian, Perkembangan Nilai, Transkrip Ijazah, Cetak Nilai, BACKUP, AKUN beserta child route yang ada di `src/data/navigation.js`.
- Guru mempertahankan UTAMA, Data Referensi/Mapping Mata Pelajaran, PENILAIAN, Input Nilai Rapor, Nilai Tersimpan, Cek Penilaian, Input Kelengkapan, Cek Penilaian Kelas, Perkembangan Nilai, Transkrip Ijazah, Cetak Nilai, BACKUP, AKUN beserta child route yang ada di `src/data/navigation.js`.
- Penilaian Sikap tetap berada di Input Kelengkapan.

## Safety / Data Integrity
- Tidak mengubah storage key, schema, migration, assessment data, attendance data, Dapodik bridge, backup/restore, report calculation, atau authentication contract.
- Tidak melakukan clear localStorage/IndexedDB/cache data pengguna.
- Update harus tetap dapat dipasang di atas v1.2.0/v1.2.1 tanpa uninstall.

## Responsive
- Desktop/Windows: sidebar penuh + dashboard multi-column.
- Android/tablet: sidebar tetap memakai mekanisme mobile aplikasi; card/grid turun menjadi kolom yang nyaman disentuh.
- Form login tidak boleh terpotong pada layar kecil dan tetap dapat discroll bila tinggi layar terbatas.

## Identity/Footer
Identitas pengembang ditampilkan rapi dan center pada area yang sesuai:
- `Dirancang & Dikembangkan oleh`
- `FAHMI DJAWAS, S.Pd.`
- `© 2026 e-Rapor SDN Satria Jaya 01 — Semua Hak Dilindungi`

## Files expected to change
- `src/pages/login.js` — markup/presentation login, tanpa mengubah contract autentikasi.
- `src/pages/dashboard.js` — presentation dashboard dari data/service yang sama.
- `src/styles/app.css` — theme, login animation, dashboard/sidebar/topbar/responsive styling.
- `src/ui/layout.js` — hanya bila class/markup tambahan dibutuhkan untuk visual shell; navigation contract tetap sama.
- Tests visual-contract/regression untuk memastikan menu dan fungsi kritis tetap tersedia.

## Acceptance
1. Login baru tampil seperti arah visual referensi, sementara animasi lama tetap berjalan seperti sebelumnya.
2. Login Admin dan Guru tetap berhasil dengan flow v1.2.1.
3. Dashboard Admin dan Guru memakai dark navy-neon dan data nyata.
4. Semua menu Admin/Guru berasal dari navigation v1.2.1 dan tetap dapat dibuka.
5. Tidak ada Portal Orang Tua/menu buatan.
6. Android dan desktop responsif.
7. Absensi, Penilaian, Penilaian Sikap, Mapping Mapel, Intrakurikuler, Rapor, Dapodik, Backup/Restore dan storage tidak mengalami perubahan perilaku.
8. Test/check/build Android harus lulus sebelum APK dinyatakan siap.