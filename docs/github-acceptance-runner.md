# Protected read-only Cloudflare acceptance runner

## What this stage does

The existing acceptance architecture now has a GitHub Actions entry point: **CreatorLoop acceptance - read-only Cloudflare verification**. A push affecting its workflow, verifier, public target file or verifier tests on `team-access-directory` queues the run. Local validation completes before the protected job can start.

The job uses the existing `creatorloop-acceptance` environment. Its required reviewer, disabled administrator bypass and branch restriction remain managed by the Owner in GitHub. No environment settings or secrets are read, created or changed by this PR. Only the metadata step receives `${{ secrets.CLOUDFLARE_API_TOKEN }}`; the Console, checkout, tests and artifact action receive no Cloudflare credential.

GitHub requires a workflow-dispatch definition on the default branch before its **Run workflow** button can start a new workflow. This branch-push entry point avoids changing `main` or merging PR #17/#18. After the initial commit queues a run, subsequent runs can use GitHub's existing run retry controls; each protected job still requires the environment gate. Obsolete SHAs fail the branch fence before credential use.

## Approve the first run

1. Open the repository's **Actions** tab.
2. Open **CreatorLoop acceptance - read-only Cloudflare verification** for the published PR #18 commit. Wait for **validate** to pass.
3. As `Creatorloopzone`, choose **Review deployments**.
4. Select `creatorloop-acceptance` and choose **Approve and deploy**.

GitHub uses the word “deploy” for environment approval. This workflow only reads Cloudflare metadata. It contains no production deployment, configuration change, D1 query/migration, provisioning, session revocation or receipt-signing step. Do not use an administrator bypass.

## Read-only contract

`scripts/acceptance/cloudflare-targets.json` contains recovered public resource pins, so no GitHub environment variables are needed. The account ID comes from the preserved D1 migration workspace; the production D1 ID and AUD from the existing repository; the training project/database/AUD from the preserved training configuration and governance checkpoint. Production project candidates reflect historical naming differences: selection must uniquely match `ops.creatorloop.net`. These are lookup/verification pins, not proof of current remote state.

The transport permits **GET only** to the fixed Cloudflare API origin and pinned account:

- Verify the existing Account API Token is active using `GET /accounts/{pinned_account_id}/tokens/verify`. The user-token endpoint is refused. An active token nearing its intentional expiration still proceeds through the remaining metadata checks; expired/disabled tokens and authentication failures stop the run.
- Read the known Pages project configurations and canonical deployment commit.
- Read metadata for the two known D1 databases.
- Read Access application metadata, select the two expected audiences, and read their policies with complete pagination.

Redirects, unknown paths/accounts/projects/databases, SQL endpoints, exports and mutation/revocation endpoints are refused. HTTP/authentication failures and mismatches remain blockers; no broader credentials or security fallback are attempted.

Only explicit public configuration, selected identifiers, boolean credential-presence flags, policy fingerprints and request status codes enter the evidence. Raw provider bodies, token IDs, environment secrets, policy emails and exception details are not logged or uploaded. Evidence is `acceptance-evidence/cloudflare-readonly.json`; GitHub keeps this short-lived diagnostic artifact for 14 days. This artifact expiration does not purge operational audit/report history and is not the permanent certification-evidence destination.

## How to interpret the result

`READ_ONLY_METADATA_MATCH` means these pinned metadata checks matched. It never means admission, sessions, database schema, migrations, backups, live lifecycle or production certification passed. `READ_ONLY_VERIFICATION_BLOCKED` identifies observations needing reconciliation without changing them.

The portable `scripts/lib/edge-executor.mjs` and signed-receipt application gate remain intact. This first stage deliberately does not call its ADMIT/REVOKE provider ports or sign a receipt. Reviewed live provider wiring, safe individual session behavior, signing-key custody, actual schema/backups, hosted individual acceptance and signed source round trips remain later gates with separate authorization. PR #18 remains draft; PR #17/#18 merge and production release remain held.

References: [GitHub manual workflow requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [GitHub environment approval](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments), [Pages project metadata](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/), [D1 metadata](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/), [existing admission architecture](admission-execution.md).
