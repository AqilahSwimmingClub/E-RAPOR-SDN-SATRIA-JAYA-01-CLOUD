# Tahap 8 Vercel+Neon + 8B–8E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrasikan backend lisensi ke Vercel+Neon dan tambahkan Admin Lokal, serah-terima siswa, TP Penilaian Umum, serta Intrakurikuler berbasis TP tanpa mengubah layout rapor.

**Architecture:** Backend lisensi menjadi adapter PostgreSQL stateless yang dapat dijalankan sebagai Vercel Functions, dengan Owner Panel tetap web. Fitur 8B–8E tetap lokal/offline-first di `DB_KEY` existing dengan koleksi baru yang ter-scope tahun pelajaran/semester/kelas/mapel. Semua integrasi rapor hanya menyentuh sumber data/deskripsi, bukan CSS/DOM layout cetak.

**Tech Stack:** Vanilla JS ESM, Node.js 22+, Vercel Functions, PostgreSQL/Neon, WebCrypto ECDSA P-256, existing localStorage DB, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-tahap-8-vercel-neon-8b-8e-design.md`

## Global Constraints
- Basis implementasi `d093b99`; jangan mengulang atau menghapus Tahap 8 yang sudah benar.
- `DB_KEY = erapor_satria_jaya_01_v1` tidak boleh berubah.
- 1 License Key = 1 perangkat aktif harus tetap ditegakkan di database.
- Tidak boleh ada secret server di client/repo.
- Data siswa/nilai/absensi tidak dikirim ke server lisensi.
- Tidak boleh membuat nilai per TP.
- Layout cetak rapor tidak boleh berubah.
- Tidak boleh menyentuh Tahap 9 updater/package identity.

---

### Task 1: PostgreSQL/Neon adapter dan skema lisensi

**Files:**
- Create: `server/src/pg.js`
- Create: `server/schema-postgres.sql`
- Modify: `server/src/licenses.js`
- Modify: `server/src/api.js`
- Test: `tests/license-postgres.test.js`

**Interfaces:**
- Produces database helpers setara operasi lisensi existing: query, transaction, one-active-device enforcement, owner session persistence.
- Existing HTTP contract `/activate`, `/check`, owner endpoints dipertahankan.

- [ ] Tulis failing tests yang membuktikan skema PostgreSQL memiliki partial unique index satu perangkat aktif, foreign key, status constraint, dan transaction activation.
- [ ] Jalankan test baru dan pastikan FAIL sebelum adapter ada.
- [ ] Implementasikan `server/schema-postgres.sql` dengan tabel existing dan `CREATE UNIQUE INDEX ... WHERE is_active = TRUE`.
- [ ] Implementasikan `server/src/pg.js` memakai connection string `DATABASE_URL`; jangan menyimpan koneksi global yang mengasumsikan server persisten.
- [ ] Refactor `licenses.js` agar storage layer dapat memakai adapter PostgreSQL tanpa mengubah aturan komersial/crypto.
- [ ] Jalankan test PostgreSQL adapter dan seluruh test lisensi.
- [ ] Commit `feat(lisensi): tambah adapter postgres neon`.

### Task 2: Vercel Functions + Owner Panel deployment shape

**Files:**
- Create: `api/[...route].js`
- Create: `vercel.json`
- Modify: `server/src/api.js`
- Modify: `server/src/config.js`
- Modify: `server/public/owner/*` bila routing asset perlu disesuaikan
- Modify: `.env.example`
- Test: `tests/license-vercel.test.js`
- Docs: `docs/LICENSE-SYSTEM.md`

**Interfaces:**
- Produces Vercel handler `(req,res)` yang meneruskan semua public/owner API ke core API existing.
- Owner Panel tersedia di `/owner/`; API memakai `/api/...` atau rewrite kompatibel sesuai `vercel.json`.

- [ ] Tulis failing tests untuk routing Vercel, CORS public only, owner endpoint tanpa CORS publik, dan no persistent filesystem dependency.
- [ ] Implementasikan handler stateless Vercel dan rewrites.
- [ ] Pindahkan seluruh secret ke env: `DATABASE_URL`, signing private key, pepper, recovery key, owner bootstrap credentials.
- [ ] Pastikan client hanya memakai API base + public verification key.
- [ ] Update dokumentasi deploy Vercel + Neon step-by-step.
- [ ] Jalankan seluruh suite Tahap 8 dan security scans.
- [ ] Commit `feat(lisensi): siap deploy vercel neon`.

### Task 3: Admin readiness dan aktivasi penggunaan Guru

**Files:**
- Create: `src/services/admin-readiness.js`
- Modify: `src/services/admin-status.js`
- Modify: `src/services/auth.js`
- Modify: `src/core/router.js`
- Modify: `src/pages/admin-status.js`
- Modify: `src/pages/users.js`
- Modify: `src/data/navigation.js`
- Test: `tests/admin-guru-readiness.test.js`

**Interfaces:**
- Produces `getAdminReadiness(session, scope)`, `activateTeacherUsage(session, scope)`, `deactivateTeacherUsage(session, scope)`, `isTeacherUsageActive(session)`.
- Scope key = `academicYear|semester` pada device lokal.

- [ ] Tulis failing tests: Admin checklist incomplete, activation ditolak; checklist lengkap, activation sukses; Guru tidak dapat self-assign; Guru belum aktif hanya melihat dashboard/menu aman; aktivasi tidak memengaruhi lisensi.
- [ ] Implementasikan koleksi lokal `teacherUsageActivation` melalui existing `loadDb/updateDb`.
- [ ] Definisikan checklist wajib dari data yang sudah tersedia: school identity, academic year/semester, principal, active class, subject mapping, KKTP, weights/report settings, teacher assignment.
- [ ] Tambahkan tombol `Aktifkan e-Rapor untuk Guru` dan status readiness di halaman Admin.
- [ ] Tambahkan route/menu guard dengan pesan alasan lock yang jelas tanpa menghapus data.
- [ ] Jalankan test baru + auth/navigation regression.
- [ ] Commit `feat(admin): kontrol kesiapan penggunaan guru`.

### Task 4: Serah Terima Data Siswa

**Files:**
- Create: `src/services/student-handover.js`
- Create: `src/pages/student-handover.js`
- Modify: `src/data/navigation.js`
- Modify: `src/core/router.js`
- Modify: `src/services/file-io.js`
- Modify: `src/services/students.js`
- Test: `tests/student-handover.test.js`

**Interfaces:**
- Produces `exportStudentHandover(session, options)` dan `importStudentHandover(session, payload, options)`.
- Format file: `schema: "erapor-student-handover-v1"`, source metadata, `students[]` biodata-only.

- [ ] Tulis failing tests bahwa export hanya berisi biodata dan tidak mengandung score/attendance/account/password/license/token/installationId/device binding.
- [ ] Tulis tests pemilihan sebagian siswa, saran kenaikan kelas, tujuan editable, konflik NIS/NISN aman, dan arsip sumber tidak dihapus.
- [ ] Implementasikan whitelist field biodata dari model siswa existing; jangan blacklist.
- [ ] Implementasikan import preview + pilihan rombel/tahun tujuan sebelum commit.
- [ ] Tambahkan UI sederhana touch-friendly mengikuti desain existing.
- [ ] Jalankan test siswa/backup/import regression.
- [ ] Commit `feat(siswa): serah terima biodata antar kelas dan tahun`.

### Task 5: Model data TP Penilaian Umum

**Files:**
- Create: `src/data/learning-objective-defaults.js`
- Create: `src/services/learning-objectives.js`
- Modify: `src/services/storage.js` atau migration initializer non-destruktif sesuai pola existing
- Modify: `src/services/objectives.js` bila dapat digunakan tanpa benturan istilah existing
- Test: `tests/learning-objectives.test.js`

**Interfaces:**
- Produces `listLearningObjectives({classId,subjectId,academicYear,semester})`, `saveLearningObjective`, `setSelectedAssessmentObjectives`, `getSelectedAssessmentObjectives`.
- Selection scope = class + subject + academic year + semester.

- [ ] Tulis failing tests bahwa TP terscope benar dan satu assessment dapat memilih N TP tanpa score per TP.
- [ ] Tambahkan data default berlabel `inspiratif`, dengan metadata sumber CP/panduan dan `editable:true`.
- [ ] Implementasikan CRUD lokal TP tambahan/penyesuaian Guru tanpa mengubah default source metadata.
- [ ] Implementasikan selection set per scope.
- [ ] Pastikan backup existing membawa data akademik TP lokal tetapi tidak membawa lisensi.
- [ ] Jalankan tests.
- [ ] Commit `feat(tp): model tp acuan penilaian umum`.

### Task 6: Integrasi TP ke Menu Penilaian Umum

**Files:**
- Modify: `src/pages/assessment.js`
- Modify: `src/services/assessment.js`
- Modify: `src/services/descriptions.js`
- Modify: `src/services/report.js`
- Test: `tests/assessment-tp.test.js`

**Interfaces:**
- Consumes selection TP Task 5.
- Produces deskripsi nilai rapor berdasarkan TP terpilih + satu final score existing.

- [ ] Tulis failing tests yang mengunci formula/perhitungan nilai existing byte-for-byte untuk fixture yang sama sebelum/sesudah TP.
- [ ] Tulis tests 1 TP, 2 TP, 3+ TP menghasilkan deskripsi yang mencakup seluruh konsep tanpa repetisi berlebihan.
- [ ] Tambahkan selector TP pada halaman Penilaian tanpa membuat input angka per TP.
- [ ] Integrasikan generator deskripsi dengan selected objectives; jangan invent kompetensi di luar TP terpilih.
- [ ] Pastikan final score tetap berasal dari pipeline assessment existing.
- [ ] Jalankan seluruh assessment/report tests.
- [ ] Commit `feat(penilaian): gunakan tp sebagai acuan deskripsi rapor`.

### Task 7: Data TP resmi/inspiratif terbaru per mapel dan fase

**Files:**
- Modify: `src/data/learning-objective-defaults.js`
- Create: `docs/TP-SOURCES.md`
- Test: `tests/tp-source-integrity.test.js`

**Interfaces:**
- Dataset mencakup kelas/fase/mapel yang didukung aplikasi, semester 1/2, dengan source citation metadata internal berupa judul dokumen, nomor keputusan/panduan, tahun, dan URL sumber resmi.

- [ ] Verifikasi sumber resmi Kemendikdasmen/BSKAP sebelum menulis konten; jangan mengklaim TP sebagai teks nasional wajib bila dokumen hanya menetapkan CP.
- [ ] Turunkan TP inspiratif yang ringkas, operasional, dan sesuai fase dari CP/ATP/panduan resmi terbaru yang tersedia.
- [ ] PABP memakai pembaruan resmi 2026; mapel umum memakai CP terbaru yang masih berlaku.
- [ ] Mapel opsional hanya muncul bila diaktifkan sekolah; IPAS tidak muncul sebagai mapel terpisah pada Fase A.
- [ ] Tulis integrity tests: tidak ada scope kosong untuk mapel wajib yang didukung, tidak ada duplikasi ID, setiap record punya source metadata.
- [ ] Commit `data(tp): tambah tp inspiratif berbasis sumber resmi`.

### Task 8: Intrakurikuler Mapel → TP → Predikat → Deskripsi

**Files:**
- Modify: `src/services/intracurricular.js`
- Modify: `src/pages/intracurricular.js`
- Modify: `src/pages/intracurricular-input.js`
- Modify: `src/data/intracurricular-defaults.js`
- Modify: `src/services/report.js`
- Test: `tests/intracurricular-tp.test.js`

**Interfaces:**
- Predikat enum fixed: `Cukup`, `Baik`, `Sangat Baik`.
- Intrakurikuler reference uses same TP catalogue but stores selection/predicate separately from Penilaian Umum.

- [ ] Tulis failing tests untuk fase A/B/C, visibility IPAS, mapel optional, 1/N TP, tiga predikat, dan automatic description.
- [ ] Refactor model aktivitas intrakurikuler existing menjadi subject/objective-aware dengan migrasi kompatibel untuk data lama.
- [ ] Implementasikan UI alur Mapel → TP → Predikat → Deskripsi; interval angka tidak wajib.
- [ ] Simpan deskripsi hasil otomatis tetapi izinkan regenerasi saat pilihan berubah.
- [ ] Pastikan data Intrakurikuler tidak menimpa Kokurikuler atau Penilaian Umum.
- [ ] Jalankan test Intrakurikuler/Kokurikuler/report.
- [ ] Commit `feat(intrakurikuler): mapel tp predikat deskripsi otomatis`.

### Task 9: Regression lock tampilan rapor

**Files:**
- Test: `tests/report-layout-lock.test.js`
- Modify: hanya test fixture/snapshot; jangan ubah styling rapor kecuali test membuktikan perubahan tak sengaja perlu dikembalikan ke baseline.

**Interfaces:**
- Snapshot/structural assertions terhadap markup/style critical report baseline `d093b99`.

- [ ] Capture baseline critical CSS/DOM report dari `d093b99`: font family/sizes, alignment, column widths, table ordering, page break classes.
- [ ] Tulis tests yang gagal bila properti layout tersebut berubah.
- [ ] Verifikasi 0/1/2/3 activity sections tetap target 2 A4 pages sesuai test existing.
- [ ] Verifikasi deskripsi TP hanya mengubah text content, bukan struktur/layout.
- [ ] Commit `test(rapor): kunci layout final`.

### Task 10: Final integration, compatibility, security verification

**Files:**
- Modify: `package.json` hanya bila scripts/dependency PostgreSQL benar-benar diperlukan
- Modify: `docs/LICENSE-SYSTEM.md`
- Modify: `.env.example`
- Test: seluruh `tests/*.test.js`

**Interfaces:**
- Produces deploy-ready Vercel+Neon branch dengan fitur 8B–8E lengkap.

- [ ] Jalankan semua tests dan pastikan seluruh 721 baseline + test baru PASS.
- [ ] Jalankan `npm run check` dan `npm run build`, keduanya exit 0.
- [ ] Audit grep: no private key/pepper/recovery/owner password, no bypass, no `localStorage.clear`, `DB_KEY` unchanged.
- [ ] Verifikasi existing install fixture: siswa/nilai/absensi/rapor tetap utuh.
- [ ] Verifikasi backup lama restore dan backup baru tidak memindahkan lisensi.
- [ ] Verifikasi Vercel handler dengan database PostgreSQL test/dev dan satu-key-one-device concurrent activation.
- [ ] Verifikasi Admin readiness, handover, TP assessment, Intrakurikuler secara browser nyata bila harness mendukung.
- [ ] Tulis laporan final SHA, jumlah test, deployment env Vercel/Neon, daftar perubahan, dan STOP sebelum Tahap 9.
- [ ] Commit final `feat: selesaikan tahap 8 vercel neon dan 8B-8E`.
