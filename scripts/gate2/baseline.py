"""Verify existing authenticated training evidence; add private column allowlists.
No network, export, pending migration execution or remote restore.
"""
import argparse,hashlib,json,pathlib,runpy,sqlite3,zipfile,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
if __name__=='__main__':
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('archive');a.add_argument('output');v=a.parse_args()
    try:
        b=runpy.run_path(str(ROOT/'scripts/inspection/d1-schema-baseline.py'))['baseline'](v.archive,training_only=True)['TRAINING']
        with zipfile.ZipFile(v.archive) as z:raw=z.read('TRAINING.sql')
        if hashlib.sha256(raw).hexdigest()!=b['backupSha256']:raise ValueError()
        db=sqlite3.connect(':memory:');db.set_authorizer(lambda action,a,b,c,d:sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
        try:
            db.executescript(raw.decode())
            b['dataColumns']={t:[r[1] for r in db.execute('PRAGMA table_info("'+t+'")')] for t in b['foreignKeys']}
        finally:db.close()
        out=pathlib.Path(v.output);out.mkdir(mode=0o700,parents=True,exist_ok=False)
        p=out/'TRAINING.json';p.write_text(json.dumps(b)+'\n');p.chmod(0o600)
        print('ACCEPTED_GATE2_TRAINING_BASELINE_VERIFIED; no export or remote restore')
    except Exception:print('GATE2_BASELINE_BLOCKED',file=sys.stderr);sys.exit(1)
