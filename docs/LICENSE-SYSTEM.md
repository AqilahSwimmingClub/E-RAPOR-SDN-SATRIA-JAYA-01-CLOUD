# Sistem Lisensi e-Rapor

Aturan komersialnya satu kalimat: **1 License Key = 1 perangkat aktif**.
Sekolah yang ingin memakai e-Rapor di lima perangkat harus membeli lima License Key.

Dokumen ini tidak memuat satu pun nilai rahasia. Seluruh rahasia diisi lewat environment.

---

## 1. Arsitektur

Tiga komponen yang terpisah:

| Komponen | Lokasi | Peran |
|---|---|---|
| **Client e-Rapor** | `src/` — aplikasi yang dipakai sekolah | Meminta aktivasi, menyimpan Activation Token, memverifikasi tanda tangannya, dan tetap berjalan offline |
| **License Backend** | `server/src/` — Node.js + SQLite, tanpa dependency | Satu-satunya tempat keputusan lisensi dibuat |
| **Owner Web Panel** | `server/public/owner/` — disajikan di `/owner/` | Panel khusus pemilik: buat lisensi, reset perangkat, suspend, revoke, recovery, audit log |

Client **tidak pernah** menulis langsung ke database lisensi. Ia hanya memanggil dua endpoint
publik (`/activate`, `/check`) dan menerima hasilnya.

```
Sekolah  ──POST /api/v1/activate──►  License Backend  ──►  SQLite
   ▲                                        │
   └──── Activation Token (ECDSA) ──────────┘
Pemilik  ──Bearer session──►  /api/v1/owner/*
```

---

## 2. Menyiapkan backend

```bash
# 1. Buat kunci penandatangan (sekali seumur hidup instalasi)
node server/scripts/generate-signing-key.mjs
#    → private key tersimpan di server/secrets/license-signing-key.pem  (JANGAN di-commit)
#    → public key ditampilkan di layar; tempel ke src/data/license-config.js

# 2. Buat nilai acak untuk pepper dan kunci pemulihan
node server/scripts/generate-secrets.mjs

# 3. Salin dan isi environment
cp server/.env.example server/.env
#    isi LICENSE_HASH_PEPPER, LICENSE_RECOVERY_KEY, OWNER_USERNAME, OWNER_PASSWORD

# 4. Jalankan
node --env-file=server/.env server/src/server.js
#    API   : http://127.0.0.1:8787/api/v1
#    Panel : http://127.0.0.1:8787/owner/
```

### Environment variable yang wajib diisi

| Variabel | Isi | Catatan |
|---|---|---|
| `LICENSE_SIGNING_PRIVATE_KEY_FILE` | Path ke PEM kunci privat | Alternatif: `LICENSE_SIGNING_PRIVATE_KEY` berisi PEM langsung |
| `LICENSE_HASH_PEPPER` | Acak ≥32 karakter | **Jangan pernah diganti** setelah ada lisensi terbit — seluruh kunci lama tidak akan ditemukan |
| `LICENSE_RECOVERY_KEY` | Acak ≥32 karakter | Mengenkripsi nilai pemulihan License Key |
| `OWNER_USERNAME` | Username pemilik | Akun dibuat sekali saat server start |
| `OWNER_PASSWORD` | Password pemilik | Tidak pernah ditanam di kode |
| `LICENSE_DB_FILE` | Path berkas SQLite | Default `./server/data/licenses.db` |
| `HOST` / `PORT` | Alamat server | Default `127.0.0.1:8787` |

Setelah `generate-signing-key.mjs`, tempel **public key** ke `src/data/license-config.js`:

```js
export const LICENSE_API_BASE='https://lisensi.domain-anda.id';
export const LICENSE_PUBLIC_JWK={kty:'EC',crv:'P-256',x:'…',y:'…'};
```

Kedua nilai itu **bukan rahasia** dan memang ikut ke APK.

---

## 3. Skema database

| Tabel | Isi |
|---|---|
| `customers` | Sekolah/pembeli: nama, NPSN, kontak, catatan |
| `licenses` | `license_hash` (unik), `license_hint`, `encrypted_recovery`, `status`, `customer_id`, `school_name`, `npsn`, waktu |
| `device_activations` | `license_id`, `installation_id`, `platform`, `device_label`, `activated_at`, `last_seen_at`, `released_at`, `is_active` |
| `license_events` | Audit log: jenis, aktor, detail, waktu |
| `owner_accounts` / `owner_sessions` | Autentikasi pemilik (scrypt + sesi 12 jam) |
| `app_versions` | **Skema saja**, disiapkan untuk Tahap 9. Belum ada updater yang memakainya |

Inti aturan komersial ditegakkan database, bukan kode:

```sql
CREATE UNIQUE INDEX ux_one_active_device
  ON device_activations(license_id) WHERE is_active=1;
```

Dua perangkat yang menekan Aktifkan pada detik yang sama tidak mungkin sama-sama berhasil:
aktivasi berjalan dalam `BEGIN IMMEDIATE`, dan yang kalah ditolak oleh index ini.

Status lisensi: `UNUSED` → `ACTIVE` → (`SUSPENDED` ↔ `ACTIVE`) → `REVOKED`.

---

## 4. Endpoint API

### Publik (dipakai aplikasi sekolah)

| Method | Path | Isi |
|---|---|---|
| `GET` | `/api/v1/health` | Cek server hidup |
| `GET` | `/api/v1/public-key` | Kunci publik verifikasi token |
| `POST` | `/api/v1/activate` | `{license_key, installation_id, platform, device_label, school_name, npsn, app_version}` |
| `POST` | `/api/v1/check` | `{installation_id, license_id}` |
| `GET` | `/api/v1/updates/latest` | `{implemented:false}` — Tahap 9 belum aktif |

### Pemilik (wajib `Authorization: Bearer <session>`)

| Method | Path | Isi |
|---|---|---|
| `POST` | `/api/v1/owner/login` · `/logout` | Sesi pemilik |
| `GET` | `/api/v1/owner/summary` | Ringkasan jumlah lisensi |
| `GET` | `/api/v1/owner/licenses?q=&status=` | Cari lisensi |
| `GET` | `/api/v1/owner/licenses/:id` | Detail + perangkat + riwayat |
| `POST` | `/api/v1/owner/licenses` | Generate 1–500 key sekaligus |
| `POST` | `/api/v1/owner/licenses/:id/reset-device` | Lepas perangkat aktif |
| `POST` | `/api/v1/owner/licenses/:id/suspend` · `/reactivate` · `/revoke` | Ubah status |
| `POST` | `/api/v1/owner/licenses/:id/recover` | Pulihkan License Key hilang |
| `GET` | `/api/v1/owner/customers` · `POST` | Data pembeli |
| `GET` | `/api/v1/owner/events` | Audit log |

Kode error yang dipetakan ke pesan pengguna: `INVALID_KEY`, `ALREADY_ACTIVATED`, `SUSPENDED`,
`REVOKED`, `NOT_BOUND`, `RATE_LIMITED`, `NETWORK`.

---

## 5. Installation ID

Dibuat dari `crypto.getRandomValues` (16 byte) → `inst_<32 hex>`, disimpan pada
`localStorage['erapor_installation_v1']`.

Tidak diturunkan dari nama sekolah, NPSN, IMEI, atau nomor telepon, sehingga aplikasi tidak
meminta izin perangkat apa pun. Kuncinya **terpisah dari `DB_KEY`**, jadi tidak pernah ikut
ke berkas backup.

---

## 6. Activation Token

ECDSA **P-256 / SHA-256**, tanda tangan IEEE-P1363, format `base64url(payload).base64url(sig)`.
Dipilih karena `crypto.subtle.verify('ECDSA')` didukung semua browser dan WebView Android
tanpa pustaka tambahan.

```json
{ "schema":1, "license_id":"lic_…", "license_hint":"ERAPOR-••••-••••-8Q2K",
  "installation_id":"inst_…", "activation_id":"act_…", "status":"ACTIVE",
  "issued_at":"…", "next_check_at":"…", "grace_days":14 }
```

- **Server** memegang private key (dari environment).
- **Client** hanya memegang public key dan memverifikasi tanda tangan secara lokal.
- Token yang tandanya tidak cocok, atau yang `installation_id`-nya bukan perangkat ini,
  diperlakukan seolah tidak ada.

Tidak ada "secret bersama" yang ditanam di APK.

---

## 7. Alur pemakaian

### Aktivasi pertama (butuh internet sekali)

```
Install → Setup Identitas Sekolah → Aktivasi License Key → Aktivasi Admin Pertama → Login → Dashboard
```

Setup sekolah sengaja didahulukan agar nama sekolah dan NPSN dapat ikut terkirim saat aktivasi.

### Offline sehari-hari

Setelah aktivasi berhasil, **seluruh** input siswa, nilai, absensi, rapor, cetak, dan backup
berjalan tanpa internet. Aplikasi tidak pernah menunggu server saat dibuka.

### Pemeriksaan berkala

- Cek ke server paling sering **setiap 14 hari** bila ada internet.
- Bila jatuh tempo tetapi perangkat offline: masa tenggang **14 hari** lagi, dengan peringatan
  yang wajar. Aplikasi **tetap penuh** selama masa tenggang.
- Gagal menghubungi server **tidak pernah** dianggap lisensi dicabut.
- `last_successful_license_check` disimpan; keputusan tidak hanya bergantung jam lokal karena
  batas waktunya berasal dari `next_check_at` yang **ditandatangani server**.

### Reset / pindah perangkat

```
Key aktif di Laptop A → Pemilik klik RESET DEVICE → binding A ditutup (is_active=0)
→ Key kembali UNUSED → aktivasi di Laptop B → Key terkunci ke B
```

Laptop A tidak kembali sah tanpa otorisasi pemilik. Reset tercatat di audit log lengkap dengan
waktu, `old_installation_id`, alasan, dan aktor.

### Lost key recovery

Pemilik mencari lisensi lewat nama sekolah, NPSN, pembeli, hint kunci, atau ID lisensi, lalu
menekan **Recovery Key**. Nilai pemulihan didekripsi server-side dan ditampilkan sekali.

Recovery **tidak** membuat lisensi baru, **tidak** menambah slot aktivasi, dan **selalu**
tercatat di audit log. Bila perangkat lama hilang/rusak, pemilik harus **Reset Device** dulu.

Aplikasi sekolah tidak punya tombol apa pun untuk mengambil kunci dari server; yang tampil di
sana hanya `ERAPOR-••••-••••-8Q2K`.

---

## 8. Perilaku saat lisensi bermasalah

`SUSPENDED`, `REVOKED`, `NOT_BOUND`, atau masa tenggang habis → aplikasi masuk **Mode Terbatas**:

- ✅ Data tetap **utuh seluruhnya** — tidak ada penghapusan, tidak ada `localStorage.clear()`
- ✅ Pengguna tetap dapat **melihat** data, **mencetak**, dan **membuat backup**
- ⛔ Halaman yang **mengubah** data ditutup sementara

Data sekolah tidak pernah dijadikan sandera.

---

## 9. Backup

Lisensi disimpan pada `localStorage['erapor_license_v1']` dan Installation ID pada
`erapor_installation_v1` — keduanya **di luar `DB_KEY`**. Karena backup hanya mengekspor isi
`DB_KEY`, maka secara struktural:

| Ikut backup | Tidak ikut backup |
|---|---|
| Siswa, nilai, absensi, rapor | Activation Token |
| Identitas sekolah, pengaturan | Installation ID |
| Mapping, bobot, KKTP | License ID / hint / binding perangkat |

Backup Laptop A yang direstore ke Laptop B memindahkan **data sekolah**, bukan lisensi.
Laptop B tetap wajib punya License Key sendiri.

---

## 10. Catatan deployment

Backend ini Node.js murni tanpa dependency, jadi dapat dijalankan di mana saja yang bisa
menjalankan Node 22+ dan menyimpan berkas.

1. **Wajib HTTPS** di produksi (reverse proxy Nginx/Caddy, atau platform yang sudah TLS).
2. Simpan `server/secrets/` dan `server/data/` di volume persisten, backup rutin —
   kehilangan `LICENSE_HASH_PEPPER` membuat seluruh kunci lama tidak dapat dicari lagi.
3. `server/data/licenses.db` adalah SQLite; untuk trafik pemilik + aktivasi sekolah, ini lebih
   dari cukup. Bila kelak ingin pindah ke Postgres/Supabase, DDL di `server/src/db.js` dapat
   dipakai hampir apa adanya — yang penting **UNIQUE INDEX parsial** ikut dibuat, karena di
   situlah aturan satu-perangkat ditegakkan.
4. Batasi akses `/owner/` (IP allowlist atau VPN) sebagai lapisan tambahan.
5. Rate limit bawaan: 8 aktivasi/menit per IP dan per Installation ID, 6 percobaan login
   pemilik/menit per IP.

---

## 11. Tahap 9 — belum dikerjakan

Yang **sudah** disiapkan: tabel `app_versions` dan endpoint `/api/v1/updates/latest` yang
sengaja menjawab `{implemented:false}`.

Yang **belum ada sama sekali**: unduh APK otomatis, updater Windows, install APK, auto-updater
Electron, dan perubahan identitas paket. Semua itu masuk Tahap 9.
