-- Extend the existing identity table's role constraint. Keep IDs and every value.
-- Existing foreign keys are NO ACTION; do not run if live inspection differs.
PRAGMA defer_foreign_keys = ON;
-- Recreate this existing trigger later in the same atomic migration.
DROP TRIGGER audit_events_snapshot;
CREATE TABLE operators_expanded (
 id TEXT PRIMARY KEY, login_email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('OPERATOR','MARKETING','MERCH','LOOPERS','OPERATIONS','QA_REVIEWER','APPROVAL_AUTHORITY','ADMINISTRATOR','OPERATIONS_MANAGER','MARKETING_CAMPAIGN_MANAGER','TECHNICIAN','READ_ONLY_AUDITOR')),
 account_status TEXT NOT NULL CHECK(account_status IN ('ACTIVE','SUSPENDED','DISABLED')),
 last_activity_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO operators_expanded SELECT * FROM operators;
DROP TABLE operators;
ALTER TABLE operators_expanded RENAME TO operators;
ALTER TABLE console_team_profiles ADD COLUMN environment TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK(environment IN ('TRAINING','PRODUCTION'));
ALTER TABLE console_team_profiles ADD COLUMN technical_level TEXT CHECK(technical_level IN ('TRAINING','PRODUCTION_SUPPORT','INFRASTRUCTURE_ADMIN'));
ALTER TABLE console_team_profiles ADD COLUMN visibility_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE console_team_profiles ADD COLUMN export_permissions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE console_team_profiles ADD COLUMN managed_scope INTEGER NOT NULL DEFAULT 1;
ALTER TABLE console_team_profiles ADD COLUMN auth_not_before INTEGER NOT NULL DEFAULT 0;
ALTER TABLE console_team_profiles ADD COLUMN certification_evidence TEXT;
ALTER TABLE console_team_profiles ADD COLUMN edge_revocation_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE console_team_profiles ADD COLUMN last_mutation_id TEXT;
ALTER TABLE console_team_profiles ADD COLUMN certified_role TEXT;
ALTER TABLE console_team_profiles ADD COLUMN system_scope_json TEXT NOT NULL DEFAULT '[]';
-- Extend the existing immutable actor snapshot. Earlier snapshots stay unchanged.
ALTER TABLE console_audit_actor_snapshots ADD COLUMN membership_version INTEGER;
ALTER TABLE console_audit_actor_snapshots ADD COLUMN permission_snapshot_json TEXT;
CREATE TRIGGER audit_events_snapshot AFTER INSERT ON audit_events BEGIN
 INSERT INTO console_audit_actor_snapshots(event_id,actor_id,actor_email,actor_name,actor_role,scope_json,authority_json,membership_version,permission_snapshot_json)
 SELECT NEW.id,o.id,o.login_email,o.display_name,o.role,
 (SELECT json_group_array(json_object('campaignId',campaign_id,'recordId',record_id)) FROM console_access_grants WHERE operator_id=o.id),
 (SELECT json_group_array(json_object('campaignId',campaign_id,'fieldKey',field_key,'expiresAt',expires_at)) FROM console_approval_delegations WHERE operator_id=o.id AND datetime(expires_at)>CURRENT_TIMESTAMP),
 COALESCE(p.version,0),json_object('visibility',COALESCE(p.visibility_json,'legacy'),'exports',COALESCE(p.export_permissions_json,'legacy'),'environment',COALESCE(p.environment,'legacy'),'technicalLevel',p.technical_level,'systemScope',p.system_scope_json)
 FROM operators o LEFT JOIN console_team_profiles p ON p.operator_id=o.id WHERE o.id=NEW.operator_id;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM console_audit_actor_snapshots WHERE event_id=NEW.id) THEN RAISE(ABORT,'Audit identity snapshot required') END;
END;
-- Transaction guard: a role/scope/status change cannot race a previously authorized write.
CREATE TABLE console_mutation_guards(id TEXT PRIMARY KEY,operator_id TEXT NOT NULL REFERENCES operators(id),expected_role TEXT NOT NULL,expected_version INTEGER NOT NULL);
CREATE TRIGGER console_mutation_guard BEFORE INSERT ON console_mutation_guards WHEN NOT EXISTS (
 SELECT 1 FROM operators o LEFT JOIN console_team_profiles p ON p.operator_id=o.id
 WHERE o.id=NEW.operator_id AND o.account_status='ACTIVE' AND o.role=NEW.expected_role AND COALESCE(p.version,0)=NEW.expected_version
) BEGIN SELECT RAISE(ABORT,'Console permissions changed'); END;
-- Finalized snapshots extend the same audit ledger, not a competing report store.
CREATE UNIQUE INDEX finalized_report_versions ON audit_events(object_id,json_extract(new_value,'$.version')) WHERE object_type='FinalizedReport';
CREATE TRIGGER finalized_report_version_guard BEFORE INSERT ON audit_events WHEN NEW.object_type='FinalizedReport' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM operators WHERE id=NEW.operator_id AND login_email='team@creatorloop.net' AND role='ADMINISTRATOR' AND account_status='ACTIVE') THEN RAISE(ABORT,'Finalized report requires Owner authority') END;
 SELECT CASE WHEN json_valid(NEW.new_value)=0 THEN RAISE(ABORT,'Finalized report requires valid JSON') END;
 SELECT CASE WHEN NEW.action NOT IN ('REPORT_FINALIZED','REPORT_SUPERSEDED')
 OR json_type(NEW.new_value,'$.version') IS NOT 'integer'
 OR json_type(NEW.new_value,'$.records') IS NOT 'array'
 OR COALESCE(json_extract(NEW.new_value,'$.dataset'),'') NOT IN ('creators','campaigns')
 OR COALESCE(length(trim(json_extract(NEW.new_value,'$.reason'))),0)=0
 OR COALESCE(length(trim(json_extract(NEW.new_value,'$.title'))),0)=0
 OR COALESCE(length(json_extract(NEW.new_value,'$.snapshotHash')),0)<>64
 THEN RAISE(ABORT,'Finalized report metadata is required') END;
 SELECT CASE WHEN NOT (
 (NEW.action='REPORT_FINALIZED' AND json_extract(NEW.new_value,'$.version')=1 AND NEW.previous_value IS NULL AND NOT EXISTS(SELECT 1 FROM audit_events WHERE object_type='FinalizedReport' AND object_id=NEW.object_id))
 OR (NEW.action='REPORT_SUPERSEDED' AND EXISTS(
 SELECT 1 FROM audit_events a WHERE a.id=NEW.previous_value AND a.object_type='FinalizedReport' AND a.object_id=NEW.object_id AND a.campaign_id=NEW.campaign_id
 AND json_extract(a.new_value,'$.dataset')=json_extract(NEW.new_value,'$.dataset')
 AND json_extract(a.new_value,'$.version')=json_extract(NEW.new_value,'$.version')-1
 AND NOT EXISTS(SELECT 1 FROM audit_events b WHERE b.object_type='FinalizedReport' AND b.object_id=a.object_id AND json_extract(b.new_value,'$.version')>json_extract(a.new_value,'$.version'))
 ))) THEN RAISE(ABORT,'Finalized report must supersede the latest version') END;
END;
INSERT INTO schema_migrations(version) VALUES ('0007_team_governance');
PRAGMA defer_foreign_keys = OFF;
