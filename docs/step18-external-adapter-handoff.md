# Step 18 external adapters — implementation handoff

This implements the Owner-authorized **bounded preparation**, not new security authority. Imports have no side effects, default network transport or default key resolver. No live key, token, policy, identity, receipt or deployment was created. Existing admission/application security and immutable ledger code remain unchanged.

## Implemented components

| File | Purpose |
|---|---|
| `scripts/lib/training-execution-contract.mjs` | Fixed TRAINING account/app/DB/AUD/project pins; exact subject/request/version/timestamp binding; approved one-hour execution window; actual authorization and current-request ports; preservation/session/runtime requirements |
| `scripts/lib/creatorloop-training-provider.mjs` | Individually owned policy create/remove and dedicated-user revocation; approved policy template only; preserved Owner/service hashes; pre/post mutation fences; no automatic mutation retry |
| `scripts/lib/creatorloop-training-transport.mjs` | Private host-only credential injection, exact method/path/body approval hash, fixed endpoint allowlist, no redirects/retries, timeout/bounded response, redacted failures |
| `scripts/lib/creatorloop-training-session.mjs` | In-memory cryptographic Access JWT validation with issuer/AUD/time/subject and identity checks; active independently observed old-session/fresh-login denial port for REVOKE; no token persistence |
| `scripts/lib/creatorloop-training-signer.mjs` | Public-only RSA normalization/import/fingerprint, exact envelope/payload fields, separate observer, independent evidence hash, request fences, external signing port and returned-signature validation |
| `scripts/lib/training-release-plan.mjs` | Non-executable fresh TRAINING config patch; validated public keys; enabled slots, peer pins and DB fence; conservative unknown credential alias refusal; exact config hash and distinct source/execution SHAs |
| `scripts/lib/training-release-references.mjs` | Manifest-bound application SHA selection independent of protected execution SHA |
| `scripts/acceptance/training-application-readiness.mjs` | Existing GET-only context remains; optional `EXPECTED_TRAINING_APPLICATION_SHA` must match checked-out reviewed proposal; execution SHA retained; no default behavior change when unset |
| `docs/proposals/step18-training-release-workflow.yml` | **Inactive template**, outside `.github/workflows`; requires existing environment approval and a verified external release port |
| `docs/proposals/step18-training-staging.toml` | **Inactive staging template**, TRAINING binding/public pins; no public key placeholder installed; root `wrangler.toml` untouched |

## Required private host wiring — no substitute authority

The Owner-approved private signing workstation and separate ephemeral GitHub-hosted executor supply these ports in their respective custody domains. Provider/release jobs use distinct protected environments; signing keys never enter GitHub or Manus. Their authenticated sources and actual separation must be established; a hardcoded `true`/local JSON file is not an implementation of protected approval or fresh identity/session proof.

- `verifyApproval({manifest,manifestHash})`: protected Owner approval source, independent principal/key/provider custody, verified short-lived provider permission acceptance and exact source hash. Return matching `manifestHash`, `ownerDecisionRef`, `executionSha`, `signerPrincipal`, `executorPrincipal`, `independentCustodyEnforced=true`, `providerCapabilityVerified=true` only after actual corroboration.
- `readCurrentRequest(operatorId)`: current immutable ledger request plus `personnelVersion`, obtained through a reviewed Owner-authenticated Team & Access mechanism. Existing request `reason` is allowed, projected out of receipt. Reader is invoked at all fences. No copied Owner cookies, static request snapshot, direct unrestricted D1 reader or new Console service account is provided.
- `verifyHostAuthorization({method,path,body})`: enforce current protected request and body, return their exact SHA-256 `requestHash`, TRAINING app target, validity window and external credential reference.
- `resolveShortLivedCapability(reference)`: private store, account ID, actual verified permission acceptance, expiry <= one hour. Never route token to chat/public artifact/Pages. The environment metadata token is not reused or expanded.
- `obtainIndividualToken`, `fetchAccessPublicKeys`, `corroborateIdentity`: private participant session handoff and fixed Cloudflare team certs/identity endpoint. Tokens stay in protected memory; this adapter cannot erase all copies held by caller or provider runtime, so host logging/retention must be separately enforced.
- `probeRevokedSessions`: signer-controlled active old-token and fresh-login denial tests for the exact dedicated subject/app, with attribution and revocation boundary; a revoke API success or token expiry alone is insufficient.
- `observeRuntime`: fresh verified actual application SHA, TRAINING binding, AUD and agreed stable project deployment identity. Caller must independently correlate provider deployment and loaded runtime; this module does not infer them from request values.
- `independentEvidence(request)`: signer-controlled separately corroborated policy/runtime/session state. Return signer principal, policy ID, preserved policies and session/runtime proofs; provider self-attestation is not sufficient.
- `externalSign({keyRef,keyId,algorithm,hash,payload})`: protected non-general-purpose signing service controlled by the independent signer. The provider/executor must not gain key access or be able to substitute this implementation. Return only key ID and base64url signature; public validation runs before returning the envelope.
- Reviewed repository release/provider ports on the ephemeral runner replace the retired `/opt` private-host assumption. `scripts/execution/github-training-preflight.mjs` verifies exact hosted run context, latest branch SHA and existing environment controls before a protected job is referenced; its `check-port` mode checks an approved file hash then deliberately refuses protected execution under preparation authority. No live port is installed or dispatched. Actual ports must be reviewed/wired after the private prerequisites and exact protected authorization are supplied.

`createTrainingProvider()` exposes the provider ports and a fenced `currentRequest`. Wire these into the existing unchanged `executeEdgeRequest()` along with the independently controlled `createTrainingSigner()` interface. Do not run either with fictional test ports against live resources.

Manifest requirements: protocol `CREATORLOOP_TRAINING_EXECUTION_V1`; exact public `targets`; Owner reference; distinct principals and private runner/key/token references; `executionSha`, `applicationSha`; approved/expiry times; exact subject operator ID/email/sub with dedicated TRAINING status and accepted subject-only cross-app revocation; preserved policy hash, exact approved `requireRules` and precedence; operation/request ID/version/requestedAt; public key ID/fingerprint; owned policy ID for REVOKE. Initial evidence/runtime data must be fresh and current; no pending null fields are executable.

Policy verification is intentionally strict and may fail on provider normalization. Reconcile real response schema under the approved fresh preflight rather than guessing or widening selectors. Missing/ambiguous policies or changed preservation hashes stop execution. Unknown mutation outcome cannot be retried automatically; reconcile externally and use a newly approved retry/recovery if required. Shared-policy/group/IdP management is not implemented.

## Release preparation boundaries

`prepareTrainingRelease()` returns `executable=false` and a public configuration patch/hash only; it never calls Cloudflare. Every enabled TRAINING slot must have the correct DB binding and reviewed public verifier set. Preview enablement unknown is BLOCKED. Secret-like aliases are refused conservatively for explicit reconciliation, not silently deleted. Peer identity convention is the stable Pages project UUID, distinct from per-release deployment UUID.

No active workflow/security configuration was changed. The current metadata workflow does not expose `EXPECTED_TRAINING_APPLICATION_SHA` yet. Before use, the existing reviewer must approve the minimal workflow-variable plumbing, exact application SHA in the reviewed proposal and final execution SHA; source code fences remain. Never change reviewer rules to make the job run. If new preparation is integrated, pin the **final approved application SHA** deliberately; do not assume old `f0fb836...` contains new adapter code or treat a branch as a release hash.

The hosted release/provider templates remain inactive under `docs/proposals`; they are not installed or operational merely because hosted-runner integration is prepared. The isolated environments are `creatorloop-training-release` and `creatorloop-training-provider-execution`; `creatorloop-acceptance` remains unchanged/read-only. Setup instructions and exact nonsecret environment payload construction are in `docs/step18-owner-secure-setup.md`. Missing or weak environment controls block preflight, avoiding implicit unprotected environment creation. Private prerequisites, real reviewed ports, source/asset manifest and exact config review are still required. Templates must not be moved into `.github/workflows` or triggered as routine local engineering. Clean staging excludes production root config, `.git`, scripts/tests/private files; Functions and Console/public dependencies are selected from the exact reviewed application tree. No migration, production deploy or protected merge is included.

## One Owner-controlled unlock request

Provide one protected technical handoff containing:

1. **Independent custody:** name the GitHub-hosted provider execution administrator and separate private-workstation signer/custodian; restricted evidence destination; enforceable OS/service/admin separation; designated reviewer; protected approval source and signer-controlled observation method. No credentials in chat.
2. **Key action:** authorize the named custodian to generate/store one TRAINING-only RSA key externally; supply only approved public JWK, unique `kid`, public fingerprint and nonsecret key reference. Local public tests do not prove the future key or challenge signature.
3. **Capabilities:** authorize exact short-lived Cloudflare permission groups and reference(s), confirm actual permission acceptance without broad fallback, separately name release authority; acknowledge account-level capability granularity. Provider capability and key never enter Manus/Pages/public source.
4. **Dedicated identity:** approve exact new TRAINING email/IdP mechanism, verified Access `sub`, test-only status, fictional scope inventory, and **subject-only cross-application revocation**. Identity creation and policy creation remain unexecuted until specifically authorized.
5. **Final protected action:** after fresh reconciliation/public-key validation, approve exact request, target pins, policy requirements/precedence, current personnel version, application SHA, execution SHA and config hash through the existing protected gate. Release approval is separate from architecture approval.

Once those particulars are supplied and corresponding actions authorized, execute as one coordinated protected TRAINING workstream. No new approval loop is needed for routine local engineering failures. Absence of a live current-request reader, independent observer, enforced custody or approved release port remains a genuine prerequisite—not something this preparation fabricates.

## Evidence and limits

New regression tests use mock transports, fictional approval ports/identities and a published **public-only** RFC key. They generate no new signing key or live credential. The existing full repository suite uses its already-established ephemeral fictional key fixtures; those tests are not live admission evidence. Positive real signature acceptance is covered by existing admission tests; the new signer tests reject invalid signatures and unbound payloads. A valid signature through the actual external signer remains a hosted custody acceptance requirement.

Full local logs are retained outside the repository. The application verifier, immutable receipt model, ledger/migration bytes, role/field locks, Owner admission authority and production restrictions remain unchanged. Step 18 is not certified by passing local tests.

### Completed local verification — October 8, 2026

- Node: sandbox-only **22.23.3**.
- Focused new adapters + existing executor/readiness/admission compatibility: **46/46 PASS**.
- Full `npm test`: **407/407 PASS**, zero failures.
- `npm run check`, explicit syntax checks for every new module, `git diff --check`: **PASS**.
- TRAINING staging TOML parse and exact DB/environment checks: **PASS**.
- No live network/provider call, key provisioning, token issuance, identity/policy creation, admission or deployment occurred. Existing full-suite ephemeral fictional fixtures are local tests only.
- Root production-pinned configuration, all active workflows, authentication/admission implementation, migrations and protected branches remain unchanged by this work.
