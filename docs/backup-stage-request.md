# Controlled backup stage — prepared, not executed

This is the next preparation gate under [CL-EX-20261004-01](acceptance-exceptions/2026-10-04-training-preservation.md). The historical Pages anomaly remains unresolved. This request authorizes nothing by itself and contains no executable remote operation.

**Subsequent Owner authorization:** the [dated follow-up](acceptance-exceptions/2026-10-04-backup-stage-authorization.md) supplies 90-day retention and the allowed controlled export stage. Use [the execution guide](backup-stage-execution.md) for the prepared workflow, encrypted storage and current approval action. The decisions below describe the original request; they do not override that follow-up.

## Exact proposed scope

| Environment | Pages reference | D1 database ID | Operation |
|---|---|---|---|
| TRAINING | `creatorloop-operator-training` | `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0` | Fresh full schema/data export; protected retention; independent retrieval and local restore comparison; local migration rehearsal |
| PRODUCTION | `creatorloop-operations-console` | `c4993a97-5835-4c6c-af06-7020fa8d4f2a` | The same backup/verification operations, separately identified and processed |

Use only the pinned account and existing protected `creatorloop-acceptance` credential. Do not broaden permissions or fall back to another credential if an export is denied. No SQL query endpoint, import, Time Travel restore, remote migration, Pages PATCH, deployment, Access change, policy change, admission or revocation is included.

Cloudflare's [D1 export API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/) uses `POST /accounts/{account_id}/d1/database/{database_id}/export` with `output_format: polling`. Export initiation and bookmark polling must be distinct from mutation retries. The [documented limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations) include blocking other database requests during export, unsupported virtual tables and potential numeric precision loss. Therefore this is not the existing GET-only stage and requires an approved export window, especially for production. Never delete virtual tables to make an export succeed. Treat unsupported or lossy contents as blockers.

## Owner decisions required before implementation can target storage

1. Approve fresh TRAINING and PRODUCTION exports within an explicit acceptable availability window. This allows export/poll/download only, plus local verification; no remote restore or migration.
2. Select an existing protected backup/evidence destination, its permitted readers, and retention duration. Preserve original operational audit/report history without introducing a deletion schedule. Storage access must use secure supported runner credentials, never a secret supplied through ChatGPT or source.

No existing Owner-approved destination or retention duration was found in the recovered release instructions. Do not select a public repository, ordinary shared folder, temporary download URL or 14-day diagnostic artifact as the permanent backup destination. Do not fabricate those storage decisions or claim remote retention from a local manifest.

Once those decisions exist, stage the corresponding protected workflow for review before its environment approval. Pin the current PR SHA and fence stale branch state. Corroborate distinct Pages/D1/AUD targets and current read-only metadata before export. Process the databases sequentially; never substitute a production export for training evidence.

## Existing verification pipeline to execute on secured exports

Run each step separately per environment with the exact reviewed release SHA:

1. Record source database identity, export start/completion time, export hash, protected object identity, actual access restrictions and selected retention policy. Keep SQL contents, signed URLs and credentials out of logs, source and diagnostic artifacts.
2. Retain the unchanged original SQL export and produce its manifest using `scripts/retention-manifest.py`. Hash and retain the existing sanitized investigation artifacts as release evidence as well.
3. Retrieve the backup independently from the approved destination into an isolated verification workspace. Run the existing retention verifier on that retrieved export with `--compare-manifest` pointing to the original manifest. This restores SQL into memory, verifies integrity and foreign keys, and compares schema, rows, attribution, reports and external artifacts. A same-workspace copy alone cannot prove storage retrieval or retention.
4. Run `scripts/team-migration-preflight.py` on the verified export. This rehearses only pending `0005_team_directory.sql`, `0006_audit_history.sql`, `0007_team_governance.sql` locally, rejecting actual schema/guard drift and preserving original rows. Retain migration hashes and the receipt.
5. Record any denial, unsupported export, integrity failure, drift, retrieval/access failure or comparison failure as a blocker. Do not retry an uncertain initiation, edit the export, silently omit a table, apply migration fragments or restore into live D1.

Local `LOCAL_RETENTION_VERIFIED`, `LOCAL_RESTORE_MATCH` and `LOCAL_REHEARSAL_PASS` remain local receipts. Mark storage verification complete only with independent destination retrieval and access/retention evidence. Do not mark D1 atomic execution, hosted lifecycle, synchronization, Operator Readiness or production certification PASS from these receipts.

## Separate later authorization

After backups, independent restore comparison and rehearsal pass, remote migration still requires actual D1 executor/atomicity corroboration, approved exact migration/deployment SHA and a new Owner authorization. The original historical anomaly must remain visible in that release review. No remote migration or production deployment is authorized by this preparation exception.
