// Owner-kit integration contracts only; not a copy of repository unit tests.
// Run only after the private kit, README, manifest and checksums are complete:
// Place this file beside the extracted CreatorLoop_Owner_Source_Check_cc6732d directory.
//   node --test test_owner_kit.mjs
// No live CLI execution, inherited credentials, shell execution or network.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  checkOwnerSource, validateKit, SOURCE_COMMIT,
} from './CreatorLoop_Owner_Source_Check_cc6732d/owner-source-token-check.mjs';

const KIT = fileURLToPath(new URL('./CreatorLoop_Owner_Source_Check_cc6732d/', import.meta.url));
const ENTRY = path.join(KIT, 'owner-source-token-check.mjs');
const PIN = 'cc6732dba75b208dae05c886c56af73a4b16f012';
const ENDPOINT = 'https://api.cloudflare.com/client/v4/user/tokens/verify';
const FAKE_TOKEN = 'FICTIONAL-OWNER-SOURCE-TEST-ONLY-NEVER-LIVE';
const FAKE_ENV_TOKEN = 'FICTIONAL-ENV-SENTINEL-NEVER-LIVE';
const FAKE_ID = '0123456789abcdef0123456789abcdef';
const FAKE_PROVIDER_TEXT = 'FICTIONAL-PROVIDER-TEXT-MUST-NOT-LEAVE-REPORT';
const NOW = Date.parse('2030-01-01T00:00:00Z');
const PAYLOADS = [
  'scripts/lib/cloudflare-readonly.mjs',
  'scripts/lib/cloudflare-token-custody-preflight.mjs',
  'scripts/acceptance/cloudflare-targets.json',
  'scripts/diagnostics/private-cloudflare-token-preflight.mjs',
  'owner-source-token-check.mjs',
  'Run_Owner_Check.command',
  'OWNER_MAC_README.md',
];
const KIT_FILES = [...PAYLOADS, 'SOURCE_MANIFEST.json', 'SHA256SUMS'].sort();
const FALSE_FLAGS = [
  'scopeVerified', 'resourceAccessVerified', 'installedGitHubSecretVerified',
  'backupApproved', 'releaseApproved', 'ownerAuthorizationVerified', 'changesMade',
];
const REPORT_FIELDS = new Set([
  'protocol', 'sourceCommit', 'sourceTokenResult', 'code', 'verificationAttempted',
  'httpStatus', 'providerCodes', 'sourceTokenVerified', 'tokenActive', ...FALSE_FLAGS,
  'networkRequests', 'observedAt', 'sourceTokenType', 'verificationEndpoint',
  'reviewedEndpointSelector', 'liveVerifierIntegrationCertified',
]);

// Defense in depth: an omitted injected fetch must fail locally, not go live.
let ambientFetchCalls = 0;
const originalFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async () => {
    ambientFetchCalls++;
    throw new Error('TEST_NETWORK_FORBIDDEN');
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(ambientFetchCalls, 0, 'no operation may use ambient fetch');
});

function activeBody(extra = {}) {
  return { success: true, errors: [], result: { id: FAKE_ID, status: 'active', ...extra } };
}
function jsonResponse(body, status = 200, headers = {}) {
  // Response is an in-memory Web API object; it performs no request.
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', ...headers },
  });
}
function assertSanitized(report, extraForbidden = []) {
  assert.equal(report.protocol, 'CREATORLOOP_OWNER_SOURCE_CHECK_CC6732D_V1');
  assert.equal(report.sourceCommit, PIN);
  for (const flag of FALSE_FLAGS) assert.equal(report[flag], false, flag);
  if (Object.hasOwn(report, 'liveVerifierIntegrationCertified')) {
    assert.equal(report.liveVerifierIntegrationCertified, false);
  }
  for (const [key, value] of Object.entries(report)) {
    assert.ok(REPORT_FIELDS.has(key), `unexpected output field: ${key}`);
    if (/Certified$|Approved$/.test(key)) assert.equal(value, false, key);
  }
  const text = JSON.stringify(report);
  for (const forbidden of [FAKE_TOKEN, FAKE_ENV_TOKEN, FAKE_ID, FAKE_PROVIDER_TEXT, ...extraForbidden]) {
    assert.equal(text.includes(forbidden), false, 'report must omit fictional sensitive/provider data');
  }
}
async function invoke(responseFactory, token = FAKE_TOKEN) {
  const calls = [];
  const report = await checkOwnerSource({
    token, now: () => NOW,
    fetcher: async (url, options) => {
      // Authorization is deliberately checked NOW: preflight deletes its header
      // reference in finally. Do not retain the header object or token value.
      assert.equal(options.headers.Authorization, `Bearer ${FAKE_TOKEN}`);
      assert.equal(options.headers.Accept, 'application/json');
      assert.equal(url, ENDPOINT, 'resource, metadata, backup and fallback endpoints forbidden');
      assert.equal(options.method, 'GET');
      assert.equal(options.body, undefined);
      assert.equal(options.redirect, 'error');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      calls.push({ url, method: options.method });
      return responseFactory();
    },
  });
  assertSanitized(report);
  return { report, calls };
}
function assertOneRequest(report, calls) {
  assert.deepEqual(calls, [{ url: ENDPOINT, method: 'GET' }]);
  assert.equal(report.networkRequests, 1);
  assert.equal(report.verificationAttempted, true);
  assert.equal(report.sourceTokenType, 'user');
  assert.equal(report.verificationEndpoint, '/user/tokens/verify');
  assert.equal(report.reviewedEndpointSelector, 'CC6732D_USER_ONLY');
  assert.equal(report.liveVerifierIntegrationCertified, false);
}
function assertDenied(report, calls, result, code) {
  assertOneRequest(report, calls);
  assert.equal(report.sourceTokenResult, result);
  assert.equal(report.code, code);
  assert.equal(report.sourceTokenVerified, false);
  assert.equal(report.tokenActive, false);
}

// This walk runs only when the parent explicitly runs the completed test file.
// It is read-only: no fixture copies, permission changes or kit mutations.
async function privateInventory(dir = KIT, prefix = '') {
  const stat = await lstat(dir);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.isDirectory(), true);
  assert.equal(stat.mode & 0o777, 0o700, `private directory: ${prefix || '.'}`);
  assert.equal(stat.uid, process.getuid());
  const files = [];
  for (const name of await readdir(dir)) {
    const rel = prefix + name;
    const absolute = path.join(dir, name);
    const item = await lstat(absolute);
    assert.equal(item.isSymbolicLink(), false, rel);
    assert.equal(item.uid, process.getuid(), rel);
    if (item.isDirectory()) files.push(...await privateInventory(absolute, rel + '/'));
    else {
      assert.equal(item.isFile(), true, rel);
      assert.equal(item.mode & 0o777, rel === 'Run_Owner_Check.command' ? 0o700 : 0o600, rel);
      files.push(rel);
    }
  }
  return files.sort();
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('pinned cc6732d kit: seven payload entries, nine private files and zero-network validation', async () => {
  assert.equal(SOURCE_COMMIT, PIN);
  assert.deepEqual(await privateInventory(), KIT_FILES);
  const manifest = JSON.parse(await readFile(path.join(KIT, 'SOURCE_MANIFEST.json'), 'utf8'));
  assert.equal(manifest.protocol, 'CREATORLOOP_OWNER_SOURCE_KIT_V1');
  assert.equal(manifest.sourceCommit, PIN);
  assert.equal(manifest.files.length, 7);
  assert.deepEqual(manifest.files.map(file => file.path).sort(), [...PAYLOADS].sort());
  for (const file of manifest.files) {
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sha256(await readFile(path.join(KIT, file.path))), file.sha256);
  }
  const sums = (await readFile(path.join(KIT, 'SHA256SUMS'), 'utf8')).trimEnd().split(/\r?\n/);
  const entries = sums.map(line => {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    assert.ok(match, 'standard SHA256SUMS line required');
    return { hash: match[1], name: match[2].replace(/^\.\//, '') };
  });
  // SHA256SUMS cannot self-hash: eight entries cover the other eight of nine files.
  assert.deepEqual(entries.map(entry => entry.name).sort(), KIT_FILES.filter(name => name !== 'SHA256SUMS'));
  for (const entry of entries) {
    assert.equal(sha256(await readFile(path.join(KIT, entry.name))), entry.hash);
  }
  assert.deepEqual(await validateKit(), {
    integrityVerified: true, sourceCommit: PIN, reviewedUserEndpointVerified: true,
    networkRequests: 0, keyReadOrGenerated: false,
  });
  assert.equal(ambientFetchCalls, 0);
});

test('active source is liveness-only: exactly one authorized GET and no other calls or certifications', async () => {
  const { report, calls } = await invoke(() => jsonResponse(activeBody()));
  assertOneRequest(report, calls);
  assert.equal(report.sourceTokenResult, 'PASS');
  assert.equal(report.code, 'USER_SOURCE_TOKEN_ACTIVE_ONLY');
  assert.equal(report.sourceTokenVerified, true);
  assert.equal(report.tokenActive, true);
  assert.equal(report.httpStatus, 200);
  assert.deepEqual(report.providerCodes, []);
  assert.ok(Number.isFinite(Date.parse(report.observedAt)));
});

test('unavailable, empty and non-string input is blocked with zero requests', async () => {
  for (const token of [undefined, null, '', false, 42, {}, []]) {
    let calls = 0;
    const report = await checkOwnerSource({ token, fetcher: async () => { calls++; throw new Error('UNEXPECTED_CALL'); } });
    assertSanitized(report);
    assert.equal(calls, 0);
    assert.equal(report.networkRequests, 0);
    assert.equal(report.verificationAttempted, false);
    assert.equal(report.sourceTokenResult, 'BLOCKED');
    assert.equal(report.code, 'SOURCE_TOKEN_UNAVAILABLE');
  }
});

test('malformed fictional credentials are never trimmed, repaired or sent', async () => {
  for (const token of [' ', ' FICTIONAL-TEST', 'FICTIONAL-TEST ', 'FICTIONAL\nTEST', 'FICTIONAL\tTEST', 'FICTIONAL\u0000TEST', 'FICTIONAL-\u00e9', 'X'.repeat(4097)]) {
    let calls = 0;
    const report = await checkOwnerSource({ token, fetcher: async () => { calls++; throw new Error('UNEXPECTED_CALL'); } });
    assertSanitized(report);
    assert.equal(calls, 0);
    assert.equal(report.networkRequests, 0);
    assert.equal(report.verificationAttempted, false);
    assert.equal(report.sourceTokenResult, 'BLOCKED');
    assert.ok(['MALFORMED_CREDENTIAL', 'KIT_OR_INPUT_BLOCKED'].includes(report.code));
  }
});

test('401/1000 and provider rejection produce one sanitized FAIL with no retry or account fallback', async () => {
  for (const [status, code] of [[401, 'CLOUDFLARE_HTTP_ERROR'], [200, 'CLOUDFLARE_API_REJECTED']]) {
    const { report, calls } = await invoke(() => jsonResponse({
      success: false, result: { id: FAKE_ID },
      errors: [
        { code: 1000, message: `${FAKE_PROVIDER_TEXT} ${FAKE_TOKEN}`, token: FAKE_TOKEN },
        { code: 1000, message: FAKE_PROVIDER_TEXT },
        { code: '1001', message: FAKE_PROVIDER_TEXT },
        { code: -1, message: FAKE_PROVIDER_TEXT },
      ],
    }, status));
    assertDenied(report, calls, 'FAIL', code);
    assert.equal(report.httpStatus, status);
    assert.deepEqual(report.providerCodes, [1000]);
  }
});

test('disabled, expired and future-activation source states cannot pass', async () => {
  const cases = [
    [{ status: 'disabled' }, 'TOKEN_DISABLED'],
    [{ status: 'expired' }, 'TOKEN_EXPIRED'],
    [{ expires_on: '2030-01-01T00:00:00Z' }, 'TOKEN_EXPIRED'],
    [{ not_before: '2030-01-01T00:00:01Z' }, 'TOKEN_NOT_YET_VALID'],
  ];
  for (const [state, code] of cases) {
    const { report, calls } = await invoke(() => jsonResponse(activeBody(state)));
    assertDenied(report, calls, 'FAIL', code);
    assert.deepEqual(report.providerCodes, []);
  }
});

test('successful output drops provider text, token IDs, raw credentials, policies and headers', async () => {
  const fakeRay = 'FICTIONAL-PROVIDER-RAY-NOT-EVIDENCE';
  const fakePolicy = 'FICTIONAL-POLICY-NOT-SCOPE-EVIDENCE';
  const body = activeBody({ token: FAKE_TOKEN, message: FAKE_PROVIDER_TEXT, policies: [{ name: fakePolicy }] });
  body.messages = [{ message: FAKE_PROVIDER_TEXT }];
  body.provider_debug = `${FAKE_ID}:${FAKE_TOKEN}`;
  const { report, calls } = await invoke(() => jsonResponse(body, 200, { 'cf-ray': fakeRay, 'x-fictional-token': FAKE_TOKEN }));
  assertOneRequest(report, calls);
  assert.equal(report.sourceTokenResult, 'PASS');
  assertSanitized(report, [fakeRay, fakePolicy]);
});

test('redirects, endpoint substitution and thrown provider failures are blocked without follow-up', async () => {
  const cases = [
    [() => jsonResponse({}, 302, { location: 'https://fictional.invalid/no-follow' }), 'REDIRECT_OR_ENDPOINT_BLOCKED'],
    [() => ({ status: 200, redirected: true, url: ENDPOINT }), 'REDIRECT_OR_ENDPOINT_BLOCKED'],
    [() => ({ status: 200, url: 'https://fictional.invalid/alternate' }), 'REDIRECT_OR_ENDPOINT_BLOCKED'],
    [() => { throw new Error(`${FAKE_PROVIDER_TEXT} ${FAKE_TOKEN}`); }, 'NETWORK_OR_REDIRECT_BLOCKED'],
  ];
  for (const [factory, code] of cases) {
    const { report, calls } = await invoke(factory);
    assertDenied(report, calls, 'BLOCKED', code);
  }
});

test('oversized declared or streamed responses are blocked after exactly one request', async () => {
  const cases = [
    () => jsonResponse(activeBody(), 200, { 'content-length': '16385' }),
    () => new Response('X'.repeat(16385), { status: 200 }),
  ];
  for (const factory of cases) {
    const { report, calls } = await invoke(factory);
    assertDenied(report, calls, 'BLOCKED', 'RESPONSE_TOO_LARGE');
    assert.equal(report.httpStatus, 200);
  }
});

// Child processes receive ONLY this fictional environment, never process.env.
// The preload also checks that these fake environment values remain unchanged
// and that invalid/offline entrypoint branches cannot call ambient fetch.
const CHILD_ENV = Object.freeze({
  HOME: '/nonexistent-fictional-owner-kit-test-home',
  CLOUDFLARE_API_TOKEN: FAKE_ENV_TOKEN,
  CF_API_TOKEN: FAKE_ENV_TOKEN,
  OWNER_CHECK_TEST_SENTINEL: 'FICTIONAL-PRESERVE-ENV-SENTINEL',
});
const childGuard = `
const expected = ${JSON.stringify(CHILD_ENV)};
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('TEST_NETWORK_FORBIDDEN'); };
process.on('exit', () => {
  if (calls !== 0) { process.stderr.write('TEST_NETWORK_FORBIDDEN\\n'); process.exitCode = 97; }
  if (Object.entries(expected).some(([key, value]) => process.env[key] !== value)) {
    process.stderr.write('TEST_FICTIONAL_ENVIRONMENT_MUTATED\\n'); process.exitCode = 98;
  }
});
`;
const childPreload = `data:text/javascript,${encodeURIComponent(childGuard)}`;
function runBoundedCli(args) {
  // No valid live flag combination is allowed by this test helper.
  assert.ok(
    (args.length === 1 && args[0] === '--offline-validate') ||
    !(args.length === 2 && args[0] === '--execute-read-only' && args[1] === '--token-stdin'),
    'tests must never spawn live mode',
  );
  const env = { ...CHILD_ENV };
  const child = spawnSync(process.execPath, ['--import', childPreload, ENTRY, ...args], {
    cwd: KIT, env, input: '', encoding: 'utf8', timeout: 10000, maxBuffer: 65536,
    shell: false, windowsHide: true,
  });
  assert.deepEqual(env, CHILD_ENV, 'caller-owned fictional environment remains unchanged');
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.stderr, '', 'no stderr diagnostics or secrets');
  for (const value of [FAKE_TOKEN, FAKE_ENV_TOKEN]) {
    assert.equal(child.stdout.includes(value), false);
    assert.equal(child.stderr.includes(value), false);
  }
  const lines = child.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1, 'one bounded JSON result only');
  return { child, report: JSON.parse(lines[0]) };
}

test('CLI accepts offline-only validation and rejects nonfixed flags without stdin, network or env mutation', () => {
  const invalidArgs = [
    [], ['--token', FAKE_TOKEN], ['--execute-read-only'],
    ['--offline-validate', '--unexpected'], ['--token-stdin', '--execute-read-only'],
  ];
  for (const args of invalidArgs) {
    const { child, report } = runBoundedCli(args);
    assert.equal(child.status, 1);
    assertSanitized(report);
    assert.equal(report.code, 'INVALID_CLI_ARGUMENTS');
    assert.equal(report.sourceTokenResult, 'BLOCKED');
    assert.equal(report.verificationAttempted, false);
    assert.equal(report.networkRequests, 0);
  }
  const { child, report } = runBoundedCli(['--offline-validate']);
  assert.equal(child.status, 0);
  assert.deepEqual(report, {
    integrityVerified: true, sourceCommit: PIN, reviewedUserEndpointVerified: true,
    networkRequests: 0, keyReadOrGenerated: false,
  });
});

test('static shell uses hidden local input and an anonymous builtin pipe, never export or credential files', async () => {
  // Static inspection only. Never launch the command or read a real credential.
  const shell = await readFile(path.join(KIT, 'Run_Owner_Check.command'), 'utf8');
  const code = shell.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
  assert.match(shell, /^#!\/bin\/bash\n/);
  assert.match(code, /^set \+x$/m);
  assert.match(code, /^set -o pipefail$/m);
  assert.match(code, /^umask 077$/m);
  assert.match(code, /trap 'unset source_token' EXIT/);
  assert.match(code, /IFS= read -r -s -p '[^']*' source_token <\/dev\/tty/);
  assert.match(code, /^printf '%s' "\$source_token" \| node owner-source-token-check\.mjs --execute-read-only --token-stdin \| \/usr\/bin\/tee "\$result_file"$/m);
  assert.match(code, /^unset source_token$/m);
  assert.match(code, /\/usr\/bin\/shasum -a 256 -c SHA256SUMS \|\| exit 1/);
  assert.match(code, /node owner-source-token-check\.mjs --offline-validate \|\| exit 1/);
  assert.ok(code.indexOf('--offline-validate') < code.indexOf("source_token </dev/tty"), 'offline integrity gate precedes credential read');
  assert.doesNotMatch(code, /\b(?:export|printenv|env|curl|wget|pbcopy|pbpaste|xclip|xsel|clipboard|keyfile|keychain|security|ssh-keygen|openssl|git|npm|npx|brew)\b/i);
  assert.doesNotMatch(code, /(?:auto[-_ ]?update|--update|\.env|mkfifo)/i);
  for (const line of code.split('\n').filter(line => line.includes('$source_token'))) {
    assert.ok(
      /^if \[\[ .* -z "\$source_token" \]\]; then$/.test(line) ||
      /^printf '%s' "\$source_token" \| node /.test(line),
      'source-token expansion is limited to emptiness check and anonymous builtin pipe',
    );
    assert.doesNotMatch(line, /(?:>|>>|--token=|node[^|]*"\$source_token")/);
  }
});
