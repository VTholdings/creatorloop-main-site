# Gate 2 request — isolated training D1 atomicity and rollback verification

This is a proposed authorization, not execution approval. No Gate 2 workflow or live test is launched by this document. PR #18 remains draft. An executable Gate 2 commit must be locally tested and presented with its exact SHA and protected run link before the Owner releases any write-capable job.

## Verified prerequisites

Training Gate 1 run `37248108426` passed 21 bounded checks at `adfaadbdaa1d7348670761083f71da39a5d725ff`. Production Gate 1 run `37251935281` passed 22 bounded checks at source baseline `9744c6cd64c2ac0691184243a7051b49185b2004`.

Production receipt artifact `11322070166` has verified archive SHA-256 `5d74ea4c52188effb27851931b7e1b2df81eaf88084a5f86efd8c2f2103168f7`. All checks matched, every read reported zero writes and unchanged database metadata, no blockers were reported, and the receipt completed `2026-10-05T01:43:34.894Z`. Its `atomicExecutionCertified` remains false. Pending migrations `0005`, `0006`, `0007` remain unapplied. Completed backup acceptance is not reopened.

## Exact proposed target and scope

Account `2a3b96a0b37850cd03107131baa66b6d`; environment **TRAINING only**; database `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0`. The future executor must reject production or any substituted account/database before a network call. No production database may be queried or written in Gate 2.

Use the documented D1 REST `/query` batch mechanism through the protected GitHub runner. The request body and SQL phases must be fixed and reviewed; no arbitrary SQL, credentials, table names or endpoints may be supplied as inputs. No Worker, Pages deployment, new database or existing application executor activation is needed. PASS will certify this tested D1 batch path; bound application/lifecycle acceptance remains a later gate.

The test changes only ordinary, persistent synthetic fixtures under an ASCII-safe namespace derived from the exact run ID, first attempt and release SHA: `cl_g2_<run>_1_<sha-prefix>_...`. These are not connection-local SQL TEMP tables, real migration objects or application audit/history tables. A collision with any existing name blocks before writes. No migration file is executed and the actual `schema_migrations` table is read-only.

Required fixtures: synthetic parent and FK child, a synthetic migration-registration table, an append-only synthetic history table with UPDATE/DELETE denial triggers, and two schema objects created only inside intentionally failing batches. No human identity, creator record, campaign, actual audit event or finalized report may be changed. No fixture FK or trigger may reference an existing application object.

## Reviewed test sequence

1. Require separate Owner protected-environment approval and a fresh, run/SHA-bound training-window attestation that no training operators are active. Use auditable dispatch input or an explicitly verified Owner PR attestation; do not rely on deployment-review comments. Keep first-attempt, expiry, replay and stale-branch/main fencing. Secrets stay in `creatorloop-acceptance`; no new secret or broader permission is requested.
2. Before the first fixture write, corroborate the completed Gate 1 receipts, current original training schema/registration and guard definitions, migration hashes, foreign-key enforcement, namespace absence, and a bounded private fingerprint snapshot of all existing application data. Stop if the bounded snapshot cannot prove the required history preservation; row counts alone are insufficient. Publish only hashes/counts, never operational data or SQL exports. Confirm an available D1 write permission through the controlled operation; a denial blocks without credential changes.
3. Create the synthetic fixture schema and seed its synthetic history using one reviewed batch. Verify the exact created objects and seed before proceeding. Record each object as owned by this run and exact SHA; no wildcard cleanup or `IF EXISTS` adoption of pre-existing objects.
4. Demonstrate a successful atomic batch that sets transaction-local `PRAGMA defer_foreign_keys=ON`, inserts a child before its parent, repairs that FK within the same batch, and inserts synthetic migration/history markers. Verify all expected rows and zero FK violations. Verify deferral is reset afterward and foreign-key enforcement remains enabled. Never use `PRAGMA foreign_keys=OFF`.
5. Demonstrate deferred-FK failure at transaction completion: create a synthetic schema object, insert synthetic registration/history markers and an unresolved FK child in one batch. Require the expected FK failure; immediately verify the entire fixture schema and data equal their pre-batch state and no failed schema/registration/history marker survived.
6. Demonstrate an intentional statement failure: stage another synthetic schema object, registration/history markers and a synthetic parent update, then attempt a forbidden change to the synthetic immutable-history seed. Require the specific denial-trigger failure. Verify the original history seed remains, no staged markers or schema object remain, and all fixture data equal their pre-batch state. No real audit/history protection is relaxed to obtain a result.
7. Only after both failed batches' rollback evidence is captured and matched, remove this run's successful fixtures using a fixed, dependency-ordered cleanup batch. Verify owned object definitions and run identity immediately before cleanup. Drop the synthetic child before its parent; removing the synthetic history fixture also removes only its own test triggers. This narrow Owner-controlled fixture cleanup does not grant any ability to remove application audits or finalized reports.
8. Require final namespace absence, complete original schema/registration/guard equivalence, enabled FK enforcement/reset deferral, and unchanged private fingerprints of all original application records, including historical attribution/reports. Preserve a sanitized receipt with SHA/run/database/phase/SQL-plan hashes, expected failure classifications, before/after hashes, cleanup status, timing, approval/attestation evidence and remaining holds.

## Rollback and failure boundary

Cloudflare documents D1 batches as transactions and documents transaction-local FK deferral. Gate 2 tests those claims; it does not assume they passed. Do not submit unsupported explicit transaction commands or compensate for a broken transaction by reversing application data.

Verify rollback immediately after each expected failure and **before cleanup**. Any partial schema, synthetic registration or synthetic history change is a Gate 2 FAIL. Preserve evidence and stop; do not delete partial results to manufacture PASS. Unexpected error, timeout, uncertain write outcome, stale authorization, mismatched ownership or unsafe cleanup also blocks, with no write retry, automatic restore, rollback script or broad sweep. Record any remaining run-owned fixtures for a separate bounded Owner recovery decision. Cleanup is not guaranteed after cancellation/network failure and cannot be inferred from a failed request.

## PASS criteria and authority limit

PASS requires all successful-batch expected changes to commit together; verified FK deferral and repair; correctly classified unresolved-FK and immutable-history failures; exact post-failure fixture schema/data equality; no partial schema/registration/history effects; unchanged original application data/schema/guards; completed narrowly owned fixture cleanup; no namespace leftovers; no production access; and complete attributable sanitized evidence. Missing evidence or preservation drift blocks.

No production write/migration/inspection, real training migration, remote restore, application data mutation, Access/binding/configuration change, deployment, merge, admission activation or later acceptance gate is authorized. Gate 2 PASS does not authorize the next operation.

## Owner authorization and run step

Post a Gate 2-only scope authorization on PR #18 referring to this plan and its commit SHA. After that scope approval, prepare and locally validate the isolated executor and present its **new exact execution SHA and protected run link**. Before execution, the Owner must confirm the training window through the reliable attestation mechanism and approve **Review deployments → creatorloop-acceptance → Approve and deploy** for that precise run. No deployment-review comment is required or used. Do not approve or rerun either Gate 1 workflow for Gate 2.

Sources:

- [D1 Database batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 foreign-key deferral](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- [D1 REST query/batch request boundary](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
