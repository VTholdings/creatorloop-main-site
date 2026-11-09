#!/usr/bin/env python3
"""Read-only retention verification. Restores a trusted SQL export into memory.
No deletion, external execution, credentials, or record contents are emitted.
"""
import argparse,hashlib,json,pathlib,sqlite3,subprocess

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def inspect_backup(path,environment,release_sha,external_files=(),compare_manifest=None):
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
            rows=sorted(json.dumps([{'blob_hex':v.hex()} if isinstance(v,bytes) else v for v in r],ensure_ascii=False,separators=(',',':')) for r in db.execute('SELECT * FROM '+quoted))
            inventory[table]={'columns':columns,'rows':len(rows),'sha256':digest(json.dumps(rows,ensure_ascii=False).encode())}
        schema=[{'type':kind,'name':name,'sha256':digest(sql.encode())} for kind,name,sql in db.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name")]
        attribution=None
        if 'console_audit_actor_snapshots' in inventory:
            missing=db.execute("SELECT count(*) FROM audit_events a LEFT JOIN console_audit_actor_snapshots s ON s.event_id=a.id WHERE s.event_id IS NULL AND a.object_type='FinalizedReport'").fetchone()[0]
            if missing:
                raise ValueError('Missing immutable finalized report attribution snapshot')
            if db.execute('SELECT count(*) FROM audit_events a JOIN console_audit_actor_snapshots s ON s.event_id=a.id WHERE s.actor_id<>a.operator_id').fetchone()[0]:
                raise ValueError('Historical actor snapshot identity mismatch')
            # 0006 snapshots future events only. Never invent attribution for legacy rows.
            legacy=db.execute('SELECT count(*) FROM audit_events a LEFT JOIN console_audit_actor_snapshots s ON s.event_id=a.id WHERE s.event_id IS NULL').fetchone()[0]
            attribution={'captured':inventory['console_audit_actor_snapshots']['rows'],'unattributed_legacy_events':legacy}
        reports=[]
        versions=set()
        if 'audit_events' in inventory:
            originals={r[0]:r for r in db.execute("SELECT id,object_id,previous_value,new_value FROM audit_events WHERE object_type='FinalizedReport'")}
            for eid,rid,previous,raw_report in originals.values():
                report=json.loads(raw_report)
                if not isinstance(report,dict) or not isinstance(report.get('records'),list) or type(report.get('version')) is not int or report['version']<1:
                    raise ValueError('Invalid finalized report version/content metadata')
                key=(rid,report['version'])
                if key in versions:
                    raise ValueError('Duplicate or branched finalized report version')
                versions.add(key)
                canonical=subprocess.run(['node','-e',"process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')).records))"],input=raw_report.encode(),capture_output=True,check=True,timeout=10).stdout
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
        reports.sort(key=lambda r:(r['reportId'],r['version']))
        external.sort(key=lambda f:(f['file'],f['sha256']))
        result={'audit_attribution':attribution,'schema_inventory':schema,'status':'LOCAL_RETENTION_VERIFIED','remote_verified':False,'environment':environment,'release_sha':release_sha,'backup_sha256':digest(raw),'table_inventory':inventory,'report_versions':reports,'external_artifacts':external,'live_gate':'Authenticated fresh backup, protected retention destination and independent restore evidence required; external hashes alone do not prove remote retention'}
        if compare_manifest is not None:
            original=json.loads(pathlib.Path(compare_manifest).read_text())
            if original.get('status')!='LOCAL_RETENTION_VERIFIED':
                raise ValueError('A verified original retention manifest is required')
            for key in ('environment','release_sha','table_inventory','schema_inventory','audit_attribution','report_versions','external_artifacts'):
                if key not in original or result[key]!=original[key]:
                    raise ValueError('Restored content differs from original manifest: '+key)
            result['restore_comparison']='LOCAL_RESTORE_MATCH'
        return result
    finally:
        db.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup');parser.add_argument('--environment',required=True,choices=['TRAINING','PRODUCTION']);parser.add_argument('--release-sha',required=True);parser.add_argument('--external',action='append',default=[])
    parser.add_argument('--compare-manifest',help='Compare an independent restored SQL export against its original manifest')
    a=parser.parse_args()
    try:
        print(json.dumps(inspect_backup(a.backup,a.environment,a.release_sha,a.external,a.compare_manifest),indent=2))
    except (OSError,ValueError,KeyError,sqlite3.Error,TypeError,UnicodeError,subprocess.SubprocessError) as e:
        parser.exit(1,'RETENTION BLOCKED: '+str(e)+'\n')
