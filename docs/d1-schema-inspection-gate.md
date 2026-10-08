# Gate 1 — bounded live D1 schema inspection

Current [Owner authorization on PR #18](https://github.com/VTholdings/creatorloop-main-site/pull/18#issuecomment-5986047219) permits the exact-fingerprint `_cf_KV` normalization and a fresh **TRAINING ONLY** schema inspection. It supersedes the earlier two-database execution scope: production inspection is held, even if training passes. [Backup acceptance](acceptance-exceptions/2026-10-04-backup-acceptance-complete.md) remains complete; no backup is repeated. This stage does not extend the historical preservation exception to any write, remote restore, migration, atomicity test or executor activation.

## Mechanism and approved targets

Workflow `.github/workflows/acceptance-d1-schema.yml` queues on relevant changes to `team-access-directory`. Validation precedes the existing protected `creatorloop-acceptance` environment. The job requires first attempt, current branch HEAD/main, exact run identity, fixed `SCHEMA_INSPECTION_SCOPE=TRAINING_ONLY`, and recorded Owner `Creatorloopzone` approval (login and numeric ID). Review comments are unused. No credentials, environment configuration, bindings, Access policy or application code are changed.

| Environment | Pinned D1 ID |
|---|---|
| TRAINING — inspection authorized | `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0` |
| PRODUCTION — held; receipt only | `c4993a97-5835-4c6c-af06-7020fa8d4f2a` |

Account remains `2a3b96a0b37850cd03107131baa66b6d`. The live entry point instantiates only the training client and reads only the training baseline. A discrepancy/denial stops inspection. Production always gets a `NOT_AUTHORIZED_PRODUCTION_HELD` receipt with no queries or PASS claim. No correction or retry is performed.

### Existing evidence, not another export

Retrieve only encrypted Owner transfer artifact `11317109290` from accepted run `37242966914`, release `a7e3945a1a087a1fbc1ae8c7d0607e5ac94fcf46`. Verify the pinned ciphertext checksum and authenticated encryption using the existing protected `CREATORLOOP_BACKUP_PASSPHRASE`. Read the authenticated ZIP's training SQL and training export/retention/restore/preflight receipts using `--training-only`; do not read production SQL/individual manifests, extract or upload SQL. ZIP paths, duplicates and expanded size are bounded. Interpret the trusted training SQL export in isolated local memory to obtain its original schema/columns/foreign keys; no live database is restored and no pending migration is executed, locally or remotely.

Require accepted capture identities, export checksums, successful restore/rehearsal status, equal original/restored manifests and unchanged exact rehearsal hashes for `0005_team_directory.sql`, `0006_audit_history.sql`, `0007_team_governance.sql`. The private baseline includes SHA-256 of every reviewed repository migration file. Evidence is anchored to the accepted backup release; the inspection commit adds tooling only. The Owner's retained copy is untouched.

### Exact SQL read boundary

Cloudflare's [D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) uses HTTP POST for SQL reads as well as writes. This stage has its own restricted transport; the existing GET-only Cloudflare verifier remains unchanged. The only Cloudflare endpoint is the pinned account/database `/query` path for the selected environment. Request body is exactly `{sql, params: []}`. SQL must equal an internally generated allowlisted statement, not merely start with SELECT or PRAGMA:

```sql
SELECT type,name,tbl_name,sql FROM sqlite_master
WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
ORDER BY type,name LIMIT 257

SELECT version FROM schema_migrations ORDER BY version LIMIT 33

PRAGMA table_info("operators")
PRAGMA foreign_keys
PRAGMA foreign_key_list("FIXED_ACCEPTED_TABLE_NAME")
```

`FIXED_ACCEPTED_TABLE_NAME` is generated from the authenticated original schema only, restricted to an ASCII identifier and quoted. No name is taken from live discoveries or user input. At most 48 tables, 256 schema objects, 32 migration registrations and 128 column/foreign-key rows per query. Read schema and registration again at the end as a drift fence. Maximum 54 SQL reads, training only, with 20-second request timeouts, a 2 MiB response limit and a 20-minute protected-job limit. Branch/main fences are checked before every query. Internal `_cf_KV` contents are never queried.

The transport refuses arbitrary SQL, writes, settings assignments, transactions, comments/appended statements, migrations, exports, rollback tests, other endpoints/accounts/databases and redirects. Each response must explicitly report `rows_written: 0` and `changed_db: false`, one successful result, and the bounded row count. Missing evidence, denials or uncertain responses stop; there is no retry or alternative credential.

## PASS/FAIL receipts

Only `schema-evidence/TRAINING.json` and `schema-evidence/PRODUCTION.json` are uploaded, with 90-day retention requested. Receipts identify environment/database, run/release/main SHAs, accepted backup identity/hash/timestamp, reviewed migration hashes, registered/pending Team migrations, checks, before/after fingerprints, zero-write response evidence and blockers. Raw SQL, provider error messages, defaults, names/emails of employees, operational records, tokens, signed URLs and passwords are not uploaded or logged. Unexpected object names are fingerprinted; known object differences are identified without publishing SQL. Decrypted evidence/private baselines are removed after the run.

`LIVE_SCHEMA_INSPECTION_PASS` requires all application schema objects/definitions, migration versions, identity columns and foreign keys to equal the original accepted baseline, enabled foreign keys, and no cascading identity-reference action. All comparisons remain strict except the one explicitly authorized training provider row below. Re-reading schema/registration must match. An expected pending guard remains pending; matching the pre-migration schema is not certification that unapplied governance controls are installed.

### Training provider exception

The [classification evidence](acceptance-exceptions/2026-10-05-training-cf-kv-classification.md) establishes the reserved, export-excluded `_cf_KV` object and its exact live/provider definition. Normalization requires explicit opt-in, training identity, and a baseline with no `_cf_KV` schema or foreign-key entry. At most one live row is excluded, and only if `type=table`, `name=_cf_KV`, `tbl_name=_cf_KV` and full canonical metadata SHA-256 is `7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686`. An altered/malformed definition or duplicate blocks immediately. Other `_cf_` tables, related indices/triggers/views and application changes still block; no prefix filter is used.

Schema checks retain the unnormalized inventory's `actualSha256`/`rowCount`, the normalized inventory's `comparisonSha256`/`comparisonRowCount`, and separate provider presence/count/definition/exclusion evidence. No raw SQL is published. The provider must remain identical at the end fence, including presence: disappearance or appearance between fences blocks. The library's production comparisons remain strict; enabling this exception for production is refused before any SQL call. The current protected entry point does not execute production at all.

The registration table stores versions, not historical applied-file checksums. Receipts therefore explicitly set `remoteAppliedFileHashesStored: false`: exact current/rehearsed file hashes are corroborated, along with the registered schema, but historical file-byte provenance is not fabricated. Likewise `atomicExecutionCertified`, `remoteMigrationsApplied`, `remoteRestorePerformed` and `productionDeployed` remain false. PASS establishes Gate 1 only.

## Exact Owner approval

Before the protected job executes, review its presented commit SHA and fixed scope above. On the new **Gate 1 training-only read-only D1 inspection** run, wait for validation, then select **Review deployments → creatorloop-acceptance → Approve and deploy**. No attestation/comment or low-activity backup window is requested for these bounded reads. The button does not authorize deployment. Do not approve an older run/SHA or rerun a blocked inspection without reviewing the discrepancy and a fresh request.

Production inspection, Gate 2 atomicity/write testing, remote migrations/restores, production deployment, executor activation, configuration changes and PR merges remain unauthorized. PR #18 remains draft. Stop and report any mismatch instead of correcting it. After training PASS, report its exact evidence and request separate authorization before any production inspection.
