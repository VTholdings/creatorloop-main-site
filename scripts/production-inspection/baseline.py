"""Reuse authenticated accepted-backup checks locally; output only production.
No network, new export, remote restore or pending migration execution.
"""
import argparse,json,pathlib,runpy,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
if __name__=='__main__':
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('archive');a.add_argument('output');v=a.parse_args()
    try:
        accepted=runpy.run_path(str(ROOT/'scripts/inspection/d1-schema-baseline.py'))['baseline'](v.archive)
        out=pathlib.Path(v.output);out.mkdir(mode=0o700,parents=True,exist_ok=False)
        p=out/'PRODUCTION.json';p.write_text(json.dumps(accepted['PRODUCTION'])+'\n');p.chmod(0o600)
        print('ACCEPTED_PRODUCTION_BASELINE_VERIFIED; no export or remote restore performed')
    except Exception:print('ACCEPTED_PRODUCTION_BASELINE_BLOCKED',file=sys.stderr);sys.exit(1)
