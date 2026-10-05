# Training migration execution — separate Owner approval required

System destination: `VTholdings/creatorloop-main-site`, draft PR #18, branch `team-access-directory`, protected GitHub environment `creatorloop-acceptance`. The only Cloudflare database target is training D1 `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0` in account `2a3b96a0b37850cd03107131baa66b6d`.

Preparation implements the Owner-reviewed plan from release `7237c1317113c2705c5f2b8e622d284ea14871fc`. It is not migration execution approval. Gate 2 PASS remains accepted at run [37353740653](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37353740653); only its training REST batch path is certified. Backup acceptance remains complete at run [37242966914](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37242966914), including separately retained encrypted Owner storage. Nothing here authorizes another export, production access or a remote restore.

## Exact migration bytes and mechanism

| Order | File | SHA-256 |
| --- | --- | --- |
| 1 | `0005_team_directory.sql` | `2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693` |
| 2 | `0006_audit_history.sql` | `4caafd074663b4125d8af552c2e35653c26feaaa3458c92906d6b8c0856d9d02` |
| 3 | `0007_team_governance.sql` | `521b61fd348277116dcb0af55a803f057c64cc97b065ff00fdf244dcdea0c382` |

The executor joins the unchanged UTF-8 files, in this order, with a newline. It submits one POST to the pinned training D1 `/query` endpoint, with `batch: [{sql: <complete combined SQL>, params: []}]`. It does not tokenize/split statements, issue independent registration commits, use Wrangler, inject remote BEGIN/COMMIT, retry a write or expose an arbitrary SQL parameter. Cloudflare documents multi-statement SQL as a batch in its [REST query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/). Local actual-file rehearsal and late-failure rollback testing complement the accepted Gate 2 mechanism evidence.

## Owner procedure

Chief returns the final tested executable SHA, fresh attempt-1 run link and exact four-line attestation. Do not use a previous Gate 2 attestation or an environment review comment.

During a confirmed inactive training window, **Creatorloopzone** manually posts these four lines to **PR #18 → Conversation → Add a comment**, replacing the placeholders with the supplied run/SHA. Posting this migration-specific attestation and subsequently approving the protected environment authorizes only the fixed migration scope above.

```text
CREATORLOOP_TRAINING_MIGRATION_WINDOW_V1
run=<exact fresh run ID>
sha=<full final tested executable SHA>
attestation=TRAINING_MIGRATION_NO_ACTIVE_OPERATORS
```

Confirm the saved comment is visibly present and send Chief its direct GitHub comment link with “posted.” Chief independently verifies the exact text, PR, numeric Owner identity, run, SHA, uniqueness, unedited timestamps and expiry. **Only after that confirmation**, use the run's **Review deployments → creatorloop-acceptance → Approve and deploy**. This button releases a migration job; the workflow contains no deployment step. No review comment is required.

The comment must be posted after run creation and remain unedited and unique. Its window expires 60 minutes after posting; at least five minutes must remain before the migration request. Keep training operators, integrations and other database writers inactive throughout preflight, execution and verification. If the window expires or the run is blocked, do not rerun it. A fresh attempt and fresh attestation require a new request.

## Encoded preflight

The protected workflow downloads the existing accepted encrypted bundle and the accepted training Gate 2 receipt. Ciphertext and exact Gate 2 receipt hashes are pinned. The passphrase is delivered only from the existing environment secret. Private files remain on the ephemeral runner and only training SQL is reconstructed/rehearsed in memory; production SQL is not opened or executed.

The accepted backup's schema/retention/restore/rehearsal manifests are authenticated, and migration bytes must match both the pinned hashes and the accepted rehearsal. The pending list must be exactly 0005/0006/0007 with the three original registrations. A second local transaction intentionally fails after all real migration SQL and proves exact restoration of schema, original rows and registration.

Before any Cloudflare call, require the protected environment's independent Owner approval, matching first-attempt push workflow, current branch/main and a valid saved PR attestation. Run, approval, comment and branch/main are rechecked before every Cloudflare request. Credential custody, fixed origin, redirect refusal, bounded responses and no-retry rules remain in force.

Account-token verification is GET-only; require active status and sufficient lifetime when an expiration is supplied. Training D1 metadata must identify the exact UUID. The existing bounded training Gate 1 inspection runs unchanged, including its schema/registration end fences and the named exact `_cf_KV` exception. Provider disappearance/change from the accepted Gate 2 raw schema is also blocked.

Two additional bounded read batches compare all original columns/constraints, identity column order, FK definitions and actions, enforcement/deferral/constraint settings, consistency, foreign-key violations, existing report JSON/version collisions and every original table's row fingerprints/counts against the accepted backup. Rows are represented privately with SQLite type tags, text/blob hex, integer text and precise real formatting. A same-count change is not accepted. Backup coverage or live state drift blocks before the single write; no backup/export fallback is attempted.

## Encoded post-checks

PASS requires exact reviewed post-rehearsal schema, every table's column metadata and FK definition, all triggers/indexes/constraints, enabled FK/CHECK enforcement, reset deferral, clean `quick_check` and no FK violations. Only the approved `_cf_KV` metadata exception is permitted, and its complete raw fingerprint must stay unchanged.

Every original row/value and registration timestamp must be preserved. The registry must contain exactly the original three entries plus one each for 0005, 0006 and 0007, with valid execution-window timestamps. Profiles, Team events, actor snapshots and mutation guards must be empty. No `operators_expanded`, Gate 2 fixture or other unexpected schema object may remain. No employee is provisioned, admitted or activated. The unchanged `0007` default is `PRODUCTION`; future training provisioning must explicitly choose `TRAINING`.

Remote checks are reads only. They verify immutable/snapshot/mutation/report guard definitions. They do not seed audit/report/operator records or attempt historical deletion. Existing local behavior tests and the actual SQL rehearsal retain that behavior evidence.

## Failure and evidence

There is exactly one migration submission opportunity. Known SQL failure requires bounded read-only proof that the complete original schema, registration and data are restored. Partial effects or failed verification hold recovery without compensating writes. Timeout, malformed response or an otherwise unknown outcome remains blocked even if a read finds unchanged state; that observation does not establish completed rollback. A committed migration with failed post-checks is reported as committed and blocked, not rolled back. Expired/stale authority can stop follow-up reads; recovery then requires separate Owner authorization.

Only `training-migration-evidence/TRAINING.json` is retained with requested 90-day artifact retention. It records run/SHA/database, migration/SQL-plan hashes, approval/comment provenance, accepted backup/Gate 2 references, bounded phase metadata, before/after hashes/counts, checks and rollback/blocker status. Unknown application outcome is explicitly `null`, not a fabricated “no migration.” SQL, private records, raw provider errors, credentials, decrypted exports and passphrases are excluded. Private files are removed in the workflow's final cleanup step.

PR #18 stays draft. Production, remote restore, Access/Pages/binding changes, deployment, merge, admission executor activation, operator admission and all later gates remain held.
