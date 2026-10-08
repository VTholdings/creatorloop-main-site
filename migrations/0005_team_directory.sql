-- Console personnel metadata only. No operational/source records are changed.
PRAGMA foreign_keys = ON;
CREATE TABLE console_team_profiles (
 operator_id TEXT PRIMARY KEY REFERENCES operators(id),
 employment_status TEXT NOT NULL CHECK(employment_status IN ('PENDING_START','EMPLOYED')),
 training_status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(training_status IN ('NOT_STARTED','IN_PROGRESS','CERTIFIED')),
 lifecycle_status TEXT NOT NULL DEFAULT 'INVITED' CHECK(lifecycle_status IN ('PENDING','INVITED','TRAINING','CERTIFIED','ACTIVE','SUSPENDED','INACTIVE')),
 proposed_scope_json TEXT NOT NULL DEFAULT '[]',
 version INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NOT NULL REFERENCES operators(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE console_team_events (
 id TEXT PRIMARY KEY,
 target_operator_id TEXT NOT NULL REFERENCES operators(id),
 actor_operator_id TEXT NOT NULL REFERENCES operators(id),
 actor_email TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 actor_role TEXT NOT NULL,
 action TEXT NOT NULL,
 previous_state_json TEXT,
 new_state_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX console_team_events_target ON console_team_events(target_operator_id,created_at);
CREATE TRIGGER console_team_events_no_update BEFORE UPDATE ON console_team_events
 BEGIN SELECT RAISE(ABORT,'Team history is append-only'); END;
CREATE TRIGGER console_team_events_no_delete BEFORE DELETE ON console_team_events
 BEGIN SELECT RAISE(ABORT,'Team history is append-only'); END;
INSERT INTO schema_migrations(version) VALUES ('0005_team_directory');
