# Step 18 — TRAINING application and executor readiness

2026-10-08. Step 17 is accepted and is not repeated. Step 18 is **not complete** and Step 19 is **not ready for hosted lifecycle acceptance**.

## Verified work

- Protected run [37705786539](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37705786539) committed corrected 0005→0006→0007 atomically to TRAINING. Its accepted receipt proves the resulting schema, registrations and original row preservation. The run/attestation is closed; never rerun or renew it.
- This preparation corrects two ordinary application defects. TRAINING Team login links and reauthentication messages use `creatorloop-operator-training.pages.dev`, while production links retain `ops.creatorloop.net`. API isolation validation now runs before operator lookup, bootstrap and activity updates, using the same existing validation predicates.
- Local tests use ephemeral fictional identities, in-memory SQLite and fictional signing material only. New assertions prove an explicit TRAINING profile, inactive invitation without grants, migration default preservation, training links, readiness without live certification, and zero database touches on invalid/incomplete isolation configuration.
- Full local suite: **370/370 PASS**, syntax PASS, whitespace check PASS. This includes existing role, scope, lifecycle, admission, executor-race, history/audit, finalized-report, synchronization-denial, corrected migration and rollback tests. Local tests do not establish hosted behavior or provider adapter readiness.
- Migration bytes and hashes remain exactly the accepted values: 0005 `2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693`, 0006 `5efb5f677c082bb8bc5ad2e5a8c326b51b1894d3935adf3c1153b3be80cf58ed`, 0007 `f6cc901cd01a51ce9b51a022ab1ad8746197c29d5876b81557b7d7ed494b0457`. Existing receipt verification, permission/commit guards, executor, parser request bytes, migration workflow, target pins and root wrangler configuration are unchanged.

## Current evidence limits

The October 4 09:39:41.570 HST metadata from [37228580212](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37228580212), artifact 11312632678, is authentic: downloaded ZIP SHA-256 `c36fc95acfaa0fe7e5e350cf05fb0df9de8716d969712aa71974cba8992a80b2` matches GitHub. It is historical, not a current remote inspection.

It showed TRAINING Pages project `creatorloop-operator-training`, project ID `9863d88c-8025-414c-9524-078ee470e9e7`, canonical deployment `7637de42-2d67-4623-bf62-6be6560120a8`, deployed SHA `f4814ed44f2ecfe8ad00414999fa850967db4df0`. The TRAINING D1 binding was `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0`, distinct from production `c4993a97-5835-4c6c-af06-7020fa8d4f2a`. Its Access audience was `a6b7d2d9e2a0bbe45ac1f1155cbd32593467eac2d66c01aa67d36fb290b7a38d`, with a separate Owner-only Access application and matching Pages domain. Neither deployment slot contained admission verifier keys or synchronization credentials. The preview slot lacked explicit TRAINING environment; preview enablement was unknown. Current values must be reread before any hosted fixture or deployment decision.

On October 8 a direct browser check of the TRAINING `/console/` entry was stopped by `net::ERR_BLOCKED_BY_CLIENT` before page inspection. This proves a limitation of this browser, not site failure or bot detection. No sign-in, application API request, bootstrap, activity write or fixture occurred. GitHub deployment-list GET is unsupported by the connector; it does not prove deployment absence.

The root `wrangler.toml` binds the production database/audience. **Do not use it unchanged to deploy TRAINING.** No deployment command has been issued.

## Narrow fresh metadata check

`.github/workflows/acceptance-training-application-readiness.yml` prepares a fresh GET-only check under the unchanged `creatorloop-acceptance` environment. It keeps GitHub `contents: read`, branch/repository/push checks, immutable checkout, current-head fence, timeouts, redirect rejection, no retries, existing credential custody and sanitized evidence. It neither changes nor removes an approval rule. It does not introduce credentials or alter scope.

The narrower application verifier requests only account-token verification, the pinned TRAINING Pages project, TRAINING D1 metadata, Access application listing for the pinned TRAINING audience and that application's policy list. Account-wide Access listing can contain other application metadata; the evidence projects only the matching TRAINING application. It does not read production Pages, production D1 or production policies. No D1 `/query`, application API, SQL, migrations, export/restore, provider mutation, signing or deployment exists in this lane.

Evidence records the canonical SHA/deployment, both enabled configuration slots, exact binding/AUD/environment and peer pins, known prohibited credential presence, verifier-key presence, expected Access domain and sanitized policy hashes. A metadata match **always** retains `step18Complete=false`, `step19Ready=false`: secret presence is not key validity; metadata is not runtime isolation or live acceptance. Unknown credential aliases, actual deployed key parsing and provider adapter behavior need separate verification. Numeric HTTP statuses/provider codes are retained on failure; raw provider messages/secret values are discarded.

A push also matches the pre-existing broader read-only workflow's `scripts/acceptance/**` filter. Leave that unrelated job protected; only the new TRAINING check is relevant to Step 18. Never approve stale migration/parser/correction jobs.

## Executor compatibility and genuine blockers

[Admission execution](admission-execution.md) describes the completed portable executor contract. `scripts/lib/edge-executor.mjs` is compatible locally with the immutable request/receipt ledger introduced by 0005–0007 and tested fences, including stale request/version, subject binding, expiration, individual revocation and preserved Owner/service policy checks. No live Cloudflare provider adapter or signing-key custodian is installed or selected in the repository. A configured public verifier alone does not mean a functioning executor.

Do not manufacture a receipt, set a bypass switch, put a signing private key/Cloudflare token into Pages, create/expand credentials, or substitute account-wide/all-users revocation for individual revocation. If an existing approved external executor and signer exist, corroborate their public key, target constraints and provider mechanism before reuse; do not request private keys in chat. Creating them or extending provider access is an Owner security-boundary decision.

The new check still technically requires the existing GitHub environment reviewer to release the protected token. No security proposal or duplicate-approval-layer reduction has been implemented. A routine run is prepared and validated before requesting that exact review if no authorized review method exists for it.

## Evidence needed for Step 18 complete / Step 19 ready

| Requirement | Required evidence | Current status |
|---|---|---|
| Corrected TRAINING database | Accepted Step 17 schema/registration/preservation receipt | Complete; no repeat migration |
| Current isolated runtime | Fresh reviewed SHA, Pages deployment/binding and exact TRAINING/peer pins in every enabled slot; no production synchronization/private signing/provider credential | Fresh protected metadata pending |
| Authentication | Actual Access domain/audience and preserved Owner/service policies; authenticated TRAINING Owner route evidence | Historical metadata only; browser blocked |
| Application/role routes | Hosted controlled synthetic users for all eight approved roles; direct route denials, scope/privacy/export/Owner boundaries, reports/audits and no production destinations | Local full suite passes; hosted verification pending |
| Executor | Approved external provider adapter/signing custody, individual admit/revoke+session evidence and immutable signed receipts with correct request/version/environment/AUD/DB/deployment | Portable executor tests pass; live adapter/custody uncorroborated |
| Safety for synthetic acceptance | Current bindings/auth confirmed; fixture inventory, dedicated fictional identities, request-bound scopes and attribution; no live employees or real operator admission | No remote fixtures yet |
| Readiness handoff | Sanitized deployment/runtime/executor evidence and unresolved gate list, with Step 19 authority separate | Prepared; not certified |

Next: collect the fresh protected TRAINING metadata, then prepare the exact isolated TRAINING-only release/configuration diff against current values. Any required protected deployment or new signer/provider-credential boundary is an Owner exception; ask for that concrete adjustment only after the fresh evidence. No production migration/write/deployment, protected merge, restore, real employee activation, DNS/email/Access change or later-gate certification is included.
