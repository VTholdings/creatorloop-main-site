# Training-only read-only parser diagnostic

> Historical protocol. Run [37541286670](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37541286670) completed and is closed. Its CASE/simple findings support a [pending migration correction](case-free-migration-correction.md). Original protocol hash pins remain unchanged and reject the corrected files before Cloudflare I/O; do not reuse old approvals or attestations.

System destination: draft PR #18 in `VTholdings/creatorloop-main-site`, branch `team-access-directory`, protected environment `creatorloop-acceptance`. Only training D1 `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0` is addressed. Run `37358040555` is closed and is not rerun.

The source is that run's sanitized rollback receipt, pinned by exact SHA-256 `551758939c0792d995197afb652204e33f7993395490c6bda32e600c65d4fa2e`. The recovered error text is `incomplete input: SQLITE_ERROR`, whose exact hash matches the retained provider error. All migration files remain unchanged; their original reviewed hashes are checked before Cloudflare access. No export, backup decryption, migration execution, production receipt or production endpoint is used.

## Fixed comparisons

All trigger probes use this header, an unused diagnostic name and the existing training identity table:

```sql
EXPLAIN CREATE TRIGGER cl_parser_explain_only BEFORE UPDATE ON operators
```

Each of these three bodies is tested once with a newline before ` BEGIN`, and once on a single line. Every form ends in ` END;`.

| Kind | Body |
| --- | --- |
| simple | `SELECT RAISE(ABORT,'Team history is append-only');` |
| case | `SELECT CASE WHEN NEW.id IS NULL THEN RAISE(ABORT,'DIAGNOSTIC_ONLY') END;` |
| multi_case | `SELECT NEW.id; SELECT CASE WHEN NEW.id IS NULL THEN RAISE(ABORT,'DIAGNOSTIC_ONLY') END;` |

The six complete EXPLAIN variants each use four shapes, for 24 bounded observations. All `params` arrays are empty:

1. `single_sql`: `{sql: variant, params: []}`.
2. `single_batch`: `{batch: [{sql: variant, params: []}]}`.
3. `separate_batch`: one batch with `EXPLAIN SELECT 1;` and the variant as two separate entries.
4. `joined_batch`: one batch entry containing `EXPLAIN SELECT 1;`, a newline and the complete variant.

Nothing creates or fires a trigger. EXPLAIN returns VM instructions instead of executing the underlying DDL. No PRAGMA, SQL input parameter, original migration SQL, INSERT, UPDATE, DELETE, ALTER, DROP, transaction command or cleanup write is submitted as an executable statement. Trigger bodies contain only SELECT expressions. No request may be replayed, redirected or retried.

Before the first probe and after every observation, a fixed SELECT-only batch reads the complete schema (including the exact provider object), counts of all 15 original application tables, migration versions, and a schema end fence. All must match the accepted rollback receipt; there is no additional normalization. The unused diagnostic name cannot exist in that exact schema. Success responses must report zero rows written and `changed_db=false`. Error responses retain numeric HTTP status separately, bounded numeric provider codes, a fixed error category and the exact message hash; raw messages, SQL response rows and record values are not published. Rejected requests without write metadata are explicitly marked as such, never represented as provider-certified zero writes. Subsequent SELECT evidence separately proves schema/count/registration preservation.

Only recognized incomplete-input or statement-count parser rejections (code 7500, HTTP 200/400) are comparison observations. Authentication, unsupported EXPLAIN, other provider errors, timeout, malformed/oversized response, missing write metadata, state drift or stale authority block the run immediately without retry or correction. Results establish parser behavior only; they do not authorize or certify migrations.

## Owner attestation and separate approval

Chief supplies the final tested SHA, fresh first-attempt run and these exact four lines with actual values:

```text
CREATORLOOP_TRAINING_PARSER_DIAGNOSTIC_V1
run=<new run ID>
sha=<full tested SHA>
attestation=TRAINING_EXPLAIN_ONLY_NO_WRITES
```

Post them manually under **PR #18 → Conversation → Add a comment**. Confirm the comment is saved and provide its direct link. Chief verifies the exact saved text, numeric Owner identity, PR, run, SHA, unique unedited comment and expiry. Only after that confirmation approve the run through **Review deployments → creatorloop-acceptance → Approve and deploy**. The workflow does not deploy anything. Environment review comments are not used.

The comment must be posted after run creation and expires 60 minutes after posting. Before every Cloudflare request, recheck the matching attempt-1 push workflow, independent Owner environment approval, saved PR comment and current branch/main. A rerun or changed/expired attestation is rejected. Missing approval or attestation prevents all Cloudflare requests. The token stays in the existing environment secret and is delivered only to the protected diagnostic step.

Only sanitized `training-parser-evidence/TRAINING.json` is retained, with requested 90-day artifact retention. PR #18 remains draft. Migration/corrective writes, restore, production access, deployment, merge and every later gate remain held.
