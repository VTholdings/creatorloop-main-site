"""Bundle secured exports or verify an independently retrieved encrypted bundle.
All SQLite work is in memory through existing verifiers. No network or live SQL.
"""
import argparse,hashlib,json,pathlib,runpy,sys,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
retention=runpy.run_path(str(ROOT/'scripts/retention-manifest.py'))['inspect_backup']
rehearse=runpy.run_path(str(ROOT/'scripts/team-migration-preflight.py'))['rehearse']
def receipt(path,value):
    path.write_text(json.dumps(value,indent=2)+'\n');path.chmod(0o600)
def bundle(folder,output,release):
    evidence=json.loads((folder/'export-evidence.json').read_text())
    complete=evidence.get('status')=='FRESH_EXPORTS_CAPTURED'
    for environment in ('TRAINING','PRODUCTION'):
        p=folder/(environment+'.sql')
        if not p.exists(): complete=False;continue
        try:
            expected=next(x for x in evidence['exports'] if x['environment']==environment)
            if hashlib.sha256(p.read_bytes()).hexdigest()!=expected['sha256']: raise ValueError()
            receipt(folder/(environment+'-retention.json'),retention(p,environment,release))
        except Exception:
            complete=False;receipt(folder/(environment+'-blocked.json'),{'code':'CAPTURE_RETENTION_VERIFICATION_BLOCKED'})
    # Even partial captures remain encrypted and retained for investigation.
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as archive:
        for p in sorted(folder.rglob('*')):
            if p.is_file() and not p.is_symlink(): archive.write(p,p.relative_to(folder))
    output.chmod(0o600)
    return complete
def restored(archive,folder,release):
    folder.mkdir(mode=0o700,parents=True,exist_ok=False)
    with zipfile.ZipFile(archive) as z:
        seen=set();total=0
        for info in z.infolist():
            p=pathlib.PurePosixPath(info.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in info.filename or info.filename in seen or info.is_dir(): raise ValueError()
            seen.add(info.filename);total+=info.file_size
            if total>140*1024*1024: raise ValueError()
        z.extractall(folder)
    evidence=json.loads((folder/'export-evidence.json').read_text())
    if evidence.get('status')!='FRESH_EXPORTS_CAPTURED' or evidence.get('releaseSha')!=release: raise ValueError()
    for environment in ('TRAINING','PRODUCTION'):
        p=folder/(environment+'.sql');expected=next(x for x in evidence['exports'] if x['environment']==environment)
        if hashlib.sha256(p.read_bytes()).hexdigest()!=expected['sha256']: raise ValueError()
        manifest=retention(p,environment,release,compare_manifest=folder/(environment+'-retention.json'))
        receipt(folder/(environment+'-restore.json'),manifest)
        receipt(folder/(environment+'-preflight.json'),rehearse(p))
    return {'status':'LOCAL_RESTORE_AND_REHEARSAL_PASS','remoteMigrationsApplied':False,'productionDeployed':False,'offPlatformCopy':'PREPARED_NOT_CONFIRMED','retentionDays':90}
if __name__=='__main__':
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('mode',choices=['bundle','restore']);a.add_argument('input');a.add_argument('output');a.add_argument('--release-sha',required=True);v=a.parse_args()
    try:
        if len(v.release_sha)!=40 or any(c not in '0123456789abcdef' for c in v.release_sha): raise ValueError()
        if v.mode=='bundle':
            ok=bundle(pathlib.Path(v.input),pathlib.Path(v.output),v.release_sha)
            print('CAPTURE_RETENTION_VERIFIED' if ok else 'CAPTURE_RETAINED_WITH_BLOCKERS');sys.exit(0 if ok else 1)
        else:
            result=restored(pathlib.Path(v.input),pathlib.Path(v.output),v.release_sha)
            receipt(pathlib.Path(v.output)/'verification-summary.json',result);print(result['status'])
    except Exception:
        if v.mode=='restore' and pathlib.Path(v.output).is_dir():
            receipt(pathlib.Path(v.output)/'verification-blocked.json',{'code':'BACKUP_LOCAL_VERIFICATION_BLOCKED','remoteMigrationsApplied':False})
        print('BACKUP_LOCAL_VERIFICATION_BLOCKED',file=sys.stderr);sys.exit(1)
