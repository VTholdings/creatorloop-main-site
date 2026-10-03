#!/usr/bin/env python3
"""Read-only retention verification. Restores a trusted SQL export into memory.
No deletion, external execution, credentials, or record contents are emitted.
"""
import argparse,hashlib,json,pathlib,sqlite3,subprocess

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def inspect_backup(path,environment,release_sha,external_files=()):
    if environment not in ('TRAINING','PRODUCTION') or len(release_sha)!=40 or any(c not in '0123456789abcdef' for c in release_sha):
        raise ValueError('An explicit environment and full release SHA are required')
    raw=pathlib.Path(path).read_bytes()
    db=sqlite3.connect(':memory:')
    db.set_authorizer(lambda action,a,b,c,d: sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
    try:
        db.executescript(raw.decode())
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Backup integrity/foreign-key verification failed')
        inventory={}
        for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
            quoted='"'+table.replace('"','""')+'"'
            columns=[r[1] for r in db.execute('PRAGMA table_info('+quoted+')')]
            rows=sorted(json.dumps(list(r),ensure_ascii=False,separators=(',',':')) for r in db.execute('SELECT * FROM '+quoted))
            inventory[table]={'columns':columns,'rows':len(rows),'sha256':digest(json.dumps(rows,ensure_ascii=False).encode())}
        reports=[]
        if 'audit_events' in inventory:
            originals={r[0]:r for r in db.execute("SELECT id,object_id,previous_value,new_value FROM audit_events WHERE object_type='FinalizedReport'")}
            for eid,rid,previous,raw_report in originals.values():
                report=json.loads(raw_report)
                canonical=subprocess.run(['node','-e',"process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')).records))"],input=raw_report.encode(),capture_output=True,check=True).stdout
                expected=digest(canonical)
                if expected!=report['snapshotHash']:
                    raise ValueError('Finalized report content hash mismatch')
                version=report['version']
                if version==1 and previous is not None or version>1 and (previous not in originals or originals[previous][1]!=rid or json.loads(originals[previous][3])['version']!=version-1):
                    raise ValueError('Broken finalized report version chain')
                reports.append({'eventId':eid,'reportId':rid,'version':version,'snapshotHash':expected})
        external=[]
        for file in external_files:
            p=pathlib.Path(file)
            external.append({'file':p.name,'bytes':p.stat().st_size,'sha256':digest(p.read_bytes())})
        return {'status':'LOCAL_RETENTION_VERIFIED','remote_verified':False,'environment':environment,'release_sha':release_sha,'backup_sha256':digest(raw),'table_inventory':inventory,'report_versions':reports,'external_artifacts':external,'live_gate':'Authenticated fresh backup, protected retention destination and independent restore evidence required; external hashes alone do not prove remote retention'}
    finally:
        db.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup');parser.add_argument('--environment',required=True,choices=['TRAINING','PRODUCTION']);parser.add_argument('--release-sha',required=True);parser.add_argument('--external',action='append',default=[])
    a=parser.parse_args()
    try:
        print(json.dumps(inspect_backup(a.backup,a.environment,a.release_sha,a.external),indent=2))
    except (OSError,ValueError,KeyError,sqlite3.Error,subprocess.CalledProcessError) as e:
        parser.exit(1,'RETENTION BLOCKED: '+str(e)+'\n')
