-- Preserve the exact 🗺️CREATORS / Primary Platform value separately from
-- the existing constrained internal platform category. No workbook changes.
ALTER TABLE creator_enrollments ADD COLUMN source_primary_platform TEXT;
UPDATE creator_enrollments SET source_primary_platform=primary_platform;
INSERT INTO schema_migrations(version) VALUES ('0003_source_primary_platform');
