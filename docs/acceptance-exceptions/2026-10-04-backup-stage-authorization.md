# CL-EX-20261004-01 — linked backup-stage authorization

This dated follow-up preserves [the original historical anomaly record](2026-10-04-training-preservation.md). It does not change that record's unresolved finding, certify preservation, approve normalization or relax a future write guard.

On 2026-10-04 the Owner explicitly authorized fresh TRAINING and PRODUCTION D1 exports; 90-day retention; an immediate protected Actions copy; preparation of a second copy for Owner-controlled off-platform storage; and execution only during a controlled low-activity window with no active operator use. The Owner authorized export/verification and subsequent restore verification/local migration preflight/rehearsal, excluding remote migrations, schema changes and production deployment.

The source repository is public, as verified through GitHub repository metadata. Environment approval does not make its artifacts confidential. The prepared implementation therefore uploads only authenticated encrypted bundles, never unencrypted exports or detailed retention manifests. A separate Owner-controlled encryption key is required before any Cloudflare export call; it must be securely stored in the protected GitHub environment and independently retained by the Owner. No token replacement, broader permission or production configuration change is required.

The existing `creatorloop-acceptance` approval remains required. The workflow separately checks that `Creatorloopzone` supplied the exact `workflow_dispatch` input `BACKUP_WINDOW_NO_ACTIVE_OPERATORS` for this first-attempt run and approved the protected environment. Review comments are not used; see [the replacement gate](2026-10-04-backup-dispatch-authorization.md). Only the Owner can establish the actual no-use window; neither a workflow approval nor this record constitutes telemetry proving no users are active. Do not approve unless that operational condition is true for both databases.

The [execution guide](../backup-stage-execution.md) identifies the exact controls and the remaining key-custody/approval action. An encrypted transfer bundle is preparation, not evidence that the Owner has actually retained the second copy off-platform. Confirm that copy and the associated decryption key are independently retained for at least 90 days before claiming the off-platform retention gate complete.

Remote migrations, production deployment, release certification and Operator Readiness remain separately held. This authorization is scoped to this backup stage and cannot be reused for a configuration correction or remote restore.
