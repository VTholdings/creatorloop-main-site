# Corrected TRAINING migration preparation — execution held

System destination: VTholdings/creatorloop-main-site, existing draft PR #18 on draft PR #17, team-access-directory; training D1 `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0` in account `2a3b96a0b37850cd03107131baa66b6d`. No production access, actual migration, restore, deployment, merge, admission, activation or later gate is released by this preparation.

Distinct candidate modules and local tests are prepared. The proposed workflow is stored at `docs/proposals/acceptance-training-case-free-migrations.yml`, outside the Actions directory. It cannot queue a migration run. Historical migration/parser executors, hashes, workflow contents and closed-run attestations remain unchanged. No new credential, permission, environment, approval rule or security boundary is created.

## Fixed migration request

One POST to the existing TRAINING D1 /query endpoint, with `{batch:[{sql:<complete joined reviewed files>,params:[]}]}`. Files are joined with one newline in this order, without splitting, rewriting, explicit remote BEGIN/COMMIT, independent registration commits or write retry:

| Order | Migration | Exact SHA-256 |
| --- | --- | --- |
| 1 | 0005_team_directory.sql | 2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693 |
| 2 | 0006_audit_history.sql | 5efb5f677c082bb8bc5ad2e5a8c326b51b1894d3935adf3c1153b3be80cf58ed |
| 3 | 0007_team_governance.sql | f6cc901cd01a51ce9b51a022ab1ad8746197c29d5876b81557b7d7ed494b0457 |

Joined SQL SHA-256 `cde49d27c0c242a0bf2c93c29ddc474bd249e0bc37e7bc57cf666aaf28d9daf6`; 10,337 UTF-8 bytes. Exact JSON request-body SHA-256 `2ec66c36095ca410b7b4b1270db3ce68764fff96fd9ed5d5cd0549f554fe1f9f`; 10,508 UTF-8 bytes. Remote request behavior changes from the historical executor only through the already-reviewed CASE-free SQL bytes and the distinct current authorization protocol.

## Provenance and guards

The candidate requires the exact hash-verified corrected-trigger receipt from run 37700780032. It retains the original accepted encrypted backup, passphrase custody and Gate 2 receipt pins. The original backup manifests are authenticated against immutable historical migration fixtures in a private temporary source tree. The corrected pending files are then rehearsed separately in memory, with an injected late failure proving rollback of original schema, every original row and registration. Historical acceptedRehearsalSha256 remains historical; localCorrectedRehearsalSha256 records the new rehearsal. The unchanged historical Gate 2 verifier corroborates original data/schema and old rehearsal provenance rather than pretending Gate 2 executed corrected files.

Fresh preflight and two prewrite fences compare exact original schema, columns, constraints, FK definitions/actions, enforcement settings, report JSON/version collisions and every original table's typed row fingerprints against the authenticated backup. Drift blocks before the single migration submission; count-only preservation is insufficient. Post-checks require exact corrected schema/guards, original rows and registration timestamps, three added registrations, four empty new governance tables, enabled enforcement, reset deferral and clean integrity/FK checks. Only the existing exact _cf_KV exception is allowed. The PRODUCTION default in 0007 remains unchanged; future training provisioning must explicitly select TRAINING.

The new authorization module is a renamed copy of the existing migration authorization, with a distinct workflow, scope and four-line protocol. Same numeric Owner, independent protected environment approval, unique unedited PR #18 comment after run creation, attempt 1, 60-minute nonrenewable expiry, five-minute minimum remaining write budget, current branch/main/checkout/run/SHA fences and per-request rechecks. Diagnostic approval cannot authorize a migration. Existing credentials, endpoints, bounds, redirect rejection, 20-second timeout and no-retry behavior remain unchanged.

Failure handling retains the historical rules: known SQL rejection requires independent full rollback verification; uncertain outcome remains unknown, even if later state is unchanged. Partial effects, post-check discrepancies or failed reads stop with recovery held. No compensating write, cleanup sweep, retry or remote restore is permitted. Only sanitized evidence is retained.

## Local validation

26 candidate tests and 360/360 full-suite tests pass, with no failures/skips/cancellations. Full syntax checks, Python compilation and diff whitespace checks pass. Tests cover corrected-byte/provenance substitution refusal, actual local atomic success, retired-identity/history preservation, early/late rollback, partial effects, timeout/unknown outcomes, same-count drift/races, missing guards, enforcement/report conflicts, bounded zero-write reads, target/scope/replay/window refusal, missing Owner approval, stale run/SHA and secret sanitization. Tests confirm the proposed workflow is inactive and the diagnostic attestation cannot authorize migration. Existing TRUE/FALSE/NULL and reduced-parser-limit actual-migration tests remain passing in the full suite.

These tests use local synthetic fixtures. The Owner's encrypted accepted backup was not decrypted or accessed in this preparation. Fresh private-backup and remote preflight verification are required in a separately authorized protected run; local tests do not certify them.

## Exact next Owner decision

Release only the existing TRAINING migration hold for one fresh protected attempt-1 execution of the fixed corrected 0005 → 0006 → 0007 batch above, during an inactive TRAINING window, with the retained preflight, independent approval, current run/SHA attestation, post-checks and no-retry/unknown-outcome rules. Production, restore, deployment, both PR merges, admission/activation and all other later gates stay held. This is a write-capable stage, so standing diagnostic authority does not release it.

After that scope authorization, the tested workflow proposal can be installed unchanged, CI verified and its exact fresh run/SHA returned for the Owner's separate saved window comment and environment review. No run/SHA is invented before the workflow exists. The new four-line protocol is:

```text
CREATORLOOP_TRAINING_CASE_FREE_MIGRATION_WINDOW_V1
run=<fresh presented run ID>
sha=<full fresh tested SHA>
attestation=TRAINING_CASE_FREE_MIGRATION_NO_ACTIVE_OPERATORS
```

No existing run or comment may be reused. The separate automatic diagnostic-lane security proposal remains a proposal; credential scope and environment protections are untouched.
