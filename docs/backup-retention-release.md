# Backup, retention and controlled release preparation

Keep every existing audit event, actor snapshot, Team event and finalized report version. A report correction appends a linked version; it never replaces the original. This PR adds no purge, deletion schedule, storage provider or retention duration. Those require the actual external systems and the Owner's retention requirements.

## Prepare evidence without live access

Run `python3 scripts/team-migration-preflight.py /absolute/path/to/fresh-backup.sql` on a trusted export. It restores into memory, compares the registered schema and guards to the exact migrations, rehearses pending files atomically, checks foreign keys and verifies original rows/attribution remain unchanged.

Run `python3 scripts/retention-manifest.py /absolute/path/to/fresh-backup.sql --environment TRAINING --release-sha FULL_SHA --external /absolute/path/to/report.pdf` separately for each environment. Node and Python are required. The script restores into memory, verifies integrity/foreign keys, hashes each table's rows, verifies finalized report content hashes and linked versions, and inventories supplied external artifacts. It also fingerprints table/index/trigger definitions, checks finalized-report attribution and snapshot identity while inventorying unchanged legacy events without inventing their earlier roles, rejects duplicated or broken report version chains, and handles binary values. It emits hashes/counts, not employee records or credentials. Keep the original export and artifacts unchanged. A hash manifest establishes local content evidence; it does not prove a remote backup is fresh, retained, access-controlled or restorable from its actual storage location.

For an independent restored export, repeat the command with `--compare-manifest /absolute/path/to/original-manifest.json` and the same environment, release SHA and restored external artifacts. A mismatch in schema, rows, report versions, attribution or artifact hashes blocks the comparison. `LOCAL_RESTORE_MATCH` proves local content equality only; it does not prove the protected remote backup destination can be restored.

## Execute only in the approved secure environment

1. Verify the exact release SHA and migration file hashes. Read current remote migration registration, table schema, foreign keys and immutable guards separately for training and production.
2. Export fresh backups and record the database/project/AUD identities, export time, protected destination and restore procedure. Produce and retain both preflight and retention manifests. Rehearse restoration on an isolated copy; compare all original rows and hashes.
3. Inspect external reports in their actual platform. Record all versions, supersession links, attributable author/time, retention controls, access restrictions and backup destination. Export the relevant versions and hash them. Restore a protected copy from the real backup destination and compare it. Do not invent a retention period or delete history.
4. Apply only unregistered `0005_team_directory.sql`, `0006_audit_history.sql`, `0007_team_governance.sql` in that order through a demonstrated atomic D1 execution path with deferred foreign keys. Do not execute fragments or retry a failed rebuild blindly. If the actual schema or executor differs, stop and reconcile the actual evidence.
5. Verify post-migration registration, integrity, original-row hashes, historical attribution, immutable guards and new snapshots. Preserve rollback/interruption evidence.
6. Prepare isolated training deployment and actual policy/AUD/binding checks. Pin the approved public verifier keys and distinct environment identities. Complete admission/revocation and individually authenticated acceptance before enabling employees.
7. Install the exact reviewed bound bridge in the approved PNB Acquisition & Launch Control System only during controlled rollout. Preserve the existing endpoint, service policy and secrets. Verify canonical headers, protected formulas/validations, actual platform inputs, signed import → permitted change → export → acknowledgement → reimport, stale/source conflicts and retained reports.
8. Complete Operator Readiness and Owner release review. PR #18 stays draft and production deployment stays held until the live gates are ready.

## Source mapping boundary

The source contract remains `assets/operations-control-system-sync.gs`, `SOURCE_FIELDS` in `functions/api/operator-workflows.js`, and the existing signed integration route. Tabs retain their exact names: `CAMPAIGNS`, `🗺️CREATORS`, `CREATOR ASSIGNMENTS`, `CREATIVES`, `LAUNCH CONTROL`, `DECISIONS & BLOCKERS`, `RETARGETING`, `CREATOR PERFORMANCE`, `DATA INTAKE`, and `Creator Loop: Sign Up Form (Responses)`.

Product Focus and Product Scope remain separate. Campaign editing exports Notes only. Protected economics, rights, launch and Owner Approval are not widened by ordinary Save or new admission controls. Existing source tests cover mapped imports, formula/validation protection, escalation export/acknowledgement, pending-source conflict protection and narrow campaign Notes retries. They cannot verify that a live platform connection supplies the correct data; corroborate the real source and headers during live acceptance.
