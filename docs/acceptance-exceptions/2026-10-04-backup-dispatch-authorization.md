# Backup attestation mechanism replacement — 2026-10-04

Owner authorized replacement of unreliable deployment-review comments with an exact manual dispatch input plus the existing protected environment approval. This changes how the operational attestation is evidenced; it does not authorize exports during implementation, change the permitted backup scope, or authorize remote migration/restore/deployment.

## Retained failure evidence

Both [run 37237219473](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37237219473) and [run 37238287120](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37238287120) recorded Owner environment approval with `comment: ""` despite the Owner reporting entry of the required attestation. Both guards stopped with `OWNER_LOW_ACTIVITY_ATTESTATION_REQUIRED`, capturing zero of two exports before any Cloudflare call. The second run retained encrypted diagnostic evidence as artifact `11315629320`, SHA-256 `fa56157e6074a4b6cba3e323a6a764b281af881a236a68e53b68f08d7b41da17`. That artifact is not a database backup. The reason GitHub did not retain the entered comments remains undetermined. Do not repeat that mechanism or interpret the empty comment as proof the Owner omitted it.

## Revised substantive gate

- A fresh `workflow_dispatch` event must be initiated by GitHub user `Creatorloopzone`, numeric ID `245245322`, against `team-access-directory` in the existing repository. Exact `low_activity_attestation` input: `BACKUP_WINDOW_NO_ACTIVE_OPERATORS`. Exact `expected_release_sha`: the full reviewed branch HEAD. No input defaults, trimming, interpolation, comment fallback or push export fallback.
- An independent protected `creatorloop-acceptance` approval by that Owner is still required. Rejected, missing or unrelated approval blocks capture. Existing required-reviewer, disabled-bypass, restricted-branch and secret-custody settings remain.
- Validate the runner event and corroborate API run identity, attempt, actors, workflow path, repository, event, branch and SHA. Permit first attempts only. Require the attested branch SHA and observed main SHA to remain current; recheck before each export. The no-use attestation expires 60 minutes after dispatch and is rechecked before each export. Approval delays do not extend the window. A fresh dispatch/approval is required after expiry; do not rerun an export attempt.
- Record the accepted non-secret authorization receipt in the run summary/log and encrypted export evidence, including run ID, SHA, Owner identity, environment ID and dispatch/validation/expiry times. Never record raw invalid inputs, secrets or SQL in logs. GitHub comments are explicitly unused.
- Ordinary pushes run validation only. No export run was dispatched as part of implementing this change. The exact later Owner action is in [the execution guide](../backup-stage-execution.md).

The existing clean infrastructure precheck, pinned sequential exports, encryption validation, export uncertainty/no-restart rule, bounded downloads, 90-day artifact expiry check, independent retrieval, local restore comparison and local migration rehearsal remain unchanged. The unresolved historical Pages preservation anomaly and all migration/deployment/certification holds remain. The input expresses an Owner operational attestation; it does not fabricate telemetry showing no active operators.
