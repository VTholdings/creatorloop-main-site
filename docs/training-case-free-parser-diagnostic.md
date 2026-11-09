# Protected corrected-trigger parser acceptance

System destination: `VTholdings/creatorloop-main-site`, existing draft PR #18 on draft PR #17, branch `team-access-directory`, unchanged protected environment `creatorloop-acceptance`. This distinct protocol does not rerun or repin the closed historical parser/migration executors. It is TRAINING-only, zero-write parser verification; no migration executes.

The original CASE-free patch is published at `fc5325e2acb26bc8edec1ccb77db86187e6494f7`. Its predicates, error strings, ABORT behavior, order, roles, schema, lifecycle, history and stale-permission/report protections remain unchanged. Local equivalence and migration/rollback tests are separate from private D1 parser acceptance.

## Fixed requests

Three complete, hash-pinned statements are copied byte-for-byte from the corrected migrations and prefixed only with `EXPLAIN `:

| File | Trigger | Rewritten guards |
| --- | --- | --- |
| 0006_audit_history.sql | audit_events_snapshot | 1 |
| 0007_team_governance.sql | audit_events_snapshot | 1 |
| 0007_team_governance.sql | finalized_report_version_guard | 4 |

Each uses the four previously tested shapes: single sql, one-entry batch, separate batch entries with `EXPLAIN SELECT 1;`, and joined EXPLAIN statements in one batch entry. All params arrays are empty. Maximum: **12 probe POSTs and 13 snapshot POSTs = 25 requests**. There is no arbitrary SQL, caller-defined target/body, retry, redirect, trigger-name cleanup or migration submission. The audit trigger bodies contain their existing INSERT logic, but it remains inside a complete EXPLAIN CREATE TRIGGER statement; no trigger is installed or fired.

Target is only TRAINING D1 `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0`, account `2a3b96a0b37850cd03107131baa66b6d`. The credential remains in the existing environment and is injected only into the protected step. No new credential/scope, environment, approval rule, production permission or diagnostic-lane cutover is introduced.

Before the first probe and after every normally returned probe observation (including a provider rejection), the unchanged 18-entry SELECT-only snapshot batch compares full schema fences, counts for the 15 allowlisted tables and exact migration registrations with the hash-verified rollback receipt from closed run 37358040555. Transport, malformed-response or validation failures stop immediately without falsely marking preservation. That receipt is a preservation baseline only; its old migration hashes and approvals do not authorize corrected SQL. Corrected files separately require their new exact hashes. No encrypted backup, passphrase, production artifact or private record export is opened.

Every successful result must be successful and bounded, and explicitly report numeric `rows_written=0` and boolean `changed_db=false`. Probe results must contain EXPLAIN VM evidence. Snapshot counts must retain exact ordering, safe numeric counts and both schema fences. A failed provider response or validation is fatal; no failure is reinterpreted as migration/parser success. Error evidence retains numeric HTTP status, bounded numeric provider codes, envelope/category, exact sanitized error-message hash and response-body hash. Metadata availability is reported independently. A successful subsequent snapshot can establish independent schema/count/registration preservation for a rejected probe, without inventing zero-write metadata for that failed response. These checks do not prove every application row value unchanged.

All twelve probes and thirteen preservation snapshots must pass for `CASE_FREE_PARSER_DIAGNOSTIC_COMPLETE`. Attempted and successful probe counts remain distinct, including blocked/malformed probe responses. Sanitized evidence excludes SQL text, VM rows, raw messages, tokens and record values. ZIP integrity/digest must be verified when collecting the terminal artifact.

## Retained authorization gates

Only attempt-1 push runs of `.github/workflows/acceptance-training-case-free-parser.yml` on the exact repository/branch are eligible. The separate authorization module is an exact renamed copy of the existing protected parser authorization: same numeric Owner 245245322, independently recorded Owner environment review, unique exact unedited PR #18 comment after run creation, **60-minute nonrenewable expiry**, current branch/main/checkout/run/SHA fences and replay refusal. An old protocol/comment/run, rerun, stale branch, edited comment or expiry makes no Cloudflare request. Every request is fenced again. Existing workflow permissions remain contents/actions/issues read only.

Chief supplies the fresh run/SHA with this four-line attestation:

```text
CREATORLOOP_TRAINING_CASE_FREE_PARSER_DIAGNOSTIC_V1
run=<fresh attempt-1 run ID>
sha=<full published SHA>
attestation=TRAINING_CASE_FREE_EXPLAIN_ONLY_NO_WRITES
```

The Owner posts the exact saved comment to PR #18 and provides its direct link for independent verification. The existing required `creatorloop-acceptance` environment review remains an Owner action after that verification. Routine standing engineering authority does not alter that enforced environment rule. No prior environment approval is reused. The separate TRAINING lane security proposal remains proposal only.

Production access/writes/migrations/deployment, any actual migration write, restore, PR merge, admission, activation and later gates remain held. Older test-triggered historical jobs must not be approved for these corrected files; their original hash pins refuse them before Cloudflare I/O. Diagnostic completion certifies only the tested private parser path, not migration execution, hosted lifecycle acceptance or production readiness.
