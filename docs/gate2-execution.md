# Gate 2 executable approval and evidence

The Owner scope authorization is [PR #18 comment 5986789715](https://github.com/VTholdings/creatorloop-main-site/pull/18#issuecomment-5986789715), referring to proposal `9c68e91e0001dcc249f4e0129e3a47d6103ef277`. It permits preparation of the bounded training synthetic-fixture test. Execution requires separate approval of the final tested SHA/run and a fresh inactive-training-window attestation.

## Exact execution approval

The branch push queues `.github/workflows/acceptance-gate2.yml`. Validation runs without Cloudflare credentials. The write-capable job waits behind the existing `creatorloop-acceptance` environment reviewer gate. Return its final executable SHA and run link to the Owner before any approval.

Once the training window is inactive, **Creatorloopzone** posts exactly these four lines as a new PR #18 comment, substituting the actual run ID and full executable SHA; do not include code fences or edit the comment:

```text
CREATORLOOP_GATE2_WINDOW_V1
run=<exact fresh run ID>
sha=<exact executable SHA>
attestation=GATE2_TRAINING_NO_ACTIVE_OPERATORS
```

Then use that run's **Review deployments → creatorloop-acceptance → Approve and deploy**. No deployment-review comment is required. The attestation must be posted after run creation and remain unedited, unique and no older than 60 minutes throughout the stage. Keep training inactive until the job completes or a blocker is reported. This environment button releases the synthetic test; the workflow contains no deployment step.

The executor verifies the Owner's numeric identity, scope-authorization body digest, first attempt, workflow/run/SHA, protected environment approval, exact window comment, expiry and current branch/main. It rechecks the window/scope authorization and branch/main before each Cloudflare request. Missing evidence, altered authorization, stale HEAD/main, expiry or replay stops execution. No Cloudflare request occurs before authorization passes. A blocked or uncertain run must not be rerun automatically.

## Bounded mechanism

Only account `2a3b96a0b37850cd03107131baa66b6d` and training D1 `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0` are reachable through the executor. Existing protected environment secrets are reused. The completed production Gate 1 receipt is read locally; no production API request is made.

Existing accepted encrypted backup evidence is authenticated locally to recover the original training schema and column allowlists. No fresh export, remote restore or pending migration is performed. Completed training/production Gate 1 receipts and migration-byte hashes are corroborated, followed by a fresh bounded training schema inspection using the accepted exact `_cf_KV` fingerprint rule.

The fixed D1 REST query batches create four persistent synthetic tables and two history-denial triggers in `cl_g2_<run>_1_<sha-prefix>_...`. Two additional table names are used only in intentionally failing batches. Arbitrary SQL, identifiers, account/database targets and write retries are refused. No application table is written. Read bounds are 48 application tables, 128 columns/table, 2,000 rows/table, 512 schema objects and 4 MiB/response; overflow blocks before a fixture write when detected in the initial snapshot.

Application-data comparisons use private, sorted, type-tagged SQLite representations, preserving large integers, text bytes including NUL, blobs and real precision. Only counts and hashes are retained. The initial schema snapshot must still match the accepted schema with the existing named provider exception; all later snapshots must also preserve its complete raw fingerprint.

PASS requires a child-before-parent commit with transaction-local FK deferral, reset deferral/enabled enforcement, exact rollback of an unresolved-FK batch and an immutable-history-denial batch, no partial schema/registration/history effects, unchanged original application records/guards, and verified removal of all successful fixtures. Each phase uses the reviewed REST batch mechanism; no explicit remote BEGIN/COMMIT, real migration or compensating application change is submitted.

Cleanup runs only after both rollback comparisons pass. An ownership/data/schema CHECK inside the cleanup batch must succeed before dependency-ordered DROPs of the exact run-owned fixture tables. Any discrepancy, denied/unknown response, timeout, stale authority or cleanup mismatch stops without retry, broad sweep or restore. Unverified leftovers are reported for a separate Owner recovery decision; a failed request never proves cleanup.

## Evidence and retained holds

Only `gate2-evidence/TRAINING.json` is uploaded with requested 90-day retention. It contains run/SHA/database, approval and attestation provenance, private snapshot hashes/counts, phase/SQL-plan hashes, expected failure classifications, zero-write read metadata, cleanup status, possible remaining fixture names and blockers. Private decrypted evidence is removed from the ephemeral runner and is never included in the receipt artifact.

`GATE2_ATOMICITY_PASS` certifies only the tested training D1 REST batch path. It does not certify admission, the deployed application binding or Operator Readiness. PR #18 remains draft. Production access/write/migration, real training migrations, remote restores, executor activation, binding/Access/configuration changes, deployment, merge and every later gate remain held.
