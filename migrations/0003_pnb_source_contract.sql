-- Preserve all records, IDs, history, attribution, and business terms.
-- Run as one D1 migration. Foreign keys stay enabled and are checked at commit.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE creator_enrollments_pnb (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id),
  creator_name TEXT NOT NULL,
  primary_platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  contact TEXT NOT NULL,
  creator_status TEXT NOT NULL CHECK (creator_status IN ('Not Started','In Progress','Blocked','Ready for Review','Approved','Live','Paused','Complete','Archived','Active','')),
  compensation_model TEXT NOT NULL CHECK (compensation_model IN ('Performance','Fixed Content Fee','Hybrid','Product Seeding','Performance Bonus','Organic Only','N/A','')),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('Not Reviewed','Organic Only','Paid Usage Approved','Expired','Blocked','N/A','')),
  product_focus TEXT NOT NULL,
  notes TEXT,
  evidence_link TEXT,
  workflow_status TEXT NOT NULL CHECK (workflow_status IN ('AVAILABLE','IN_PROGRESS','AWAITING_QA','PASSED','HOLD','CORRECTION_REQUIRED')),
  assigned_operator_id TEXT REFERENCES operators(id),
  source_record TEXT,
  enrollment_date TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (sync_status IN ('SYNCED','PENDING_EXPORT','CONFLICT','LOCAL_ONLY')),
  source_updated_at TEXT,
  source_version TEXT,
  last_mutation_id TEXT
);
INSERT INTO creator_enrollments_pnb SELECT * FROM creator_enrollments;
DROP TABLE creator_enrollments;
ALTER TABLE creator_enrollments_pnb RENAME TO creator_enrollments;

CREATE TABLE creator_assignments_pnb (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('TEST','NONPRODUCTION','PRODUCTION')),
  creator_id TEXT NOT NULL REFERENCES creator_enrollments(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  status TEXT NOT NULL CHECK (status IN ('Not Started','In Progress','Blocked','Ready for Review','Approved','Live','Paused','Complete','Archived','Active')),
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
  last_mutation_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (sync_status IN ('SYNCED','PENDING_EXPORT','CONFLICT','LOCAL_ONLY'))
);
INSERT INTO creator_assignments_pnb SELECT * FROM creator_assignments;
DROP TABLE creator_assignments;
ALTER TABLE creator_assignments_pnb RENAME TO creator_assignments;

CREATE INDEX enrollment_campaign_status_idx ON creator_enrollments(campaign_id,workflow_status);
CREATE INDEX creator_search_idx ON creator_enrollments(campaign_id,creator_name,handle,primary_platform,creator_status,workflow_status);
CREATE INDEX assignment_creator_campaign_idx ON creator_assignments(creator_id,campaign_id,status);
INSERT INTO schema_migrations(version) VALUES ('0003_pnb_source_contract');
PRAGMA defer_foreign_keys = OFF;
