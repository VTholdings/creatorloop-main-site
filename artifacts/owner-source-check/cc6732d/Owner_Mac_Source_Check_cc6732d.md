# CreatorLoop — Owner Mac source-token check

**Pinned repository source:** `VTholdings/creatorloop-main-site` commit `cc6732dba75b208dae05c886c56af73a4b16f012`. This kit copies four repository files byte-for-byte, including the corrected explicit user-owned endpoint selector. New kit-only Owner launchers are identified separately in `SOURCE_MANIFEST.json`; they do not change PR29 or the installed signer. Chief independently verifies the kit; local packaging checks are not Chief acceptance or live credential authentication.

## What the command does

Exactly one maximum HTTPS **GET** to `https://api.cloudflare.com/client/v4/user/tokens/verify`. The corrected cc6732d client fixes the user endpoint; the existing bounded source checker enforces a five-second deadline, 16 KiB response limit, no redirects and no retry/fallback. A separate transport gate refuses any other URL, method, body or second request. No Pages/Access/D1 metadata call, API-token listing, GitHub operation, rotation, secret replacement, backup, key generation, signature, migration, merge or deployment. No Cloudflare OAuth login is required or attempted.

The kit contains no token, private key or passphrase. Public account/resource pins are included solely because they are reviewed source dependencies; they are not permission to query those resources. `verifyCloudflare()` and the copied original CLI are **not called** by the Owner launcher. The wrapper removes obsolete account-only compatibility wording from the source-only result without certifying any live integration.

## Download and install once

Use the direct download links supplied in the handoff from **VT's own GitHub repository**, not a sandbox filesystem path. Download:

- `CreatorLoop_Owner_Source_Check_cc6732d.zip`
- `CreatorLoop_Owner_Source_Check_cc6732d.zip.sha256`

Keep the supplied independent checksum with the download. Do not rely on a checksum shown only inside an untrusted archive. On the designated private Mac, with the existing approved **Node v22.23.3**:

```sh
cd "$HOME/Downloads"
shasum -a 256 -c CreatorLoop_Owner_Source_Check_cc6732d.zip.sha256
```

Stop on checksum failure. If your browser added a duplicate-name suffix, use a single correctly named copy—do not silently substitute a different archive.

Install into a new, separate private directory; do not overwrite the signer, outbound-approval code or any previous kit:

```sh
umask 077
mkdir "$HOME/.vt-creatorloop/source-check-cc6732d-v1" &&
unzip "$HOME/Downloads/CreatorLoop_Owner_Source_Check_cc6732d.zip" -d "$HOME/.vt-creatorloop/source-check-cc6732d-v1" &&
chmod -R u=rwX,go= "$HOME/.vt-creatorloop/source-check-cc6732d-v1"
```

If that directory already exists, stop rather than reinstall/overwrite. This is a new kit; no previously accepted Mac signer check is repeated. No npm install, administrator command, inbound access or automatic repository update is needed.

## Run privately once

Close screen sharing/recording and plaintext Notes windows. Never send a screenshot of credential storage. Only use an **existing privately held, safe user-owned CreatorLoop source token**. Known exposed material awaiting containment is not a safe source. If the value is unavailable or a forbidden GitHub-secret cutover is needed, stop; do not retrieve a masked value or invent a substitute token.

Run:

```sh
/bin/bash "$HOME/.vt-creatorloop/source-check-cc6732d-v1/CreatorLoop_Owner_Source_Check_cc6732d/Run_Owner_Check.command"
```

The launcher checks the package hashes, exact source/import inventory and existing runtime **before reading a credential**. It also requires the existing Owner-only evidence directory `$HOME/.vt-creatorloop/evidence` to be owner-controlled with mode700. If a prerequisite fails, stop and report its fixed message; do not weaken permissions or reinstall Node automatically.

When asked whether an existing safe source is available, type `yes` only if it is. Enter/paste the **token value only** at the hidden local prompt: input is not echoed. The launcher is a non-interactive Bash script; the token is not a shell command and does not enter shell history. A Bash builtin sends it through an **anonymous stdin pipe** to a short-lived Node process. It is never exported to an environment variable, passed as a process argument, read from a credential file, uploaded to chat, or saved. Only the sanitized JSON is written to a new Owner-only evidence file. The local variable and byte buffers are released/cleared; JavaScript strings cannot be guaranteed zeroized. The Owner's Mac/admin remains a trusted boundary—this is not protection against a compromised local administrator.

Do not run with shell tracing, record the session, or forward Terminal screenshots. If using the clipboard, clear the sensitive clipboard through your own private practice after input; the kit does not modify it or your credential store. The parent shell and any existing `CLOUDFLARE_API_TOKEN` environment are unchanged.

## What to return

Return **only** the bounded JSON evidence file printed by the launcher and the execution time. No raw API response, headers, token ID/value/fragments, credential screenshots, passphrase or key. `sourceTokenResult: PASS` means this supplied source authenticated and was active at that time, not installed-secret equality, scope or launch acceptance. `FAIL` identifies rejected/inactive source authentication; `BLOCKED` identifies an unmet check. Scope/resource/installed-secret/backup/release certification flags remain false.

The launcher does not repeat a failed check. Chief verifies the sanitized evidence independently. After sourcePASS, the next gate is separately authorized protected verification of `creatorloop-acceptance/CLOUDFLARE_API_TOKEN` on the exact reviewed integrated candidate, or an exact secret cutover if needed. Neither action is authorized by this kit.

## If the source token is unavailable

The launcher returns **`SOURCE_TOKEN_UNAVAILABLE`** without a request when you do not confirm availability or provide no value. Narrow recovery: locate the existing value in the Owner-controlled password manager/keychain or original private provisioning record. Do not disclose it to Manus. Cloudflare and GitHub masked secret views cannot recover an original token value.

If no legitimate private copy exists, stop and request **separate exact Trustee authorization** for a replacement of the intended user-owned CreatorLoop source with its approved account/policy constraints, followed by a separately approved exact GitHub-secret cutover if required. No blanket rotation, wider permission, replacement, recovery extraction or backup execution is included here. Preserve original backup passphrases and encrypted artifacts untouched.
