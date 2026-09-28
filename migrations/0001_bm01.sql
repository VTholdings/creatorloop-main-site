PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','READY_FOR_REVIEW','APPROVED','LIVE','PAUSED','COMPLETE','ARCHIVED')),
  source_reference TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  login_email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OPERATOR','MARKETING','MERCH','LOOPERS','OPERATIONS','QA_REVIEWER','APPROVAL_AUTHORITY','ADMINISTRATOR')),
  account_status TEXT NOT NULL CHECK (account_status IN ('ACTIVE','SUSPENDED','DISABLED')),
  last_activity_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS creator_enrollments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  creator_name TEXT NOT NULL,
  primary_platform TEXT NOT NULL CHECK (primary_platform IN ('Meta','TikTok','Google','Shopify','Klaviyo','Recharge','Clipster','Other')),
  handle TEXT NOT NULL,
  contact TEXT NOT NULL,
  creator_status TEXT NOT NULL CHECK (creator_status IN ('Not Started','In Progress','Blocked','Ready for Review','Approved','Active','Complete','Archived')),
  compensation_model TEXT NOT NULL CHECK (compensation_model IN ('Performance','Fixed Content Fee','Hybrid','Product Seeding','Performance Bonus','Organic Only','N/A')),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('Not Reviewed','Organic Only','Paid Usage Approved','Expired','Blocked')),
  product_focus TEXT NOT NULL,
  notes TEXT,
  evidence_link TEXT,
  workflow_status TEXT NOT NULL CHECK (workflow_status IN ('AVAILABLE','IN_PROGRESS','AWAITING_QA','PASSED','HOLD','CORRECTION_REQUIRED')),
  assigned_operator_id TEXT REFERENCES operators(id),
  source_record TEXT,
  enrollment_date TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS qa_reviews (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES creator_enrollments(id),
  reviewer_id TEXT NOT NULL REFERENCES operators(id),
  result TEXT NOT NULL CHECK (result IN ('PASS','HOLD','CORRECTION_REQUIRED')),
  checklist_json TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operators(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  qa_event TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_object_idx ON audit_events(object_type, object_id, created_at);
CREATE INDEX IF NOT EXISTS enrollment_campaign_status_idx ON creator_enrollments(campaign_id, workflow_status);

INSERT OR IGNORE INTO campaigns (id, name, brand_code, status, source_reference)
VALUES ('CMP-100', 'PNB_META_ACQ_3ITEMS_202609', 'PNB', 'IN_PROGRESS', 'PNB Acquisition & Launch Control System / CAMPAIGNS');

INSERT OR IGNORE INTO creator_enrollments (
  id, campaign_id, creator_name, primary_platform, handle, contact, creator_status,
  compensation_model, rights_status, product_focus, notes, evidence_link,
  workflow_status, source_record, enrollment_date, last_updated
) VALUES (
  'CR-100', 'CMP-100', 'Maya Carter — TEST / FICTIONAL', 'Meta', '@MayaPaws',
  'maya.carter@example.com', 'Active', 'Performance', 'Paid Usage Approved',
  'PNB_META_ACQ_3ITEMS_202609 — 3-product campaign',
  'TEST / FICTIONAL — certification record only; exclude from live reporting.',
  'TEST / FICTIONAL', 'PASSED', 'Workbook CREATORS row CR-100',
  '2026-09-20T00:00:00-10:00', '2026-09-27T15:13:00-10:00'
);
