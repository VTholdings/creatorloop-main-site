# Protected encrypted backup and local rehearsal stage

The Owner's [dated authorization](acceptance-exceptions/2026-10-04-backup-stage-authorization.md) now supplies the export scope and 90-day retention decision. Workflow: `.github/workflows/acceptance-backups.yml`, branch `team-access-directory`, protected environment `creatorloop-acceptance`. PR #18 remains draft.

## Start a fresh Owner-attested run

The existing `CREATORLOOP_BACKUP_PASSPHRASE` has passed the protected delivery/threshold check. Keep that secret and the existing Cloudflare secret unchanged. Keep the independently retained backup password in Owner-controlled storage; never put either secret in an input, source, command argument or ChatGPT.

1. Confirm a controlled window with no active operator use of either database. Keep operator use paused until both exports complete or the job stops.
2. Manually dispatch `.github/workflows/acceptance-backups.yml` on `team-access-directory`, signed in as **Creatorloopzone**. Supply `low_activity_attestation` exactly `BACKUP_WINDOW_NO_ACTIVE_OPERATORS`, and `expected_release_sha` as the full current, reviewed PR #18 HEAD. Neither input has a default. Invalid or missing input fails validation before the environment approval is requested.
3. On that **fresh** run choose **Review deployments → creatorloop-acceptance → Approve and deploy**. A review comment is optional and is never authorization evidence. GitHub's button label does not authorize deployment. Approve within 60 minutes of dispatch; an expired attestation needs a fresh window and dispatch, never a rerun.

The backup workflow has already run and is registered in Actions. The workflow lives on the held PR branch, not `main`. GitHub's **Run workflow** UI is generally exposed for default-branch workflows; do not merge the PR or alter the default branch to expose it. Use GitHub's branch-targeted dispatch API/CLI for the existing registered workflow when the button is unavailable:

```sh
gh workflow run acceptance-backups.yml \
  --repo VTholdings/creatorloop-main-site \
  --ref team-access-directory \
  -f low_activity_attestation=BACKUP_WINDOW_NO_ACTIVE_OPERATORS \
  -f expected_release_sha=FULL_REVIEWED_PR18_HEAD
```

Run this using an existing secure GitHub session authenticated as `Creatorloopzone`; it contains no secret. If GitHub refuses dispatch of this registered branch workflow, retain the exact error and stop. Do not enable a push export fallback, change the repository's default branch, introduce a credential or merge anything. A workflow registration adjustment would require a separately reviewed repository action.

Pushes now perform validation only and never request the protected backup job. The runner reads the dispatch input from `GITHUB_EVENT_PATH`, checks exact equality without trimming or shell evaluation, and checks Owner identity by login and numeric GitHub ID. It corroborates the current run's event, ID, first attempt, actors, workflow path, repository, branch and SHA through GitHub's API. It independently requires the Owner's recorded approval of `creatorloop-acceptance`; missing or rejected approval fails closed even with valid input. GitHub review comments are no longer used.

The accepted non-secret receipt is recorded in the job log and run summary and retained inside encrypted export evidence: exact attestation, Owner identity, run ID, SHA, environment ID, dispatch/validation/expiry timestamps and confirmation that the review comment was unused. The input belongs to this fresh event; it cannot authorize a push or a rerun. The existing encryption-key, environment and export-target guards remain. Both branch HEAD and main SHA are corroborated before infrastructure checks and again before each export; the 60-minute attestation deadline is also rechecked before each export. A moved ref, expired window or uncertain export outcome stops capture. Do not blindly retry an export job.

## Executed scope

- Run existing read-only infrastructure verification against the exact current main/release SHA; require a clean metadata result before exports.
- Export the two pinned databases sequentially, TRAINING then PRODUCTION. Each environment has one initiation and bounded polling of its returned bookmark, never a new initiation as a retry. GET download sends no Cloudflare/GitHub credential and accepts only HTTPS Cloudflare R2 download hosts without redirect.
- Retain database IDs, export timestamps, SHA-256 hashes and request statuses without SQL contents, token values, provider messages, bookmarks or signed URLs in logs.
- Use the existing in-memory retention verifier on each full export. Encrypt even partial captured evidence for investigation if a later step fails. No failed/partial capture is accepted as a completed backup gate.
- Include the three original sanitized correction/current-state/forensic evidence artifacts in the encrypted bundle. Their original GitHub artifact identities/digests remain in the historical record.
- Encrypt the private ZIP with AES-256-GCM, a fresh random salt/nonce, and a scrypt-derived key. Upload only ciphertext and its checksum as the immediate Actions copy, requesting 90 days and corroborating actual artifact expiry against both artifact and run creation through GitHub metadata. Report the exact expiry and anchor; stop if neither supports the 90-day policy. A run-based expiry does not imply 90 full days after upload/capture. The independent Owner copy still requires at least 90 days from capture.
- Download that exact artifact by ID into a separate location, check its checksum, authenticate/decrypt it, independently restore SQL into memory and compare against the original retention manifests. Then rehearse pending Team migrations locally with the existing preflight. No live import/restore, SQL query, schema change or migration endpoint is called.
- Prepare a second authenticated encrypted Owner transfer bundle with exports, metadata, original/restore manifests and preflight receipts, also retained in Actions for 90 days. A failed restore/rehearsal remains failed even if its evidence bundle is uploaded successfully.

Only export/polling uses POST, at the two fixed D1 export paths. All other Cloudflare calls remain the established read-only checks or unauthenticated GET download. Provider errors, unknown outcomes, changed bookmarks, size/deadline limits, unsupported exports, failed checksums, wrong keys, failed integrity/foreign keys, schema/row drift and storage-retention mismatches stop acceptance. No virtual table deletion, lossy-export workaround, token change or weaker preservation rule is implemented. Local equality alone cannot detect provider-side export omissions or precision loss; those documented export limitations remain part of later live database corroboration.

## Owner transfer after the run

Download the **creatorloop-encrypted-owner-transfer-FULL_SHA** artifact from the successful run and retain the whole artifact ZIP in Owner-controlled off-platform storage for at least 90 days, with restricted access. Keep the decryption password separately. Confirm the retained copy's ciphertext checksum matches the included `.sha256` file. This step creates the actual second retained copy; preparing it on GitHub alone does not.

For a future authorized local restore, unzip the artifact, verify `owner-transfer.clbackup.sha256`, securely supply the password as `CREATORLOOP_BACKUP_PASSPHRASE`, and use the repository's `scripts/backup-envelope.mjs decrypt` utility to obtain the private ZIP. Node 22 and Python 3 support the supplied tooling. Keep decrypted SQL out of source, public folders and logs. Inspect the encrypted receipts for exact migration hashes and release SHA; never use this utility to import into remote D1.

## Remaining hold

The workflow's success establishes fresh captured exports, verified artifact retrieval and local restore/rehearsal evidence. It does not prove Owner off-platform storage, external report retention, actual D1 transaction/atomicity behavior, individual admission, live lifecycle, synchronization or Operator Readiness certification. Those gates and the unresolved historical anomaly remain visible in release review. Stop before remote migrations and obtain separate Owner authorization for the exact later operation.
