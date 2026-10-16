# CL-EX-20261004-01 — historical training preservation anomaly

Recorded on 2026-10-04 under the Owner's instruction to retain this investigation and determine a bounded acceptance exception. Reviewed source: PR #18, `238802e98a8519060807751690584863f4c77fdc`.

## Disposition and authority

**Historical anomaly: OPEN / UNRESOLVED. Progression exception: limited to preparation for the backup, independent local restore and migration rehearsal gate. Release exception: NOT APPROVED.**

The Owner's conditional instruction permits this preparation after assessing the exception's scope. It does not certify preservation of the original Pages configuration. No field is classified as provider normalization. The original correction remains failed; its evidence and status are not rewritten. No workflow or application reads this document to suppress a failure.

This exception addresses missing historical evidence for one identified training PATCH. It does not cover current infrastructure discrepancies, failed backups/restores, future writes, individual admission, lifecycle testing, synchronization, retention or certification. Preparation can proceed because it does not change the affected configuration or rely on historical preservation being proven. Performing remote exports still requires the separately controlled backup gate below.

## Retained investigation record

| Evidence | Finding | Retained reference |
|---|---|---|
| Training correction | One training PATCH returned HTTP 200. Approved values read back correctly; strict unrelated-configuration comparison failed with `UNAPPROVED_TRAINING_CONFIGURATION_CHANGED`. | [Run 37228580254](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37228580254), artifact 11312552587 |
| Subsequent read-only verification | Current approved training production/preview bindings matched; previously observed production settings and Access policy hashes were unchanged. This is limited metadata evidence. | [Run 37228580212](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37228580212), artifact 11312632678 |
| Bounded forensic investigation | Token and both project GETs returned 200. Both audit GETs returned 403/code 10000. Structural candidates did not reproduce the original configuration hash. Before configuration was not recovered; observed production fields were unchanged. | [Run 37229874499](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37229874499), artifact 11312688812 |
| Owner dashboard investigation | Owner reported a successful Pages `update`, resource `creatorloop-operator-training`, PATCH/200, API-token actor, at 2026-10-04 09:35:30 HST / 19:35:30 UTC. RAW REQUEST exposed metadata only; History exposed no changes for the available period. No request body or old/new configuration values were available. | Owner report in this project's 2026-10-04 acceptance conversation; independently reported, not fetched by the runner |

Verified artifact ZIP SHA-256 fingerprints, in the same order as the three runs above:

- `521b41d7a0c36d03e13bdd23d8254ddc11372b6390b65cb2a1cf203878ee3322`
- `c36fc95acfaa0fe7e5e350cf05fb0df9de8716d969712aa71974cba8992a80b2`
- `142093be5f3d2feecef471644eaf1870901c9f721764368eea7ddb7351ae869d`

This versioned record preserves the findings and artifact identity. Original sanitized artifacts remain in protected Actions storage under their existing 14-day retention; that storage is not a permanent evidence-retention policy. Before they expire, retain them in the Owner-approved protected release-evidence destination and verify these fingerprints. Do not publish provider bodies, credentials, personnel data or signed download URLs in source, logs or ordinary artifacts.

## Limits of the finding

Exact unrelated field and before/after values remain unknown. A successful PATCH does not prove unrelated configuration was preserved. Unchanged recorded production fields/policy hashes do not prove the entire production configuration was unchanged. Neither inference may be upgraded to PASS.

To resolve the anomaly, recover a trusted original pre-PATCH configuration and an attributable post-PATCH response, or provider-side before/after evidence capable of corroborating the original preservation hash. A fresh snapshot, export or restore cannot recreate that missing historical proof. If recovered evidence shows an unintended security or configuration change, stop progression and obtain a specific correction decision.

## Controls retained

- `training-pages-correction.mjs` retains its exact unrelated-configuration comparison and stale-state fence. No hash exclusion, normalization allowance, bypass, retry or rollback is introduced.
- No exception is automatically inherited by another write, environment, person or release. Future mismatches fail closed and require their own investigation.
- Before any future configuration write is separately approved, prepare protected before/after evidence capture with sanitized field-level differences; retain full comparison material only in approved protected storage. Do not repeat the historical missing-baseline condition.
- PR #18 and PR #17 remain unmerged; PR #18 remains draft. Remote migrations, configuration writes, production deployment and Operator admission remain separately held.
- Live Lifecycle, Operator Readiness and Infrastructure Production certification for this change remain pending/not certified. This record is not certification evidence for those gates.

## Next controlled gate

Proceed with [the prepared backup-stage request](../backup-stage-request.md), reusing the existing preflight and retention verifiers. Fresh exports, actual protected storage retrieval and independent local restore comparison remain unexecuted. The storage/retention decision and explicit export approval must precede any export API call. Revalidate current metadata at that stage; stop on new drift or any failed comparison.

Preserve this record. Later authorization, recovered evidence or closure must be recorded in a linked, dated follow-up rather than deleting or replacing these historical findings.
