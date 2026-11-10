# CreatorLoop — Owner Mac readiness, revision 2

**OWNER_MAC_EXECUTION: HOLD — Chief independent acceptance required. Do not run this command yet.** This revision corrects supplemental finding F1 against procedure commit `9d22b856ddef66c694d2aa13cee7c2dc233840d6`. The earlier command is superseded for execution. The supplemental result is not Chief acceptance.

The accepted V2 launcher/artifact at `d0dd305efe2c1e7da4aa5d4fd9c7cb2f72130035`, installed signer, source verifier and kit hashes remain unchanged. Only this companion readiness procedure is revised.

## Exact correction

The original command checked the resolved home's path and Owner identity but omitted its permissions/ACLs and the `/Users` ancestor trust gate. It could admit an Owner-owned world-writable home. Such a parent can let another local principal replace custody pathnames despite private child modes; this is a confirmed check omission, not evidence that the actual Mac is compromised.

Before setting home readiness PASS, changing clean child HOME, or inspecting kit/evidence, the corrected command checks both `/Users` and the resolved Owner home. Both must be nonsymlink directories with root-or-Owner ownership, no group/other write bits and no ACL entries. The home must additionally retain its exact `/Users/tt1` pin and current effective Owner ownership. Unsafe paths return `OWNER_HOME_ANCESTOR_OWNER_MODE_OR_ACL_BLOCKED`; private custody inspection, checksum/code reads, offline helper and possession dialog are skipped. Child HOME stays `/var/empty` on this failure.

The ACL policy is deliberately conservative: **even a harmless or deny-only standard macOS home ACL blocks readiness**. No ACL is printed or changed. Return the bounded blocker for Chief's specific review; do not remove ACLs, repair permissions, relocate custody or install a runtime automatically. Owner/root/OS/Terminal trust remains the documented boundary; no claim is made against compromise or concurrent changes by trusted administrators.

## Use only after Chief approval

Open the immutable revision-2 `Owner_Mac_Readiness_Command.txt`, copy its entire contents unchanged into the designated Mac's trusted native Terminal as one command, and run once only after Chief approves this exact revision. There is no remote-fetch/eval command. Do not insert a credential anywhere.

The clean privileged Bash starts with HOME `/var/empty` and resolves the effective account's local Directory Services `NFSHomeDirectory`, never inherited HOME. It checks the home trust chain, fixed `/usr/local/bin/node` version `v22.23.3` and its ownership/mode/ACL chain, V2 private installed metadata, exact accepted checksum-table fingerprint before installed code import, the accepted `--offline-validate` path only, and private evidence-directory metadata. No evidence contents are read. A safe Owner-owned 755 custody parent remains allowed; installed private directories and evidence remain 700.

One button-only AppleScript dialog asks only whether a safe existing user-owned source token is possessed. It has No/Yes buttons, default No and a 60-second timeout; no text field. Possession is Owner attestation, not authentication. No or unavailable confirmation is BLOCKED, not authority to retrieve or create credentials.

Return only the one bounded PASS/BLOCKED JSON line, including `actualHome`, home/node/kit/evidence statuses, possession enum, fixed codes, `sourceAuthenticated:false`, `networkRequests:0`, `credentialReads:0`, and `changesMade:false`. Do not return screenshots, tokens, keys, passphrases or private records.

## Narrow blocker handling

`OWNER_HOME_PIN_OR_OWNERSHIP_MISMATCH` requires confirming the designated local Owner account or a separately reviewed pin correction. `OWNER_HOME_ANCESTOR_OWNER_MODE_OR_ACL_BLOCKED` requires specific ancestor metadata/ACL review, not automatic repair. In either case `KIT_AND_EVIDENCE_NOT_INSPECTED_HOME_BLOCKED` and `SOURCE_CONFIRMATION_NOT_REQUESTED_HOME_BLOCKED` explain skipped work.

Node path/version/ownership/mode/ACL blockers do not authorize PATH fallback, installation or repair. Kit metadata/integrity/offline blockers require the smallest reviewed correction, not overwrite. Evidence metadata blockers do not authorize ACL/mode changes. Possession blockers mean source availability is unknown or unavailable; do not request its value.

No Cloudflare/source-token request, launcher run, keychain access, credential-file read, application file write, permission/ACL change, installation, replacement, signing, backup, protected workflow, merge or deployment is included. Readiness PASS cannot authenticate a source token or verify the installed GitHub environment secret.

## Evidence limits

The targeted `test_ancestor_trust.py` runner reuses fictional metadata fixtures but does not execute the original seven readiness tests, accepted V2/Team/verifier suites or accepted kit code. Native macOS Directory Services, BSD metadata/ACL output, actual Node and AppleScript behavior remain untested. Missing tools, inaccessible records, unfamiliar metadata or ACLs and unavailable UI fail closed. Chief must independently review the corrected immutable command before any Owner execution.
