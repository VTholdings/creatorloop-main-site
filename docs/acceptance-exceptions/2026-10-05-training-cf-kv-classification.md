# Training `_cf_KV` classification — read-only evidence

Classification: **Cloudflare-managed, reserved D1 storage table; intentionally excluded from the SQL export.** This resolves the origin/export explanation for this one discrepancy. It does not mark Gate 1 PASS, implement an exception, authorize another inspection, or authorize production inspection or Gate 2.

## Existing live and accepted-export evidence

- Gate 1 run: [37245487941](https://github.com/VTholdings/creatorloop-main-site/actions/runs/37245487941), release `fc5340177c65417c269c8122bf9fc6100afce9f6`.
- Training database: `12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0`.
- Receipt artifact: `11319316086`; archive SHA-256 `0564d5a78c7e25bc1cc5c8cf433d1a8d825c006e3cf626b521a820821c241565` (verified again locally).
- The first bounded schema read returned HTTP 200, `rows_written = 0`, `changed_db = false`, 23 objects and exactly one added object. No production query ran.
- That added object's identity fingerprint equals SHA-256 of JSON string `"table:_cf_KV"`: `891040ff8041bed0bab67da5084a4cdb0473f6ec9cc30a7d246c9d4c53c2e387`.
- Its full metadata-row fingerprint is `7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686`.
- The accepted training export from backup run `37242966914`, completed `2026-10-04T23:14:12.339Z`, has SHA-256 `cd711aafdbb3f3171e63a1025200c9b92c95eb3cd6f8369977880d0258136d40` and no `_cf_KV` in the authenticated export-derived schema inventory. The protected Gate 1 preparation corroborated that inventory against both accepted original/restore manifests before the live comparison. This investigation reused that evidence; it did not decrypt the bundle again, perform another export, or restore anything.
- The accepted export client sends the full-database export request without `tables`, `no_schema`, or `no_data` filtering. It retains downloaded SQL bytes unchanged. Therefore the absence was not introduced by CreatorLoop filtering.
- Repository migration/application source contains no `_cf_KV` creation or manipulation.

## Cloudflare provenance and exact live-definition match

[Cloudflare's D1 import/export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/) identifies `_cf_KV` as reserved underlying storage, forbids direct queries to its contents, shows it alongside an application table in schema metadata, and instructs users to remove its CREATE statement from SQLite dumps before importing into D1.

[Cloudflare workerd `sqlite-kv.c++`, pinned to `54224534dfc0e2c6486ccd234cd3a1b9ffcf68de`](https://github.com/cloudflare/workerd/blob/54224534dfc0e2c6486ccd234cd3a1b9ffcf68de/src/workerd/util/sqlite-kv.c%2B%2B) creates this table through its trusted internal storage implementation. Its SQLite schema definition is:

```sql
CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID
```

Offline reconstruction of `{name: '_cf_KV', sql: <the exact definition above>, tbl_name: '_cf_KV', type: 'table'}`, serialized with sorted keys and compact JSON as Gate 1 does, produces **exactly the full live metadata-row fingerprint above**. The match includes type, name, owning table, complete SQL, whitespace, column definitions, primary key and WITHOUT ROWID. It is not a name-only inference. No read of internal key/value contents was attempted.

[Cloudflare's `dumpSql.ts`, pinned to `e35c4a154ea16a96b47cb2e68a4930c1d833e81d`](https://github.com/cloudflare/workers-sdk/blob/e35c4a154ea16a96b47cb2e68a4930c1d833e81d/packages/miniflare/src/workers/d1/dumpSql.ts) explicitly skips table names starting with `_cf_` before emitting schema or data. Its header identifies this as export logic shared, through a manually synchronized copy, with D1 workers. This establishes intentional exclusion; the actual accepted remote export corroborates that behavior for this training database. This source inspection does not claim to attest the exact deployed Cloudflare binary version.

Together, the official D1 classification, exact provider-definition/live fingerprint match, explicit shared export exclusion and actual full-export absence establish this specific object as provider-managed and export-excluded. Its absence from the accepted SQL export is expected, rather than evidence of lost application schema/history. The accepted application restore/rehearsal and completed backup acceptance remain valid.

## Smallest proposed Gate 1 normalization — not implemented

For training schema comparison and its end fence only:

1. Retain fingerprints of the unnormalized schema inventory and the comparison inventory in sanitized receipts. Keep raw SQL/private metadata private. Record `_cf_KV` classification, presence, exact metadata fingerprint and exclusion separately.
2. Exclude at most one metadata row only when `type === 'table'`, `name === '_cf_KV'`, `tbl_name === '_cf_KV'`, and its full canonical row fingerprint is exactly `7e657b88f7044fb2b82a2ac486f4b4c2a1bf49fd180d64b03e26dfe0485a6686`. The accepted baseline must exclude that object as already corroborated. No internal contents may be queried.
3. Require any observed provider row to remain identical at the end fence; report a changed, missing-between-fences, duplicate or malformed provider row as a discrepancy.
4. Compare every other schema row exactly as before. An unexpected index, trigger, view, another `_cf_` object or any application change still blocks. Do not add a prefix wildcard, infer exemption from names alone, suppress object differences, or relax other inspection/migration/approval/zero-write guards.
5. Do not extend this training-only proposal to production without separate authorization.

No application code, workflow, comparison logic, database, binding, policy or other infrastructure was changed during classification. The current strict Gate 1 guard still blocks `_cf_KV`. Remaining identity, registration, foreign-key and history-guard checks have not passed merely because classification is complete.

Next proposed Owner action: authorize implementing this exact training-only comparator rule and a fresh protected **training-only** Gate 1 inspection. Production inspection, Gate 2, remote migration/restore, deployment and PR merge remain held. PR #18 remains draft.
