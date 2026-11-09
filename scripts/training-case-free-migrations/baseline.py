"""Private training-only accepted-backup reconstruction and exact local rehearsal.
No network, export, remote restore or production SQL execution.
"""
import argparse,hashlib,json,pathlib,runpy,sqlite3,sys,zipfile,shutil,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
HASHES={'0005_team_directory.sql': '2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693', '0006_audit_history.sql': '5efb5f677c082bb8bc5ad2e5a8c326b51b1894d3935adf3c1153b3be80cf58ed', '0007_team_governance.sql': 'f6cc901cd01a51ce9b51a022ab1ad8746197c29d5876b81557b7d7ed494b0457'}
SCHEMA="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name"
def rows(db,sql):return [dict(r) for r in db.execute(sql)]
def data_sql(t,cols):
    projection=[]
    for c in cols:
        if not c.replace('_','').isalnum():raise ValueError()
        q='"'+c+'"'
        projection.append("CASE typeof("+q+") WHEN 'text' THEN 'text:'||hex("+q+") WHEN 'blob' THEN 'blob:'||hex("+q+") WHEN 'real' THEN 'real:'||printf('%!.17g',"+q+") ELSE typeof("+q+")||':'||quote("+q+") END AS "+q)
    return 'SELECT '+','.join(projection)+' FROM "'+t+'" LIMIT 2001'
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def sorted_rows(v):return sorted(v,key=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False))
def prepare(archive):
    for n,h in HASHES.items():
        if hashlib.sha256((ROOT/'migrations'/n).read_bytes()).hexdigest()!=h:raise ValueError()
    # Authenticate the original manifests against immutable historical source bytes first.
    # Rehearse corrected pending files separately; never relabel old receipt hashes.
    with tempfile.TemporaryDirectory(prefix='cl-case-free-baseline-') as temp:
        historical=pathlib.Path(temp)
        shutil.copytree(ROOT/'scripts',historical/'scripts')
        shutil.copytree(ROOT/'migrations',historical/'migrations')
        for name in ('0006_audit_history.sql','0007_team_governance.sql'):
            shutil.copyfile(ROOT/'tests/fixtures/accepted-team-migrations'/name,historical/'migrations'/name)
        b=runpy.run_path(str(historical/'scripts/training-migrations/baseline.py'))['prepare'](archive)
    b['historicalMigrationSha256']=dict(b['migrationSha256'])
    b['historicalAcceptedRehearsalSha256']=dict(b['acceptedRehearsalSha256'])
    b['migrationSha256']={name:hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted((ROOT/'migrations').glob('*.sql')) for name in [file.name]}
    b['localCorrectedRehearsalSha256']=dict(HASHES)
    if b['registeredTeamMigrations'] or b['pendingMigrations']!=[n[:-4] for n in HASHES]:raise ValueError()
    with zipfile.ZipFile(archive) as z:raw=z.read('TRAINING.sql')
    if hashlib.sha256(raw).hexdigest()!=b['backupSha256']:raise ValueError()
    db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
    db.set_authorizer(lambda a,b,c,d,e:sqlite3.SQLITE_DENY if a in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
    try:
        db.executescript(raw.decode());db.execute('PRAGMA foreign_keys=ON')
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or rows(db,'PRAGMA foreign_key_check'):raise ValueError()
        tables=sorted(b['foreignKeys'])
        b['dataColumns']={t:[r['name'] for r in rows(db,'PRAGMA table_info("'+t+'")')] for t in tables}
        inventory={t:sorted_rows(rows(db,data_sql(t,b['dataColumns'][t]))) for t in tables}
        if any(len(v)>2000 for v in inventory.values()):raise ValueError()
        b['backupData']={t:{'count':len(v),'sha256':digest(v)} for t,v in inventory.items()}
        b['originalRegistrationRows']=inventory['schema_migrations']
        b['originalTableInfo']={t:rows(db,'PRAGMA table_info("'+t+'")') for t in tables}
        sql='\n'.join((ROOT/'migrations'/n).read_text() for n in HASHES)
        try:db.executescript('BEGIN;\n'+sql+'\nCOMMIT;')
        except Exception:
            if db.in_transaction:db.rollback()
            raise
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or rows(db,'PRAGMA foreign_key_check'):raise ValueError()
        for t,v in inventory.items():
            observed=sorted_rows(rows(db,data_sql(t,b['dataColumns'][t])))
            if t=='schema_migrations':observed=[r for r in observed if r['version'] in {x['version'] for x in v}]
            if observed!=v:raise ValueError()
        schema=rows(db,SCHEMA);post_tables=sorted(r['name'] for r in schema if r['type']=='table')
        b['postSchema']=schema;b['postForeignKeys']={t:rows(db,'PRAGMA foreign_key_list("'+t+'")') for t in post_tables}
        b['postTableInfo']={t:rows(db,'PRAGMA table_info("'+t+'")') for t in post_tables}
        b['newTables']=sorted(set(post_tables)-set(tables))
        if b['newTables']!=['console_audit_actor_snapshots','console_mutation_guards','console_team_events','console_team_profiles'] or any(db.execute('SELECT count(*) FROM "'+t+'"').fetchone()[0] for t in b['newTables']):raise ValueError()
        # Engine-trigger failure after all reviewed SQL must roll back schema, rows and registration.
        second=sqlite3.connect(':memory:');second.row_factory=sqlite3.Row
        try:
            second.executescript(raw.decode());second.execute('PRAGMA foreign_keys=ON')
            try:second.executescript('BEGIN;\n'+sql+"\nINSERT INTO schema_migrations(version) VALUES ('0007_team_governance');\nCOMMIT;")
            except sqlite3.IntegrityError:
                if second.in_transaction:second.rollback()
            else:raise ValueError()
            if rows(second,SCHEMA)!=b['schema']:raise ValueError()
            if any(sorted_rows(rows(second,data_sql(t,b['dataColumns'][t])))!=v for t,v in inventory.items()):raise ValueError()
        finally:second.close()
        b['localRehearsal']='LOCAL_REHEARSAL_AND_ROLLBACK_PASS';return b
    finally:db.close()
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('archive');p.add_argument('output');a=p.parse_args()
    try:
        b=prepare(a.archive);out=pathlib.Path(a.output);out.mkdir(mode=0o700,parents=True,exist_ok=False)
        f=out/'TRAINING.json';f.write_text(json.dumps(b)+'\n');f.chmod(0o600)
        print('TRAINING_CASE_FREE_MIGRATION_PRIVATE_REHEARSAL_PASS; no remote migration or restore')
    except Exception:print('TRAINING_CASE_FREE_MIGRATION_BASELINE_BLOCKED',file=sys.stderr);sys.exit(1)
