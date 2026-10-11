# Step 18 — managed execution commissioning handoff

## Current decision and implementation — October 10, 16:44 HST

**The Owner approved a TRAINING-only exception to distinct-human executor custody.** Reference: `VT-OWNER-2026-10-10-164433-HST`. This supersedes the prior contractor-dependent commissioning requirement and the earlier “not feasible under the unchanged human contract” finding. No separate contractor, dedicated server or continuously available technical administrator is required for the new workload model. `kailuatester-del` remains unavailable and Read; it is not reassigned, impersonated or used by the workload.

The exception does **not** authorize resource provisioning, privileged deployment, key generation, admission/revocation, protected merges or production changes. Actual setup remains an Owner-controlled commissioning session through the existing protection gates. No live identity, credential, evidence endpoint or effective permission is claimed from local code/tests.

Implemented in the existing PR #22:

- Explicit `CREATORLOOP_APPROVED_TRAINING_WORKLOAD_POLICY_V2`, exact TRAINING/repository/branch, actual App bot ID/login distinct from Owner reviewer, `workloadRef`, unchanged separate `signerCustodianRef`, exact exception decision, `ownerOverrideRiskAccepted=true` and reviewed `separationControlsRef`. Legacy V1 human separation remains enforced; no implicit conversion.
- Managed public configuration `CREATORLOOP_MANAGED_TRAINING_V2`, one actual Owner identity and one Access **service-token** workload identity. The latter is cryptographically verified using signed application JWT `type=app`, `sub=""`, exact `common_name=<actual client ID>`, issuer, audience and expiry, never unverified caller headers. Owner tokens cannot dispatch and service tokens cannot approve/export. The workload identity maps to the reviewed App bot, not the contractor.
- `training-workload-submitter.mjs`: dependency-injected, no default credentials or network. Exact request-bound current Owner submission approval and restricted service capability are checked twice; only fixed gateway `/v1/dispatch` is called, redirects rejected, no automatic retries, sanitized result. Install/wire only in an approved VT managed execution context; no private server is reinstated. Possession of a service credential alone is not admission approval.
- Versioned `CREATORLOOP_MEDIATED_WORKLOAD_APPROVAL_V2` and `CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2`, bound to workload and exception without claiming a human contractor acted. Existing V1 audit bodies, immutable admission receipt format, database tables/schema, replay claims and pinned Mac package remain unchanged. New V2 history is exported and recovered by the existing complete custody path.
- Required public `workloadControls` plan and current independently signed commissioning evidence. Runtime management/approval/admission signing bindings are refused by known names; this is defense in depth, **not** proof that a malicious administrator cannot rename a secret or change code. Actual permissions, bindings and trust must be corroborated outside the executor.

## Exact approved resources — unchanged

All names below remain reserved configuration references until actual authorized provisioning; no production bindings.

| Component | Reference |
|---|---|
| Existing Cloudflare account | `2a3b96a0b37850cd03107131baa66b6d` |
| Existing repository and execution ref | `VTholdings/creatorloop-main-site`, `team-access-directory` |
| Gateway Worker | `creatorloop-training-execution-gateway`; `docs/proposals/managed-execution/gateway.toml` |
| Private capability Worker | `creatorloop-training-execution-capability`; `docs/proposals/managed-execution/capability.toml` |
| Private binding | gateway `CAPABILITY` → capability Worker; capability has no public/preview/Workers.dev route |
| Replay/audit state | `TrainingExecutionState`, `STATE`; object `creatorloop-training-execution-v1` |
| Restricted R2 | `creatorloop-training-execution-evidence`, `EVIDENCE` |
| Existing protected environments | `creatorloop-training-provider-execution`, `creatorloop-training-release` |
| Inactive workflow templates | `docs/proposals/step18-training-{provider,release}-workflow.yml`; not activated |
| Unchanged Owner signer | Mac `creatorloop-training-signer-core-739dbef-v1`; private keys stay outside executor/GitHub/Manus |

Runtime/build pins remain Node 22.23.3, Wrangler 4.45.0, Miniflare 4.20251008.0, Worker compatibility 2025-10-08 with `nodejs_compat`. The managed DO class registration is protected managed storage setup, not authorization for Console D1 migrations.

## Enforced workload boundary and residual override risk

**Normal execution:** the App capability has Actions-write/Metadata-read on this repository only, no Contents/Workflows/Admin/Secrets permissions; it is accessible only to the reviewed private capability runtime. Provider capability remains exact short-lived scope/account/reference with independent effective-scope verification; no broad existing token is reused. Neither runtime receives Workers Editor/Admin, deployment credentials, approval/evidence signing key or Mac admission key. Gateway exposes only approved request/role routes; service binding is not itself authentication and downstream verifies the original identity.

**Normal privileged deployment:** use the existing `creatorloop-training-release` gate with designated Owner review, prevention of self-review, administrator bypass disabled and exact `team-access-directory`. Register reviewed workflow bytes/source/configuration only through existing protected review/merge processes. Restrict the deployment credential to Editor on the two already-existing Workers where supported; creating Workers initially requires explicitly authorized product-level Admin. Store deployment authority only in the separately protected deployment context, never in capability/gateway, the ordinary execution App or a public repository. Pin workflow/actions/tool/source and expected configuration/version. Disable automatic Cloudflare Builds and unapproved alternate deployment paths for these targets through explicitly authorized setup; do not change unrelated systems.

**Direct override paths:** Cloudflare Editor can update code, settings, secrets, bindings, versions and deployments; GitHub environment protection does not gate direct Cloudflare dashboard/API access. Owner account-level authority can replace code, mint credentials, alter Access/trust, edit environment settings or remove retention. No code check or scoped token makes Owner unable to override these controls. The approved exception treats the Owner as trusted ultimate VT administrator, **not** as a newly independent second person. Limit routine alternate edit/token access, protect Owner login/recovery, record any exceptional direct change in VT-restricted evidence, invalidate commissioning after any version/config/identity/permission change, stop privileged execution until exact reconciliation and fresh approval, and keep independently recoverable source/state. Never label an Owner override “independently reviewed” when it was not.

**Detection/limits:** an Owner-administered observer/evidence authority outside executor administration must corroborate actual Worker version, reviewed source/configuration, bindings, effective privileges, protected deployment controls, Access mapping, audit retention and VT recovery. Runtime only verifies the signed proof; proof freshness (≤300 seconds) and version/config binding fail closed when absent/stale. A malicious replacement can remove those checks and use already-provisioned provider credentials until revoked; short-lived scope, absence of Mac key, preserved application receipt verification and independent observation limit impact but do not eliminate it. Owner override remains a residual TRAINING trust risk. It is not approved for production by this exception.

## Owner commissioning — one coordinated protected session

No repeated contractor form, staffing search, Mac installation, accepted migrations or GitHub environment check is needed. The new technical inputs below cannot be invented or supplied by test fixtures. Do not send secrets, private keys, passwords or JWTs to Manus/chat.

### 1. Confirm exact setup authority and actual nonsecret bindings

**Owner action:** authorize the bounded resource/identity/trust/credential setup and reviewed disabled-version installation on the existing VT account/repository. The security-model decision alone withholds these actions. Use the Owner's actual administrator session or an already authorized provisioning process; no separate human-custody claim is required.

Bind the following public/restricted references: final reviewed PR #22 source SHA and config; actual GitHub App/install/repository/owner/bot IDs; Owner reviewer ID; dedicated gateway HTTPS origin/Access audience; actual Owner subject/email and dispatch-only service-token client ID; workload reference; Owner-controlled approval/evidence administration and endpoint/public verification reference; short-lived provider scope/reference/expiry; R2 retention rule and VT restricted recovery-copy destination. Preserve earlier accepted ownership, account Read access and environment controls. Fresh changed-target reconciliation is required at actual commissioning, not as another preliminary audit.

### 2. Commission constrained resources/identity and the separately controlled approval source

Under the exact authorization, register only the two Workers, managed DO class/object and restricted R2 bucket above. Capability remains private, no public/preview route, no Console D1 binding. Gateway `CAPABILITY` is the only approved caller binding; audit alternate binding/edit access during commissioning. Do not deploy root production `wrangler.toml`.

Authorize one dedicated Access **Service Auth** credential for dispatch only, bound to the new gateway audience/path, short-lived/rotatable and privately retained by the approved VT workload context. It grants neither Worker management nor Mac access. Access adds the signed JWT; forward its original assertion only, not raw client-secret headers, into capability. Workload dispatch requires no browser Origin; Owner approve/export still requires exact browser origin and Owner JWT. Keep Access configuration scoped to this new gateway; do not modify Console authentication or organization-wide settings by implication.

Privately commission the App key/provider credential in capability only, through the exact reviewed version procedure; never the admission key. The submitter service credential is separate from provider and deployment capabilities. Effective rights must be verified; policy text alone is insufficient. No raw token is given to the Owner browser, Read collaborator or public workflow output.

**Approval/evidence authority is still a real prerequisite.** It may be Owner-administered under this exception but must be a separately controlled component outside gateway/capability runtime and outside their deployment credentials. It must authenticate the Owner, retain the exact decision and verify request/run/current state independently; no executor-generated success boolean qualifies. Use the existing `CREATORLOOP_INDEPENDENT_READ_V1` read contract and RS256 signed response, fixed issuer/public keys, `aud=CREATORLOOP_TRAINING_EVIDENCE`, fresh nonce/query hash, ≤300-second integer time window and exact value. Private read-channel key is not an admission key and must not be supplied to executor. Provisioning/key creation remains separately held. No working endpoint is currently supplied or claimed.

Configure purposes: `commissioning`, `dispatchApproval`, `runApproval`, `executionBundle`, `providerApproval`, `providerCapability`, `providerScope`, `currentRequest`, `runtime`, `session`, `custodyExport`. These can be operations of one Owner-administered authority, not twelve services. V2 ports require `administrationRef` equal to the public control plan's `approvalEvidenceCustodyRef`; they cannot point at gateway origin or claim the workload's administration reference. References alone are not effective custody verification. Sensitive reads require original authenticated Access/OIDC authorization and remain restricted.

### 3. Apply public V2 configuration and signed actual controls

`MANAGED_CONFIG_JSON` uses `CREATORLOOP_MANAGED_TRAINING_V2` and the exact V2 policy described above. `identities` has exactly Owner `{role,subject,email,githubId}` and executor `{role:"executor",type:"access-service-token",clientId,githubId:<App bot ID>}`. Both have different IDs; there is no fabricated human login. App bot in policy/config/run must match. Existing TOML public placeholders `{}` refuse until actual reviewed values are supplied.

Required `workloadControls` protocol `CREATORLOOP_TRAINING_WORKLOAD_CONTROLS_V1` binds TRAINING/account/two Workers/repository/ref/release environment, Owner reviewer, selected-workers Editor deployment scope, self-review prevention and bypass=false; runtime management/signing credentials=false, automatic Builds/alternate deployment credentials=false, capability public route=false; exact reviewed source SHA, Owner override acceptance, freeze when commissioning expires and actual `ownerOverrideAuditRef`, `configVersionReconciliationRef`, `vtRecoveryCopyRef`, `approvalEvidenceCustodyRef`. The offline validator marks effective platform controls **unverified**; actual external evidence must verify them.

Commissioning value uses `CREATORLOOP_TRAINING_WORKLOAD_COMMISSIONING_V2`, exact config/version/App/install/policy, `workloadControlsHash`, reviewed `sourceSha`, matching `ownerOverrideAuditRef` and `controlsEvidenceRef` bound to policy; exact exception reference, Owner override acknowledgment, runtime-no-deployment/no-approval-signing proof, protected deployment path, change detection, direct-override mitigation, VT independent recovery, unchanged signing exclusion/App scope/retention/approval-observer separation and actual evidence reference. No distinct-human `independentDeploymentAuthorityEnforced=true` is invented for V2. Missing actual controls or signed evidence refuses before privileged secret resolution and again immediately before capability use.

Upload disabled/refusing reviewed versions before actual activation and obtain immutable IDs. After the actual class/resources exist, an **authorized administrator only** may use the pinned local tooling:

```sh
WRANGLER_SEND_METRICS=false "$MANAGED_TOOL_ROOT/node_modules/.bin/wrangler" versions upload \
  --config docs/proposals/managed-execution/capability.toml
WRANGLER_SEND_METRICS=false "$MANAGED_TOOL_ROOT/node_modules/.bin/wrangler" versions upload \
  --config docs/proposals/managed-execution/gateway.toml
# No versions deploy, provider/admission invocation or protected merge here.
```

Record exact version/source/configuration/binding hashes; actual activation requires its exact protected authorization. Ordinary `wrangler secret put` immediately deploys and must not be used to bypass version review. Do not copy broad existing API credentials.

### 4. Verify complete VT custody/recovery and approval separation before protected execution

Preserve canonical VT GitHub source and independently held portable source/evidence checkpoint; no vendor, contractor or AI is sole custodian. The earlier custody ZIP/hash remains an earlier unchanged checkpoint, not a claim to contain these later changes. Retain reviewed new source through VT GitHub/private recovery processes.

Owner `/v1/custody/export` requires original authenticated Owner JWT, exact approved export UUID/decision/capability version and independently signed short-lived `CREATORLOOP_OWNER_CUSTODY_EXPORT_APPROVAL_V1`. Workload token cannot export or approve. It returns complete `{snapshot,receipt}` of claims/decisions/events/jobs/immutable schema/SQLite sequence, preserving expired/consumed claims and unresolved outcomes. Restricted R2 stores only sanitized `training-custody/<exportId>.json`; complete raw state belongs only in VT restricted storage. >32 MiB refuses rather than truncates; reused export ID refuses. Preserve separately held original snapshot hash, source/version and point-in-time receipt. Keep an independently recoverable second VT copy, not the Mac/R2 as sole custody.

Owner runs the existing new-empty offline drill with the exact reviewed code/Node:

```sh
node scripts/execution/recover-managed-custody-local.mjs \
  /Users/tt1/.vt-creatorloop/evidence/managed-export.json \
  /Users/tt1/.vt-creatorloop/evidence/managed-recovery-drill.sqlite \
  ORIGINAL_HASH_FROM_SEPARATELY_RETAINED_RECEIPT
```

Files/destination stay Owner-restricted; existing target refuses. Imported SQL never executes; exact trusted schema, bound rows and consumed claims remain preserved. No live restore/reset/cutover or recovered-executor activation is authorized. R2 projections are not a complete state backup; do not reset a ledger or replay uncertain operations. An export hash alone is not proof of actual hosted recovery.

### 5. Protected TRAINING release and acceptance — still separately held

Register the existing reviewed inactive workflow bytes on default `main` and execution `team-access-directory` only through existing protected review/merge authority. Preserve environments/review/self-review/bypass and all production holds. The App actor initiates the request-bound job; Owner reviewer is distinct from App actor. This is workload separation under the exception, not two independent humans. Do not make the Owner approve a workflow they directly initiated to evade self-review protection.

Bind reviewed V2 executor and evidence trust into existing `approved-mediated-run-policy.json`, `approved-managed-config.json`, `approved-managed-job-policy.json` via protected review. Preserve exact workflow/ref/inputs/source hashes and OIDC repository/owner/run/attempt/audience/App actor/environment checks; protected provider/release port hashes remain required. Submitter consumes already approved requests; gateway/capability cannot manufacture authorization. New V2 run proof includes policy/workload/exception binding. Provider manifest remains unchanged format but `executorPrincipal=workloadRef`, `signerPrincipal=Owner Mac custody ref`; distinct principals and immutable admission receipts remain enforced. `independentCustodyEnforced` in the old provider/signer contract denotes actual separated workload/key custody for this TRAINING execution, **not** fabricated distinct-human custody. It must be externally corroborated, not set true by executor.

Reconcile actual admission public JWK, unchanged Owner Mac approval/observer/signing wiring, runtime/peer pins and reviewed application-versus-workflow SHA/config. Obtain exact synthetic TRAINING identity/role/scope, subject-only cross-application revocation and release/admission authorization. No key is generated or live admission performed by this document/model change. Independently verify operation, immutable receipt, revocation and old/fresh session denial. Accept Step 18 only on hosted evidence; then original Step 19 lifecycle, Step 20 authorized safe TRAINING source sync (production-sync prohibition intact), Step 21 hosted reports/version history/retention, Step 22 individually authenticated role walkthrough, Step 23 after preceding gates. No new downstream defect is manufactured while commissioning is absent.

## New validation and unchanged boundaries

**Completed local results:** 10/10 new focused tests PASS; 1/1 new native workerd integration PASS (not skipped); both changed Worker dry builds, all affected module/test syntax and whitespace PASS. Evidence remains outside the repository at `/home/ubuntu/step18-managed-evidence/workload-exception/`. Tests use ephemeral fictional signing fixtures and deny-by-default local network mocks; no operational credential/key is created or retained.

Focused new exception tests cover explicit TRAINING-only policy, human V1 compatibility, exact service JWT vs Owner/contractor identity, Owner-only approval, workload/run/exception binding, replay/audit versions, known runtime authority-binding refusal, public override-control plan and fixed approved submitter/redirect/no-retry behavior. One new native workerd integration exercises the changed workload path, exact signed controls, no self-approval/preapproval dispatch, scope/provider/run/replay safeguards and Owner export → complete offline recovery of V2 audit records. Old admission receipts and pinned Mac source are untouched. No accepted old suite, Mac/environment review, migration or package check is repeated for reassurance.

**Immediate unavoidable commissioning action:** Owner must issue the exact protected resource/Access/App/provider/evidence-trust/version setup authority in the existing VT administrator session and supply the actual nonsecret identity/trust/version/recovery references above. No independent contractor appointment is now required. Until real approval/evidence wiring, scoped capabilities, protected version review and recovery are established, execution refuses and Step 18 remains BLOCKED—not accepted by the design exception alone.

Official service JWT/reference controls used by this implementation:

[1]: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/ "Cloudflare signed identity and service-token JWT payloads"
[2]: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ "Cloudflare Access service authentication and credential revocation"
[3]: https://developers.cloudflare.com/workers/authorization/workers/ "Cloudflare Worker-scoped roles and direct deployment/secret authority"
[4]: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments "GitHub protected environment reviewers, self-review and secret release"
