#!/bin/bash -p
# V2: -p ignores BASH_ENV/ENV, imported functions and ambient shell options.
# It grants no OS privileges. The documented entry clears env BEFORE Bash.
builtin set +x
builtin set +a
builtin set +o history
builtin set -o pipefail
builtin umask 077
builtin unset -v source_token
builtin export -n source_token
builtin unset BASH_ENV ENV NODE_OPTIONS NODE_PATH CDPATH GLOBIGNORE HISTFILE
IFS=$' \t\n'
readonly OWNER_HOME='/Users/tt1'
readonly SAFE_PATH='/usr/bin:/bin:/usr/sbin:/sbin'
readonly NODE_EXECUTABLE='/usr/local/bin/node'
PATH="$SAFE_PATH"
readonly PATH
builtin trap 'builtin unset -v source_token' EXIT
clean_exec(){
  /usr/bin/env -i HOME="$OWNER_HOME" PATH="$SAFE_PATH" LANG=C LC_ALL=C "$@"
}
blocked(){ builtin printf '%s\n' "$1"; exit 1; }
[[ "$-" == *p* ]] || blocked 'PROTECTED_SHELL_STARTUP_REQUIRED — use only the documented entry.'
if [[ "$EUID" -eq 0 ]]; then blocked 'OWNER_NONROOT_SESSION_REQUIRED — no token read.'; fi
if [[ "$(clean_exec /usr/bin/uname -s)" != 'Darwin' ]]; then blocked 'OWNER_MAC_REQUIRED — no token read and no request.'; fi
script_path="${BASH_SOURCE[0]}"
if [[ "$script_path" != */* ]]; then blocked 'ABSOLUTE_OR_EXPLICIT_SCRIPT_PATH_REQUIRED'; fi
builtin cd -- "${script_path%/*}" || exit 1
kit_dir="$(builtin pwd -P)" || exit 1
readonly kit_dir
# Trust only this fixed, real executable and its non-writable directory chain.
secure_node_path(){
  local p="$1" owner mode meta
  [[ ! -L "$p" ]] || return 1
  meta="$(clean_exec /usr/bin/stat -f '%u %Lp' "$p")" || return 1
  IFS=' ' builtin read -r owner mode <<< "$meta"
  [[ "$owner" =~ ^[0-9]+$ && "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  [[ "$owner" == 0 || "$owner" == "$EUID" ]] || return 1
  (( (8#$mode & 0022) == 0 )) || return 1
}
for p in /usr /usr/local /usr/local/bin; do
  [[ -d "$p" ]] && secure_node_path "$p" || blocked 'TRUSTED_ABSOLUTE_NODE_PATH_REQUIRED — no fallback or install.'
done
[[ -f "$NODE_EXECUTABLE" && -x "$NODE_EXECUTABLE" ]] && secure_node_path "$NODE_EXECUTABLE" || blocked 'TRUSTED_ABSOLUTE_NODE_REQUIRED — no token read.'
[[ "$(clean_exec "$NODE_EXECUTABLE" --version)" == 'v22.23.3' ]] || blocked 'APPROVED_NODE_V22.23.3_REQUIRED — no token read.'
clean_exec /usr/bin/shasum -a 256 -c SHA256SUMS || exit 1
clean_exec "$NODE_EXECUTABLE" "$kit_dir/owner-source-token-check.mjs" --offline-validate || exit 1
readonly evidence_dir="$OWNER_HOME/.vt-creatorloop/evidence"
[[ -d "$evidence_dir" && ! -L "$evidence_dir" ]] || blocked 'EXISTING_OWNER_PRIVATE_EVIDENCE_DIRECTORY_REQUIRED'
[[ "$(clean_exec /usr/bin/stat -f '%u:%Lp' "$evidence_dir")" == "$EUID:700" ]] || blocked 'EXISTING_OWNER_PRIVATE_EVIDENCE_DIRECTORY_REQUIRED'
builtin printf '%s\n' 'LIVE USE HELD UNTIL CHIEF RETURNS PASS FOR THIS V2 KIT.'
builtin printf '%s\n' 'Close screen sharing/recording and Notes. Use only an existing safe USER-owned source.'
answer=''
IFS= builtin read -r -p 'After Chief PASS, is that existing safe source available? Type yes or Return to stop: ' answer </dev/tty || exit 1
[[ "$answer" == 'yes' ]] || blocked 'SOURCE_TOKEN_UNAVAILABLE'
# Explicitly clear inherited export state immediately before receiving input.
builtin unset -v source_token
builtin export -n source_token
source_token=''
builtin export -n source_token
IFS= builtin read -r -s -p 'Existing source token (hidden local input): ' source_token </dev/tty
input_status=$?
builtin printf '\n'
[[ "$input_status" -eq 0 && -n "$source_token" ]] || blocked 'SOURCE_TOKEN_UNAVAILABLE'
result_file="$(clean_exec /usr/bin/mktemp "$evidence_dir/source-token-check-cc6732d-v2.XXXXXX")" || exit 1
builtin printf 'Execution UTC: %s\n' "$(clean_exec /bin/date -u '+%Y-%m-%dT%H:%M:%SZ')"
# The value crosses only an anonymous pipe, never an export or exec argument.
builtin printf '%s' "$source_token" | clean_exec "$NODE_EXECUTABLE" "$kit_dir/owner-source-token-check.mjs" --execute-read-only --token-stdin | clean_exec /usr/bin/tee "$result_file"
pipe_status=("${PIPESTATUS[@]}")
result_status=${pipe_status[1]}
builtin unset -v source_token
[[ "${pipe_status[2]}" -eq 0 ]] || blocked 'SANITIZED_EVIDENCE_SAVE_FAILED'
builtin printf 'Sanitized result saved privately: %s\n' "$result_file"
builtin printf '%s\n' 'Return only bounded JSON and execution time; no token, screenshot or passphrase.'
exit "$result_status"
