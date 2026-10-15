"""Bounded Owner-approved migration. Credentials are never serialized or logged."""
import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
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

def normalized_html(body):
    # The existing zone injects this Cloudflare Web Analytics script at the edge.
    # Remove only this known host/path from comparison, retaining every source byte otherwise.
    text = body.decode('utf-8')
    text = re.sub(r'<script\b(?=[^>]*\bsrc=[\"\']https://static\.cloudflareinsights\.com/beacon\.min\.js)[^>]*></script>\n?', '', text)
    return text.encode('utf-8')

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
        final_url = urllib.parse.urlsplit(response.geturl())
        content_type = response.headers.get('Content-Type', '')
        normalized = normalized_html(body) if 'text/html' in content_type else body
        return {'status': response.status, 'sha256': hashlib.sha256(body).hexdigest(),
            'normalized_sha256': hashlib.sha256(normalized).hexdigest(),
            'size': len(body), 'content_type': content_type,
            'robots_header': response.headers.get('X-Robots-Tag'),
            'final_host': final_url.hostname, 'final_path': final_url.path,
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
    if snapshot['root_http']['normalized_sha256'] != hashlib.sha256(git_bytes('index.html', LIVE_SHA)).hexdigest():
        raise RuntimeError('Live root HTML differs from pinned Loop source')
    snapshot['comparison_normalization'] = 'Only existing Cloudflare Web Analytics beacon script; all remaining HTML bytes must match pinned source'
    save('before.json', snapshot)
    log('PREFLIGHT_PASS', deployment_id=snapshot['old_project']['canonical_deployment_id'],
        root_http=snapshot['root_http']['status'], phase=os.environ.get('MIGRATION_PHASE'))
    return snapshot

def corporate_files():
    manifest = json.loads(git_bytes('corporate/qa/source-sha256.json'))
    names = ['index.html', 'styles.css', 'assets/approved-brand-artwork.webp', 'assets/global-infrastructure.webp']
    result = {}
    for name in names:
        body = git_bytes('corporate/' + name)
        if hashlib.sha256(body).hexdigest() != manifest[name]:
            raise RuntimeError('Accepted source integrity failure: ' + name)
        if name == 'index.html':
            directive = b'  <meta name="robots" content="noindex, nofollow">\n'
            if body.count(directive) != 1:
                raise RuntimeError('Staging robots directive differs from approved source')
            body = body.replace(directive, b'', 1)
        result[name] = body
    save('corporate-payload.json', {'source_sha': ACCEPTED, 'only_source_change': 'Remove staging robots meta directive',
        'files': {name: hashlib.sha256(body).hexdigest() for name, body in result.items()}})
    return result

def maybe_project(name):
    try:
        return project(name)
    except RuntimeError as exc:
        if 'HTTP 404' in str(exc):
            return None
        raise

def ready_http(host, path, attempts=13):
    for attempt in range(attempts):
        try:
            result = http(host, path, redirect=False)
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
        else:
            if result['status'] not in [502, 503, 504, 521, 522, 523, 524, 525, 526] or attempt == attempts - 1:
                return result
        time.sleep(5)

def verify_corporate(host, files):
    checks = {}
    for name, body in files.items():
        path = '/' if name == 'index.html' else '/' + name
        result = ready_http(host, path)
        if result['status'] != 200 or result['normalized_sha256'] != hashlib.sha256(body).hexdigest():
            raise RuntimeError(f'Corporate HTTP/source mismatch: {host}{path} status {result["status"]}')
        if name == 'index.html' and result['robots_header'] and 'noindex' in result['robots_header'].lower():
            raise RuntimeError('Corporate response has an unexpected noindex header')
        checks[path] = result
    save('corporate-' + host + '.json', checks)
    log('CORPORATE_VERIFIED', hostname=host, file_checks=len(checks))
    return checks

def unchanged(before):
    old = projection(project(OLD))
    expected = dict(before['old_project'])
    old.pop('domains', None)
    expected.pop('domains', None)
    if old != expected:
        raise RuntimeError('Existing Loop production configuration changed')
    if ops_state() != before['ops']:
        raise RuntimeError('Operations project or Access redirect changed')
    if projection(project('creatorloop-operator-training')) != before['training_project']:
        raise RuntimeError('Training project changed')

def stage(before):
    files = corporate_files()
    p = maybe_project(CORP)
    if p is None:
        p = api('POST', f'/accounts/{ACCOUNT}/pages/projects', {'name': CORP,
            'production_branch': 'corporate/owner-qa-20261015',
            'build_config': {'root_dir': 'corporate', 'destination_dir': '.', 'build_command': ''}})
        log('ISOLATED_CORPORATE_PROJECT_CREATED', project_id=p['id'])
    if p.get('source'):
        raise RuntimeError('Corporate project unexpectedly has repository auto-deployment connected')
    if any(d != CORP + '.pages.dev' for d in p.get('domains', [])):
        raise RuntimeError('Corporate project already has an unexpected hostname; refusing upload')
    for cfg in (p.get('deployment_configs') or {}).values():
        if cfg.get('d1_databases') or cfg.get('services') or cfg.get('env_vars'):
            raise RuntimeError('Corporate project unexpectedly has runtime bindings or environment variables')
    with tempfile.TemporaryDirectory(prefix='creatorloop-corporate-') as directory:
        payload = Path(directory) / 'public'
        payload.mkdir()
        for name, body in files.items():
            path = payload / name
            path.parent.mkdir(exist_ok=True, parents=True)
            path.write_bytes(body)
        if sorted(str(p.relative_to(payload)) for p in payload.rglob('*') if p.is_file()) != sorted(files):
            raise RuntimeError('Deployment directory contains unexpected files')
        command = ['npx', '--yes', '--package=wrangler@4.146.0', 'wrangler', 'pages', 'deploy', str(payload),
            '--project-name', CORP, '--branch', 'corporate/owner-qa-20261015', '--commit-hash', ACCEPTED,
            '--commit-message', 'Owner-approved corporate V1; only staging noindex removed', '--commit-dirty=true']
        run = subprocess.run(command, cwd=directory, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=480)
        # Wrangler output is not published: only successful deployment metadata is returned.
        if run.returncode:
            raise RuntimeError(f'Isolated Wrangler upload failed with exit code {run.returncode}; no hostname changes attempted')
    for attempt in range(30):
        p = project(CORP)
        dep = p.get('canonical_deployment') or {}
        if dep.get('latest_stage', {}).get('status') == 'success':
            break
        time.sleep(5)
    else:
        raise RuntimeError('Corporate deployment did not reach successful status')
    if dep.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash') != ACCEPTED:
        raise RuntimeError('Corporate deployment does not identify accepted source commit')
    verify_corporate(CORP + '.pages.dev', files)
    unchanged(before)
    current_dns = api('GET', f'/zones/{ZONE}/dns_records?per_page=100')
    if current_dns != before['dns']:
        raise RuntimeError('DNS changed during isolated staging')
    save('corporate-deployment.json', {'id': dep['id'], 'url': dep['url'], 'project_id': p['id'],
        'source_sha': ACCEPTED, 'production_hostname_changes': False})
    log('STAGE_PASS', deployment_id=dep['id'], url=dep['url'], project_id=p['id'])
    return p

def domains(name):
    return api('GET', f'/accounts/{ACCOUNT}/pages/projects/{name}/domains')

def ensure_domain(name, host):
    assert (name, host) in [(OLD, LOOP), (OLD, ROOT), (CORP, ROOT)]
    if not any(d['name'] == host for d in domains(name)):
        api('POST', f'/accounts/{ACCOUNT}/pages/projects/{name}/domains', {'name': host})
        log('DOMAIN_ASSOCIATED', project=name, hostname=host)

def remove_domain(name, host):
    assert (name, host) in [(OLD, LOOP), (OLD, ROOT), (CORP, ROOT)]
    if any(d['name'] == host for d in domains(name)):
        api('DELETE', f'/accounts/{ACCOUNT}/pages/projects/{name}/domains/{host}')
        log('DOMAIN_DETACHED', project=name, hostname=host)

def host_dns(host):
    assert host in [ROOT, LOOP]
    return api('GET', f'/zones/{ZONE}/dns_records?name={host}')

def set_dns(host, target):
    assert (host, target) in [(LOOP, OLD + '.pages.dev'), (ROOT, OLD + '.pages.dev'), (ROOT, CORP + '.pages.dev')]
    records = [d for d in host_dns(host) if d['type'] in ['CNAME', 'A', 'AAAA']]
    if len(records) > 1 or records and records[0]['type'] != 'CNAME':
        raise RuntimeError('Unexpected conflicting DNS records; refusing overwrite')
    if records and records[0]['content'] not in [OLD + '.pages.dev', CORP + '.pages.dev']:
        raise RuntimeError('DNS target changed outside migration; refusing overwrite')
    data = {'type': 'CNAME', 'name': host, 'content': target, 'ttl': 1, 'proxied': True}
    if records:
        record = records[0]
        if any(record.get(k) != v for k, v in data.items()):
            api('PATCH', f'/zones/{ZONE}/dns_records/{record["id"]}', data)
    else:
        api('POST', f'/zones/{ZONE}/dns_records', data)
    log('DNS_TARGET_SET', hostname=host, target=target)

def wait_domain(name, host, timeout=600):
    deadline = time.monotonic() + timeout
    previous = None
    while time.monotonic() < deadline:
        d = api('GET', f'/accounts/{ACCOUNT}/pages/projects/{name}/domains/{host}')
        status = (d.get('status'), d.get('validation_data', {}).get('status'), d.get('verification_data', {}).get('status'))
        if status != previous:
            log('DOMAIN_STATUS', hostname=host, domain=status[0], validation=status[1], verification=status[2])
            previous = status
        if status[0] == 'active' and status[1] in [None, 'active'] and status[2] in [None, 'active']:
            return d
        if status[0] in ['blocked', 'error']:
            raise RuntimeError('Hostname validation failed: ' + host)
        time.sleep(10)
    raise RuntimeError('Hostname validation timed out: ' + host)

def loop_files():
    names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', LIVE_SHA], text=True).splitlines()
    names = [p for p in names if p == 'index.html' or p.startswith(('js/', 'css/', 'pages/', 'assets/images/'))
        or p == 'assets/creatorloop-blueprint.pdf']
    return {('/' if p == 'index.html' else '/' + p): git_bytes(p, LIVE_SHA) for p in names}

def verify_loop(host):
    files = loop_files()
    def source_http(path):
        got = ready_http(host, path)
        if got['status'] in [301, 302, 307, 308] and got['location_host'] in [None, host]:
            initial = got['status']
            got = http(host, path, redirect=True)
            got['initial_status'] = initial
        if got['final_host'] != host:
            raise RuntimeError('Loop resource unexpectedly redirects to another hostname')
        return got
    def check(item):
        path, body = item
        got = source_http(path)
        if got['status'] != 200 or got['normalized_sha256'] != hashlib.sha256(body).hexdigest():
            raise RuntimeError(f'Loop source/HTTP mismatch at {host}{path}: {got["status"]}')
        return path, got
    with ThreadPoolExecutor(max_workers=4) as executor:
        checks = dict(executor.map(check, files.items()))
    for path in ['/blueprint', '/blueprint/', '/missions', '/missions/', '/mission-board', '/home']:
        got = source_http(path)
        target = '/pages/blueprint.html' if path.startswith('/blueprint') else '/index.html' if path == '/home' else '/pages/missions.html'
        target = '/' if target == '/index.html' else target
        if got['status'] != 200 or got['normalized_sha256'] != checks[target]['normalized_sha256']:
            raise RuntimeError('Loop friendly route mismatch: ' + host + path)
        checks[path] = got
    for path in ['/console/', '/api/console/me']:
        got = http(host, path, redirect=False)
        if got['status'] not in [401, 403]:
            raise RuntimeError('Loop protected route did not deny anonymous access: ' + host + path)
        checks[path] = got
    missing = http(host, '/__creatorloop_migration_missing__', redirect=False)
    if missing['status'] != 404 or missing['normalized_sha256'] != hashlib.sha256(git_bytes('404.html', LIVE_SHA)).hexdigest():
        raise RuntimeError('Loop custom 404 behavior changed at ' + host)
    checks['/__creatorloop_migration_missing__'] = missing
    save('loop-' + host + '.json', checks)
    log('LOOP_VERIFIED', hostname=host, static_files=len(files), routes_and_protected_checks=len(checks)-len(files))
    return checks

def dns_unchanged_except(before, allowed):
    current = api('GET', f'/zones/{ZONE}/dns_records?per_page=100')
    def semantic(records):
        keys = ['name', 'type', 'content', 'ttl', 'proxied', 'priority', 'data', 'settings', 'comment', 'tags']
        return sorted([json.dumps({k: d.get(k) for k in keys}, sort_keys=True)
            for d in records if d['name'] not in allowed])
    old = semantic(before['dns'])
    new = semantic(current)
    if old != new:
        raise RuntimeError('Unrelated DNS configuration changed')

def rollback(before, root_touched, loop_touched, keep_loop):
    log('ROLLBACK_STARTED', root_touched=root_touched)
    results = []
    if root_touched:
        for label, action in [
            ('detach_corporate_root', lambda: remove_domain(CORP, ROOT)),
            ('restore_loop_root_association', lambda: ensure_domain(OLD, ROOT)),
            ('restore_root_dns', lambda: set_dns(ROOT, OLD + '.pages.dev')),
            ('validate_restored_root', lambda: wait_domain(OLD, ROOT)),
            ('verify_restored_root', lambda: verify_loop(ROOT)),
        ]:
            try:
                action()
                results.append({'action': label, 'status': 'PASS'})
            except Exception as exc:
                results.append({'action': label, 'status': 'FAIL', 'error': str(exc).replace(TOKEN, '[REDACTED]')})
    if loop_touched and not keep_loop:
        try:
            remove_domain(OLD, LOOP)
            previous = [d for d in before['dns'] if d['name'] == LOOP]
            if not previous:
                for record in host_dns(LOOP):
                    if record['type'] == 'CNAME' and record['content'] == OLD + '.pages.dev':
                        api('DELETE', f'/zones/{ZONE}/dns_records/{record["id"]}')
            results.append({'action': 'remove_unverified_new_loop_hostname', 'status': 'PASS'})
        except Exception as exc:
            results.append({'action': 'remove_unverified_new_loop_hostname', 'status': 'FAIL', 'error': str(exc).replace(TOKEN, '[REDACTED]')})
    try:
        unchanged(before)
        dns_unchanged_except(before, [LOOP] if keep_loop else [])
        results.append({'action': 'verify_original_projects_and_unrelated_dns', 'status': 'PASS'})
    except Exception as exc:
        results.append({'action': 'verify_original_projects_and_unrelated_dns', 'status': 'FAIL', 'error': str(exc).replace(TOKEN, '[REDACTED]')})
    status = 'PASS' if all(r['status'] == 'PASS' for r in results) else 'CORRECTION_REQUIRED'
    save('rollback.json', {'status': status, 'actions': results})
    log('ROLLBACK_FINISHED', status=status)

def execute(before):
    # Staging was independently completed and reviewed before this phase was enabled.
    files = corporate_files()
    p = project(CORP)
    dep = p.get('canonical_deployment') or {}
    if p.get('source') or dep.get('latest_stage', {}).get('status') != 'success':
        raise RuntimeError('Isolated corporate deployment is not ready')
    if dep.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash') != ACCEPTED:
        raise RuntimeError('Corporate source SHA mismatch')
    verify_corporate(CORP + '.pages.dev', files)
    unchanged(before)
    verify_loop(ROOT)
    if any(d['name'] == LOOP for d in before['dns']) or any(d['name'] == LOOP for d in before['old_domains']):
        raise RuntimeError('Loop hostname already exists; refusing to duplicate or replace it')
    root_touched = False
    loop_touched = False
    loop_pass = False
    def interrupted(signum, frame):
        raise RuntimeError('Migration interrupted; restoring production routing')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        loop_touched = True
        ensure_domain(OLD, LOOP)
        set_dns(LOOP, OLD + '.pages.dev')
        loop_domain = wait_domain(OLD, LOOP)
        verify_loop(LOOP)
        loop_pass = True
        unchanged(before)
        dns_unchanged_except(before, [LOOP])
        # Last preservation gate: apex still serves the original Loop before detaching it.
        root_check = http(ROOT, '/', redirect=False)
        if root_check['normalized_sha256'] != hashlib.sha256(git_bytes('index.html', LIVE_SHA)).hexdigest():
            raise RuntimeError('Original root changed before cutover')
        save('before-cutover.json', {'loop_domain': loop_domain, 'root_http': root_check,
            'root_rollback_target': OLD + '.pages.dev', 'old_deployment_id': before['old_project']['canonical_deployment_id'],
            'corporate_deployment_id': dep['id']})
        log('PRESERVATION_GATE_PASS', loop_hostname=LOOP)
        root_touched = True
        # Keep the existing DNS record in place until the new Pages association is created.
        remove_domain(OLD, ROOT)
        ensure_domain(CORP, ROOT)
        set_dns(ROOT, CORP + '.pages.dev')
        root_domain = wait_domain(CORP, ROOT)
        verify_corporate(ROOT, files)
        try:
            verify_loop(LOOP)
        except Exception:
            loop_pass = False
            raise
        unchanged(before)
        dns_unchanged_except(before, [ROOT, LOOP])
        final_dns = {host: host_dns(host) for host in [ROOT, LOOP]}
        for host, target in [(ROOT, CORP + '.pages.dev'), (LOOP, OLD + '.pages.dev')]:
            cname = [r for r in final_dns[host] if r['type'] == 'CNAME']
            if len(cname) != 1 or cname[0]['content'] != target or not cname[0]['proxied']:
                raise RuntimeError('Final DNS target mismatch: ' + host)
        result = {'status': 'PASS', 'accepted_sha': ACCEPTED, 'only_source_change': 'Remove staging noindex directive',
            'corporate': {'url': 'https://' + ROOT, 'project_id': p['id'], 'deployment_id': dep['id'], 'domain': root_domain},
            'loop': {'url': 'https://' + LOOP, 'project_id': before['old_project']['id'],
                'deployment_id': before['old_project']['canonical_deployment_id'], 'source_sha': LIVE_SHA},
            'ops': {'url': 'https://ops.creatorloop.net', 'unchanged': True,
                'deployment_id': before['ops']['project']['canonical_deployment_id']},
            'training_unchanged': True, 'dns': final_dns,
            'rollback': {'old_project': OLD, 'old_deployment_id': before['old_project']['canonical_deployment_id'],
                'old_root_dns': next(d for d in before['dns'] if d['name'] == ROOT and d['type'] == 'CNAME'),
                'sequence': ['Detach root from corporate project', 'Associate root with existing Loop project',
                    'Restore root CNAME to creatorloop-main-site.pages.dev', 'Wait for active domain and verify original Loop files']}}
        save('result.json', result)
        log('DEPLOYMENT_PASS', corporate_deployment_id=dep['id'], loop_deployment_id=result['loop']['deployment_id'],
            ops_deployment_id=result['ops']['deployment_id'])
    except Exception:
        rollback(before, root_touched, loop_touched, loop_pass)
        raise

def main():
    phase = os.environ.get('MIGRATION_PHASE', 'preflight')
    before = preflight()
    if phase == 'stage':
        p = stage(before)
        save('result.json', {'status': 'STAGE_PASS', 'deployment_id': p['canonical_deployment']['id'],
            'production_hostname_changes': False, 'accepted_sha': ACCEPTED})
    elif phase == 'execute':
        execute(before)
    elif phase != 'preflight':
        raise RuntimeError('Execution phase is not enabled in this preflight revision')
    else:
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
