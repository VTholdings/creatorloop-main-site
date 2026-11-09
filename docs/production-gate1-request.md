# Production Gate 1 — separate Owner authorization requested

Preparation only. Production inspection is not authorized by the completed training run or by preparation of this workflow. The new protected job cannot run until a separate Owner environment approval. PR #18 remains draft; all write/release holds remain in force.

## Training prerequisite verified

[Training run 37248108426](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37248108426) passed at `adfaadbdaa1d7348670761083f71da39a5d725ff`. Its receipt contains 21 matched checks, zero rows written, unchanged database metadata, unchanged provider fingerprints at both schema fences, no blockers, and a production-held receipt. Artifact `11320388581` archive SHA-256 `93b451071b27bcfd948a36998cc17eae46aa5426ca1caf479a6cb0ddcae03e65` was verified locally. The new production job reuses this completed evidence; it does not rerun training inspection.

## Proposed scope and mechanism

The dedicated `.github/workflows/acceptance-production-schema.yml` workflow queues on production-tooling changes to `team-access-directory`. Full validation runs first. Its production job uses protected `creatorloop-acceptance`, first attempt only, and fixed `PRODUCTION_ONLY` scope. Before any Cloudflare query, the entry point corroborates run/path/branch/SHA, Owner reviewer login/numeric ID, environment approval, current branch/main, accepted training PASS and unchanged migration hashes. Current branch/main fences precede every SQL read.

Only account `2a3b96a0b37850cd03107131baa66b6d`, production D1 `c4993a97-5835-4c6c-af06-7020fa8d4f2a`, endpoint `/query`, may be queried. No training query is made. Read the exact bounded schema, migration registration, `operators` columns, foreign-key setting and accepted tables' foreign-key definitions. Compare schema/trigger/index/view definitions and guard presence against the accepted original production backup, and schema/registration again at the end. Preserve exact current/rehearsed migration hashes and applied/unapplied version lists. The existing migration table stores versions rather than historical file checksums; do not claim historical byte provenance or that pending migrations/guards are installed.

Reuse the existing authenticated encrypted Owner transfer artifact `11317109290` from backup run `37242966914`; no export is repeated. The existing baseline checker corroborates the accepted bundle's manifests locally; the new wrapper outputs only a private production baseline. This local preparation performs no live restore or pending migration execution. The Owner off-platform copy is untouched.

The existing exact SQL transport remains unchanged: fixed allowlist, empty params, pinned path, at most 54 reads, 20-second request timeout, 2 MiB response bound, no redirects, no retries. Every response must explicitly report `rows_written=0` and `changed_db=false`. A discrepancy, refusal or missing zero-write evidence stops immediately. There is no correction/fallback path.

## Explicit proposed provider handling

The [documented Cloudflare provider classification](acceptance-exceptions/2026-10-05-training-cf-kv-classification.md) and completed training fences establish one reserved, intentionally export-excluded table definition. The proposed production authorization extends this named-object rule only when production's own live metadata exactly matches it:

- `type=table`, `name=_cf_KV`, `tbl_name=_cf_KV`;
- full canonical metadata SHA-256 `7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686`;
- at most one such row and no provider object in the authenticated original production baseline;
- retain raw inventory hash/count, comparison hash/count, full provider fingerprint and separate provider checks;
- identical definition and presence at the end fence;
- no contents queried, no wildcard `_cf_*` exclusion, and no other object exempted.

An altered/malformed/duplicate provider, other internal-looking object, application schema/guard difference, or provider appearance/disappearance between fences blocks. This is an explicit production proposal requiring separate approval; training's authorization is not reused. The original training implementation and strict production-library default are unchanged.

Only sanitized `production-evidence/PRODUCTION.json` is uploaded, with 90-day retention requested. Raw SQL, records, defaults, credentials and signed URLs remain private. Ephemeral decrypted evidence is removed after the job. Pending governance migrations stay pending even if the original schema comparison passes.

## Exact approval

For the newly presented production run and exact SHA, post the production-only authorization on PR #18 if retaining a PR discussion record, then open that run and select **Review deployments → creatorloop-acceptance → Approve and deploy**. No backup-window attestation or review comment is required. The separate environment approval authorizes only the defined read-only inspection, despite the button label. Do not approve a training run, old SHA or retry attempt.

After production PASS, stop and report its exact evidence and the next separate authorization. Gate 2, migrations, schema/data writes, remote restores, executor activation, bindings/configuration/Access changes, deployment and merge remain held.
