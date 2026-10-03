# Individual admission and revocation execution

## Implemented application boundary

The immutable `console_team_events` ledger now stores `EDGE_ADMISSION_REQUEST`, `EDGE_REVOCATION_REQUEST`, and `EDGE_RECEIPT`. Existing migration 0005 creates the ledger; 0006 protects replacement; 0007 supplies current membership versions and transaction guards. No additional migration or competing identity store is introduced.

Only the current active Owner / Administrator can prepare requests or record signed evidence. Requests carry a unique ID, individual operator ID/email, environment, current personnel version, timestamp, audience, database ID and deployment ID. Each request is saved atomically with its attributable Team action. No Cloudflare call is made by the Console.

`REGISTRY_VERIFIED` no longer enables training access or activation. The application requires a current individual ADMIT receipt, appropriate lifecycle/certification/scope, and a fresh validated Access session whose `sub` matches the receipt's individual subject. Existing unprofiled legacy identities and Owner access are preserved; adding a managed profile cannot inherit old assignment fallback as an admission grant.

Permission changes continue to advance the session epoch. Suspension, deactivation, role changes and ending active training access create a revocation request atomically while denying Console access. Edits during pending revocation refresh the request/version. An old ADMIT receipt cannot authorize reactivation while the latest request is REVOKE. A valid REVOKE receipt confirms evidence only; it never activates a person. New admission must follow.

Every managed write rechecks the current admission request/receipt and expiry inside the existing transaction guard. Activation and training admission also recheck the target receipt at commit. Rejected/stale receipt writes leave no partial grants, audit or state.

## Deployment configuration — public values only

Configure each environment independently during the held, reviewed rollout:

- `CONSOLE_ENVIRONMENT`: exactly `TRAINING` or `PRODUCTION`.
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN` and `CLOUDFLARE_ACCESS_AUD`: the verified environment's existing Access configuration.
- `CONSOLE_DATABASE_ID`, `CONSOLE_DEPLOYMENT_ID`: exact verified binding/project identities.
- `PEER_ACCESS_AUD`, `PEER_DATABASE_ID`, `PEER_DEPLOYMENT_ID`: independently verified other-environment identities. Each must differ from this environment's value.
- `ADMISSION_VERIFIER_KEYS`: JSON array of approved RSA public JWKs with unique `kid`, at least 2048-bit modulus and no private key components.

Training Console requests also fail closed before account lookup when the distinct pins and verifier configuration are missing. These pins make configuration failures fail closed. They cannot prove actual bindings or Cloudflare policies; corroborate those live. Removing a signer key denies its admission receipts. Do not configure a signing private key or Cloudflare API token in the Console. Do not add production sync credentials to training; the training integration route rejects all imports/exports even if a secret is mistakenly bound.

## Signed envelope contract

The envelope has exactly `keyId`, `payload`, `signature`. `payload` is base64url of UTF-8 JSON. Sign the ASCII payload string with RSA-SHA256 (RSASSA-PKCS1-v1_5); encode the signature as base64url. The application pins the public key by `keyId`.

Payload fields: `protocol='CREATORLOOP_EDGE_V1'`, `requestId`, `operatorId`, `email`, `operation='ADMIT'|'REVOKE'`, `environment`, `audience`, `databaseId`, `deploymentId`, `requestVersion`, `observedAt`, `expiresAt`, `evidenceHash`, `policyId`, `subject`, `policyVerified=true`, `sessionVerified=true`. REVOKE additionally requires `revokedBefore`. Unknown fields are rejected. `evidenceHash` is a SHA-256 hex digest of the protected evidence projection. Never include raw API responses, tokens or JWTs.

Evidence must be observed no earlier than the request, no more than five minutes ago and not in the future. Receipt expiry must be after now and at most 24 hours after observation. ADMIT expires deliberately; renewal requires a new controlled request. Signer removal also invalidates admission. REVOKE evidence must verify both policy removal and session revocation at a boundary between request time and observation. A request has one immutable receipt. Superseded requests, changed membership versions, tampered envelopes and identity/environment substitutions are rejected.

## Portable executor

`scripts/lib/edge-executor.mjs` implements request validation, individual-operation selection, before/after request fencing, independent evidence validation, preservation checks, projected evidence hashing and signing orchestration. Local mock-provider tests cover these operations. It accepts ports:

- `currentRequest(operatorId)`: return the latest immutable request plus current personnel version. Return no request if the version or authority changed.
- `provider.ensureApprovedIndividualAdmission(request)`: retry-safe work for that already-approved individual only, under the reviewed existing policy mechanism.
- `provider.revokeIndividualAdmissionAndSessions(request)`: retry-safe individual removal and session revocation. Never revoke every application's users to clear one person.
- `provider.verifyIndividualState(request)`: independently corroborate policy result, individual session result, environment/AUD/binding identities and unchanged Owner/service policies. Return only explicit evidence fields.
- `sign(payload)`: use the protected external RSA signing key and return its approved key ID and base64url signature.

No live Cloudflare adapter is installed or selected by this PR. Its account/application/policy IDs, identity-provider mechanism and individual revocation behavior must be corroborated against the current remote environment before the ports can be wired. This is an external integration/certification dependency, not an application bypass or a reason to use a generic allow-all policy. Do not claim an adapter API response alone proves that an individually authenticated session succeeded or was denied.

Cloudflare documents separate application-token revocation and user-token revocation APIs. The application-wide operation is not a safe substitute for individual revocation. The user-level operation has account-wide effects across applications and requires review of the actual identity/environment scope before choosing it. Official references: [application revocation](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/revoke_tokens/), [user revocation](https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/methods/revoke_users/), [user active sessions](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/users/). None are called by this continuation.

## Minimum secure execution environment

Use an Owner-controlled runner or workstation separate from this Work session. It must provide private environment/secret injection for the existing least-privilege replacement token, a protected external receipt signing key, redacted logs and restricted administrators. Do not put either credential in chat, source, artifacts, command arguments or the Console.

It needs authenticated network access to the approved Cloudflare account/D1/Pages/Access resources, supported migration/deployment tooling, read access to the exact PR files, protected storage for fresh exports/evidence, and separately approved individual test accounts. D1 atomic execution and restoration must be demonstrated before live migration. The Google Sheets bound bridge and its existing service credentials remain independently administered. Actual workbook/platform access is required for source mapping/retention checks. No wider token permissions or new production policy are authorized here.

Merge and production deployment remain held until the required live gates are ready. Local signed receipts use ephemeral fictional keys and are not live employee admission evidence.
