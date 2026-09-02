# Tahap 8 Vercel+Neon, 8B, 8C, 8D, 8E — Design

## Baseline
- Branch sumber: `codex/admin-guru-dapodik-v1-2-0`
- Checkpoint: `d093b99`
- Baseline terverifikasi: 721/721 test PASS, `npm run check` exit 0, `npm run build` exit 0.
- `DB_KEY = erapor_satria_jaya_01_v1` tidak boleh berubah.
- Identitas developer permanen tidak boleh menjadi data sekolah yang dapat diedit.
- Tampilan cetak rapor yang sudah final tidak boleh berubah.

## Tahap 8 revisi — Vercel + Neon PostgreSQL
Backend lisensi dipindahkan dari proses Node+SQLite persisten ke fungsi HTTP yang kompatibel dengan Vercel dan PostgreSQL Neon. Owner Panel tetap statis/web, API tetap mempertahankan kontrak publik dan owner sebanyak mungkin. Aturan 1 License Key = 1 perangkat aktif ditegakkan oleh constraint/transaction PostgreSQL, bukan sekadar pemeriksaan aplikasi.

Rahasia server (`LICENSE_HASH_PEPPER`, `LICENSE_RECOVERY_KEY`, private signing key, kredensial bootstrap owner) hanya lewat environment Vercel. Client hanya membawa API base URL dan public verification key. Tidak ada data akademik siswa/nilai/absensi yang dikirim ke backend lisensi.

## Tahap 8B — Admin Lokal & Kontrol Guru
Setiap perangkat mempunyai satu Admin lokal dan akun Guru lokal. Admin mengatur kesiapan penggunaan: identitas sekolah, tahun pelajaran/semester, kepala sekolah, rombel aktif, mapel, KKTP, bobot, pengaturan rapor, akun Guru dan penugasan rombel. Guru tidak boleh menugaskan dirinya sendiri.

Tambahkan status kesiapan lokal per tahun pelajaran + semester. Admin menekan `Aktifkan e-Rapor untuk Guru` setelah checklist wajib lengkap. Sebelum aktif, Guru dapat login/lihat dashboard tetapi menu operasional yang bergantung pada konfigurasi terkunci dengan alasan yang jelas. Perubahan status tidak memengaruhi lisensi perangkat.

## Tahap 8C — Serah Terima Data Siswa
Tambahkan ekspor/impor khusus biodata siswa antar kelas/tahun/perangkat. Berkas hanya membawa master biodata siswa yang sudah ada dan metadata sumber. Berkas tidak boleh membawa nilai, absensi, KKTP, bobot, akun/password Guru, lisensi, token aktivasi, Installation ID, atau device binding.

Admin/Guru yang berwenang dapat memilih siswa yang dipindahkan dan menentukan rombel tujuan. Kenaikan kelas boleh memberi saran 1A→2A dst, tetapi tujuan selalu dapat diubah. Data lama tetap tersimpan sebagai arsip scope tahun pelajaran sebelumnya dan tidak dihapus.

## Tahap 8D — TP pada Penilaian Umum
TP menjadi acuan kompetensi pada menu Penilaian Umum per `kelas + mapel + tahun pelajaran + semester`. Tidak dibuat nilai per TP. Mekanisme nilai existing tetap utuh: formatif, harian, praktik, sumatif lingkup materi, sumatif akhir, dan satu Nilai Akhir per mata pelajaran.

Guru dapat memilih satu atau lebih TP yang menjadi dasar satu penilaian. Deskripsi rapor dibuat dari TP terpilih dan satu nilai akhir yang sudah ada. Jika TP banyak, semua konsep terpilih tetap terwakili tetapi kalimat diringkas dan tidak repetitif.

Database bawaan harus berlabel `TP inspiratif`/`TP acuan`, bukan diklaim sebagai TP nasional wajib. Sumber diturunkan dari CP resmi terbaru dan panduan resmi; Pendidikan Agama dan Budi Pekerti memakai pembaruan 2026, mapel umum mengikuti CP terbaru yang masih berlaku. Guru dapat menambah/mengubah TP lokal tanpa mengubah CP sumber.

## Tahap 8E — Intrakurikuler Mapel → TP → Predikat → Deskripsi
Intrakurikuler tetap fitur terpisah dari Penilaian Umum. Model baru: pilih mapel → pilih TP → pilih predikat `Cukup | Baik | Sangat Baik` → deskripsi otomatis. Predikat dipilih langsung; interval angka tidak dikunci sebagai standar nasional.

Fase otomatis: kelas 1–2 = Fase A, kelas 3–4 = Fase B, kelas 5–6 = Fase C. IPAS sebagai mapel tersendiri hanya tersedia pada Fase B/C. Mapel opsional mengikuti konfigurasi sekolah.

## Regression Lock — Cetak Rapor
Dilarang mengubah layout cetak rapor yang sudah final: ukuran/jenis font, Times New Roman, posisi teks/nilai/nomor, alignment horizontal/vertikal, lebar kolom, header, spacing, urutan bagian, page-break, dan target 2 halaman A4. Tahap 8D/8E hanya boleh mengubah sumber isi/deskripsi yang masuk ke struktur yang sudah ada.

## Kompatibilitas
- Tidak ada `localStorage.clear()` atau migrasi destruktif.
- Existing install dan backup lama tetap dapat dipakai.
- Lisensi tetap tersimpan di luar `DB_KEY` dan tidak ikut backup akademik.
- Package ID Android, appUserModelId, Electron userData, GUID installer, dan Tahap 9 updater tidak disentuh.
- Tahap 9 tetap belum dikerjakan.

## Verifikasi wajib
- Seluruh 721 test lama tetap PASS.
- Test baru untuk PostgreSQL transaction/unique one-device rule, API Vercel, owner auth, reset/recovery, offline token verification.
- Test readiness Admin/Guru dan menu lock.
- Test export/import siswa tidak membawa data terlarang.
- Test TP tidak membuat score per TP dan tidak mengubah perhitungan nilai akhir.
- Test intrakurikuler mapel→TP→predikat→deskripsi.
- Snapshot/regression test cetak rapor untuk memastikan layout tidak berubah.
- `npm run check` dan `npm run build` exit 0.
