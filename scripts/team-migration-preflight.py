"""Read an SQL backup and rehearse pending Team migrations in memory only.

This produces local preservation evidence, never authorization to execute D1.
The caller must separately verify backup freshness, restore access and D1 atomicity.
"""
import argparse
import hashlib
import json
import pathlib
import re
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = [ROOT / 'migrations' / name for name in (
    '0005_team_directory.sql', '0006_audit_history.sql', '0007_team_governance.sql')]
IDENTITY_COLUMNS = ['id', 'login_email', 'display_name', 'role', 'account_status',
                    'last_activity_at', 'created_at']


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def tables(db):
    return [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]


def snapshot(db):
    result = {}
    for table in tables(db):
        columns = [r[1] for r in db.execute('PRAGMA table_info(' + quote(table) + ')')]
        rows = [list(r) for r in db.execute('SELECT * FROM ' + quote(table))]
        result[table] = (columns, sorted(json.dumps(r, ensure_ascii=False) for r in rows))
    return result


def check_database(db):
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('Database integrity check failed')
    if db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('Foreign-key violations detected')


def rehearse(backup):
    raw = pathlib.Path(backup).read_bytes()
    db = sqlite3.connect(':memory:')
    db.executescript(raw.decode('utf8'))
    db.execute('PRAGMA foreign_keys=ON')
    check_database(db)
    before = snapshot(db)
    if before.get('operators', ([],))[0] != IDENTITY_COLUMNS:
        raise ValueError('Identity columns differ from reviewed table-copy order')
    registered = {r[0] for r in db.execute('SELECT version FROM schema_migrations')}
    if '0004_operator_permissions' not in registered:
        raise ValueError('Expected registered 0004 schema is required')
    versions = [p.stem for p in MIGRATIONS]
    flags = [v in registered for v in versions]
    if flags != sorted(flags, reverse=True):
        raise ValueError('Team migration registration is not a contiguous prefix')
    # A stale registration or partially applied migration must not be replayed.
    expected = sqlite3.connect(':memory:')
    for path in sorted((ROOT / 'migrations').glob('*.sql')):
        if path.stem > '0004_operator_permissions' and path.stem not in registered:
            break
        expected.executescript('BEGIN;\n' + path.read_text() + '\nCOMMIT;')
    for table in ['operators', 'console_team_profiles', 'console_team_events',
                  'console_audit_actor_snapshots', 'console_mutation_guards']:
        if db.execute('PRAGMA table_info(' + quote(table) + ')').fetchall() != expected.execute(
                'PRAGMA table_info(' + quote(table) + ')').fetchall():
            raise ValueError('Registered schema differs from reviewed migrations: ' + table)
        actual_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
        expected_sql = expected.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
        normalize = lambda value: re.sub(r'\s+', '', value).replace('"', '').lower()
        if bool(actual_sql) != bool(expected_sql) or (actual_sql and normalize(actual_sql[0]) != normalize(expected_sql[0])):
            raise ValueError('Table constraints differ from reviewed migrations: ' + table)
    for table in tables(db):
        for fk in db.execute('PRAGMA foreign_key_list(' + quote(table) + ')'):
            if fk[2] == 'operators' and (fk[5] != 'NO ACTION' or fk[6] != 'NO ACTION'):
                raise ValueError('Unsupported identity foreign-key action: ' + table)
    # Verify existing historical guards against the exact registered schema.
    for name, sql in expected.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger'"):
        if name.startswith(('audit_', 'team_events_', 'console_team_events_', 'finalized_report_', 'console_mutation_')):
            actual = db.execute("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?", (name,)).fetchone()
            normalize = lambda value: re.sub(r'\s+', '', value).replace('"', '').lower()
            if not actual or normalize(actual[0]) != normalize(sql):
                raise ValueError('Historical/authorization trigger drift: ' + name)
    pending = [p for p in MIGRATIONS if p.stem not in registered]
    try:
        db.executescript('BEGIN;\n' + '\n'.join(p.read_text() for p in pending) + '\nCOMMIT;')
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise
    check_database(db)
    for table, (columns, rows) in before.items():
        if table == 'schema_migrations':
            continue
        values = db.execute('SELECT ' + ','.join(map(quote, columns)) + ' FROM ' + quote(table))
        if sorted(json.dumps(list(r), ensure_ascii=False) for r in values) != rows:
            raise ValueError('Original records changed: ' + table)
    after_versions = {r[0] for r in db.execute('SELECT version FROM schema_migrations')}
    if after_versions != registered | set(versions):
        raise ValueError('Unexpected migration registration after rehearsal')
    return {'status': 'LOCAL_REHEARSAL_PASS', 'remote_verified': False,
            'backup_sha256': hashlib.sha256(raw).hexdigest(),
            'registered_team_migrations': [v for v in versions if v in registered],
            'pending_migrations': [p.stem for p in pending],
            'migration_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in MIGRATIONS},
            'preserved_tables': len(before) - 1,
            'preserved_audit_events': len(before.get('audit_events', ([], []))[1]),
            'foreign_key_violations': 0,
            'remote_execution_gate': 'Fresh authenticated backup/schema and supported D1 atomic execution required'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', help='SQL export; read only, restored in memory')
    args = parser.parse_args()
    try:
        print(json.dumps(rehearse(args.backup), indent=2))
    except (ValueError, sqlite3.Error, OSError, UnicodeError) as error:
        parser.exit(1, 'PREFLIGHT BLOCKED: ' + str(error) + '\n')
