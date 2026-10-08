-- Preserve original events byte-for-byte. Only FUTURE events get snapshots.
PRAGMA foreign_keys = ON;
CREATE TABLE console_audit_actor_snapshots (
 event_id TEXT PRIMARY KEY REFERENCES audit_events(id),
 actor_id TEXT NOT NULL,
 actor_email TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 actor_role TEXT NOT NULL,
 scope_json TEXT NOT NULL,
 authority_json TEXT NOT NULL,
 captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER audit_events_snapshot AFTER INSERT ON audit_events
BEGIN
 INSERT INTO console_audit_actor_snapshots(event_id,actor_id,actor_email,actor_name,actor_role,scope_json,authority_json)
 SELECT NEW.id,o.id,o.login_email,o.display_name,o.role,
  (SELECT json_group_array(json_object('campaignId',campaign_id,'recordId',record_id)) FROM console_access_grants WHERE operator_id=o.id),
  (SELECT json_group_array(json_object('campaignId',campaign_id,'fieldKey',field_key,'expiresAt',expires_at)) FROM console_approval_delegations WHERE operator_id=o.id AND expires_at>CURRENT_TIMESTAMP)
 FROM operators o WHERE o.id=NEW.operator_id;
 SELECT RAISE(ABORT,'Audit identity snapshot required') WHERE NOT EXISTS(SELECT 1 FROM console_audit_actor_snapshots WHERE event_id=NEW.id);
END;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
 BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
 BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TRIGGER audit_snapshots_no_update BEFORE UPDATE ON console_audit_actor_snapshots
 BEGIN SELECT RAISE(ABORT,'Audit snapshots are append-only'); END;
CREATE TRIGGER audit_snapshots_no_delete BEFORE DELETE ON console_audit_actor_snapshots
 BEGIN SELECT RAISE(ABORT,'Audit snapshots are append-only'); END;
CREATE TRIGGER audit_events_no_replace BEFORE INSERT ON audit_events
 WHEN EXISTS(SELECT 1 FROM audit_events WHERE id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TRIGGER audit_snapshots_no_replace BEFORE INSERT ON console_audit_actor_snapshots
 WHEN EXISTS(SELECT 1 FROM console_audit_actor_snapshots WHERE event_id=NEW.event_id)
 BEGIN SELECT RAISE(ABORT,'Audit snapshots are append-only'); END;
CREATE TRIGGER team_events_no_replace BEFORE INSERT ON console_team_events
 WHEN EXISTS(SELECT 1 FROM console_team_events WHERE id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'Team history is append-only'); END;
INSERT INTO schema_migrations(version) VALUES ('0006_audit_history');
