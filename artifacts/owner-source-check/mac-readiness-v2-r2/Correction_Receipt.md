# CreatorLoop — readiness F1 correction receipt

**Original supplemental result: FAIL. Correction: PASS_LOCAL only. Chief acceptance: PENDING. OWNER_MAC_EXECUTION: HOLD.**

The isolated supplemental reviewer identified missing permissions/ACL checks on the Owner home and missing `/Users` ancestor trust checks in procedure commit `9d22b856ddef66c694d2aa13cee7c2dc233840d6`. The original command is superseded for execution. This was not evidence of an actual Mac compromise.

Revision 2 adds `USERS_PARENT=/Users` and reuses `trusted_path` on that parent and the exact resolved Owner home before home PASS or changing clean HOME. Home pin, EUID ownership and nonsymlink checks remain. Both paths must reject group/other writes and all ACL entries. A failed gate skips custody/evidence metadata, checksum-file/code reads, offline validation and the Yes/No dialog. Existing trusted Node version check can still run with HOME `/var/empty`; no private path input is passed to it. Skipped-work codes now state HOME_BLOCKED rather than incorrectly implying every failure is a different home.

**Targeted local verification: 3 tests, 13 fictional Linux Bash fixture executions, zero failures/errors/skips; PASS.** Ten negative cases cover home and `/Users` group/world write, ACL, foreign ownership and symlink states. Three safe-mode/ownership cases preserve PASS and verify ancestor checks precede custody/checksum/import work. Unsafe fixtures also enforce child HOME remains `/var/empty`. The exact full clean command/body relationship and correction order pass a static test. Source and complete command syntax checks pass. Each fixture's target bytes/modes/owners/mtime/symlinks remain unchanged during execution. Fake metadata/Node/UI/checksum shims use an inert fictional kit; no accepted kit code executes.

Command SHA-256: `ef7a37b3bb75d4054d39e70e61b4f02016a2ecbc645dcee1bf6ddb91d7a2c3fe`.

The helper from the previous readiness suite was reused and minimally adapted for fixture path translation and the new blocked labels. Its original seven tests were not executed. No V2 launcher, verifier, Team, full application, migration, cloud or earlier acceptance suite was repeated. The helper's later docstring-only clarification did not alter runtime logic; no additional suite run was necessary.

Native macOS Directory Services, BSD metadata/ACL output, Node and AppleScript have not been executed. The conservative no-ACL policy can reject a harmless or standard deny-only home ACL; that requires specific Chief review, not automatic ACL deletion or weakening. Actual Owner home/Node/kit/evidence readiness and source possession remain unknown.

Accepted V2 launcher/artifact commit `d0dd305efe2c1e7da4aa5d4fd9c7cb2f72130035`, its checksum-table fingerprint, accepted source verifier commit `cc6732dba75b208dae05c886c56af73a4b16f012`, PR #29 candidate code, Mac signer, cloud resources, protected configuration and credentials are unchanged. No native Mac execution, live source/token request, secret read/replacement, credential rotation, protected workflow, backup, signing, admission, migration, merge or deployment occurred.

Chief must return `READINESS_PROCEDURE: PASS/FAIL` and `OWNER_MAC_EXECUTION: APPROVED/HOLD` for the new exact immutable revision. No corrected supplemental PASS or Chief approval is implied. HTTP 401/source authentication remains unresolved pending those gates and an actual authorized Owner-private result.
