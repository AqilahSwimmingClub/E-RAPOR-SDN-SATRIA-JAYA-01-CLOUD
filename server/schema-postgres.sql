-- Skema lisensi e-Rapor untuk PostgreSQL / Neon.
-- Jalankan sekali pada database Neon Anda, atau biarkan server menerapkannya otomatis
-- lewat applySchema(). Seluruh pernyataan bersifat idempotent.

CREATE TABLE IF NOT EXISTS customers(
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  npsn         TEXT,
  contact      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS licenses(
  id                 TEXT PRIMARY KEY,
  license_hash       TEXT NOT NULL UNIQUE,
  license_hint       TEXT NOT NULL,
  encrypted_recovery TEXT,
  status             TEXT NOT NULL CHECK (status IN ('UNUSED','ACTIVE','SUSPENDED','REVOKED')),
  customer_id        TEXT REFERENCES customers(id),
  school_name        TEXT,
  npsn               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at       TIMESTAMPTZ,
  last_check_at      TIMESTAMPTZ,
  notes              TEXT
);
CREATE INDEX IF NOT EXISTS ix_licenses_status   ON licenses(status);
CREATE INDEX IF NOT EXISTS ix_licenses_customer ON licenses(customer_id);
-- Kolom tambahan ditambahkan terpisah, bukan dengan membuat ulang tabel, supaya lisensi yang
-- sudah terbit beserta ikatan perangkatnya tidak hilang satu pun.
-- license_type memisahkan lisensi pembeli dari lisensi Developer milik pemilik aplikasi.
-- Seluruh lisensi lama otomatis dianggap CUSTOMER.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_type  TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS buyer_name    TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS revoked_at    TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS revoke_reason TEXT;
CREATE INDEX IF NOT EXISTS ix_licenses_type ON licenses(license_type, status);

CREATE TABLE IF NOT EXISTS device_activations(
  id              TEXT PRIMARY KEY,
  license_id      TEXT NOT NULL REFERENCES licenses(id),
  installation_id TEXT NOT NULL,
  platform        TEXT,
  device_label    TEXT,
  app_version     TEXT,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ,
  released_at     TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Inti aturan komersial: satu lisensi hanya boleh punya SATU perangkat aktif.
-- Ditegakkan database, bukan kode. Dua aktivasi bersamaan tidak mungkin sama-sama lolos.
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_device
  ON device_activations(license_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS ix_activation_installation ON device_activations(installation_id);

CREATE TABLE IF NOT EXISTS license_events(
  id         TEXT PRIMARY KEY,
  license_id TEXT,
  type       TEXT NOT NULL,
  actor      TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_events_license ON license_events(license_id);
CREATE INDEX IF NOT EXISTS ix_events_created ON license_events(created_at);

CREATE TABLE IF NOT EXISTS owner_accounts(
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_sessions(
  token_hash TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES owner_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Katalog rilis resmi e-Rapor. Hanya baris published yang pernah dilayani ke aplikasi
-- sekolah. Tabel ini tidak pernah memuat data akademik sekolah mana pun.
CREATE TABLE IF NOT EXISTS app_versions(
  id                    TEXT PRIMARY KEY,
  platform              TEXT NOT NULL,
  version               TEXT NOT NULL,
  version_code          INTEGER,
  min_supported_version TEXT,
  notes                 TEXT,
  released_at           TIMESTAMPTZ
);
-- Kolom Tahap 9 ditambahkan terpisah, bukan dengan membuat ulang tabel, supaya instalasi yang
-- sudah berjalan tidak kehilangan satu baris pun.
ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS download_url TEXT;
ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS created_by   TEXT;
CREATE INDEX IF NOT EXISTS ix_app_versions_platform ON app_versions(platform, published);
CREATE UNIQUE INDEX IF NOT EXISTS ux_app_versions_platform_version ON app_versions(platform, version);
