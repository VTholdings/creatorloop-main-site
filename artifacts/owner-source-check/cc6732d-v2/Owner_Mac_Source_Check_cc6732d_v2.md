# CreatorLoop — corrected Owner Mac source-check kit v2

**LIVE TOKEN USE IS BLOCKED UNTIL CHIEF RETURNS PASS FOR THIS EXACT V2 ARCHIVE.** The v1 kit failed launcher security review. Keep v1 as historical evidence; do not run it with a credential.

Chief's accepted findings are preserved: original archive integrity, seven original payload hashes, four pinned repository files and GET-only verifier. V2 changes **only** `Run_Owner_Check.command` and these instructions; the Owner Node entrypoint and four repository files remain unchanged. New archive/manifest/checksum identify those two corrections. Repository source remains `cc6732dba75b208dae05c886c56af73a4b16f012`.

## Security correction

The launcher explicitly unsets `source_token` and removes its export attribute at startup and immediately before hidden input. Assignment alone does not clear an inherited export. It also disables automatic export, tracing and history. Every external child uses an absolute executable through `/usr/bin/env -i` with exactly `HOME`, fixed system `PATH`, `LANG` and `LC_ALL`. No credential is an environment variable or process argument; the value crosses only an anonymous stdin pipe.

Every Node invocation—version, offline integrity and source check—uses **`/usr/local/bin/node`**, never `command -v`, an alias, a function or ambient PATH. The launcher requires a real nonsymlink executable with version `v22.23.3`; the file and `/usr`, `/usr/local`, `/usr/local/bin` must be root/Owner-owned and not group/other-writable. These checks execute through sanitized absolute Apple utilities. No Node fallback, download, upgrade, symlink creation or permission relaxation occurs.

`#!/bin/bash -p` protects direct execution from inherited `BASH_ENV`, `ENV`, exported functions and shell options. The documented entry below additionally empties the environment **before starting Bash** and passes `--noprofile --norc -p`. `-p` suppresses startup inheritance; it grants no OS privileges, and root execution is rejected. A launcher cannot undo malicious code already run by an unsafe caller: **never use plain `/bin/bash file`, `source file`, a PATH-selected interpreter or another invocation.** The Owner's trusted Terminal, Apple utilities, approved Node binary and Mac administrator remain trust boundaries, not independently verified facts from the sandbox.

Reference: [GNU Bash privileged-mode semantics](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html).

## Download/install — code only

Use the immutable VT-owned GitHub links supplied in the handoff. Download `CreatorLoop_Owner_Source_Check_cc6732d_v2.zip` and its `.zip.sha256` file. No keys, token values, passphrases, credential configuration or private evidence are included.

On the designated Mac in a trusted Terminal, verify the archive with a clean environment:

```sh
/usr/bin/env -i HOME=/Users/tt1 PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=C LC_ALL=C /bin/bash --noprofile --norc -p -c 'cd /Users/tt1/Downloads && /usr/bin/shasum -a 256 -c CreatorLoop_Owner_Source_Check_cc6732d_v2.zip.sha256'
```

Stop on mismatch. Save checksum links with their exact filename, not a browser-added `.txt` suffix. Install into **new v2 custody**, never over v1 or either signer installation:

```sh
/usr/bin/env -i HOME=/Users/tt1 PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=C LC_ALL=C /bin/bash --noprofile --norc -p -c 'umask 077; /bin/mkdir /Users/tt1/.vt-creatorloop/source-check-cc6732d-v2 && /usr/bin/unzip /Users/tt1/Downloads/CreatorLoop_Owner_Source_Check_cc6732d_v2.zip -d /Users/tt1/.vt-creatorloop/source-check-cc6732d-v2 && /bin/chmod -R u=rwX,go= /Users/tt1/.vt-creatorloop/source-check-cc6732d-v2'
```

If the destination exists, stop; do not overwrite. Code-only installation does not authorize live source input.

## Run only after Chief PASS and existing Trustee source-check authority

Close screen recording/sharing and plaintext Notes. Use only an **existing safe, privately held user-owned source token**. Known exposed/uncontained material is not safe. Do not put the token into Terminal commands, environment assignments, chat, screenshots or files.

The exact entry is:

```sh
/usr/bin/env -i HOME=/Users/tt1 PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=C LC_ALL=C /bin/bash --noprofile --norc -p /Users/tt1/.vt-creatorloop/source-check-cc6732d-v2/CreatorLoop_Owner_Source_Check_cc6732d/Run_Owner_Check.command
```

No ambient PATH/NODE_OPTIONS/NODE_PATH/shell startup configuration reaches Node. The launcher verifies its runtime and kit integrity **before** hidden input, and requires existing Owner-only evidence at `/Users/tt1/.vt-creatorloop/evidence`, mode700. If `/usr/local/bin/node` is absent, a symlink, unsafe or a different version, it returns a fixed blocker before input. Report only the actual existing Node absolute path/version/nonsecret hash for a reviewed pin correction. Do not choose a PATH result, modify the launcher, install another runtime or repair its permissions automatically. This fixed path is a required operational pin, not a claim that Manus observed it on the Mac.

After Chief PASS, answer `yes` only if the safe source already exists. Enter/paste its value **only** at the hidden prompt. The parent shell/environment is unchanged; only a private shell-local variable and Node stdin receive it. Child environments contain no token. Source text is not saved, echoed or logged; JavaScript strings cannot be guaranteed zeroized, so the trusted local administrator remains a residual boundary. Clipboard clearing is your private responsibility; the kit does not read or modify clipboard/keychain data.

## Scope and result

Accepted verifier scope remains **one maximum GET** to `https://api.cloudflare.com/client/v4/user/tokens/verify`, five-second deadline,16KiB response limit, no redirect/retry/fallback. No resource/metadata requests, OAuth, credential changes, GitHub secret operations, backup, migrations, signing, admission, merge or deployment. All scope/resource/installed-secret/backup/release certification flags stay false. SourcePASS is not launch acceptance or installed-secret equality.

Return only the bounded JSON and execution time, never raw responses, headers, credential IDs/values/fragments or screenshots. Sanitized evidence is written to a new Owner-only file; an evidence-write failure is not reported as successful retention.

If no safe value exists, stop: **`SOURCE_TOKEN_UNAVAILABLE`**, no request. Recover only an existing legitimate Owner-private password-manager/keychain/provisioning copy. Masked Cloudflare/GitHub views cannot reveal the original. If no private copy exists, exact replacement and any GitHub cutover need separate Trustee authority. Preserve original backup passphrases and encrypted backups untouched.
