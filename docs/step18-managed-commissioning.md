# Step 18 — managed execution commissioning handoff

**Engineering scope:** implements the Owner-approved TRAINING managed host substitution in existing draft PR #22. No Console rebuild, signing-Mac update, live key/token/identity, provider admission, Worker deployment, environment change, migration or protected merge is performed. `kailuatester-del` remains Read. The private Linux server is no longer a setup prerequisite.

## Exact resources and source

Proposed resource names below are **reserved configuration references, not provisioned resources**. Account pin is existing TRAINING account `2a3b96a0b37850cd03107131baa66b6d`; reconcile it fresh only during actual protected commissioning. No production binding is included.

| Component | Exact reference | Source/configuration |
|---|---|---|
| Authenticated gateway | `creatorloop-training-execution-gateway` | `workers/training-managed/gateway.mjs`; `docs/proposals/managed-execution/gateway.toml` |
| Private credential-bearing Worker | `creatorloop-training-execution-capability` | `workers/training-managed/capability.mjs`, `capability-core.mjs`, `app-capability.mjs`, `security.mjs`, `commissioning.mjs`; `docs/proposals/managed-execution/capability.toml` |
| Private service binding | gateway `CAPABILITY` → capability Worker | No public route, `workers.dev` or preview URL for capability Worker |
| Managed replay/audit state | `TrainingExecutionState`, binding `STATE`; object name `creatorloop-training-execution-v1` | `workers/training-managed/state.mjs`; native SQLite Durable Object |
| Restricted evidence bucket | `creatorloop-training-execution-evidence`, binding `EVIDENCE` | Prefixes `training-decisions/`, `training-audit/`; no public bucket |
| Protected job client | existing repository, only `team-access-directory` | `scripts/execution/github-managed-training-job.mjs` |
| Existing read-only pre-gate run check | same pinned bot/run/Owner approval contract | `scripts/execution/github-mediated-run-check.mjs` now uses a fixed independently signed evidence reader |
| Protected provider/release jobs | `creatorloop-training-provider-execution`, `creatorloop-training-release` | Existing proposal templates, still outside `.github/workflows`; OIDC permission only inside protected job |

Worker compatibility is pinned to **2025-10-08 / nodejs_compat**, matching local Miniflare/workerd tests. Local build tools pinned outside the repository: Wrangler **4.45.0**, Miniflare **4.20251008.0**, Node **22.23.3**. No production/runtime dependency changed. Durable Object class registration in the template is new managed-executor storage only, **not** a Console D1 migration or authorization to execute one.

## Existing safeguards retained

PR #22 dispatcher/request/approval/provider/transport contracts are reused. Only exact fixed workflow/ref/input shapes are accepted. A Read human has no raw Actions token or arbitrary API proxy. The Owner's pinned signer remains separate and signs no receipt here.

Gateway and capability Worker both cryptographically verify the **original** Access JWT, exact subject/email mapping and role. Owner and contractor subjects must differ. Gateway rejects wrong origin/content type, unknown route, query string and oversized request. Service bindings do not carry authentication implicitly; downstream reauthentication is mandatory. Managed public routes are only `/v1/approve`, `/v1/dispatch`, `/v1/run-check`, `/v1/provider` on the exact approved HTTPS origin.

Privileged code uses fresh independently signed commissioning evidence bound to actual Worker version ID, canonical public configuration hash, App IDs and executor-policy hash. Evidence must affirm enforced deployment/custody/approval-observer separation and retention, with a real evidence reference. Missing, expired, mismatched or unsigned evidence refuses before secret resolution. The check runs again before privileged capability resolution. **This validates evidence; it does not create actual independent control.** Administrators who can replace credential-bearing code can access its runtime secrets. Do not falsely attest that they cannot.

Only the capability Worker resolves the separately provisioned App key/provider token. App installation token issuance selects the one repository and Actions-write only; actual response permissions/repository selection are rechecked. Tokens stay in memory. Native Workers does not support fetch `redirect: error`; the wrapper uses `manual` and rejects every redirect before following it. Existing transport redirect restrictions are preserved.

Durable Object commits immutable Owner decisions, global one-time dispatch/request-version operation claims and hash-linked audit events. Restricted R2 retention is awaited before dispatch/provider mutation. Storage refusal leaves consumed claims/unretained evidence, **not** a false success or automatic retry. Unknown outcomes never reopen the request. Native R2 lock controls must be actually commissioned; an administrator can remove retention rules, so independently held Owner checkpoint/retention evidence is still required. No delete/reset/application generic SQL method exists.

Provider execution authenticates the actual GitHub job using OIDC, exact repository/owner IDs, workflow identity/SHA, TRAINING ref, environment, App actor, run/attempt, audience, issuer, expiry and signed current run approval. A legacy GitHub 204 response requires independent dispatch/run correlation; it is not acceptance by itself. Only one immutable admission request/version/operation may be attempted even across separate dispatch IDs.

Provider response remains **signer acceptance pending**. Independent request/runtime/session/policy observation and unchanged receipt verification are required. No Worker issues an admission envelope or accesses the Mac private key.

## Only unavoidable protected commissioning actions

### 1. Establish real managed administration, identity and evidence trust

Use the already accepted Owner/contractor handoff; **no duplicate contractor form**. Authorized security administrator must restrict Worker deployment/binding changes, approval/evidence-source administration, restricted R2 retention and signing administration so the executor cannot approve itself or replace the Mac observer/signing code. Keep residual Owner/org super-administrator override powers visible. Confirm actual per-resource permission limits rather than assuming role names enforce them.

Select actual gateway origin and explicit Access identity subjects/email → reviewed GitHub IDs. These are **new gateway** audience/origin pins, not the Console admission audience. Do not alter Console Access or expand current repository permissions. Provisioning an Access application/policy/identity is protected and needs its exact authority.

The fixed evidence reader requires **real independently administered signed evidence ports**, which are not supplied by local tests. Configure exact HTTPS endpoint, issuer and public verification keys for each purpose: `commissioning`, `dispatchApproval`, `runApproval`, `executionBundle`, `providerApproval`, `providerCapability`, `providerScope`, `currentRequest`, `runtime`, `session`. These may be operations of one approved independently administered evidence authority, not ten services. Do not let the capability Worker mint them from its own API-success booleans or store an evidence/admission signer private key. If no compatible independent authority endpoint exists, its protected installation/trust registration is a prerequisite; do not invent an endpoint or resurrect a contractor-managed server. Owner's independent Mac observer remains the verifier for admission/session acceptance.

Signed evidence format is a public verification **read-channel** JWS, not an admission receipt: RS256 with approved unique public `kid`, `iss`, `aud=CREATORLOOP_TRAINING_EVIDENCE`, integer `iat/exp` (≤300 seconds), `purpose`, server-provided `nonce`/`queryHash` echoed from the read request, and exact contract `value`. Private material stays with its independent authority. Actual request/decision/session data stays restricted; only sanitized hashes/IDs enter R2/run outputs. Read request protocol: `CREATORLOOP_INDEPENDENT_READ_V1`, fixed purpose/query/hash and fresh random nonce. The read endpoint must independently authenticate/authorize sensitive data access and issue the evidence; an unauthenticated internet endpoint is not approved by this implementation.

### 2. Privately provision scoped capabilities and actual resources

After exact administrator authorization, create/register the above two Workers, Durable Object and restricted R2 bucket; no production D1 bindings. Upload the reviewed public `MANAGED_CONFIG_JSON` to both Workers and actual version metadata binding to capability. Upload disabled/refusing versions first; obtain the immutable actual Worker version ID, then independently authorize that ID/config hash. This avoids a circular requirement to put an unknown version ID into its own code/config before uploading. Activate only the exact authorized versions after trust, permissions, credentials and retention evidence pass.

Private administrator provisions **only** `GITHUB_APP_PRIVATE_KEY` (PKCS#8 App key, never admission key) and `TRAINING_PROVIDER_TOKEN` in the capability Worker. GitHub App is installed only on `VTholdings/creatorloop-main-site`, Actions-write/Metadata-read; no Contents, Workflows, Admin, Secrets or organization privileges. Provider capability must have the separately approved exact short-lived scope, account, expiry and restricted nonsecret credential reference; do not inject broad existing token or grant Workers/secret management to runtime credentials. Secret writes can themselves create/deploy versions; use the specifically approved disabled-version procedure, not an unreviewed immediate secret deployment. Nothing is provided to Manus/chat/source/GitHub artifacts.

`MANAGED_CONFIG_JSON` protocol: `CREATORLOOP_MANAGED_TRAINING_V1`; actual `accessIssuer`, `accessAudience`, `gatewayOrigin`, `identities` (one Owner/one executor), reviewed `approvedExecutor`, App/installation/bot IDs, immutable repository/owner IDs, dedicated `oidcAudience`, exact approved OIDC subjects, independent `evidencePorts`, provider capability public scope/expiry metadata. Missing/unprovisioned fields refuse. The templates deliberately contain `{}`. Do not populate them with fictional test identities.

For actual OIDC subjects, reconcile GitHub's current subject format; do not assume the old name-based subject if immutable IDs/customizations are in use. No raw OIDC/Access JWT is retained in audit. Scope/expiry metadata are corroborated through the independent current provider approval; they are not proof by themselves.

### 3. Install exact protected workflow and approval wiring

Existing workflow templates stay inactive. Reviewed registration must place identical approved bytes on default `main` and execution `team-access-directory` through existing protected PR/review gates. Preparation does not merge/register them. Preserve both existing environments and `creatorloop-acceptance`. Only protected provider/release job receives `id-token: write`; pre-environment approval checks have no new privileged capability.

Install reviewed nonsecret files under protected review: `scripts/execution/approved-mediated-run-policy.json` (existing policy), `approved-managed-config.json` (managed evidence trust/public pins), `approved-managed-job-policy.json` (`CREATORLOOP_MANAGED_JOB_POLICY_V1`, exact gateway origin/audience). Real reviewed provider/release ports and exact hashes remain required. The existing `check-port` refusal is deliberately retained until those actual ports and authorization are reviewed; this engineering change does not dispatch, admit or deploy.

The managed job CLI validates `/v1/run-check` only, never invokes provider/release by itself. The capability Worker has the reviewed fixed provider operation endpoint, but its activation/invocation requires the approved protected port plus exact live request/run authority. Production releases are absent.

### 4. Complete exact TRAINING acceptance, then existing Steps 19–22

With actual signed commissioning/read evidence, scope isolation, restricted retained audit, correct public admission JWK, distinct runtime/peer pins and final reviewed SHA/config, obtain the existing exact release/admission authorization. Reconcile deployed SHA, perform independently observed admission/revocation and old/fresh session-denial evidence, and record valid immutable receipts through the approved application lifecycle. Mac key generation/wiring remains separately held until its prerequisites/authority are satisfied; no test key counts.

Accept Step 18 only on live evidence. Then run Step 19 admitted synthetic lifecycle, Step 20 safe authorized source round-trip (no removal of TRAINING's production-sync prohibition), Step 21 hosted report/version/history retention, Step 22 the established individually authenticated role walkthrough. Preserve Steps 1–17 and all production/migration/restore/merge holds. No local test or dispatch-success result advances a milestone by itself.

## Reproducing new local tests without private material

**Delivered local validation:** 44/44 focused managed/dispatcher/provider/independent-observer regressions passed; 1/1 native workerd integration passed (not skipped). Native integration exercises Owner approval, signed commissioning, gateway/private service binding, scoped App dispatch, SQLite Durable Object/R2 retention, exact OIDC protected-run check, fixed mocked Cloudflare policy creation, request-version replay rejection and sanitized evidence; no admission envelope is signed. Both dry-run Worker builds, affected Node syntax, `npm run check`, inactive YAML/TOML and whitespace checks passed. Existing full application suite, migrations, environment review and Mac installation were not repeated. All network calls in native tests terminate at a deny-by-default local mock.

New test keys are ephemeral fictional fixtures, in memory only; not operational admission/App keys. External calls in native integration are deny-by-default mocks. No provider account is queried.

```sh
# Trusted local workspace; install test tools separately, not production dependencies.
mkdir -p /tmp/creatorloop-managed-tools
npm install --prefix /tmp/creatorloop-managed-tools --no-audit --no-fund wrangler@4.45.0 miniflare@4.20251008.0
export WRANGLER_SEND_METRICS=false
export MANAGED_TOOL_ROOT=/tmp/creatorloop-managed-tools
export MANAGED_BUNDLE_ROOT=/tmp/creatorloop-managed-build
for lane in capability gateway; do
  "$MANAGED_TOOL_ROOT/node_modules/.bin/wrangler" deploy --dry-run \
    --config "docs/proposals/managed-execution/$lane.toml" \
    --outdir "$MANAGED_BUNDLE_ROOT/$lane-build"
done
node --test tests/training-managed-workers.test.js tests/training-managed-runtime.test.js
```

Native integration is explicitly skipped by default when both local tool/build roots are absent; a skip is **not** native-runtime acceptance. The documented command sets both, and the delivered evidence records an actual pass. Default repository tests require no live infrastructure. No existing accepted broad suite was rerun just for reassurance.
