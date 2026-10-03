# Team & Access acceptance and migration gate

This draft extends the existing Console. Keep its pull request stacked on the operator approval-reference change. Local acceptance is evidence of application behavior, not evidence of hosted admission or production certification.

## Verified application behavior

The existing identity store retains eight employee roles, including separate Operations Manager and OPERATIONS roles. Role, explicit record/system scope, environment, delegation, visibility and export authorization are enforced separately. Technician levels confer no platform credentials. New identities remain inactive; training, certification and activation are separate transitions. Suspension/deactivation denies Console requests and preserves identity, assignment attribution and append-only history. Permission epochs reject prior signed sessions; transaction guards reject writes after concurrent permission changes.

Finalized Console reports are immutable snapshots in the existing audit ledger. Corrections link replacement versions with reason, authorizing identity, immutable role/permission snapshot and timestamp. Audit corrections append new events. Separate export authorization is enforced and exports generate evidence. This implementation does not certify preservation of reports stored in outside systems.

## Admission blocker

`HUMAN_PROVISIONING_MODE=REGISTRY_VERIFIED` is a deployment switch. It is not an individual admission receipt, automatic policy provisioning, or proof that an employee authenticated. Leave it unset outside isolated tests until a reviewed admission mechanism and the environment's Access policy have passed live acceptance. The current implementation does not yet store and verify per-person admission receipts or complete per-person edge-session revocation. Those requirements remain open. Do not enable operational activation merely to make the UI demonstration pass.

The optional evaluator and broker experiments preserved on the local recovery branch are not part of this release. Installing a new Access admission mechanism is a consequential security configuration change requiring review and authenticated platform access. Preserve existing Owner admission and integration service policies. Do not ask the Owner to repeat previously completed authorization when the current environment lacks the authenticated administrative session.

## Migration preparation

Apply only unapplied files, in order: `0005_team_directory.sql`, `0006_audit_history.sql`, `0007_team_governance.sql`. Use the exact reviewed release files. Do not rename/replay a registered migration or assume its name proves the remote schema matches it.

Before remote execution:

1. Export each affected database and record its restore procedure and release SHA. Preserve the original audit rows and snapshots as comparison evidence.
2. Read `schema_migrations`, `sqlite_master`, `PRAGMA table_info(operators)`, and foreign-key definitions on all referencing tables. Compare actual schema against the migration assumptions. Verify the original identity column order used by the copy statement.
3. Confirm the actual D1 migration mechanism supports atomic migration execution with deferred foreign keys. Migration 0007 rebuilds the role-constrained identity table and temporarily replaces its audit trigger. Stop if live foreign keys use cascading deletion, schema differs, or the executor cannot guarantee the required transaction behavior. A local SQLite transaction does not certify remote D1 behavior.
4. Rehearse on a backed-up isolated copy. Compare every original row/column, identity ID and attribution before/after. Check `PRAGMA foreign_key_check`, `PRAGMA integrity_check`, immutable triggers, migration registration and future audit snapshots.
5. Record interrupted-execution/rollback evidence. Never retry individual fragments of a failed migration against the live database. Inspect and restore or resume through the supported migration tool according to the rehearsed procedure.

Local tests demonstrate original row/foreign-key retention, immutable snapshots and rollback when the atomic rehearsal fails. No remote migrations have been applied by this continuation.

### Repeatable backup preflight

Run `python3 scripts/team-migration-preflight.py /absolute/path/to/fresh-backup.sql` separately for each affected environment. The script reads the backup and restores it into memory; it never connects to Cloudflare, changes the input file or writes a database. Its JSON receipt records the backup hash, exact migration hashes, registered/pending Team migrations, preserved table/audit counts and foreign-key checks. Do not use an old recovery export as current remote evidence.

The preflight rejects registration gaps, identity column/constraint drift, missing historical guards and cascading identity references. It skips registered files only after comparing the affected schema and guards to the reviewed migrations. Pending files are rehearsed in one local transaction and every original table's columns/rows are compared afterward. Seven negative/checkpoint tests run through the ordinary test suite.

A `LOCAL_REHEARSAL_PASS` is not a D1 execution approval. Before applying anything remotely, corroborate the current registered schema, backup freshness and restore procedure, exact deployment SHA, and the supported D1 executor's atomic/foreign-key behavior. Retain the resulting preflight receipt with the release evidence. Production execution remains held until the live release gates are ready.

## Hosted lifecycle gate

Use distinct individually authenticated identities and separately isolated training/production audiences. Record evidence for invite, explicit scope/visibility/delegation, isolated training, role-specific certification, verified individual admission, activation, successful permitted action, rejected prohibited action, attributable audit event, permission change with old-session rejection, suspension, deactivation and retained history. Test pending edge revocation separately; Console denial does not prove a Cloudflare token was revoked. Include Technician restrictions and sensitive export denial/authorization. Confirm finalized versions survive the lifecycle.

Locally signed RSA JWT tests pass through the actual middleware and Console API. They exercise cryptographic identity validation, stale/future token rejection and wrong-audience denial. Their generated keys and simulated certificate endpoint are fictional test controls; they do not establish real Cloudflare authentication.

## Certification separation

- Infrastructure Production Certified: preserve the prior certification; revalidate deployed SHA/configuration independently before release.
- Team & Access Architecture: application implementation tested; individual admission provisioning remains incomplete.
- Team & Access Live Lifecycle Test: pending hosted individual acceptance.
- Operator Readiness Certified: not certified. Local signed source round-trip coverage now preserves pending escalations through import, export, acknowledgement and reimport. Hosted bridge evidence, actual source mapping/connections, operational queues, training deployment/isolation, OPS VIEW and employee handoff remain separate gates.

Keep the pull request draft. No production merge or deployment is authorized by these local tests.

Controlled editing is staged in the same draft; see [controlled-record-editing.md](controlled-record-editing.md). Its local View/Edit/Review/Save, before/after audit, current-scope/decision guards and narrow campaign Notes synchronization tests do not replace hosted acceptance. Include the updated bound bridge in the eventual controlled rollout; no live workbook installation is performed during draft development.
