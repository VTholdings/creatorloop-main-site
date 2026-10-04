"""Read the accepted authenticated bundle locally; emit private schema expectations.
No network, remote restore, pending migration execution or SQL/data logging.
"""
import argparse,hashlib,json,pathlib,sqlite3,zipfile,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
RELEASE='a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46'
RUN='37242966914'
DBS={'TRAINING':'12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0','PRODUCTION':'c4993a97-5835-4c6c-af06-7020fa8d4f2a'}
SCHEMA="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name LIMIT 257"
REGISTRATION='SELECT version FROM schema_migrations ORDER BY version LIMIT 33'
def digest(b):return hashlib.sha256(b).hexdigest()
def rows(db,sql):return [dict(r) for r in db.execute(sql)]
def baseline(archive):
    hashes={p.name:digest(p.read_bytes()) for p in sorted((ROOT/'migrations').glob('*.sql'))}
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if len(names)!=len(set(names)) or sum(i.file_size for i in z.infolist())>140*1024*1024:raise ValueError()
        if any(pathlib.PurePosixPath(n).is_absolute() or '..' in pathlib.PurePosixPath(n).parts or '\\' in n for n in names):raise ValueError()
        evidence=json.loads(z.read('export-evidence.json'));summary=json.loads(z.read('verification-summary.json'))
        if evidence.get('status')!='FRESH_EXPORTS_CAPTURED' or evidence.get('releaseSha')!=RELEASE or evidence.get('runId')!=RUN or evidence.get('blockers') or len(evidence.get('exports',[]))!=2:raise ValueError()
        if summary.get('status')!='LOCAL_RESTORE_AND_REHEARSAL_PASS' or summary.get('remoteMigrationsApplied') is not False or summary.get('productionDeployed') is not False:raise ValueError()
        result={}
        for env,dbid in DBS.items():
            raw=z.read(env+'.sql');capture=next(e for e in evidence['exports'] if e['environment']==env)
            preflight=json.loads(z.read(env+'-preflight.json'));original=json.loads(z.read(env+'-retention.json'));restored=json.loads(z.read(env+'-restore.json'))
            if capture.get('databaseId')!=dbid or capture.get('status')!='EXPORT_CAPTURED' or capture.get('sha256')!=digest(raw):raise ValueError()
            if preflight.get('status')!='LOCAL_REHEARSAL_PASS' or preflight.get('backup_sha256')!=digest(raw) or preflight.get('foreign_key_violations')!=0:raise ValueError()
            if set(preflight.get('migration_sha256',{}))!={'0005_team_directory.sql','0006_audit_history.sql','0007_team_governance.sql'}:raise ValueError()
            for name,sha in preflight['migration_sha256'].items():
                if hashes.get(name)!=sha:raise ValueError()
            if original.get('backup_sha256')!=digest(raw) or restored.get('backup_sha256')!=digest(raw) or restored.get('restore_comparison')!='LOCAL_RESTORE_MATCH':raise ValueError()
            for key in ('environment','release_sha','table_inventory','schema_inventory','audit_attribution','report_versions','external_artifacts'):
                if original[key]!=restored[key]:raise ValueError()
            if original['environment']!=env or original['release_sha']!=RELEASE:raise ValueError()
            db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
            db.set_authorizer(lambda action,a,b,c,d: sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
            try:
                db.executescript(raw.decode())
                schema=rows(db,SCHEMA);registration=rows(db,REGISTRATION)
                if len(schema)>256 or len(registration)>32:raise ValueError()
                # Corroborate the accepted original schema manifest without rerunning rehearsal.
                observed=[{'type':r['type'],'name':r['name'],'sha256':digest(r['sql'].encode())} for r in schema]
                if observed!=original['schema_inventory']:raise ValueError()
                tables=sorted(r['name'] for r in schema if r['type']=='table')
                if not 1<=len(tables)<=48 or any(not n.replace('_','').isalnum() or not (n[0].isalpha() or n[0]=='_') for n in tables):raise ValueError()
                known={p.stem for p in (ROOT/'migrations').glob('*.sql')}
                versions=[r['version'] for r in registration]
                if len(set(versions))!=len(versions) or any(v not in known for v in versions) or not {'0002_operations_console_v2','0003_pnb_source_contract','0004_operator_permissions'}.issubset(versions):raise ValueError()
                teams=[p.stem for p in sorted((ROOT/'migrations').glob('000[567]_*.sql'))]
                if [v for v in teams if v in versions]!=preflight['registered_team_migrations'] or [v for v in teams if v not in versions]!=preflight['pending_migrations']:raise ValueError()
                result[env]={'protocol':'CREATORLOOP_D1_SCHEMA_BASELINE_V1','environment':env,'databaseId':dbid,'backupRunId':RUN,'backupReleaseSha':RELEASE,'backupSha256':digest(raw),'exportCompletedAt':capture['completedAt'],'schema':schema,'registration':registration,'operators':rows(db,'PRAGMA table_info("operators")'),'foreignKeys':{t:rows(db,'PRAGMA foreign_key_list("'+t+'")') for t in tables},'migrationSha256':hashes,'acceptedRehearsalSha256':preflight['migration_sha256'],'registeredTeamMigrations':preflight['registered_team_migrations'],'pendingMigrations':preflight['pending_migrations']}
            finally:db.close()
        return result
if __name__=='__main__':
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('archive');a.add_argument('output');v=a.parse_args()
    try:
        result=baseline(v.archive);out=pathlib.Path(v.output);out.mkdir(mode=0o700,parents=True,exist_ok=False)
        for env,value in result.items():p=out/(env+'.json');p.write_text(json.dumps(value)+'\n');p.chmod(0o600)
        print('ACCEPTED_SCHEMA_BASELINES_VERIFIED; no export or remote restore performed')
    except Exception:print('ACCEPTED_SCHEMA_BASELINE_BLOCKED',file=sys.stderr);sys.exit(1)
