# CreatorLoop — Owner Mac readiness, prerequisites only

V2 launcher/artifact acceptance at `d0dd305efe2c1e7da4aa5d4fd9c7cb2f72130035` is preserved. This new companion procedure does not alter or rerun V2 security tests. Chief independently reviews this prerequisite-only command before Owner use.

Open the immutable `Owner_Mac_Readiness_Command.txt`, copy its entire contents into the designated Mac's trusted Terminal as **one command**, and run once after Chief verifies the procedure. Do not insert a credential anywhere. The clean environment starts with `/var/empty`, then resolves the current effective user's **local** Directory Services home; it does not trust inherited `$HOME` or assume `/Users/tt1` is correct.

The command checks the accepted absolute Node path/version and trust-chain ownership/modes/ACLs, V2 private installation/file permissions, the accepted checksum-table fingerprint before importing code, accepted offline integrity only, and private evidence-directory metadata. It does not read evidence contents, keychain data, passphrases or token values. It opens one **Yes/No button-only** dialog about possession of a safe existing user-owned source. There is no text-entry field. No/timeout is BLOCKED, not authorization to create or retrieve a credential.

Output is **one bounded JSON line**, with overall `PASS` or `BLOCKED`, actual home, individual readiness fields, fixed blocker codes, `sourceAuthenticated:false`, `networkRequests:0`, `credentialReads:0`, `changesMade:false`. Source possession is Owner attestation, not verified authentication. No API request, launcher execution, source-token check, file write, chmod/chown/ACL edit, installation, replacement, signing, merge, backup or deployment occurs.

## Correct only the actual returned blocker

- `OWNER_HOME_PIN_OR_OWNERSHIP_MISMATCH`: report the returned nonsecret actual home. Confirm the designated Owner profile or review a narrow path-pin correction; do not assume or silently repoint the accepted launcher. Kit/evidence and source-possession inspection are skipped for the wrong home.
- `NODE_ABSOLUTE_PATH_OWNER_MODE_OR_ACL_BLOCKED` / `NODE_VERSION_NOT_22_23_3`: report the blocker and existing nonsecret Node path/version/metadata through a trusted procedure. No PATH fallback, Node installation, upgrade or permission repair is included.
- `KIT_INSTALL_OWNER_PRIVATE_MODE_OR_ACL_BLOCKED`, `KIT_NOT_EXACT_ACCEPTED_V2`, `KIT_OFFLINE_INTEGRITY_BLOCKED`: existing installation differs or cannot be safely verified. Return the code for the smallest reviewed installation/integrity correction; do not overwrite files automatically.
- `EVIDENCE_OWNER_700_OR_ACL_BLOCKED`: the directory/custody parent is not safely owned or private, or an ACL needs specific review. No ACL entries or private records are printed. Do not remove ACLs or change modes under this read-only procedure. A safe Owner-owned755 custody parent is allowed; evidence and installed kit directories remain700.
- `SOURCE_TOKEN_POSSESSION_NOT_CONFIRMED` / `SOURCE_POSSESSION_CONFIRMATION_UNAVAILABLE`: safe-source possession remains unconfirmed. No token value is requested. If none exists, preserve `SOURCE_TOKEN_UNAVAILABLE` and use only separately approved private recovery/replacement boundaries.

Return the bounded JSON only. A readinessPASS does **not** authenticate a token or approve an installed GitHub secret/protected workflow. It establishes only these observed Mac prerequisites; the private source check remains a distinct, previously authorized Owner action.
