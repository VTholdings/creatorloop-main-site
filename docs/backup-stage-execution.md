# Protected encrypted backup and local rehearsal stage

The Owner's [dated authorization](acceptance-exceptions/2026-10-04-backup-stage-authorization.md) now supplies the export scope and 90-day retention decision. Workflow: `.github/workflows/acceptance-backups.yml`, branch `team-access-directory`, protected environment `creatorloop-acceptance`. PR #18 remains draft.

## Before approving

1. Generate a unique random password of at least 32 characters in your password manager. Keep it as the CreatorLoop backup decryption key in Owner-controlled storage, independently of GitHub. Do not reuse the Cloudflare token or send this key through ChatGPT.
2. In repository **Settings → Environments → creatorloop-acceptance → Environment secrets**, add `CREATORLOOP_BACKUP_PASSPHRASE` with that password. Do not alter the existing Cloudflare secret, reviewers, branch restriction or administrator-bypass setting.
3. Start a controlled window with no active operator use of either database. Open the prepared run, choose **Review deployments**, select `creatorloop-acceptance`, enter exactly `BACKUP_WINDOW_NO_ACTIVE_OPERATORS` as the review comment, and choose **Approve and deploy**. This attests the window; GitHub's button label does not authorize deployment. Keep operator use paused until both exports complete or the job stops.

The implementation refuses absent/short encryption keys before any Cloudflare read/export, refuses another reviewer/comment/environment, fences an obsolete SHA and refuses run attempts after the first. Do not blindly rerun an export job, especially after uncertain initiation. Reconcile retained evidence and stage a new individually approved request if necessary.

## Executed scope

- Run existing read-only infrastructure verification against the exact current main/release SHA; require a clean metadata result before exports.
- Export the two pinned databases sequentially, TRAINING then PRODUCTION. Each environment has one initiation and bounded polling of its returned bookmark, never a new initiation as a retry. GET download sends no Cloudflare/GitHub credential and accepts only HTTPS Cloudflare R2 download hosts without redirect.
- Retain database IDs, export timestamps, SHA-256 hashes and request statuses without SQL contents, token values, provider messages, bookmarks or signed URLs in logs.
- Use the existing in-memory retention verifier on each full export. Encrypt even partial captured evidence for investigation if a later step fails. No failed/partial capture is accepted as a completed backup gate.
- Include the three original sanitized correction/current-state/forensic evidence artifacts in the encrypted bundle. Their original GitHub artifact identities/digests remain in the historical record.
- Encrypt the private ZIP with AES-256-GCM, a fresh random salt/nonce, and a scrypt-derived key. Upload only ciphertext and its checksum as the immediate Actions copy, requesting 90 days and corroborating actual artifact expiry through GitHub metadata. Stop if effective retention is shorter.
- Download that exact artifact by ID into a separate location, check its checksum, authenticate/decrypt it, independently restore SQL into memory and compare against the original retention manifests. Then rehearse pending Team migrations locally with the existing preflight. No live import/restore, SQL query, schema change or migration endpoint is called.
- Prepare a second authenticated encrypted Owner transfer bundle with exports, metadata, original/restore manifests and preflight receipts, also retained in Actions for 90 days. A failed restore/rehearsal remains failed even if its evidence bundle is uploaded successfully.

Only export/polling uses POST, at the two fixed D1 export paths. All other Cloudflare calls remain the established read-only checks or unauthenticated GET download. Provider errors, unknown outcomes, changed bookmarks, size/deadline limits, unsupported exports, failed checksums, wrong keys, failed integrity/foreign keys, schema/row drift and storage-retention mismatches stop acceptance. No virtual table deletion, lossy-export workaround, token change or weaker preservation rule is implemented. Local equality alone cannot detect provider-side export omissions or precision loss; those documented export limitations remain part of later live database corroboration.

## Owner transfer after the run

Download the **creatorloop-encrypted-owner-transfer-FULL_SHA** artifact from the successful run and retain the whole artifact ZIP in Owner-controlled off-platform storage for at least 90 days, with restricted access. Keep the decryption password separately. Confirm the retained copy's ciphertext checksum matches the included `.sha256` file. This step creates the actual second retained copy; preparing it on GitHub alone does not.

For a future authorized local restore, unzip the artifact, verify `owner-transfer.clbackup.sha256`, securely supply the password as `CREATORLOOP_BACKUP_PASSPHRASE`, and use the repository's `scripts/backup-envelope.mjs decrypt` utility to obtain the private ZIP. Node 22 and Python 3 support the supplied tooling. Keep decrypted SQL out of source, public folders and logs. Inspect the encrypted receipts for exact migration hashes and release SHA; never use this utility to import into remote D1.

## Remaining hold

The workflow's success establishes fresh captured exports, verified artifact retrieval and local restore/rehearsal evidence. It does not prove Owner off-platform storage, external report retention, actual D1 transaction/atomicity behavior, individual admission, live lifecycle, synchronization or Operator Readiness certification. Those gates and the unresolved historical anomaly remain visible in release review. Stop before remote migrations and obtain separate Owner authorization for the exact later operation.
