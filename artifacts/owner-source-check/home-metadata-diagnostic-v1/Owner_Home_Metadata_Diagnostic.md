# CreatorLoop — Owner-home metadata diagnostic

**DIAGNOSTIC_EXECUTION: HOLD — Chief approval required. No Trustee run requested.** This is a new diagnostic, not another readiness execution or a permission/security-policy correction.

Trustee's Chief-approved readiness run at `970b6a78a938ee2b9bc4bc4c12774cf70f12aa47` returned `/Users/tt1`, Node PASS, and `OWNER_HOME_ANCESTOR_OWNER_MODE_OR_ACL_BLOCKED`. Kit/evidence were not inspected and no possession dialog appeared. Preserve Node PASS and all prior V2/F1 acceptance. Chief approval is recorded at PR29 comment `6772352452`; Oversight's actual-result receipt is comment `6772451563`. No live token check occurred.

## What can explain this blocker

The current `trusted_path` checks ownership, mode, symlink state and `acl_none`. The latter accepts `ls -ldne` output only when it is nonempty and has no newline. Any ACL entry adds a line, so even a deny-only ACL is rejected. The exact blocker does not distinguish `/Users` from the home or ownership/mode failure from an ACL/metadata failure.

Apple documents ACL entries as ordered allow/deny rules, with separate directory rights to add entries, remove children and change security. A deny-delete entry is not a write grant.[1][2] A macOS specialist documents `group:everyone deny delete` on home folders, but configurations vary.[3] This is a plausible normal configuration, **not an established fact about this Mac**. Do not remove that ACL, declare the home safe, or change the readiness policy from this evidence alone.

## Exact diagnostic boundary

The clean privileged Bash command invokes only absolute system `uname`, `stat` and `ls`. It reads directory metadata for exactly `/Users` and `/Users/tt1`; `ls -d` lists the directory object rather than its contents.[4] No recursive listing, extended-attribute values, credential files, keychain, Node, kit, evidence, hashes, imports, dialog, readiness script or network operation is included. It makes no application file writes or permission/ACL changes.

One bounded JSON line reports fixed paths, directory/symlink state, validated numeric owner UID/octal mode, Owner/root/other classification, group/other write bits, and one ACL pattern enum. Raw ACL names, UUIDs, rights text, filenames, symlink targets and command errors are never emitted. Only an exact single local Everyone deny-delete entry receives `SINGLE_EVERYONE_DENY_DELETE`; other/inherited/multiple/unrecognized entries remain `OTHER_OR_UNRECOGNIZED_ACL`. Unavailable/invalid metadata is UNKNOWN/null, not proof of safety.

Apple's native numeric-only `ls -n` bypasses ACL principal-name translation and prints a UUID.[5] The classifier recognizes only Apple's exact public Everyone UUID `ABCDEFAB-CDEF-ABCD-EFAB-CDEF0000000C` or the legacy literal `group:everyone`, followed by `deny delete` on one line.[6] It does not resolve identities or allow arbitrary UUIDs. Horizontal whitespace only prevents a split/malformed entry from matching. Retain numeric-only listing; do not enable name lookup to diagnose this case.

`readinessNoAclPredicate` describes the existing newline test only. It is not a new readiness result. Every successful diagnostic output remains `METADATA_ONLY` with `securityDecision:UNCHANGED_HOLD`, `readinessReRun:false`, `sourceAuthenticated:false`, and zero procedure network/credential reads/changes. Metadata snapshots do not certify effective permissions, ACL membership, concurrent stability or all custody controls.

`Expected_Output_Illustrative.json` is a fictional schema/example: UID 501 and the shown modes/ACLs are not observed Mac facts. Actual output may differ. Even that example leaves the existing no-ACL predicate BLOCKED and security decision unchanged.

## Chief review and later interpretation

Chief must approve the exact immutable command before it is delivered as a Trustee execution instruction. After approval only, one private run in the designated trusted native Terminal may return the bounded JSON—no screenshots or secrets. Native system-tool behavior has not yet been tested by this diagnostic.

Trusted owners/nonsymlink directories/no group-or-other writes plus only `NONE` or `SINGLE_EVERYONE_DENY_DELETE` would support a normal-ACL explanation for Chief review; it would not authorize a policy change or readiness rerun. Other ownership, write access, symlinks, ACLs or unknown metadata require specific review. Prepare a correction only after actual output establishes what is needed. No repair or blanket ACL allowance is proposed.

## References

[1]: https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html "Apple file-system ACL evaluation and rights"
[2]: https://raw.githubusercontent.com/apple-oss-distributions/file_cmds/main/chmod/chmod.1 "Apple published chmod manual: directory ACL permissions"
[3]: https://eclecticlight.co/2022/02/16/permissions-and-acls/ "macOS home-folder deny-delete examples and configuration variation"
[4]: https://raw.githubusercontent.com/apple-oss-distributions/file_cmds/main/ls/ls.1 "Apple published ls manual: directory-only ACL and numeric metadata flags"
[5]: https://raw.githubusercontent.com/apple-oss-distributions/file_cmds/main/ls/print.c "Apple native ls numeric ACL formatting and name-translation bypass"
[6]: https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/kern/kern_credential.c "Apple kernel well-known Everyone GUID fingerprint and code"
