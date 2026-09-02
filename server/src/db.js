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
/* Inti aturan komersial: paling banyak SATU baris aktif per lisensi. */
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_device
  ON device_activations(license_id) WHERE is_active=1;
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
  lengkapiAppVersions(db);
  return db;
}

export function nowIso(){return new Date().toISOString();}
