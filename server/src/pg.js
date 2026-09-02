/* Skema PostgreSQL untuk backend lisensi.

   Isi berkas SQL ditanam sebagai string supaya fungsi Vercel tidak perlu membaca berkas dari
   disk: pada runtime serverless tidak ada berkas yang menetap. server/schema-postgres.sql
   disediakan agar Anda dapat menjalankannya manual di Neon bila lebih suka begitu, dan
   isinya dijaga tetap sama oleh test. */

export const POSTGRES_SCHEMA=`
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

CREATE TABLE IF NOT EXISTS app_versions(
  id                    TEXT PRIMARY KEY,
  platform              TEXT NOT NULL,
  version               TEXT NOT NULL,
  version_code          INTEGER,
  min_supported_version TEXT,
  notes                 TEXT,
  released_at           TIMESTAMPTZ
);
`;

/* Dipanggil sekali saat menyiapkan database. Seluruh pernyataan idempotent, jadi memanggilnya
   berulang kali aman dan tidak pernah menghapus data yang sudah ada. */
export async function applySchema(store){
  for(const pernyataan of POSTGRES_SCHEMA.split(';').map(item=>item.trim()).filter(Boolean))
    await store.run(pernyataan);
  return true;
}
