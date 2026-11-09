# Backup secret delivery investigation — 2026-10-04

Failed run: [37233765607](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37233765607), exact source `738fbd50177e0862197dc749a17572c5856026a0`, first attempt. The protected job actually started after approval. No exports were captured.

## Direct evidence

- The workflow job references environment `creatorloop-acceptance`. GitHub's review history corroborates that exact environment and an approval by `Creatorloopzone`.
- Both the capture and encryption steps reference `${{ secrets.CREATORLOOP_BACKUP_PASSPHRASE }}` under the identically named process variable. The executed revision matches the inspected source.
- Both steps' runner environment logs show that backup variable empty. The Cloudflare variable is masked/nonempty. The job was therefore not generally denied all environment secrets.
- `requireBackupKey` rejects non-string/empty values, fewer than 32 characters, or more than 1024 characters under the single code `BACKUP_ENCRYPTION_SECRET_REQUIRED`. In this run the logs specifically corroborate empty delivery, rather than proving a short or overlong supplied password.
- Validation occurs before the approval-history fetch and before any Cloudflare metadata/export call. The later bundle/encryption failures are consequences of the same empty delivery, not independent export failures.

This establishes the immediate cause: the backup secret reference resolved to an empty runner value. The connected tools cannot inspect environment-secret administration metadata. The Owner reports that the secret existed in the correct environment before the run; the available evidence does not establish why GitHub resolved it empty. Do not attribute this to a typo, password length, Owner error or a queued-run snapshot without evidence. GitHub documents that environment secrets are read when the referencing job starts, unlike repository/organization secrets, which are read when a run is queued.

## Diagnostic next step

`acceptance-secret-diagnostic.yml` stages a fresh protected job in the same environment. It uses only the backup secret and reports secret-context/process presence, the existing minimum/maximum validation booleans and whether those observations agree. It prints no value, exact length, fingerprint, transformed value or ciphertext. There is no Cloudflare credential, infrastructure API call, export, restore or deployment in that diagnostic.

Approve only that diagnostic run. Keep the existing secret unchanged during this investigation. A PASS corroborates current delivery/validation; it cannot retroactively establish the cause of the earlier empty resolution. An unavailable result corroborates a continuing environment/secret-resolution condition. A context/process mismatch isolates injection rather than validation. An invalid-size result isolates the existing validation rule without exposing the size or changing the secret.

The original export run remains failed and must not be retried. No diagnostic result automatically resumes exports. The backup workflow's separate low-activity attestation still applies to any later newly authorized export request. The old run's approval comment was empty; the [replacement dispatch gate](acceptance-exceptions/2026-10-04-backup-dispatch-authorization.md) now requires the exact `BACKUP_WINDOW_NO_ACTIVE_OPERATORS` manual-run input plus independent environment approval. That is a separate future gate, not the cause of this failure.

PR #18 remains draft. Preserve encryption requirements, unresolved historical preservation evidence and every migration/deployment hold.

References: [GitHub secrets timing and precedence](https://docs.github.com/en/actions/reference/security/secrets), [empty secret expressions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
