# Step 18 — mediated dispatcher setup and protected integration

**Status:** credential-free implementation preparation. No App, private App key/token, service, workflow registration, permission change or dispatch was created. `kailuatester-del` stays **Read**. The Owner's Mac signer core remains pinned to `739dbef-v1`; never automatically load this repository code into signing custody.

## Implemented restrictions

- `scripts/lib/training-mediated-dispatcher.mjs`: two fixed TRAINING workflow filenames; one fixed repository/branch; exact per-lane inputs; authenticated account ID/login; Owner decision bound to canonical request hash, exact workflow hash/source, human custodian reference, distinct reviewer and a maximum five-minute dispatch window. Fresh decision/source checks before send. One-time durable claim, sanitized hash-linked audit and no mutation retry.
- `scripts/lib/training-github-dispatch-transport.mjs`: only POST to the two exact workflow dispatch endpoints; exact body/decision hash; repository-selected App installation capability with **Actions write / Metadata read only**, verified scope and at most one-hour token lifetime. No caller token, Contents/Workflows write, secrets/admin permissions, redirects, arbitrary endpoint or retry. Credential never returned/logged; response/error bodies are sanitized and bounded.
- `scripts/lib/training-dispatch-audit-store.mjs`: private 700 directory, 600 regular DB; SQLite FULL synchronous transactions for durable one-time claims and append-only application interface; restart/replay protection, request-bound hash-chain records. No delete/reset method. Owner/root can alter the store, so retention/backup/access controls remain separate requirements. Store opening is explicit provisioning; imports do nothing.
- `scripts/lib/training-mediated-run.mjs`: workflow-side check of pinned App bot ID/login, current exact run/source/inputs and independently read dispatch/run authorization. Plain UUID or bot-name input is not authorization.
- `scripts/execution/github-mediated-run-check.mjs`: inactive integration helper that deliberately fails until the actual bot policy and private authenticated run-approval implementation are reviewed/provisioned. It does not import arbitrary adapter plugins or trust local approval booleans.

Prepared provider workflow: `docs/proposals/step18-training-provider-workflow.yml`. Prepared release workflow: `docs/proposals/step18-training-release-workflow.yml`. Both remain **outside `.github/workflows`**, require mediated checks before/after the existing environment gate, and retain preparation-only refusal of actual provider/release execution.

## Exact allowed dispatch shape

The authenticated human submits only:

```json
{
  "dispatchId": "OWNER-APPROVED-UUID",
  "decisionRef": "OWNER-APPROVED-REFERENCE",
  "lane": "provider",
  "executionSha": "EXACT-REVIEWED-40-HEX-SHA",
  "inputs": {
    "intended_operation": "ADMIT",
    "owner_decision_ref": "OWNER-APPROVED-REFERENCE",
    "owner_reviewer_id": "ACTUAL-REVIEWER-NUMERIC-ID",
    "approved_port_sha256": "EXACT-REVIEWED-64-HEX-HASH"
  }
}
```

This example is deliberately non-executable. Provider operation is exactly ADMIT or REVOKE. Release lane replaces `intended_operation` with exact `application_sha` and `configuration_hash`. Caller cannot supply endpoint, repository, branch, workflow path, authorization flags or additional inputs. Dispatcher injects only `dispatch_id` and `expected_execution_sha`. The five-minute dispatch authorization is distinct from later protected run/release/admission authorization; expiration while awaiting review requires independently renewed run authority, never relaxed checks or an automatic retry.

## One coordinated Owner/admin setup

### 1. Appoint actual independent human and private dispatcher administration

Name the real person controlling GitHub account `kailuatester-del`, confirm exclusive account/authenticator/recovery custody independent of the signing Owner, and record the actual executor/dispatcher administrator and approved restricted execution host/store. This service is **not** the signing Mac or Manus sandbox. No alternate hosting resource is provisioned by this preparation. If the approved private service host is unidentified, that actual host/admin reference remains required; do not silently substitute signing custody or expose the App token to the Read collaborator.

### 2. Owner-controlled GitHub App provisioning — protected action, not performed here

The authorized repository/organization administrator registers or reconciles the specifically approved dispatcher App and installs it for **only** `VTholdings/creatorloop-main-site`:

- Repository Actions: **Read and write**.
- Repository Metadata: **Read-only** (mandatory).
- All other repository/organization permissions: **None**; in particular no Contents/Workflows write, Administration, Secrets, Variables or environment-management privilege.
- App private key and installation tokens remain in the approved private dispatcher credential store, separate from TRAINING admission RSA custody. Manus/collaborator never receives either key/token. This document supplies no key-generation/token-issuance command.
- Record nonsecret App ID, installation ID, exact bot account login/ID and effective repository/permission readback. Use short-lived installation capabilities; the transport refuses widened permission or repository sets. App installation tokens authorize the App independently of the Read collaborator's permission, so App operation must be mediated and attributed rather than pretending the human has native Actions write.

**GitHub limitation:** Actions write also permits other Actions operations, including destructive run/log/artifact actions. GitHub does not natively restrict this permission to one workflow/branch. Therefore the raw capability must never reach the collaborator. The reviewed dispatcher service exposes only the two approved dispatch operations, with no generic API proxy. Public run logs/artifacts must remain sanitized; do not publish private request/session/capability evidence there.

### 3. Wire real private service ports; provision restricted audit retention

Existing factory ports are explicit and have no production defaults:

| Port | Actual required source |
|---|---|
| `authenticateCaller` | Authenticated session for exact GitHub User ID `340701664`, login `kailuatester-del`; independent human-custodian mapping; authentication reference/time. Reject caller-submitted identity objects as proof. |
| `verifyOwnerDecision` | Independently authenticated Owner approval store; exact `CREATORLOOP_MEDIATED_DISPATCH_APPROVAL_V1` fields enforced in source. Not an executor-writable JSON approval or hardcoded true flag. |
| `readGithub` | Fixed GET-only repository ref/default-branch/workflow-content reads. Repository is public; no Contents permission added merely to read public metadata. |
| `verifyDispatchAuthorization` | Current decision/body/request binding plus approved App/installation IDs and private capability reference. |
| `resolveAppCapability` | Private store resolver, actual installation scope reconciliation, expiry and token in memory. No metadata-only capability or broad Manus integration substituted. |
| `claimOnce` / `appendAudit` | Tested local durable store on the approved private host, plus Owner retention/backup controls. Application code has no delete method. Do not put it in public repo/artifacts. |
| `verifyRunApproval` | Independently authenticated authorization/run-correlation source, exact run ID/dispatch/request/source/App identity, current expiry. Must be implemented and pinned before activating workflow checks. |

Host administrator must enforce route authentication/CSRF or equivalent request-origin protections, secret redaction, no caller access to capability resolver, code/store separation, timeout/resource limits and sanitized denied-request logging. These are real host/security prerequisites, not inferred from dependency-injected local tests. Durable claim remains consumed after refusal/uncertainty: no auto-reset/retry. Review the known outcome and obtain a new explicitly approved dispatch ID if appropriate; never repeat an uncertain POST.

For current GitHub responses with run ID, audit it and independently correlate the actual run/workflow/ref/source/bot/dispatch inputs. Legacy 204 only proves POST acceptance; use the dispatch UUID plus independently observed run metadata for unambiguous correlation. Neither accepted HTTP response nor App dispatch establishes protected execution, release, admission or session-denial acceptance. Audit chain is per dispatch; administrator-controlled store cannot independently prove tamper resistance without its external retention evidence.

### 4. Protected workflow integration review — no activation in this task

Keep current environments and `creatorloop-acceptance` unchanged. Submit the two template files, mediated modules/checks and exact actual nonsecret bot/reviewer policy to existing protected review. Actual `approved-mediated-run-policy.json` and authenticated run-approval adapter are **not installed by this preparation**; missing files/ports fail closed. Real provider/release ports remain separately reviewed and held.

GitHub `workflow_dispatch` registration requires the workflow definition on default branch `main`; execution must be selected on **`team-access-directory`** with exact approved execution SHA. Authorized integration must place the **same reviewed workflow bytes** at both refs, without activating/merging under preparation authority. Dispatcher compares their raw SHA-256 with the Owner-approved workflow digest. Default-branch registration does not authorize production deployment; workflow job conditions reject main execution. If registration cannot be completed under current protected review, stay BLOCKED, not push another trigger or change default branch.

Only after actual integration, authenticated private ports, App scope, human separation and exact protected authorization are established may the approved administrator activate the workflow/service. Retain `contents: read` for job GITHUB_TOKEN; it does **not** grant the human dispatch permission. No workflow dispatch, environment approval, admission, deployment or protected merge is included in this engineering task.

### 5. Nonsecret setup receipt to unlock later protected verification

Provide actual human custodian/admin and private host/store references; App/installation/bot IDs and permission/repository readback; restricted durable audit/retention reference; authenticated caller/decision/run authorization sources; reviewer identity; final integration PR/source SHA and both registered workflow file hashes. Never provide passwords, App private key, installation token, signing key or session credentials.

The installed Mac signer code is not auto-updated. Its independent approval/observer/signing wiring, custody/admin exclusion, key-generation authorization, provider capabilities, synthetic identity and exact release/admission acceptance remain distinct protected prerequisites. No additional architecture approval is requested: this is the single concrete setup checklist for the Owner-approved mediated approach.
