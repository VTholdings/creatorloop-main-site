# CreatorLoop corporate V1 deployment — PASS

Completed October 15, 2026, 10:05:59 HST (20:05:59 UTC).

- Corporate: https://creatorloop.net — `creatorloop-corporate`, deployment `edb54291-2aca-401c-b190-214d121bdd55`.
- Existing Loop: https://loop.creatorloop.net — `creatorloop-main-site`, original deployment `0efd311e-e0af-4b47-87e0-7ff969952603`.
- Operations: https://ops.creatorloop.net — unchanged, deployment `fcff287f-8ef7-4421-9e95-bfb9130a4fab`.
- Training: unchanged, deployment `7637de42-2d67-4623-bf62-6be6560120a8`.

Accepted source remains `f9461cb6cc6851bbbe3b5b7a94d4eb255b5c0845`. Its Owner-QA branch is unchanged. Production payload contains only the accepted HTML, CSS and two WebP images. Only the staging robots meta directive was removed. No design, logo, copy, placement, responsive CSS, Access policy, database binding or zone-setting change was made. No public Loop link was added. Repository `main` remains `f4814ed44f2ecfe8ad00414999fa850967db4df0`.

## Verification and custody

The corporate page passed all four file checks. The Loop passed 16 static-file comparisons and nine route/access/404 checks. Operations, training and unrelated DNS matched their saved configuration. Seven isolated safety tests passed. Source comparisons reverse only Cloudflare's existing analytics script and email protection before checking every remaining byte. These edge features remain enabled.

The temporary credential was supplied only through the GitHub Actions secret `CREATORLOOP_CF_MIGRATION_TOKEN`. Its value was not read into chat, committed, logged or included in artifacts. The one-time workflow is now closed; it will not execute on later pushes unless separately re-enabled.

Successful run: https://github.com/VTholdings/creatorloop-main-site/actions/runs/38798800329

## Rollback

The original Loop project and production deployment remain intact. To restore the original architecture under a future Owner-authorized rollback:

1. Remove only `creatorloop.net` from the corporate Pages project's custom domains.
2. Associate `creatorloop.net` with the existing `creatorloop-main-site` Pages project.
3. Restore the proxied root CNAME to `creatorloop-main-site.pages.dev`, TTL Auto. Retain all MX/TXT and other DNS records.
4. Wait for active domain verification/certificate status, then repeat the original Loop file, route and access checks.
5. Keep the working Loop hostname available. Leave operations, training, Access policies and database bindings untouched.

Automatic rollback completed PASS after the first strict HTTP comparison rejected the zone's existing email transformation. The original root and all 25 Loop checks were reverified before the successful retry. This is recorded in `rollback-tested.json`.

`original-configuration.json` preserves the configuration from before project/hostname changes; `receipt.json` records final targets and identifiers; `verification.json` preserves file hashes and HTTP results. These files contain no credentials.
