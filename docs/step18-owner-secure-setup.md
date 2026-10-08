# Step 18 — one guided Owner secure-setup session

**Purpose:** finish the protected prerequisites of the existing architecture in one coordinated session. This is an execution runbook, not another architecture proposal. The Owner's supplied authorization ends the search for a historical custody locator; operational provisioning remains unverified. PR #22 preparation stays the implementation baseline.

**Only the Owner/custodian and authorized service administrator execute the private/setup actions below.** Manus has not created keys, credentials, identities or infrastructure. Do not run the private-key commands in a Manus workspace, synced/uploaded directory, public repository, Pages deployment tree, or host administered by the provider executor. Do not paste secrets or passphrases into this runbook/chat.

## Session order and participants

| Sequence | Who acts | Complete in the same coordinated setup session |
|---|---|---|
| 1 | Owner + custodian + service administrator | Name distinct signing custodian/provider executor and approved private hosts. Establish actual administrative separation and protected evidence storage. Use existing approved private infrastructure; do not provision an alternate platform by assumption. |
| 2 | Custodian + independent verifier | Generate/reuse the separately authorized TRAINING RSA key externally; export public JWK/fingerprint; verify a new nonce challenge. |
| 3 | Owner + provider/release capability administrator | Privately provision/authorize exact short-lived capabilities, validate their effective permissions and fixed-target restrictions without expansion. |
| 4 | Owner + synthetic participant | Approve/create one dedicated individual TRAINING email using the existing approved IdP. Approve fictional scope and subject-only cross-application revocation; retain exact subject once individually observed. |
| 5 | Manus + private administrators + existing release reviewer | Wire private ports, reconcile fresh metadata, generate exact offline config/source plan, then obtain the existing exact protected release and admission approval. Only then execute explicitly authorized operations. |

A custodian/provider pair cannot establish separation by signing a checklist alone: the executor must not have private-key/decryptor access, signer admin access, or ability to replace the signer/approval/observer code. If those controls cannot be demonstrated, stop the private operation and record that concrete gap in this same session—do not substitute a shared account or service token.

## 1. Supply only nonsecret designations

Record named custodian, distinct execution service principal and responsible administrator, private signing host/key store reference, execution host reference, evidence destination, and admin boundaries. These are real designations, not dummy IDs. Owner approval of the actual infrastructure is required before key creation there. External ports use nonsecret references; all secret resolution occurs in private custody.

No OS accounts/services are created by this runbook. An approved administrator must configure necessary accounts/key-store ACLs and private service execution; Manus will not perform that on an unidentified or Manus-controlled host. If the infrastructure is not yet prepared, the Owner supplies its approved host and administrator within this session.

## 2. Owner-controlled RSA custody: exact commands, never run by Manus

If an appropriate approved key already exists, do **not** rotate it. Export its public SPKI and use the verification steps. Otherwise, the Owner explicitly authorizes the named custodian to generate one TRAINING-only RSA key on the approved signing host. Recommended RSA3072, public exponent 65537, RSASSA-PKCS1-v1_5 / SHA-256. The private key is encrypted, owner-readable only, and its unlock passphrase remains with the custodian—not the executor.

On the **approved private signing host**, in a private interactive terminal with recording/echo disabled for sensitive prompts:

```bash
# Owner selects existing private custody directory OUTSIDE repo/Manus/synced trees.
read -r -p 'Approved private custody directory (absolute): ' CUSTODY_DIR
case "$CUSTODY_DIR" in /*) ;; *) echo 'Absolute private path required'; exit 1;; esac
test -d "$CUSTODY_DIR" || exit 1
# Administrator must already have verified this location and its ACL/admin separation.
# These commands do not verify host authorization or all inherited ACLs.
umask 077
test ! -e "$CUSTODY_DIR/training-signing.pem" || exit 1
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
  -pkeyopt rsa_keygen_pubexp:65537 -aes-256-cbc \
  -out "$CUSTODY_DIR/training-signing.pem"
# Enter the encryption passphrase interactively; never as -pass pass: or a chat message.
chmod 600 "$CUSTODY_DIR/training-signing.pem"
openssl pkey -in "$CUSTODY_DIR/training-signing.pem" -pubout \
  -out "$CUSTODY_DIR/training-public.pem"
```

Do not set `CUSTODY_DIR` to a source workspace. No private key backup/upload is created here. Any recovery backup stays encrypted under the approved independent custody process. This command is a **manual protected action requested from the Owner**, not permission for Manus to run it.

The public SPKI may be copied to an independent verifier's approved location. That verifier generates a fresh **public nonce** challenge:

```bash
umask 077
printf 'CREATORLOOP_TRAINING_CUSTODY_CHALLENGE_V1\nNOT_AN_ADMISSION_RECEIPT\n' > custody-challenge.txt
openssl rand -hex 32 >> custody-challenge.txt
```

Transfer only that public challenge to the custodian. On the signing host, after verifying it is this challenge—not an admission payload:

```bash
openssl dgst -sha256 -sign "$CUSTODY_DIR/training-signing.pem" \
  -out custody-challenge.sig custody-challenge.txt
```

Return only the signature and public PEM to the independent verifier. In the reviewed PR #22 checkout, this **public-only command** exports the admission JWK/variable and verifies the challenge:

```bash
node scripts/custody/public-key-handoff.mjs \
  /approved/public/training-public.pem TRAINING-OWNER-ASSIGNED-UNIQUE-KID \
  /approved/public/custody-challenge.txt /approved/public/custody-challenge.sig \
  > /approved/public/training-public-handoff.json
```

Replace the public paths/key ID with the actual approved values. No private key is read by this utility. It returns `publicJwk`, `publicJwkSha256` (hex canonical public digest used by the signer interface), RFC7638 thumbprint, `admissionVerifierKeys`, and `challengeSha256`. The independent verifier compares the nonce/challenge hash it generated; a valid historical signature is not automatically fresh custody evidence. `executable=false` and `identityOrProviderAuthorityVerified=false` remain, because a challenge does not prove permission, identity or separation.

Public handoff, signature and challenge may be shared with Manus; private PEM, passphrase and provider tokens may not. Do not install `ADMISSION_VERIFIER_KEYS` yet.

## 3. Exact private capability action

Owner/capability administrator uses the existing secure Cloudflare token administration process. No token is generated or modified by this runbook.

| Capability holder | Required bounded capability | Explicit exclusions |
|---|---|---|
| Separate TRAINING executor | Existing approved or newly specifically authorized short-lived app/policy read/edit, selected-user read and individual organization revoke | No D1 mutation/query/restore, IdP/group administration, Access key edit, application-wide revoke, devices/WARP revoke or production operations |
| Independent signer/observer | Only authenticated read/proof access needed for its independently obtained policy/runtime/session evidence | No provider mutation credential or arbitrary receipt-signing endpoint |
| Separate protected release operator | Existing approved or specifically authorized Pages read/edit release capability | No signer key, Access policies, migrations, production release |

Account `2a3b96a0b37850cd03107131baa66b6d`; TRAINING app `72da9ab5-d951-4de4-8456-fd6660e4d86e`; TRAINING Pages `creatorloop-operator-training`. Current requested provider permission groups are `Access: Apps and Policies Read/Edit`, `Access: Users Read`, `Access: Organizations Revoke`. Actual API permission acceptance must be verified; the documented granular revoke label and older endpoint broad label differ. Do not broaden permissions silently to make a request succeed. Preserve the protected metadata token's existing read-only scope.

Cloudflare capability granularity may be account-level. Fixed target/request allowlists and short validity are compensating controls, not provider-enforced app-only permissions. Owner must accept the exact capability risk. The approved private resolver returns reference, effective permitted actions/account, expiry <= one hour and `permissionAcceptanceVerified=true` only after corroboration. The token stays in private store; give Manus only a nonsecret reference and sanitized permission/expiry evidence.

## 4. Dedicated individual test identity, not admission

Owner approves one new test-only email and existing IdP mechanism, exact fictional campaign/creator inventory, initial Operator role, and no other legitimate app access. Never reuse Owner, retired support, real employee or service-token identity. Explicitly accept that individual user-token revocation affects this dedicated subject across the Cloudflare account, with devices/WARP flags false. Identity creation is an Owner/admin-controlled setup action here; Console admission and policy creation remain held.

Prepare inactive TRAINING identity/role data through the authorized existing lifecycle after deployed isolation is verified; never use direct SQL to grant admission. The definitive nonempty Access `sub` must be observed from actual individual authentication. If not yet available, leave it pending; do not infer/fabricate it from email. Later policy/admission authority must explicitly cover first login and subject corroboration before a receipt. All fictional fixture IDs and attribution remain in the one protected inventory.

## 5. One consolidated release/admission approval handoff

Return the nonsecret **setup receipt** below, public-key handoff JSON/challenge proof, sanitized capability evidence and test-scope inventory through the approved process. Unknown values remain pending rather than guessed.

| Setup receipt field | Required evidence |
|---|---|
| `custodianPrincipal`, `executorPrincipal`, `serviceAdministrator` | Named distinct principals and actual admin separation |
| `signingHostRef`, `signerKeyRef`, `executorHostRef`, `evidenceStoreRef` | Approved real private locations; nonsecret references only |
| `publicKeyHandoff` | Public JWK/key ID, both public fingerprints, independently issued challenge hash and verified signature |
| `providerCapabilityRef`, `releaseCapabilityRef` | Effective permission/account/expiry evidence; no secret values; explicit account-level scope acceptance |
| `syntheticEmail`, `idpRef`, `trainingOnly`, `crossApplicationRevocationAccepted`, `fixtureInventory` | Exact Owner-approved individual and fictional scope; verified `subject` when observed |
| `privatePortWiring` | Actual authenticated approval and live current-request readers, independent observers/signing service and protected release port—not hardcoded test flags |
| `protectedApprovalRef` | Existing reviewer authorization for exact final application/execution SHAs, policy/request/version and configuration hash **after fresh reconciliation** |

Manus can then verify the public handoff, wire compatible nonsecret adapter configuration in approved scope, reconcile fresh approved metadata, prepare the exact offline patch/source hash, and present the final payload through the existing protected release control. That exact release approval remains mandatory; a setup receipt does not bypass it. No moving branch, dummy fingerprint, auto-approved stale workflow or arbitrary signer payload is permitted.

Proceed only under the corresponding explicit protected authority: TRAINING runtime/key config → exact reviewed release → re-read deployed SHA/runtime pins/bindings → synthetic request/individual authentication → independent signed ADMIT evidence → allowed fictional operator activity → current REVOKE request/provider/session denial → immutable receipt and Step 18 acceptance record. The existing architecture, migrations, production and protected-merge holds remain unchanged.

## Completed preparation and limits

The public handoff utility is locally testable using a published public RSA vector; it never creates or loads a private key. The new tests cover correct variable/fingerprints, private PEM refusal, key-ID validation, incomplete challenge rejection and invalid signature refusal. Actual nonce challenge success with the provisioned custodian key requires Owner-controlled setup, not synthetic proof.

This session is the **one consolidated Owner interaction** for known protected prerequisites. No further historical custody search or new architecture decision package is requested. Hosted Step 18 remains pending until genuine setup and exact protected execution evidence exist.
