#!/bin/bash -p
# Review-only until Chief approves; directory metadata ONLY, never readiness.
builtin set +x; builtin set +a; builtin set +o history
builtin unset -v source_token
builtin export -n source_token
readonly SAFE_PATH='/usr/bin:/bin:/usr/sbin:/sbin'
PATH="$SAFE_PATH"; readonly PATH
cle(){ /usr/bin/env -i HOME=/var/empty PATH="$SAFE_PATH" LANG=C LC_ALL=C "$@"; }
if [[ "$-" != *p* || "$EUID" -eq 0 || "$(cle /usr/bin/uname -s </dev/null 2>/dev/null)" != Darwin ]]; then
  builtin printf '{"protocol":"CREATORLOOP_HOME_METADATA_DIAGNOSTIC_V1","status":"BLOCKED","code":"TRUSTED_NONROOT_MAC_SESSION_REQUIRED","networkRequests":0,"credentialReads":0,"changesMade":false,"readinessReRun":false,"sourceAuthenticated":false}\n'
  exit 1
fi
inspect(){
  local p="$1" kind=MISSING_OR_UNAVAILABLE owner=null mode=UNKNOWN relation=UNKNOWN gw=null ow=null
  local meta='' uid='' perms='' extra='' listing='' first='' body='' acl=NOT_INSPECTED predicate=NOT_EVALUATED
  if [[ -L "$p" ]]; then kind=SYMLINK; elif [[ -d "$p" ]]; then kind=DIRECTORY; elif [[ -e "$p" ]]; then kind=NOT_DIRECTORY; fi
  meta="$(cle /usr/bin/stat -f '%u %Lp' "$p" </dev/null 2>/dev/null)"; meta_exit=$?
  if [[ "$meta_exit" -eq 0 && ${#meta} -le 64 ]]; then
    IFS=' ' builtin read -r uid perms extra <<< "$meta"
    if [[ "$uid" =~ ^(0|[1-9][0-9]{0,9})$ && "$perms" =~ ^[0-7]{3,4}$ && -z "$extra" && "$meta" != *$'\n'* ]]; then
      owner="$uid"; mode="$perms"
      if [[ "$uid" == "$EUID" ]]; then relation=CURRENT_OWNER; elif [[ "$uid" == 0 ]]; then relation=ROOT; else relation=OTHER; fi
      gw=false; ow=false
      (( (8#$perms & 0020) != 0 )) && gw=true
      (( (8#$perms & 0002) != 0 )) && ow=true
    fi
  fi
  if [[ "$kind" == DIRECTORY ]]; then
    listing="$(cle /bin/ls -ldne "$p" </dev/null 2>/dev/null)"; ls_exit=$?
    acl=UNAVAILABLE_OR_UNRECOGNIZED
    if [[ "$ls_exit" -eq 0 && -n "$listing" && ${#listing} -le 16384 ]]; then
      predicate=PASS
      [[ "$listing" == *$'\n'* ]] && predicate=BLOCKED
      first="${listing%%$'\n'*}"
      if [[ "$first" =~ ^d[rwxstST-]{9}[@+]?[[:space:]] ]]; then
        if [[ "$listing" != *$'\n'* ]]; then
          [[ "${first:10:1}" != '+' ]] && acl=NONE
        else
          body="${listing#*$'\n'}"
          # -n emits UUIDs and avoids ACL principal-name translation on Apple ls.
          if [[ "$body" =~ ^[[:blank:]]*0:[[:blank:]]+(group:everyone|ABCDEFAB-CDEF-ABCD-EFAB-CDEF0000000C)[[:blank:]]+deny[[:blank:]]+delete[[:blank:]]*$ ]]; then
            acl=SINGLE_EVERYONE_DENY_DELETE
          else
            acl=OTHER_OR_UNRECOGNIZED_ACL
          fi
        fi
      fi
    fi
  fi
  # Only fixed labels/enums and validated numeric metadata leave the process.
  builtin printf '{"path":"%s","kind":"%s","ownerUid":%s,"ownerRelation":"%s","mode":"%s","groupWritable":%s,"otherWritable":%s,"aclPattern":"%s","readinessNoAclPredicate":"%s"}' "$p" "$kind" "$owner" "$relation" "$mode" "$gw" "$ow" "$acl" "$predicate"
}
builtin printf '{"protocol":"CREATORLOOP_HOME_METADATA_DIAGNOSTIC_V1","status":"METADATA_ONLY","paths":['
inspect /Users
builtin printf ','
inspect /Users/tt1
builtin printf '],"networkRequests":0,"credentialReads":0,"changesMade":false,"readinessReRun":false,"sourceAuthenticated":false,"securityDecision":"UNCHANGED_HOLD"}\n'
