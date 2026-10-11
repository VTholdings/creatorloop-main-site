# CreatorLoop Step 18 — Owner Mac outbound approval integration

## One operating arrangement

**The Mac is the approval/signing authority; a separate VT Cloudflare Worker is only an authenticated mailbox.** The Owner Mac polls outward for a hash-bound request, independently validates it using locally pinned approval/observer code, and returns a short-lived RS256 evidence response. The mailbox cannot sign or make an approval. Neither port forwarding, Remote Login, a tunnel to the Mac nor an inbound Mac listener is needed.

The existing installed signer core at `/Users/tt1/.vt-creatorloop/signer-code/creatorloop-training-signer-core-739dbef-v1` remains unchanged. It signs **admission receipts only**, after its existing request/approval/observer checks. It is not a JWT signer or working approval endpoint. The new evidence responder is a separate versioned installation with a separate evidence key purpose; do not adapt the admission signer into unrestricted JWT signing.

This reuses the approved gateway/capability, GitHub environments, VT Cloudflare account `2a3b96a0b37850cd03107131baa66b6d` and Mac custody. No contractor server or new account is required. Existing bootstrap source `c6593fa363c82e27e45e083ca79935898dfc625e`, versions, bindings and `MANAGED_CONFIG_JSON={}` remain untouched.

## Implemented, but inactive

| Location | Function |
|---|---|
| `scripts/lib/training-owner-approval-protocol.mjs` | Validates existing `CREATORLOOP_INDEPENDENT_READ_V1`; binds purpose, query hash, nonce, caller and local decision; prepares exact unsigned evidence JWS |
| `scripts/lib/training-owner-outbound-client.mjs` | Requires privately installed Owner decision, active observer, durable claim/audit, external evidence-signing and outbound publication ports; no defaults |
| `scripts/lib/training-owner-local-journal.mjs` | Actual 0700/0600 SQLite FULL-synchronous local claims and append-only hashed evidence journal, with unique nonces across restart and complete custody export |
| `scripts/custody/owner-evidence-response.mjs` | Restricted saved-file prepare/verify utility; never signs, reads a key or calls network |
| `scripts/custody/owner-outbound-session.mjs` | Runs an Owner-installed hash-pinned adapter for at most 30 minutes; outbound only, no update mechanism, no retry of processed pending IDs |
| `workers/training-managed/owner-approval*.mjs` | Authenticated relay and separate SQLite mailbox; public verification only, immutable requests/responses and nonce/response replay refusal |
| `docs/proposals/managed-execution/owner-approval.toml` | Inactive exact resource configuration for `creatorloop-training-owner-approval-mailbox` / SQLite `OwnerApprovalMailbox`, tag `training-owner-approval-mailbox-v1` |
| `docs/proposals/managed-execution/owner-mac-adapter.mjs` | Explicitly disabled private installation template; no credential, key or live port |

Existing consumer `independentEvidence` remains unchanged. Relay replies use its existing audience `CREATORLOOP_TRAINING_EVIDENCE`, purpose, query hash, nonce and ≤300-second freshness contract. The original Access/GitHub OIDC token travels only in memory to the separate relay for independent verification; it is never saved to the mailbox. The pending actor reference records the verified principal/run, not its token. Sensitive reads require that authentication. Public commissioning/runtime/run metadata reads grant no authority; the Mac still decides whether the query matches an authorized local scope.

The mailbox holds a caller response for about **7.2 seconds**, within the current consumer's 10-second timeout. Requests expire after 30 seconds. The Owner Mac must be awake, running the bounded session, and have a previously Owner-approved exact local scope and active observations ready to answer promptly. If it is offline, slow or unable to corroborate a fact, the request refuses. This is a coordinated commissioning window, not unattended Owner approval.

## Owner-only executable procedure — one coordinated session

### 1. Freeze and install the reviewed addition locally (no key operation)

Obtain the final reviewed PR #22 source and the attached SHA-256 inventory. Do not install from a moving branch. Copy its import closure into a **new** directory; do not overwrite the installed signer core. Suggested new location:

```sh
umask 077
BASE="/Users/tt1/.vt-creatorloop"
REL="owner-outbound-approval-v1"
mkdir -p "$BASE/signer-code/$REL" "$BASE/evidence/owner-approval" "$BASE/private-signing/owner-approval-state"
chmod 700 "$BASE/evidence/owner-approval" "$BASE/private-signing/owner-approval-state"
# Extract the reviewed addition under $BASE/signer-code/$REL, preserving paths.
# Verify the supplied exact SHA256SUMS before any import.
cd "$BASE/signer-code/$REL"
shasum -a 256 -c SHA256SUMS
find . -type f -exec chmod 400 {} \;
find . -type d -exec chmod 500 {} \;
```

Owner verifies local ownership, no named/default ACL write grant, no symlinks, no repository watcher or automatic updater. The import closure includes shared public-only verification and contract modules listed in the inventory. Local sandbox hashes are **not** evidence that Mac installation/access separation passed; save the actual Mac result under `evidence/owner-approval`.

### 2. Commission the managed mailbox under specific protected authorization

These operations are **not authorized by preparation**; request exact deployment approval once final source/hash/configuration and the Owner reference are pinned:

- Register **only** `creatorloop-training-owner-approval-mailbox` in the same VT account, with SQLite class `OwnerApprovalMailbox`, binding `MAILBOX_STATE`, tag `training-owner-approval-mailbox-v1`. Do not reuse or alter the execution `STATE` namespace.
- Initial configuration `OWNER_MAILBOX_CONFIG_JSON={}`, Workers.dev/previews off and no public route until the protected identity/origin configuration is reviewed. No App/provider/deployment/signing credential in the relay.
- Owner chooses one exact HTTPS hostname in VT's existing domain; record it as `origin` and `issuer` reference. It is **not provisioned or asserted to exist** by this procedure. Do not substitute gateway origin for it.
- Configure Access separately for the dedicated relay: exact Owner identity for `/v1/owner/pending`, `/v1/owner/respond`, `/v1/owner/export`; approved managed identity/exact protected OIDC for `/v1/read`. Relay also cryptographically checks identity itself. Sensitive requests do not accept forwarded role headers. The existing shared identityConfig binds approved Owner, App bot, reviewed workflow/ref/SHA and OIDC claims. Public metadata read purposes remain non-authorizing.
- Deploy authority/credentials for the relay are Owner-governed and **not usable by the gateway/capability deployment lane or their runtimes**. If effective Cloudflare role/token scope cannot enforce this separation within the account, record that limit and withhold activation; do not claim a name or separate Worker alone provides it.
- Read back exact source/version, identities/origin, public-key-only bindings, class and absent management credentials once under the protected authorization. No admission or provider mutation is part of relay setup.

### 3. Install the real Owner private ports (specific key/credential authority required)

No credentials belong in GitHub, Manus, the installation package or chat.

The Owner installs the disabled template only as `/Users/tt1/.vt-creatorloop/private-signing/owner-approval-adapter.mjs`, with Owner-only 0400 file / 0700 parent and full local import hashes. It must implement the documented ports before it can run:

1. `pollOwnerPending`: outbound authenticated POST exact relay `/v1/owner/pending`, `{}`; Owner login/keychain credentials in memory, no cookie/token logs. No inbound access to Mac.
2. `readLocalDecision`: select an **Owner-approved local record** by exact purpose, query hash, verified actor, operation/subject/version/source and decision reference. Unknown/superseded scope fails. A managed caller cannot upload an approval into this local store.
3. `validateIndependentObservation`: reuse `createTrainingObserver` with Owner-controlled direct read-only provider/current request/runtime/session ports. Compare current policy preservation, subject/version, deployment pins and active session evidence. For dispatch/run/commissioning facts, validate actual GitHub run/source/approval and actual Cloudflare control metadata directly. Merely re-signing gateway/capability API responses is prohibited.
4. `claimLocalOnce`: use the implemented `createOwnerLocalJournal` under `/Users/tt1/.vt-creatorloop/private-signing/owner-approval-state`, transactional unique pending ID **and nonce** before signing, surviving restart. No clearing used nonces on expiry.
5. `retainLocalEvidence`: use that journal to append exact local decision, sign intent, signed response and publication outcome, with a second VT-controlled recoverable copy; failed persistence prevents signing/publication. Its `exportCustody()` exports full local claims/evidence, but does not implement a live restore.
6. `externalEvidenceSign`: Owner-only RS256 evidence-key adapter signing the exact JWS input; **separate evidence key ID/purpose from admission**. Key generation/provisioning requires specific approval and is not performed here. Restrict use to `CREATORLOOP_TRAINING_EVIDENCE_ONLY`; never authorize arbitrary supplied payloads. Keep private key/passphrase exclusively in Mac custody.
7. `postOwnerResponse`: outbound authenticated POST exact relay `/v1/owner/respond`, `{id,jws}`; no redirects/retries. Any unknown publication result stays unresolved and is reviewed in local evidence.

The public evidence JWK/fingerprint is registered in the Owner-governed relay and exact `evidencePorts[purpose]` on the consumers under separate protected config approval. Issuer proposal: `VT-CREATORLOOP-TRAINING-OWNER-MAC-EVIDENCE-V1`. The relay contains only public keys; public-key replacement/configuration changes are review-bound. Evidence response does not admit an operator. Existing admission key and `ADMISSION_VERIFIER_KEYS` provisioning are separate held actions.

**Port installation is the remaining real private implementation dependency, not paperwork.** The supplied template refuses every port until implemented with actual protected read/auth/storage/signing operations. It must not be marked operational by filling in references or returning `true`. New private adapter/import hashes and positive local signature/observer behavior must be verified on the actual Mac after authorized provisioning. Do not silently install or execute that private adapter through Manus.

### 4. Run the outbound window after private-port verification

Record the exact private adapter hash on the Mac; do not send its contents if it contains secrets or sensitive configuration:

```sh
BASE="/Users/tt1/.vt-creatorloop"
ADAPTER="$BASE/private-signing/owner-approval-adapter.mjs"
chmod 400 "$ADAPTER"
ADAPTER_SHA="$(shasum -a 256 "$ADAPTER" | awk '{print $1}')"
cd "$BASE/signer-code/owner-outbound-approval-v1"
node scripts/custody/owner-outbound-session.mjs "$ADAPTER" "$ADAPTER_SHA"
```

The CLI refuses missing/public-private permissions, changed adapter hash, absent ports or public keys. The session starts no listener and stops after 30 minutes. The Owner-approved exact local decisions must be in place; keep Terminal open only during the bounded approved commissioning/release window. **Do not run this command with unreviewed operational ports under preparation authority.**

For offline unsigned preparation only, the existing saved-file utility is executable now against fictional/restricted inputs:

```sh
node scripts/custody/owner-evidence-response.mjs prepare restricted-input.json new-prepared-output.json
```

Its input contains pending, local decision, issuer and keyId; it emits a two-part unsigned JWS input, not an approval. `complete` requires an already Owner-generated signature and public keys and only verifies; it never signs. Avoid manual per-nonce approval during the 7.2-second window; Owner approves a narrowly exact session scope first, and the independent local observer must corroborate each read dynamically. An observation/action outside that scope stops.

### 5. Verify and finish the existing commissioning route

With separate explicit activation/execution approvals: prove workload cannot respond/poll/export as Owner; invalid/superseded/non-bound signatures refuse; Mac offline prevents execution; exact positive Mac-signed evidence is accepted; no relay credential can sign; no executor deployment credential can replace the relay or Mac responder. Record actual results, not local fixture claims.

Retain complete mailbox export via Owner-only `/v1/owner/export`, exact local nonce/decision/signature journal and source hashes under both Mac and second VT custody. The mailbox export is a hashed complete-state artifact; **no live mailbox restore/activation path is implemented**. Verify portable offline recovery/sequence uniqueness separately before recovery is operationally accepted. Existing execution export/recovery drill is unchanged.

Then commission scoped App/provider capabilities through the existing protected process, reconcile actual reviewed release SHA and public runtime/peer pins, provision the approved synthetic identity, run disabled-version/configuration verification and existing isolated execution-state recovery drill. Exact protected release/admission/revocation/session-denial authorization remains mandatory. Step 18 is accepted only on live evidence; Steps 19–22 follow existing lifecycle, source synchronization, report retention and role walkthrough criteria.

## Security limits that must remain explicit

- Mac key custody plus public signature verification prevents the **unmodified reviewed** executor/relay from manufacturing an Owner receipt. A principal who can replace executable verifier code can make that code skip verification; managed secrets cannot solve this. Protected deployment and direct Cloudflare override controls must remain in force.
- The Owner retains ultimate account authority under the approved TRAINING security exception. Emergency/direct deployment override is a residual risk, recorded with version/configuration reconciliation and VT recovery evidence. This is not claimed to be a separate-human approval.
- Owner controls relay code/public key config and Mac adapter. Gateway/capability runtime has no corresponding deployment, evidence-signing or admission-signing authority. Mac is never remotely exposed for this flow.
- An unavailable Mac or missing independent observation means BLOCKED, never automatic approval or self-admission.

## Preparation evidence

The new key-free outbound preparation, SQLite immutable/replay controls and fail-closed relay/native Workers startup cases passed **11/11**. A subsequently added actual local-journal persistence/restart test passed **1/1** independently; total new cases **12**, without repeating the first eleven after an unrelated local-only addition. No keys generated and no challenge/JWS/admission signed. New relay bundle dry-build and changed-module syntax passed. Positive live Mac signing/authenticated relay acceptance and effective deployment separation remain NOT TESTED until protected provisioning. Existing installed core, bootstrap and old suites were not repeated.

## October 11 continuation — exact Owner inputs and executable setup

Owner confirmed hostname `approval-training.creatorloop.net` and login `team@creatorloop.net`; retired `support@creatorloop.net` must not be authorized. Existing Mac installations and private mailbox bootstrap remain accepted separately; no repeat install/bootstrap checks. Read-only exact new-target reconciliation found VT zone `752d0295a15ee275d9c2e3fd3f6fc2bc` active, existing Access issuer `https://shiny-wildflower-143c.cloudflareaccess.com`, existing One-time PIN IdP `3603807b-f1a4-4bbc-8524-f091bcbbb921`, no exact hostname DNS or bare-hostname Access app. OTP is existing authentication, not proof of MFA. No new IdP is introduced or existing authentication changed.

### Exact first protected action: Owner-path Access app, before hostname activation

`prepareOwnerMailboxAccess()` in `scripts/lib/training-owner-mailbox-setup.mjs` emits the non-executing exact create payload. After **explicit authorization**, create one self-hosted Access application in account `2a3b96a0b37850cd03107131baa66b6d`:

- Name `CreatorLoop TRAINING Owner Approval`, domain/path `approval-training.creatorloop.net/v1/owner/*`.
- Allow only existing IdP `3603807b-f1a4-4bbc-8524-f091bcbbb921`, session 30 minutes, HTTP-only/path-scoped/SameSite strict cookie, no WARP authentication or OPTIONS bypass.
- One application-scoped Allow policy: exact `team@creatorloop.net`; exclude `support@creatorloop.net`; no Everyone, wildcard email/domain, service-token, bypass or reusable broad policy.
- API operation `POST /accounts/2a3b96a0b37850cd03107131baa66b6d/access/apps`, with the application's embedded exact policy. If exact path/name already exists, inspect without overwrite. Record app ID/AUD and exact settings/policy once. No custom domain or Worker update as part of this step.

Do not put an Owner-only Access application over the whole relay hostname: it would redirect/reject existing workload and GitHub OIDC `/v1/read` calls. `/v1/read` retains reviewed application-layer cryptographic authentication for sensitive reads and signed non-authorizing metadata reads; no new Access bypass policy is proposed. All `/v1/owner/*` routes are edge-protected and reverified by Worker code. Unknown paths still refuse. Cloudflare assigns a distinct AUD to each application; it is not the gateway AUD.

### Confirmed correction before eventual config deployment

The original relay checked gateway AUD for Owner polling, so a correctly issued dedicated relay token failed and a gateway-audience Owner token was incorrectly accepted on those routes. Reproduced locally and corrected only Owner-route AUD selection: `ownerAccessAudience` must be actual 64-hex dedicated app AUD, not gateway/OIDC audience. `/v1/read` still checks unchanged gateway or exact protected GitHub OIDC tokens. New tests cover both audiences, retired identity/workload refusal, exact public setup and outbound HTTP ports. Deployed mailbox remains the accepted old fail-closed version; **no updated Worker version was uploaded or activated**. Do not reinstall the Owner's accepted package silently.

### Same protected session — private prerequisites, then trust/config activation

1. Create the exact Owner app/policy only when authorized. Retain its AUD in VT evidence. Have Owner perform their own login to this app on their Mac once a separately authorized hostname is routed to the still-empty/refusing mailbox. Login failure/refusal by the unconfigured Worker is not approval acceptance. Obtain only nonsecret exact Access subject/AUD/expiry verification; cookie/JWT remains Owner memory/keychain, never submitted to Manus/chat.
2. If the Owner separately authorizes key provisioning, personally reuse approved keys or generate **two separate purpose keys** in the established private Mac directory: evidence-response RS256 key and admission-receipt RS256 key. Unique IDs and encrypted files must be pinned in that exact approval. Do not use OTP/session authentication as a signing key, and do not replace the accepted admission signer code. Public key/nonce proofs and encrypted second VT-controlled recovery copies are required before public registration. No key-generation authority follows from hostname/app preparation. Existing secure setup key-generation instructions remain Owner-only; no live key is created here.
3. Wire reviewed private Owner authentication, exact local decisions and active direct observer/signing ports on the Mac. New `createOwnerMailboxHttp()` supplies actual **outbound** polling/publication/export ports: exact hostname, verified signed Owner identity/AUD, cookie used by Access edge plus original assertion for relay, five-second bounded calls, no redirects/retries/private-error logging or credential acquisition. `resolveOwnerSession` still must be privately installed; code never prompts Manus for a token. Existing Owner local journal supplies nonce/claim/retention. Active observation and restricted evidence-signing remain private actual ports, not booleans or gateway echoes. A newly reviewed local import delta must be Owner installed/pinned; no moving branch or automatic update.
4. Bind actual App/install/bot/repository/Owner IDs, gateway Access service identity/origin/AUD, Owner subject, public evidence JWK and real deployment/custody references. `prepareOwnerMailboxPublicConfiguration()` validates these and emits exact relay plus eleven purpose ports; refuses missing IDs, retired identity, private JWK, wrong issuer/custody/audience. It never installs configuration. No synthetic test identity may equal Owner or retired email; exact dedicated synthetic role/scope/revocation authorization remains necessary.
5. Under specific reviewed config/version/domain authority, install the corrected mailbox configuration/version and each consumer's public trust. Gateway/capability deploy credentials must exclude mailbox and Mac approval code; private runtime has no management/signing authority. Retain Owner overarching-admin residual risk under the TRAINING exception. Configure retention and second VT recovery copies, verify positive/negative Mac signature and direct observer behavior, then execute prescribed actual export/isolated recovery. Only after this, obtain the pinned protected TRAINING release/admission/revocation/session-denial authorization and complete existing Step 18. Steps 19–22 remain hosted NOT TESTED pending it; no timeline certifies a gate.

**New local evidence only:** 12/12 changed-only tests PASS, module syntax/whitespace PASS and corrected mailbox dry-build PASS. No old installation/bootstrap/environment/full-suite reruns. These are fictional cryptographic fixtures, not operational keys, identities or approval receipts. Existing public-only packages/custody copies and deployed fail-closed resources untouched.

References: [Cloudflare JWT audience validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) and [path-specific application precedence](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).
