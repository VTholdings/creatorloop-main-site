"""Actual pending migration rehearsal in memory; no network, export, or live SQL."""
import hashlib,json,pathlib,sqlite3

ROOT=pathlib.Path(__file__).resolve().parents[2]
NAMES=['0005_team_directory','0006_audit_history','0007_team_governance']
SQL=[(ROOT/'migrations'/(n+'.sql')).read_text() for n in NAMES]

def statements(sql):
    # SQLite's completeness scanner keeps trigger bodies intact. It is also the
    # basis of Cloudflare's public Wrangler splitter, not the private REST parser.
    out=[];buf=''
    for c in sql:
        buf+=c
        if c==';' and sqlite3.complete_statement(buf):out.append(buf);buf=''
    assert not buf.strip(), 'Incomplete trailing statement'
    return out

def snapshot(db):
    schema=db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
    values={r[0]:db.execute('SELECT * FROM "'+r[0]+'" ORDER BY rowid').fetchall() for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}
    return schema,values

def connect():
    db=sqlite3.connect(':memory:')
    limits={sqlite3.SQLITE_LIMIT_COLUMN:100,sqlite3.SQLITE_LIMIT_LENGTH:2000000,sqlite3.SQLITE_LIMIT_SQL_LENGTH:100000,sqlite3.SQLITE_LIMIT_FUNCTION_ARG:32,sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER:100,sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH:50,sqlite3.SQLITE_LIMIT_COMPOUND_SELECT:5}
    for key,value in limits.items():db.setlimit(key,value);assert db.getlimit(key)==value
    db.set_authorizer(lambda a,b,c,d,e:sqlite3.SQLITE_DENY if a in [sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH] else sqlite3.SQLITE_OK)
    for path in sorted((ROOT/'migrations').glob('*.sql'))[:4]:db.executescript(path.read_text())
    db.execute('PRAGMA foreign_keys=ON')
    db.execute("INSERT INTO operators(id,login_email,display_name,role,account_status) VALUES('CASE-RETIRED','case.retired@example.com','Fictional retained actor','ADMINISTRATOR','DISABLED')")
    db.execute("INSERT INTO audit_events(id,operator_id,campaign_id,action,object_type,object_id,new_value) VALUES('CASE-HISTORY','CASE-RETIRED','CMP-100','NOTE','Campaign','CMP-100','Original retained history')")
    db.commit();return db

pending=[statements(sql) for sql in SQL]
assert all('CASE' not in sql and '\r' not in sql for sql in SQL)
db=connect();before=snapshot(db);old_columns={t:[r[1] for r in db.execute('PRAGMA table_info("'+t+'")')] for t in before[1]}
db.execute('BEGIN')
for group in pending:
    for statement in group:db.execute(statement)
db.commit()
for table,values in before[1].items():
    projection=','.join('"'+c+'"' for c in old_columns[table])
    observed=db.execute('SELECT '+projection+' FROM "'+table+'" ORDER BY rowid').fetchall()
    if table=='schema_migrations':observed=[v for v in observed if v[0] not in NAMES]
    assert observed==values,table
assert db.execute("SELECT version FROM schema_migrations WHERE version IN (?,?,?) ORDER BY version",NAMES).fetchall()==[(n,) for n in NAMES]
assert db.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
assert db.execute('PRAGMA defer_foreign_keys').fetchone()==(0,)
assert db.execute('PRAGMA foreign_keys').fetchone()==(1,)
assert not db.execute("SELECT name FROM sqlite_master WHERE name='operators_expanded'").fetchall()
for name in ['audit_events_no_update','audit_events_no_delete','audit_snapshots_no_update','audit_snapshots_no_delete','audit_events_no_replace','audit_snapshots_no_replace','team_events_no_replace','console_team_events_no_update','console_team_events_no_delete','console_mutation_guard','finalized_report_version_guard']:
    assert db.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?",(name,)).fetchone(),name
db.close()
for stop in [1,3]:
    db=connect();before=snapshot(db);db.execute('BEGIN')
    try:
        for group in pending[:stop]:
            for statement in group:db.execute(statement)
        db.execute('INSERT INTO schema_migrations(version) VALUES(?)',(NAMES[stop-1],))
        raise AssertionError('Expected injected late registration failure')
    except sqlite3.IntegrityError:db.rollback()
    assert snapshot(db)==before
    assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
    assert not db.in_transaction
    db.close()
print(json.dumps({'status':'LOCAL_CASE_FREE_MIGRATIONS_PASS','sqliteVersion':sqlite3.sqlite_version,'compoundSelectLimit':5,'pendingStatementCount':sum(map(len,pending)),'migrationOrder':NAMES,'originalValuesPreserved':True,'earlyRollbackExact':True,'lateRollbackExact':True,'foreignKeyViolations':0,'providerVerified':False,'migrationSha256':{n+'.sql':hashlib.sha256(s.encode()).hexdigest() for n,s in zip(NAMES,SQL)}}))
