-- Console-only access metadata. Preserve every existing source record and audit entry.
PRAGMA foreign_keys = ON;
CREATE TABLE console_access_grants (
 operator_id TEXT NOT NULL REFERENCES operators(id),
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 record_id TEXT NOT NULL DEFAULT '*',
 granted_by TEXT NOT NULL REFERENCES operators(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(operator_id,campaign_id,record_id)
);
CREATE TABLE console_approval_delegations (
 operator_id TEXT NOT NULL REFERENCES operators(id),
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 field_key TEXT NOT NULL,
 delegated_by TEXT NOT NULL REFERENCES operators(id),
 expires_at TEXT NOT NULL,
 PRIMARY KEY(operator_id,campaign_id,field_key)
);
CREATE TABLE console_authorizations (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('CREATOR','ASSIGNMENT')),
 entity_id TEXT NOT NULL,
 values_json TEXT NOT NULL,
 evidence_link TEXT NOT NULL,
 approved_by TEXT NOT NULL REFERENCES operators(id),
 expires_at TEXT,
 revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE console_source_records (
 tab TEXT NOT NULL,
 record_id TEXT NOT NULL,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 creator_id TEXT,
 fields_json TEXT NOT NULL,
 source_version TEXT NOT NULL,
 source_updated_at TEXT NOT NULL,
 PRIMARY KEY(tab,record_id)
);
CREATE TABLE console_source_outbox (
 id TEXT PRIMARY KEY,
 idempotency_key TEXT NOT NULL UNIQUE,
 operator_id TEXT NOT NULL REFERENCES operators(id),
 entity_type TEXT NOT NULL CHECK(entity_type='DECISION'),
 entity_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action='UPSERT'),
 payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','EXPORTED','ACKED','FAILED')),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 exported_at TEXT,
 acknowledged_at TEXT,
 last_error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version) VALUES ('0004_operator_permissions');
