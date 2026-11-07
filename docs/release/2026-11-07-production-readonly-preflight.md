# CreatorLoop permanent console — production read-only preflight (2026-11-07)

Target: https://ops.creatorloop.net/console/ — existing Cloudflare Pages project `creatorloop-operations-console`, production branch `main`. Release candidate: PR #27, branch `chief/console-team-access-release-candidate-20261107`. This receipt records read-only facts, not a deployment or protected release authorization.

## GitHub validation

- Release candidate CI completed SUCCESS: https://github.com/VTholdings/creatorloop-main-site/actions/runs/42422120705 at `2d97bb146b89638d6d58e2fe717cb3605fea60ba`.
- Team & Access application and reviewed SQL files `0005_team_directory.sql`, `0006_audit_history.sql`, `0007_team_governance.sql` are staged, not applied.
- A prior TRAINING migration completed in protected run https://github.com/VTholdings/creatorloop-main-site/actions/runs/37705786539 ; it does not authorize production migration.

## Live production D1 — read-only inspection

- Database ID: `c4993a97-5835-4c6c-af06-7020fa8d4f2a` (existing Pages production binding).
- Registered schema: `0002_operations_console_v2`, `0003_pnb_source_contract`, `0004_operator_permissions`. No registered `0005`–`0007`.
- `operators`: 7 columns in expected reviewed copy order: `id,login_email,display_name,role,account_status,last_activity_at,created_at`. Current role CHECK covers the existing 8 roles.
- 2 operator identities and 14 historical audit events exist; 0 access grants and 0 approval delegations at inspection.
- 9 operator-referencing tables inspected; all references to `operators(id)` have `ON DELETE NO ACTION` and `ON UPDATE NO ACTION`. No cascading identity references found among these tables.
- `PRAGMA foreign_key_check`: zero violations. `PRAGMA quick_check`: `ok`.
- Current schema has no Team governance tables and no existing audit-history triggers. All 19 metadata/integrity queries reported `changed_db=false` and `changes=0` (initial 10 plus 9 foreign-key inspections).
- A D1 time-travel bookmark endpoint returned a bookmark. The bookmark alone is **not** a fresh export, restore rehearsal, or durable Owner-retained backup.

## Existing retained evidence (not fresh)

- Accepted encrypted backup workflow run: https://github.com/VTholdings/creatorloop-main-site/actions/runs/37242966914 (2026-10-04).
- Encrypted immediate artifact `11317931861` and Owner-transfer artifact `11317109290` are **not expired**, each showing retention through `2027-01-02` in the GitHub artifact metadata as inspected 2026-11-07.
- The historical backup was verified at its original gate; its October 4 snapshot cannot substitute for a fresh pre-migration backup in November.

## Live delivery and security boundary

- Pages production and preview currently bind to the **same D1 database**. Do not exercise migration or employee-lifecycle tests on the preview as though isolated.
- Cloudflare Access application `CreatorLoop Operations Console` protects `ops.creatorloop.net`; a separate Access application protects the control-system integration path. Preserve both policies and audiences.
- The current hosted console has **not** been updated with this candidate. This is one permanent console target, not a preview release.

## Required gates before any production write/merge

1. Obtain a low-activity backup window and the exact protected Owner authorization; use the existing controlled encrypted export mechanism. Do not assume operator inactivity.
2. Capture a **fresh** encrypted D1 backup, verify retained Owner copy and restore, compare all original records/attribution, run `scripts/team-migration-preflight.py` against the authenticated fresh SQL export, and retain signed/hash receipts.
3. Verify the exact current live schema and a supported **single atomic D1 execution** with deferred foreign keys and interrupted-execution rollback. Preserve the current bookmark as part of protected recovery evidence; it does not replace backup.
4. Execute only unapplied reviewed migrations in order, with an approved protected release run. Verify post-migration identity/audit row equality, FK integrity, immutable triggers, and registration before code deployment.
5. Validate separate TRAINING admission and production Cloudflare Access identities, real signed individual admission/revocation provider ports, and hosted lifecycle/role tests. No synthetic test grants live access.
6. Review release SHA, CI, source sync, Operator Readiness, and deploy to `main` only through the protected approved path; confirm `ops.creatorloop.net/console/` serves the approved SHA. Never substitute a preview URL.

**Decision:** `PRODUCTION_WRITE_HOLD`. This receipt authorizes no migration, secret access, policy modification, employee admission, deployment, or PR merge.
