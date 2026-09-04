import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/* Skema lisensi. Jaminan "satu lisensi hanya boleh punya satu perangkat aktif" ditegakkan
   oleh UNIQUE INDEX parsial di bawah, bukan oleh pemeriksaan di kode. Dua permintaan
   aktivasi yang datang bersamaan tidak mungkin sama-sama berhasil: yang kedua ditolak oleh
   database, bukan oleh urutan eksekusi.

   Skema ini sengaja ditulis dengan SQL yang portabel. Memindahkannya ke Postgres/Supabase
   cukup mengganti tipe INTEGER boolean menjadi BOOLEAN dan menjalankan DDL yang sama. */

const SCHEMA=`
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS customers(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  npsn TEXT,
  contact TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses(
  id TEXT PRIMARY KEY,
  license_hash TEXT NOT NULL UNIQUE,
  license_hint TEXT NOT NULL,
  encrypted_recovery TEXT,
  status TEXT NOT NULL CHECK(status IN ('UNUSED','ACTIVE','SUSPENDED','REVOKED')),
  customer_id TEXT REFERENCES customers(id),
  school_name TEXT,
  npsn TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  last_check_at TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS ix_licenses_customer ON licenses(customer_id);

CREATE TABLE IF NOT EXISTS device_activations(
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses(id),
  installation_id TEXT NOT NULL,
  platform TEXT,
  device_label TEXT,
  app_version TEXT,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT,
  released_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
/* Indeks lama - satu perangkat aktif per lisensi - digantikan indeks per SLOT di bawah.
   Namanya dipertahankan di sini hanya agar basis data lama dapat mengenalinya saat dilepas. */
CREATE INDEX IF NOT EXISTS ix_activation_installation ON device_activations(installation_id);

CREATE TABLE IF NOT EXISTS license_events(
  id TEXT PRIMARY KEY,
  license_id TEXT,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_license ON license_events(license_id);
CREATE INDEX IF NOT EXISTS ix_events_created ON license_events(created_at);

CREATE TABLE IF NOT EXISTS owner_accounts(
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS owner_sessions(
  token_hash TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner_accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

/* Katalog rilis resmi e-Rapor. Hanya baris published yang pernah dilayani ke aplikasi
   sekolah. Tabel ini tidak pernah memuat data akademik sekolah mana pun. */
CREATE TABLE IF NOT EXISTS app_versions(
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  version_code INTEGER,
  min_supported_version TEXT,
  notes TEXT,
  released_at TEXT
);
`;

/* SQLite tidak mengenal ADD COLUMN IF NOT EXISTS, jadi kolom Tahap 9 ditambahkan hanya bila
   memang belum ada. Tabel TIDAK pernah dibuat ulang, sehingga basis data pengembangan yang
   sudah berisi baris tetap utuh. */
/* Kolom lisensi tambahan: tipe (CUSTOMER/DEVELOPER), nama pembeli, dan jejak pencabutan.
   Sama seperti app_versions, kolomnya ditambahkan hanya bila belum ada sehingga basis data
   pengembangan yang sudah berisi lisensi tetap utuh. */
/* SLOT PERANGKAT.

   Satu lisensi pembelian memberi DUA slot yang terpisah: satu Android, satu Windows. Aturannya
   ditegakkan UNIQUE INDEX parsial atas (license_id, slot), bukan oleh pemeriksaan di kode: dua
   permintaan aktivasi yang datang bersamaan tidak mungkin sama-sama mendapat slot yang sama.

   Lisensi OWNER tidak memakai slot - barisnya menyimpan slot NULL. Baik SQLite maupun
   PostgreSQL memperlakukan NULL sebagai nilai yang selalu berbeda pada UNIQUE INDEX, sehingga
   lisensi OWNER dapat memiliki perangkat aktif sebanyak apa pun tanpa aturan tambahan. */
const KOLOM_AKTIVASI=[
  ['slot','TEXT'],
  ['device_hint','TEXT'],
];
function lengkapiAktivasi(db){
  const ada=new Set(db.prepare('PRAGMA table_info(device_activations)').all().map(baris=>baris.name));
  for(const [nama,tipe] of KOLOM_AKTIVASI)
    if(!ada.has(nama))db.exec(`ALTER TABLE device_activations ADD COLUMN ${nama} ${tipe}`);
  /* Basis data lama: baris aktif yang belum bernomor slot diisi dari platformnya, KECUALI
     milik lisensi tanpa batas. Indeks lama menjamin paling banyak satu baris aktif per
     lisensi, jadi pengisian ini tidak mungkin melahirkan slot kembar. */
  db.exec(`UPDATE device_activations SET slot=CASE WHEN LOWER(COALESCE(platform,''))='android'
      THEN 'android' ELSE 'windows' END
    WHERE slot IS NULL AND is_active=1
      AND license_id IN (SELECT id FROM licenses WHERE license_type='CUSTOMER')`);
  db.exec('DROP INDEX IF EXISTS ux_one_active_device');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_slot
    ON device_activations(license_id,slot) WHERE is_active=1 AND slot IS NOT NULL`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_activation_active ON device_activations(installation_id,is_active)');
}

const KOLOM_LISENSI=[
  ['license_type',"TEXT NOT NULL DEFAULT 'CUSTOMER'"],
  ['buyer_name','TEXT'],
  ['revoked_at','TEXT'],
  ['revoke_reason','TEXT'],
];
function lengkapiLicenses(db){
  const ada=new Set(db.prepare('PRAGMA table_info(licenses)').all().map(baris=>baris.name));
  for(const [nama,tipe] of KOLOM_LISENSI)
    if(!ada.has(nama))db.exec(`ALTER TABLE licenses ADD COLUMN ${nama} ${tipe}`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_licenses_type ON licenses(license_type, status)');
}

const KOLOM_TAHAP_9=[
  ['download_url','TEXT'],
  ['published','INTEGER NOT NULL DEFAULT 0'],
  ['created_at','TEXT'],
  ['created_by','TEXT'],
];
function lengkapiAppVersions(db){
  const ada=new Set(db.prepare('PRAGMA table_info(app_versions)').all().map(baris=>baris.name));
  for(const [nama,tipe] of KOLOM_TAHAP_9)
    if(!ada.has(nama))db.exec(`ALTER TABLE app_versions ADD COLUMN ${nama} ${tipe}`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_app_versions_platform ON app_versions(platform, published)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_app_versions_platform_version ON app_versions(platform, version)');
}

export function openDatabase(file=':memory:'){
  if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
  const db=new DatabaseSync(file);
  db.exec(SCHEMA);
  lengkapiLicenses(db);
  lengkapiAktivasi(db);
  lengkapiAppVersions(db);
  return db;
}

export function nowIso(){return new Date().toISOString();}
