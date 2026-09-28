PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE campaigns ADD COLUMN platform TEXT;
ALTER TABLE campaigns ADD COLUMN objective TEXT;
ALTER TABLE campaigns ADD COLUMN slug TEXT;
ALTER TABLE campaigns ADD COLUMN cash_budget REAL NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN promo_credit REAL NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN start_date TEXT;
ALTER TABLE campaigns ADD COLUMN end_date TEXT;
ALTER TABLE campaigns ADD COLUMN owner_name TEXT;
ALTER TABLE campaigns ADD COLUMN product_scope TEXT;
ALTER TABLE campaigns ADD COLUMN notes TEXT;
ALTER TABLE campaigns ADD COLUMN source_updated_at TEXT;
ALTER TABLE campaigns ADD COLUMN source_version TEXT;

ALTER TABLE creator_enrollments ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
  CHECK (sync_status IN ('SYNCED','PENDING_EXPORT','CONFLICT','LOCAL_ONLY'));
ALTER TABLE creator_enrollments ADD COLUMN source_updated_at TEXT;
ALTER TABLE creator_enrollments ADD COLUMN source_version TEXT;

UPDATE campaigns SET slug='3ITEMS' WHERE id='CMP-100' AND slug IS NULL;

CREATE TABLE IF NOT EXISTS creator_assignments (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('TEST','NONPRODUCTION','PRODUCTION')),
  creator_id TEXT NOT NULL REFERENCES creator_enrollments(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  status TEXT NOT NULL CHECK (status IN ('Not Started','In Progress','Blocked','Ready for Review','Approved','Active','Complete','Archived')),
  start_date TEXT,
  content_due TEXT,
  fixed_content_fee REAL NOT NULL DEFAULT 0,
  commission_rate REAL NOT NULL DEFAULT 0,
  paid_usage_rights TEXT NOT NULL CHECK (paid_usage_rights IN ('Yes','No','Pending')),
  attribution_window_days INTEGER NOT NULL DEFAULT 30,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('Planned','Pending','Verified','Blocked','Expired')),
  notes TEXT,
  signed_rights_evidence_link TEXT,
  assigned_operator_id TEXT REFERENCES operators(id),
  last_updated TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  source_updated_at TEXT,
  source_version TEXT,
  sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (sync_status IN ('SYNCED','PENDING_EXPORT','CONFLICT','LOCAL_ONLY'))
);

CREATE TABLE IF NOT EXISTS creatives (
  id TEXT PRIMARY KEY,
  creative_name TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES creator_enrollments(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  product TEXT NOT NULL,
  angle TEXT,
  format TEXT NOT NULL,
  platform TEXT NOT NULL,
  rights_status TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  destination_url TEXT,
  evidence_link TEXT,
  created_date TEXT,
  last_updated TEXT NOT NULL,
  source_updated_at TEXT,
  source_version TEXT,
  sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (sync_status IN ('SYNCED','PENDING_EXPORT','CONFLICT','LOCAL_ONLY'))
);

CREATE TABLE IF NOT EXISTS control_system_outbox (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  operator_id TEXT NOT NULL REFERENCES operators(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('CAMPAIGN','CREATOR','ASSIGNMENT','CREATIVE')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','EXPORTED','ACKNOWLEDGED','FAILED','CONFLICT')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exported_at TEXT,
  acknowledged_at TEXT
);

CREATE TABLE IF NOT EXISTS control_system_imports (
  event_id TEXT PRIMARY KEY,
  source_version TEXT,
  payload_hash TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING','APPLIED','FAILED')),
  error_message TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS assignment_creator_campaign_idx ON creator_assignments(creator_id,campaign_id,status);
CREATE INDEX IF NOT EXISTS creative_creator_campaign_idx ON creatives(creator_id,campaign_id,approval_status);
CREATE INDEX IF NOT EXISTS outbox_status_idx ON control_system_outbox(status,created_at);
CREATE INDEX IF NOT EXISTS campaign_search_idx ON campaigns(id,name,slug,status);
CREATE INDEX IF NOT EXISTS creator_search_idx ON creator_enrollments(campaign_id,creator_name,handle,primary_platform,creator_status,workflow_status);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('0002_operations_console_v2');
