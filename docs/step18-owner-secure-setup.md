# Step 18 — one guided Owner secure-setup session

**Purpose:** finish the protected prerequisites of the existing architecture in one coordinated session. This is an execution runbook, not another architecture proposal. The Owner's supplied authorization ends the search for a historical custody locator; operational provisioning remains unverified. PR #22 preparation stays the implementation baseline.

**Only the Owner/custodian and authorized service administrator execute the private/setup actions below.** Manus has not created keys, credentials, identities or infrastructure. Do not run the private-key commands in a Manus workspace, synced/uploaded directory, public repository, Pages deployment tree, or host administered by the provider executor. Do not paste secrets or passphrases into this runbook/chat.

## Session order and participants

| Sequence | Who acts | Complete in the same coordinated setup session |
|---|---|---|
| 1 | Owner + custodian + GitHub administrator | Name the private-workstation signing custodian and separate GitHub-hosted execution administrator. Establish actual separation and restricted evidence storage; configure only the two approved isolated GitHub environments through the authorized administrator. |
| 2 | Custodian + independent verifier | Generate/reuse the separately authorized TRAINING RSA key externally; export public JWK/fingerprint; verify a new nonce challenge. |
| 3 | Owner + provider/release capability administrator | Privately provision/authorize exact short-lived capabilities, validate their effective permissions and fixed-target restrictions without expansion. |
| 4 | Owner + synthetic participant | Approve/create one dedicated individual TRAINING email using the existing approved IdP. Approve fictional scope and subject-only cross-application revocation; retain exact subject once individually observed. |
| 5 | Manus + private administrators + existing release reviewer | Wire private ports, reconcile fresh metadata, generate exact offline config/source plan, then obtain the existing exact protected release and admission approval. Only then execute explicitly authorized operations. |

A custodian/provider pair cannot establish separation by signing a checklist alone: the executor must not have private-key/decryptor access, signer admin access, or ability to replace the signer/approval/observer code. If those controls cannot be demonstrated, stop the private operation and record that concrete gap in this same session—do not substitute a shared account or service token.

## 1. Supply only nonsecret designations

Record named custodian, distinct execution service principal and responsible administrator, private signing host/key store reference, execution host reference, evidence destination, and admin boundaries. These are real designations, not dummy IDs. Owner approval of the actual infrastructure is required before key creation there. External ports use nonsecret references; all secret resolution occurs in private custody.

No OS accounts/services are created by this runbook. An approved administrator must configure necessary accounts/key-store ACLs and private service execution; Manus will not perform that on an unidentified or Manus-controlled host. If the infrastructure is not yet prepared, the Owner supplies its approved host and administrator within this session.

### Approved Stage 1 execution settings — October 8, 14:16 HST

Owner approved private-workstation signing custody and a separate **ephemeral GitHub-hosted `ubuntu-latest`** executor in `VTholdings/creatorloop-main-site`. No private key enters GitHub. The public repository is not a restricted custody/evidence store. The assigned custodian/workstation administrator, executor administrator, designated reviewer and restricted evidence-store reference still must be supplied; approval of the model is not evidence that they exist.

**The authorized GitHub administrator—not Manus—creates/configures the following empty environments.** Open [repository environment settings](https://github.com/VTholdings/creatorloop-main-site/settings/environments). No secret or key is added at Stage 1; the existing `creatorloop-acceptance` environment and its credential stay unchanged.

| Exact setting | `creatorloop-training-provider-execution` | `creatorloop-training-release` |
|---|---|---|
| Required reviewer | The one actual Owner-designated user | The one actual Owner-designated user |
| Prevent self-review | Enabled | Enabled |
| Allow administrators to bypass configured protection rules | **Deselected**; save protection rules | **Deselected**; save protection rules |
| Deployment branches and tags | Selected branches and tags | Selected branches and tags |
| Allowed rule | One **Branch** rule: `team-access-directory` | One **Branch** rule: `team-access-directory` |
| Other branch/tag rules | None | None |
| Secrets now | None; do not copy the existing API token | None; do not copy the existing API token |

Use a named reviewer distinct from the actor triggering a protected run; with self-review prevention enabled, a user cannot approve their own run. One reviewer is enough for GitHub's environment gate; this does not replace independent signing custody. Keep administrator bypass disabled rather than using it to unstick a job.

For administrators using the existing secure GitHub API process, `prepareGithubEnvironmentConfiguration()` in `scripts/lib/training-github-environments.mjs` produces the exact PUT environment and POST branch-rule bodies after receiving the **actual appointed reviewer's login and numeric ID**. It refuses missing/malformed input and does not perform a request; shape validation does not prove that a named person is appointed by the Owner. Public account ID can be obtained read-only with `gh api users/ACTUAL_APPOINTED_LOGIN`; a user lookup proves account identity, not Owner appointment. No reviewer is assumed from the old environment.

Environment PUT body: `wait_timer: 0`, `prevent_self_review: true`, `reviewers: [{type: "User", id: ACTUAL_APPOINTED_ID}]`, `deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}`. Branch POST body: `{name: "team-access-directory", type: "branch"}`. Actual numeric reviewer ID must be inserted before applying; a placeholder is not an executable payload. Do not add duplicate rules when reconciling an existing environment; verify first through the approved administrator process.

**Bypass is a separate documented UI operation:** the environment PUT request schema does not document a bypass-write parameter. Do not invent one. Deselect **Allow administrators to bypass configured protection rules** and **Save protection rules**. GET readback currently exposes `can_admins_bypass`; the verifier requires it to be exactly `false`, otherwise the setting is BLOCKED rather than inferred.

After administrator completion, Manus performs fresh GET-only reconciliation of each environment and its branch policies against the appointed reviewer ID. The readback must show one required reviewer with self-review prevention, administrator bypass false and exactly the allowed branch rule. A screenshot can corroborate the operation, but no standalone checklist boolean is substituted for readback. The initial read-only snapshot found both new environments **NOT FOUND**; they were not implicitly created.

Inactive release/provider templates remain in `docs/proposals`, not `.github/workflows`. Preflight GETs verify the environment already exists and is protected **before** a job references it, avoiding GitHub's implicit creation of an unprotected environment. They recheck exact run attempt, hosted context, latest execution SHA and settings. Preparation mode does not load credentials or invoke admission/release ports; `check-port` deliberately refuses execution even if an approved file hash matches. Actual protected port wiring and activation belong to the later exact authorization, not this settings preparation.

Official setting references: [GitHub environment REST API](https://docs.github.com/en/rest/deployments/environments) and [environment configuration UI](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

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
