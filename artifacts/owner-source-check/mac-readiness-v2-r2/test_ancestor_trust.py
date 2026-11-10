#!/usr/bin/env python3
"""F1-only regression runner; original seven readiness tests are NOT executed."""
import hashlib
import io
import json
import os
from pathlib import Path
import time
import unittest
import test_readiness as helper

ROOT = Path(__file__).resolve().parent


class AncestorTrustTests(unittest.TestCase):
    executions = 0
    observations = []
    setUpClass = classmethod(helper.ReadinessTests.setUpClass.__func__)
    tearDownClass = classmethod(helper.ReadinessTests.tearDownClass.__func__)
    fixture = helper.ReadinessTests.fixture
    check_run = helper.ReadinessTests.check_run
    names = staticmethod(helper.ReadinessTests.names)

    def test_01_untrusted_ancestors_block_before_custody(self):
        for ancestor in ("home", "users"):
            for fault in ("group-write", "world-write", "acl", "foreign-owner", "symlink"):
                with self.subTest(ancestor=ancestor, fault=fault):
                    f = self.fixture()
                    p = f.home if ancestor == "home" else f.home.parent
                    f.cfg["require_empty_home"] = True
                    if fault == "group-write":
                        p.chmod(0o775)
                    elif fault == "world-write":
                        p.chmod(0o777)
                    elif fault == "acl":
                        f.cfg["acl"] = [ancestor]
                    elif fault == "foreign-owner":
                        f.cfg["owner_override"] = {ancestor: os.geteuid() + 1}
                    else:
                        real = f.support / (ancestor + "-real")
                        p.rename(real)
                        p.symlink_to(real)
                    d, calls = self.check_run(f, "BLOCKED")
                    self.assertEqual([d[k] for k in ("home", "kit", "evidence")], ["BLOCKED"] * 3)
                    self.assertEqual(d["safeExistingSourcePossession"], "UNCONFIRMED")
                    expected = "OWNER_HOME_PIN_OR_OWNERSHIP_MISMATCH" if ancestor == "home" and fault in ("foreign-owner", "symlink") else "OWNER_HOME_ANCESTOR_OWNER_MODE_OR_ACL_BLOCKED"
                    self.assertEqual(d["codes"], [expected, "KIT_AND_EVIDENCE_NOT_INSPECTED_HOME_BLOCKED", "SOURCE_CONFIRMATION_NOT_REQUESTED_HOME_BLOCKED"])
                    names = self.names(calls)
                    self.assertFalse(any(n.startswith(("stat-base", "ls-base", "stat-evidence", "ls-evidence", "stat-kit", "ls-kit", "stat-install", "ls-install")) for n in names))
                    for n in ("shasum-pin", "shasum-check", "node-offline", "osascript"):
                        self.assertNotIn(n, names)

    def test_02_safe_ancestor_modes_preserve_readiness(self):
        for home_mode, users_mode, users_owner in ((0o700, 0o755, os.geteuid()), (0o755, 0o755, 0), (0o750, 0o750, os.geteuid())):
            with self.subTest(home_mode=oct(home_mode), users_mode=oct(users_mode), users_owner=users_owner):
                f = self.fixture()
                f.home.chmod(home_mode)
                f.home.parent.chmod(users_mode)
                f.base.chmod(0o755)
                f.cfg["owner_override"] = {"users": users_owner}
                d, calls = self.check_run(f, "PASS")
                self.assertEqual([d[k] for k in ("home", "node", "kit", "evidence")], ["PASS"] * 4)
                self.assertEqual(d["codes"], [])
                names = self.names(calls)
                for check in ("stat-users", "ls-users", "ls-home"):
                    self.assertLess(names.index(check), names.index("stat-base"))
                    self.assertLess(names.index(check), names.index("shasum-pin"))
                    self.assertLess(names.index(check), names.index("node-offline"))
                self.assertEqual(names.count("node-offline"), 1)
                self.assertEqual(names.count("osascript"), 1)

    def test_03_exact_clean_command_contains_corrected_source(self):
        prefix = "/usr/bin/env -i HOME=/var/empty PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=C LC_ALL=C /bin/bash --noprofile --norc -p -s <<'CREATORLOOP_MAC_READINESS_V2'\n"
        command = (ROOT / "Owner_Mac_Readiness_Command.txt").read_text()
        self.assertEqual(command, prefix + self.source + "CREATORLOOP_MAC_READINESS_V2\n")
        self.assertIn('trusted_path "$USERS_PARENT" && trusted_path "$actual_home"', self.source)
        self.assertLess(self.source.index('trusted_path "$USERS_PARENT" && trusted_path "$actual_home"'), self.source.index('home_status=PASS; clean_home="$actual_home"'))
        self.assertNotIn("--execute-read-only", self.source)


def main():
    started = time.monotonic()
    detail = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(AncestorTrustTests)
    result = unittest.TextTestRunner(stream=detail, verbosity=2).run(suite)
    summary = {"protocol": "CREATORLOOP_READINESS_F1_REGRESSION", "status": "PASS" if result.wasSuccessful() else "FAIL", "testsRun": result.testsRun, "fixtureExecutions": AncestorTrustTests.executions, "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped), "nativeMacTested": False, "sourceAuthenticated": False, "networkRequests": 0, "credentialReads": 0, "fixtureTargetsChanged": False, "originalSuitesRepeated": False, "elapsedSeconds": round(time.monotonic() - started, 3), "commandSha256": hashlib.sha256((ROOT / "Owner_Mac_Readiness_Command.txt").read_bytes()).hexdigest()}
    log = "F1 ANCESTOR-TRUST REGRESSIONS ONLY\nReal nonroot Linux Bash -p; fixed-path Mac metadata/Node/UI/checksum shims; inert fictional kit.\nNo native Mac, accepted kit execution, credentials, network or protected operations. Original seven readiness tests not executed.\nAll fixture target bytes/modes/owners/mtime/symlinks unchanged during each readiness execution.\n" + detail.getvalue()
    log += "".join(json.dumps(o, separators=(",", ":")) + "\n" for o in AncestorTrustTests.observations)
    log += json.dumps(summary, separators=(",", ":")) + "\n"
    (ROOT / "ancestor-trust-tests.log").write_text(log)
    print(json.dumps(summary, separators=(",", ":")))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
