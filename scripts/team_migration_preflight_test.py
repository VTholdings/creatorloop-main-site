import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('preflight', ROOT / 'scripts/team-migration-preflight.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        for path in sorted((ROOT / 'migrations').glob('*.sql'))[:4]:
            self.db.executescript('BEGIN;\n' + path.read_text() + '\nCOMMIT;')
        self.temp = tempfile.TemporaryDirectory()
        self.backup = pathlib.Path(self.temp.name) / 'backup.sql'

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def run_backup(self):
        self.backup.write_text('\n'.join(self.db.iterdump()))
        return preflight.rehearse(self.backup)

    def apply(self, count):
        for path in preflight.MIGRATIONS[:count]:
            self.db.executescript('BEGIN;\n' + path.read_text() + '\nCOMMIT;')

    def test_backup_unchanged_and_all_original_rows_preserved(self):
        result = self.run_backup()
        original = self.backup.read_bytes()
        self.assertEqual(result['pending_migrations'], [p.stem for p in preflight.MIGRATIONS])
        self.assertFalse(result['remote_verified'])
        self.assertEqual(preflight.rehearse(self.backup), result)
        self.assertEqual(self.backup.read_bytes(), original)

    def test_partial_and_complete_registered_migrations_are_not_replayed(self):
        self.apply(2)
        self.assertEqual(self.run_backup()['pending_migrations'], ['0007_team_governance'])
        self.apply_last()
        self.assertEqual(self.run_backup()['pending_migrations'], [])

    def apply_last(self):
        self.db.executescript('BEGIN;\n' + preflight.MIGRATIONS[2].read_text() + '\nCOMMIT;')

    def test_registration_does_not_hide_missing_schema(self):
        self.db.execute("INSERT INTO schema_migrations(version) VALUES('0005_team_directory')")
        with self.assertRaisesRegex(ValueError, 'schema differs'):
            self.run_backup()

    def test_registration_gap_is_blocked(self):
        self.db.execute("INSERT INTO schema_migrations(version) VALUES('0006_audit_history')")
        with self.assertRaisesRegex(ValueError, 'contiguous prefix'):
            self.run_backup()

    def test_cascading_identity_deletion_is_blocked(self):
        self.db.execute('CREATE TABLE dangerous_reference(id TEXT, operator_id TEXT REFERENCES operators(id) ON DELETE CASCADE)')
        with self.assertRaisesRegex(ValueError, 'foreign-key action'):
            self.run_backup()

    def test_missing_immutable_trigger_is_blocked(self):
        self.apply(2)
        self.db.execute('DROP TRIGGER audit_events_no_delete')
        with self.assertRaisesRegex(ValueError, 'trigger drift'):
            self.run_backup()

    def test_backup_cannot_attach_or_write_external_databases(self):
        external = pathlib.Path(self.temp.name) / 'external.db'
        self.backup.write_text("ATTACH DATABASE '" + str(external) + "' AS other;CREATE TABLE other.leak(value TEXT);")
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'not authorized'):
            preflight.rehearse(self.backup)
        self.assertFalse(external.exists())

    def test_identity_column_drift_is_blocked(self):
        self.db.execute('ALTER TABLE operators ADD COLUMN unexpected TEXT')
        with self.assertRaisesRegex(ValueError, 'table-copy order'):
            self.run_backup()


if __name__ == '__main__':
    unittest.main()
