"""Bounded Owner-approved migration. Credentials are never serialized or logged."""
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ACCOUNT = '2a3b96a0b37850cd03107131baa66b6d'
ZONE = '752d0295a15ee275d9c2e3fd3f6fc2bc'
ACCEPTED = 'f9461cb6cc6851bbbe3b5b7a94d4eb255b5c0845'
LIVE_SHA = 'f4814ed44f2ecfe8ad00414999fa850967db4df0'
OLD = 'creatorloop-main-site'
CORP = 'creatorloop-corporate'
OPS = 'creatorloop-operations-console'
ROOT = 'creatorloop.net'
LOOP = 'loop.creatorloop.net'
TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
EVIDENCE = Path('migration-evidence')
EVIDENCE.mkdir(exist_ok=True)

def save(name, data):
    raw = json.dumps(data, indent=2, sort_keys=True) + '\n'
    if TOKEN and TOKEN in raw:
        raise RuntimeError('Credential detected in evidence; refusing to write')
    (EVIDENCE / name).write_text(raw)

def log(event, **data):
    print(json.dumps({'event': event, **data}), flush=True)

def api(method, path, data=None):
    assert path.startswith(('/accounts/' + ACCOUNT + '/', '/zones/' + ZONE + '/', '/user/tokens/verify'))
    req = urllib.request.Request('https://api.cloudflare.com/client/v4' + path,
        method=method, data=None if data is None else json.dumps(data).encode(),
        headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        # Preserve only Cloudflare's nonsecret diagnostic fields, never headers or raw bodies.
        try:
            error_data = json.loads(exc.read())
            diagnostics = [{'code': e.get('code'), 'message': str(e.get('message', ''))[:350]}
                for e in error_data.get('errors', [])]
        except Exception:
            diagnostics = []
        safe = json.dumps(diagnostics).replace(TOKEN, '[REDACTED]') if TOKEN else json.dumps(diagnostics)
        raise RuntimeError(f'Cloudflare {method} {path.split("?")[0]} HTTP {exc.code}: {safe}') from None
    if not result.get('success'):
        raise RuntimeError(f'Cloudflare {method} failed; error codes {[e.get("code") for e in result.get("errors", [])]}')
    return result.get('result')

def project(name):
    assert name in [OLD, CORP, OPS, 'creatorloop-operator-training']
    return api('GET', f'/accounts/{ACCOUNT}/pages/projects/{name}')

def projection(p):
    dep = p.get('canonical_deployment') or {}
    cfgs = {}
    for env, cfg in (p.get('deployment_configs') or {}).items():
        cfg = dict(cfg)
        cfg['env_vars'] = {k: {'type': v.get('type')} for k, v in cfg.get('env_vars', {}).items()}
        cfgs[env] = cfg
    return {'id': p['id'], 'name': p['name'], 'subdomain': p.get('subdomain'),
        'domains': p.get('domains'), 'source': p.get('source'),
        'production_branch': p.get('production_branch'), 'build_config': p.get('build_config'),
        'deployment_configs': cfgs, 'canonical_deployment_id': dep.get('id'),
        'canonical_sha': dep.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash')}

def git_bytes(path, ref=ACCEPTED):
    return subprocess.check_output(['git', 'show', f'{ref}:{path}'])

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def http(host, path, redirect=True):
    req = urllib.request.Request('https://' + host + path,
        headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache', 'User-Agent': 'CreatorLoop-Owner-Migration-QA/1.0'})
    opener = urllib.request.build_opener() if redirect else urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(req, timeout=40)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        body = response.read()
        location = urllib.parse.urlsplit(response.headers.get('Location', ''))
        return {'status': response.status, 'sha256': hashlib.sha256(body).hexdigest(),
            'size': len(body), 'content_type': response.headers.get('Content-Type', ''),
            'location_host': location.hostname, 'location_path': location.path}

def ops_state():
    p = project(OPS)
    h = http('ops.creatorloop.net', '/', redirect=False)
    return {'project': projection(p), 'http': {k: h[k] for k in ['status', 'location_host', 'location_path']}}

def preflight():
    if not TOKEN:
        raise RuntimeError('CREATORLOOP_CF_MIGRATION_TOKEN is missing or unavailable')
    token = api('GET', '/user/tokens/verify')
    if token.get('status') != 'active':
        raise RuntimeError('Migration token is not active')
    now = datetime.now(timezone.utc)
    log('TOKEN_ACTIVE', not_before=token.get('not_before'), expires_on=token.get('expires_on'), checked_at=now.isoformat())
    if token.get('not_before') and datetime.fromisoformat(token['not_before'].replace('Z', '+00:00')) > now:
        raise RuntimeError('Token start time is in the future; no resource requests or mutations attempted')
    diagnostics = []
    for path in [f'/accounts/{ACCOUNT}/pages/projects/{OLD}',
                 f'/accounts/{ACCOUNT}/pages/projects',
                 f'/zones/{ZONE}/dns_records?name={ROOT}']:
        try:
            data = api('GET', path)
            diagnostics.append({'path': path, 'status': 'PASS'})
        except RuntimeError as exc:
            diagnostics.append({'path': path, 'status': 'DENIED', 'error': str(exc)})
    save('credential-preflight.json', {'checks': diagnostics})
    for check in diagnostics:
        log('CREDENTIAL_CHECK', **check)
    if any(d['status'] != 'PASS' for d in diagnostics):
        raise RuntimeError('Token permission/resource checks failed; no mutations attempted')
    old = project(OLD)
    if projection(old)['canonical_sha'] != LIVE_SHA:
        raise RuntimeError('Existing Loop production SHA changed; refusing migration')
    dns = api('GET', f'/zones/{ZONE}/dns_records?per_page=100')
    apex = [d for d in dns if d['name'] == ROOT and d['type'] in ['CNAME', 'A', 'AAAA']]
    if len(apex) != 1 or apex[0]['type'] != 'CNAME' or apex[0]['content'] != OLD + '.pages.dev':
        raise RuntimeError('Root DNS differs from approved baseline')
    domains = api('GET', f'/accounts/{ACCOUNT}/pages/projects/{OLD}/domains')
    if not any(d['name'] == ROOT and d['status'] == 'active' for d in domains):
        raise RuntimeError('Existing root hostname is not active')
    snapshot = {'account_id': ACCOUNT, 'zone_id': ZONE, 'accepted_sha': ACCEPTED,
        'captured_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'old_project': projection(old), 'old_domains': domains, 'dns': dns,
        'ops': ops_state(), 'training_project': projection(project('creatorloop-operator-training')),
        'root_http': http(ROOT, '/')}
    if snapshot['root_http']['sha256'] != hashlib.sha256(git_bytes('index.html', LIVE_SHA)).hexdigest():
        raise RuntimeError('Live root HTML differs from pinned Loop source')
    save('before.json', snapshot)
    log('PREFLIGHT_PASS', deployment_id=snapshot['old_project']['canonical_deployment_id'],
        root_http=snapshot['root_http']['status'], phase=os.environ.get('MIGRATION_PHASE'))
    return snapshot

def main():
    phase = os.environ.get('MIGRATION_PHASE', 'preflight')
    before = preflight()
    if phase != 'preflight':
        raise RuntimeError('Execution phase is not enabled in this preflight revision')
    save('result.json', {'status': 'PREFLIGHT_PASS', 'production_changes': False, 'accepted_sha': ACCEPTED})

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # All errors authored here are credential-free. Do not print arbitrary HTTP response bodies.
        message = str(exc).replace(TOKEN, '[REDACTED]') if TOKEN else str(exc)
        log('STOPPED', error=message)
        save('result.json', {'status': 'STOPPED', 'error': message})
        sys.exit(1)
