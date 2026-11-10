#!/bin/bash
# Owner-only kit launcher. No credential value is in argv, export, history or files.
set +x
set -o pipefail
umask 077
source_token=''
trap 'unset source_token' EXIT
kit_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
cd "$kit_dir" || exit 1
if [[ "$(/usr/bin/uname -s)" != 'Darwin' ]]; then
  printf '%s\n' 'OWNER_MAC_REQUIRED — no token read and no network request.'
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != 'v22.23.3' ]]; then
  printf '%s\n' 'APPROVED_NODE_V22.23.3_REQUIRED — no install or token read performed.'
  exit 1
fi
/usr/bin/shasum -a 256 -c SHA256SUMS || exit 1
node owner-source-token-check.mjs --offline-validate || exit 1
evidence_dir="$HOME/.vt-creatorloop/evidence"
if [[ ! -d "$evidence_dir" || -L "$evidence_dir" ]] || [[ "$(/usr/bin/stat -f '%u:%Lp' "$evidence_dir")" != "$(id -u):700" ]]; then
  printf '%s\n' 'EXISTING_OWNER_PRIVATE_EVIDENCE_DIRECTORY_REQUIRED — no token read.'
  exit 1
fi
printf '%s\n' 'Close screen sharing/recording and plaintext Notes before continuing.'
printf '%s\n' 'Use only an EXISTING privately held safe USER-owned CreatorLoop source token.'
printf '%s\n' 'Do not use an uncontained exposed token. No creation, rotation or GitHub change is included.'
answer=''
IFS= read -r -p 'Is that existing safe source available? Type yes, or press Return to stop: ' answer </dev/tty || exit 1
if [[ "$answer" != 'yes' ]]; then
  printf '%s\n' 'SOURCE_TOKEN_UNAVAILABLE'
  exit 1
fi
IFS= read -r -s -p 'Existing source token (hidden local input): ' source_token </dev/tty
input_status=$?
printf '\n'
if [[ "$input_status" -ne 0 || -z "$source_token" ]]; then
  printf '%s\n' 'SOURCE_TOKEN_UNAVAILABLE'
  exit 1
fi
result_file=$(/usr/bin/mktemp "$evidence_dir/source-token-check-cc6732d.XXXXXX") || exit 1
printf 'Execution UTC: %s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')"
# printf is a shell builtin: value crosses an anonymous pipe, never process argv.
printf '%s' "$source_token" | node owner-source-token-check.mjs --execute-read-only --token-stdin | /usr/bin/tee "$result_file"
pipe_status=("${PIPESTATUS[@]}")
result_status=${pipe_status[1]}
unset source_token
if [[ "${pipe_status[2]}" -ne 0 ]]; then
  printf '%s\n' 'SANITIZED_EVIDENCE_SAVE_FAILED — preserve only the bounded JSON privately; do not claim retained evidence.'
  exit 1
fi
printf 'Sanitized result saved privately: %s\n' "$result_file"
printf '%s\n' 'Return only this bounded JSON and execution time. No screenshot, token or passphrase.'
exit "$result_status"
