# CASE-free pending migration correction

System destination: `VTholdings/creatorloop-main-site`, draft PR #18, branch `team-access-directory`. Local correction and CI only; live migration writes remain held.

Diagnostic [37541286670](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37541286670) completed 24/24 EXPLAIN probes: eight simple-body requests accepted, sixteen CASE-body requests rejected (HTTP 400, code 7500, INCOMPLETE_INPUT). All 25 independent schema/count/registration snapshots matched the verified rollback source. The completed run and its attestation remain closed.

## Exact syntax correction

```sql
-- Original
SELECT CASE WHEN predicate THEN RAISE(ABORT,'message') END;
-- Corrected
SELECT RAISE(ABORT,'message') WHERE predicate;
```

Exactly six statements change. Predicate bytes, ABORT behavior, error messages, trigger firing conditions and statement order stay identical. TRUE raises; FALSE and NULL do not evaluate RAISE. No new coercion or permission rule is introduced. The exact-change test reconstructs the corrected files from original hash-verified test fixtures and rejects any additional edit.

| File / trigger | Error message | Unchanged predicate |
| --- | --- | --- |
| 0006 / audit_events_snapshot | Audit identity snapshot required | `NOT EXISTS(SELECT 1 FROM console_audit_actor_snapshots WHERE event_id=NEW.id)` |
| 0007 / audit_events_snapshot | Audit identity snapshot required | Same snapshot-existence predicate |
| 0007 / finalized_report_version_guard, first | Finalized report requires Owner authority | `NOT EXISTS(SELECT 1 FROM operators WHERE id=NEW.operator_id AND login_email='team@creatorloop.net' AND role='ADMINISTRATOR' AND account_status='ACTIVE')` |
| 0007 / finalized_report_version_guard, second | Finalized report requires valid JSON | `json_valid(NEW.new_value)=0` |
| 0007 / finalized_report_version_guard, third | Finalized report metadata is required | Full metadata predicate below |
| 0007 / finalized_report_version_guard, fourth | Finalized report must supersede the latest version | Full version-chain predicate below |

0005 is byte-for-byte unchanged. Order and intent remain 0005 → 0006 → 0007. All append-only/no-replace guards and the stale-permission transaction guard are unchanged. Lifecycle, scope, role, audit attribution and Owner-only finalized-report requirements remain in force.

## Local verification

- **319/319 full-suite tests passed**, no failures/skips/cancellations. This includes migration preflight, rollback, governance, audit, finalized reports, lifecycle, authenticated sessions, safe-save, source sync and historical authorization checks.
- Full `npm run check`, Node syntax checks for changed/new tests, and Python compilation of the new rehearsal helper passed.
- All six guard messages were tested with TRUE, FALSE, NULL, numeric and text coercion inputs. ABORT undoes preceding trigger effects and the failed UPDATE in both forms.
- Actual corrected migrations execute as **44 complete statements**, atomically in memory, with compound SELECT limit **5**, columns **100**, SQL length **100,000**, value length **2,000,000**, function arguments **32**, bound parameters **100**, and LIKE-pattern bytes **50**. Foreign keys and CHECK enforcement are enabled; ATTACH/DETACH are denied.
- All original table values and original registration timestamps remain preserved, including retired-actor audit history. Registration adds exactly 0005/0006/0007. Integrity/FK checks pass; deferral resets and operators_expanded is absent.
- Injected failures after 0005 and after all three migrations restore the exact original schema, every original row and registrations, with no open transaction/FK violation.
- A separate local check used the public Cloudflare Wrangler splitter at commit `fe607f9d7d35b377d5e272e8f946598e3812fe41`; it emitted the exact same 44 statements executed by SQLite. TypeScript was type-stripped locally; Error substituted for the trimmer's UserError on an unreachable transaction-wrapper branch. No public source is a runtime dependency.
- Splitter SHA256: `519578f75edb734fd1e23d70ffea03ca4b6817f90e2001696e8c0e3215a07de0`; trimmer SHA256: `6018a7715fddad3f853dc24de4e676e27030caca638ced3a9945a7ec5050580d`.

These local limits and the public client splitter do **not** reproduce or certify Cloudflare's private REST parser. No corrected SQL was sent remotely; remote acceptance is unverified.

| File | Corrected SHA256 |
| --- | --- |
| 0005_team_directory.sql | `2f7e412f7a7e55e0330e80cb7ba124bc3a31217a6b4bc4a4e99a12732d0a9693` |
| 0006_audit_history.sql | `5efb5f677c082bb8bc5ad2e5a8c326b51b1894d3935adf3c1153b3be80cf58ed` |
| 0007_team_governance.sql | `f6cc901cd01a51ce9b51a022ab1ad8746197c29d5876b81557b7d7ed494b0457` |

## Historical authorization stays closed

Historical parser/migration executors, private baseline preparation, workflow files, permissions and authorization/expiry/replay guards are unchanged. Their original hash pins and artifact/receipt digests stay historical; tests prove the corrected files are refused **before Cloudflare I/O**. Old evidence does not authorize new SQL.

Historical executor tests use the exact original fixtures and a private temporary source tree. Functional/governance/lifecycle tests and the new full migration rehearsal use actual corrected files. No old receipt is refreshed, no expired attestation is reused and no closed run is rerun. The [separate diagnostic-lane proposal](training-diagnostic-lane-security-proposal.md) changes no active security boundary. PR #18 remains draft; live writes, production, restore, deployment, merge, admission, activation and later gates remain held.

Sources: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [pinned public splitter](https://github.com/cloudflare/workers-sdk/blob/fe607f9d7d35b377d5e272e8f946598e3812fe41/packages/wrangler/src/d1/splitter.ts).

## Exact compound predicates

Finalized report metadata is required:

```sql
NEW.action NOT IN ('REPORT_FINALIZED','REPORT_SUPERSEDED')
 OR json_type(NEW.new_value,'$.version') IS NOT 'integer'
 OR json_type(NEW.new_value,'$.records') IS NOT 'array'
 OR COALESCE(json_extract(NEW.new_value,'$.dataset'),'') NOT IN ('creators','campaigns')
 OR COALESCE(length(trim(json_extract(NEW.new_value,'$.reason'))),0)=0
 OR COALESCE(length(trim(json_extract(NEW.new_value,'$.title'))),0)=0
 OR COALESCE(length(json_extract(NEW.new_value,'$.snapshotHash')),0)<>64
```

Finalized report must supersede the latest version:

```sql
NOT (
 (NEW.action='REPORT_FINALIZED' AND json_extract(NEW.new_value,'$.version')=1 AND NEW.previous_value IS NULL AND NOT EXISTS(SELECT 1 FROM audit_events WHERE object_type='FinalizedReport' AND object_id=NEW.object_id))
 OR (NEW.action='REPORT_SUPERSEDED' AND EXISTS(
 SELECT 1 FROM audit_events a WHERE a.id=NEW.previous_value AND a.object_type='FinalizedReport' AND a.object_id=NEW.object_id AND a.campaign_id=NEW.campaign_id
 AND json_extract(a.new_value,'$.dataset')=json_extract(NEW.new_value,'$.dataset')
 AND json_extract(a.new_value,'$.version')=json_extract(NEW.new_value,'$.version')-1
 AND NOT EXISTS(SELECT 1 FROM audit_events b WHERE b.object_type='FinalizedReport' AND b.object_id=a.object_id AND json_extract(b.new_value,'$.version')>json_extract(a.new_value,'$.version'))
 )))
```
