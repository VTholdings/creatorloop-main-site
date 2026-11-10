#!/usr/bin/env python3
"""Reused original readiness fixture helper; no accepted kit or external services.

For F1 correction run test_ancestor_trust.py only; original methods are retained
but not executed by that runner. No original suite repetition is claimed.
Real /bin/bash -p runs a fixture copy with only literal platform paths/constants
translated. The Mac shims perform no networking, launchers, JS, or credential IO.
The fixture pin authenticates fictional fixture bytes, NOT the accepted V2 kit.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "readiness.sh"
LOG = ROOT / "readiness-tests.log"
PIN = "8fc8378fb6d460428182ac77d0287588981a6daaf567a4516ebe7d4f9fac834a"
OFFLINE = '{"integrityVerified":true,"sourceCommit":"cc6732dba75b208dae05c886c56af73a4b16f012","reviewedUserEndpointVerified":true,"networkRequests":0,"keyReadOrGenerated":false}'
FILES = (
    "SOURCE_MANIFEST.json", "Run_Owner_Check.command", "OWNER_MAC_README.md",
    "owner-source-token-check.mjs", "scripts/lib/cloudflare-readonly.mjs",
    "scripts/lib/cloudflare-token-custody-preflight.mjs",
    "scripts/acceptance/cloudflare-targets.json",
    "scripts/diagnostics/private-cloudflare-token-preflight.mjs",
)

# Each executable is the same strictly dispatched, network-free Python shim.
# The embedded config and call log live OUTSIDE all fixture target directories.
SHIM = r'''#!/usr/bin/python3
import hashlib, json, os, pathlib, sys
CFG = __CONFIG__
with open(CFG, encoding="utf-8") as f:
    c = json.load(f)
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
def record(call, flags):
    with open(c["log"], "a", encoding="utf-8") as f:
        f.write(json.dumps({"call": call, "flags": flags}, separators=(",", ":")) + "\n")
def reject(reason):
    record("rejected-call", [reason]); sys.exit(97)
def label(path):
    return c["labels"].get(str(path), "unexpected-target")
if os.environ.get("HOME") not in ("/var/empty", c["home"]):
    reject("unclean-HOME")
if c.get("require_empty_home") and os.environ.get("HOME") != "/var/empty":
    reject("premature-owner-HOME")
if os.environ.get("PATH") != "/usr/bin:/bin:/usr/sbin:/sbin":
    reject("unclean-PATH")
# Python may coerce C locale to C.UTF-8; there are no inherited credential vars.
if set(os.environ) - {"HOME", "PATH", "LANG", "LC_ALL", "LC_CTYPE"}:
    reject("ambient-environment")
if name == "uname":
    if args != ["-s"]: reject("uname-args")
    record("uname", ["-s"]); print("Darwin")
elif name == "id":
    if args != ["-un"]: reject("id-args")
    record("id", ["-un"]); print("fictional_owner")
elif name == "dscl":
    if args != ["/Local/Default", "-read", "/Users/fictional_owner", "NFSHomeDirectory"]:
        reject("dscl-args")
    record("dscl", ["/Local/Default", "-read", "NFSHomeDirectory"])
    print("NFSHomeDirectory: " + c["dscl_home"])
elif name == "stat":
    if len(args) != 3 or args[0] != "-f" or args[1] not in ("%u", "%u %Lp", "%u:%Lp"):
        reject("stat-args")
    p = args[2]; lab = label(p)
    if lab == "unexpected-target": reject("stat-target")
    record("stat-" + lab, args[:2])
    try: st = os.stat(p)
    except OSError: sys.exit(1)
    uid = c.get("owner_override", {}).get(lab, st.st_uid)
    mode = format(st.st_mode & 0o7777, "o")
    print(str(uid) if args[1] == "%u" else str(uid) + (" " if args[1] == "%u %Lp" else ":") + mode)
elif name == "ls":
    if len(args) != 2 or args[0] != "-ldne": reject("ls-args")
    lab = label(args[1])
    if lab == "unexpected-target": reject("ls-target")
    record("ls-" + lab, ["-ldne"])
    print("fictional-metadata")
    if lab in c.get("acl", []): print("0: fictional ACL deny entry")
elif name == "shasum":
    kit = pathlib.Path(c["kit"])
    if args == ["-a", "256", str(kit / "SHA256SUMS")]:
        record("shasum-pin", ["-a", "256", "SHA256SUMS"])
        b = (kit / "SHA256SUMS").read_bytes()
        print(hashlib.sha256(b).hexdigest() + "  SHA256SUMS")
    elif args == ["-a", "256", "-c", "SHA256SUMS"] and pathlib.Path.cwd() == kit:
        record("shasum-check", ["-a", "256", "-c", "SHA256SUMS"])
        rows = (kit / "SHA256SUMS").read_text().splitlines()
        for row in rows:
            digest, relative = row.split("  ", 1)
            if relative not in c["files"]: reject("hash-read-not-allowlisted")
            if hashlib.sha256((kit / relative).read_bytes()).hexdigest() != digest:
                sys.exit(1)
    else: reject("shasum-args")
elif name in ("node", "node-real"):
    if args == ["--version"]:
        record("node-version", ["--version"]); print(c.get("node_version", "v22.23.3"))
    elif args == [str(pathlib.Path(c["kit"]) / "owner-source-token-check.mjs"), "--offline-validate"]:
        record("node-offline", ["owner-source-token-check.mjs", "--offline-validate"])
        # Do not read, import, evaluate, or execute the fictional JS at all.
        print(c["offline"])
    else: reject("node-not-version-or-offline-only")
elif name == "osascript":
    expected = ["-e", c["dialog"], "-e", 'if gave up of r then return "UNCONFIRMED"', "-e", "return button returned of r"]
    if args != expected: reject("non-button-dialog")
    record("osascript", ["-e", "Yes/No-buttons", "default-No", "giving-up-after-60", "-e", "-e"])
    if c.get("choice") == "unavailable": sys.exit(127)
    print(c.get("choice", "Yes"))
else: reject("unexpected-executable")
'''


class Fixture:
    def __init__(self, source):
        self.temp = tempfile.TemporaryDirectory(prefix="fictional-readiness-")
        self.root = Path(self.temp.name)
        self.target = self.root / "mac"
        self.support = self.root / "support"
        self.support.mkdir()
        self.home = self.target / "Users" / "tt1"
        self.other_home = self.target / "Users" / "not_tt1"
        self.base = self.home / ".vt-creatorloop"
        self.install = self.base / "source-check-cc6732d-v2"
        self.kit = self.install / "CreatorLoop_Owner_Source_Check_cc6732d"
        self.evidence = self.base / "evidence"
        self.usr = self.target / "usr"
        self.node = self.usr / "local" / "bin" / "node"
        self.config = self.support / "config.json"
        self.call_log = self.support / "calls.jsonl"
        self.script = self.support / "readiness-fixture.sh"
        self.labels = {}
        dirs = {"users": self.home.parent, "home": self.home, "other-home": self.other_home, "base": self.base,
                "install": self.install, "kit": self.kit, "evidence": self.evidence,
                "scripts": self.kit / "scripts", "lib": self.kit / "scripts/lib",
                "acceptance": self.kit / "scripts/acceptance",
                "diagnostics": self.kit / "scripts/diagnostics", "usr": self.usr,
                "usr-local": self.usr / "local", "usr-local-bin": self.node.parent}
        for lab, p in dirs.items():
            p.mkdir(parents=True, exist_ok=True)
            p.chmod(0o755 if lab.startswith("usr") or lab == "users" else 0o700)
            self.labels[str(p)] = lab
        for relative in FILES:
            p = self.kit / relative
            p.write_text("FICTIONAL INERT READINESS FIXTURE ONLY: " + relative + "\n")
            p.chmod(0o600)
            self.labels[str(p)] = "kit-file-" + Path(relative).name
        sums = self.kit / "SHA256SUMS"
        sums.write_text("".join(hashlib.sha256((self.kit / r).read_bytes()).hexdigest() + "  " + r + "\n" for r in FILES))
        sums.chmod(0o600)
        self.labels[str(sums)] = "kit-file-SHA256SUMS"
        self.labels[str(self.node)] = "node"
        self.cfg = {"log": str(self.call_log), "home": str(self.home), "dscl_home": str(self.home),
                    "kit": str(self.kit), "labels": self.labels, "files": list(FILES),
                    "offline": OFFLINE, "choice": "Yes"}
        dialog = re.search(r"choice=\"\$\(cle /usr/bin/osascript -e '([^']+)'", source)
        if dialog is None:
            raise AssertionError("Production button-dialog shape changed")
        self.cfg["dialog"] = dialog.group(1)
        shim = SHIM.replace("__CONFIG__", repr(str(self.config)))
        mapping = {}
        for old in ("/bin/ls", "/usr/bin/stat", "/usr/bin/uname", "/usr/bin/id",
                    "/usr/bin/dscl", "/usr/bin/shasum", "/usr/bin/osascript"):
            p = self.support / Path(old).name
            p.write_text(shim); p.chmod(0o755)
            mapping[old] = str(p)
        self.node.write_text(shim); self.node.chmod(0o755)
        translated = source
        replacements = {
            **mapping,
            "readonly EXPECTED_HOME='/Users/tt1'": "readonly EXPECTED_HOME='" + str(self.home) + "'",
            "readonly USERS_PARENT='/Users'": "readonly USERS_PARENT='" + str(self.home.parent) + "'",
            "readonly NODE='/usr/local/bin/node'": "readonly NODE='" + str(self.node) + "'",
            "readonly SUMS_PIN='" + PIN + "'": "readonly SUMS_PIN='" + hashlib.sha256(sums.read_bytes()).hexdigest() + "'",
            "^/Users/": "^" + str(self.target / "Users") + "/",
            "for d in /usr /usr/local /usr/local/bin;": "for d in " + " ".join(str(p) for p in (self.usr, self.usr / "local", self.node.parent)) + ";",
        }
        self.translations = replacements
        for old, new in sorted(replacements.items(), key=lambda pair: len(pair[0]), reverse=True):
            if old not in translated:
                raise AssertionError("Fixed translation not found: " + old)
            translated = translated.replace(old, new)
        # Reversibility proves no additional check logic was changed.
        restored = translated
        for old, new in sorted(replacements.items(), key=lambda pair: len(pair[1]), reverse=True):
            restored = restored.replace(new, old)
        if restored != source:
            raise AssertionError("Fixture translations altered logic")
        self.script.write_text(translated)

    def snapshot(self):
        result = {}
        for p in [self.target] + sorted(self.target.rglob("*")):
            st = p.lstat()
            result[str(p.relative_to(self.target))] = (
                st.st_mode, st.st_uid, st.st_gid, st.st_mtime_ns,
                os.readlink(p) if p.is_symlink() else
                hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None)
        return result

    def run(self):
        self.config.write_text(json.dumps(self.cfg))
        before = self.snapshot()
        started = time.monotonic()
        # Explicit fictional env; never os.environ.copy() or ambient credentials.
        env = {"HOME": str(self.home), "PATH": "/fictional-hostile-path",
               "LANG": "C", "LC_ALL": "C", "BASH_ENV": str(self.support / "nonexistent-bash-env")}
        completed = subprocess.run(["/bin/bash", "-p", str(self.script)],
                                   cwd=self.support, env=env, stdin=subprocess.DEVNULL,
                                   capture_output=True, text=True, timeout=5)
        elapsed = time.monotonic() - started
        after = self.snapshot()
        if before != after:
            raise AssertionError("Readiness changed fixture target directories")
        calls = [json.loads(line) for line in self.call_log.read_text().splitlines()]
        return completed, calls, elapsed

    def close(self):
        self.temp.cleanup()


class ReadinessTests(unittest.TestCase):
    executions = 0
    observations = []

    @classmethod
    def setUpClass(cls):
        if os.geteuid() == 0:
            raise RuntimeError("Tests require real non-root Unix Bash; EUID is not patched")
        cls.source = SOURCE.read_text()
        cls.original_digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()

    @classmethod
    def tearDownClass(cls):
        if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != cls.original_digest:
            raise AssertionError("Production readiness.sh was modified")

    def fixture(self):
        f = Fixture(self.source)
        self.addCleanup(f.close)
        return f

    def check_run(self, f, expected_status):
        cp, calls, elapsed = f.run()
        type(self).executions += 1
        self.assertEqual(cp.stderr, "")
        self.assertLess(elapsed, 5)
        self.assertEqual(len(cp.stdout.splitlines()), 1)
        self.assertTrue(cp.stdout.endswith("\n"))
        self.assertLessEqual(len(cp.stdout.encode()), 4096)
        d = json.loads(cp.stdout)
        self.assertEqual(set(d), {"protocol", "status", "actualHome", "home", "node", "kit", "evidence",
                                  "safeExistingSourcePossession", "sourceAuthenticated", "networkRequests",
                                  "credentialReads", "changesMade", "codes"})
        self.assertEqual(d["protocol"], "CREATORLOOP_MAC_READINESS_V2")
        self.assertEqual(d["status"], expected_status)
        self.assertEqual(cp.returncode, 0 if expected_status == "PASS" else 1)
        self.assertIs(d["sourceAuthenticated"], False)
        self.assertIs(d["changesMade"], False)
        self.assertEqual(d["networkRequests"], 0)
        self.assertEqual(d["credentialReads"], 0)
        for field in ("home", "node", "kit", "evidence"):
            self.assertIn(d[field], ("PASS", "BLOCKED"))
        self.assertIn(d["safeExistingSourcePossession"], ("YES", "NO", "UNCONFIRMED"))
        self.assertTrue(all(re.fullmatch(r"[A-Z0-9_]{1,100}", code) for code in d["codes"]))
        for call in calls:
            self.assertEqual(set(call), {"call", "flags"})
            self.assertNotEqual(call["call"], "rejected-call", call)
            self.assertTrue(call["call"] in {"uname", "id", "dscl", "shasum-pin", "shasum-check", "node-version", "node-offline", "osascript"}
                            or call["call"].startswith(("stat-", "ls-")))
            self.assertNotIn("--execute-read-only", call["flags"])
            self.assertNotIn("Run_Owner_Check.command", call["flags"])
            if call["call"] == "node-offline":
                self.assertEqual(call["flags"], ["owner-source-token-check.mjs", "--offline-validate"])
        type(self).observations.append({"test": self._testMethodName, "status": d["status"],
                                        "codes": d["codes"], "calls": len(calls)})
        return d, calls

    @staticmethod
    def names(calls):
        return [c["call"] for c in calls]

    def test_01_static_no_network_writes_or_credential_input(self):
        s = self.source
        self.assertTrue(s.startswith("#!/bin/bash -p\n"))
        self.assertIn('"$-" != *p*', s)
        self.assertIn('/usr/bin/env -i HOME="$clean_home"', s)
        self.assertNotRegex(s, r"(?m)^\s*(?:cle\s+)?(?:curl|wget|ssh|nc|telnet|sudo|touch|mkdir|rm|mv|cp|chmod|chown|tee)\b")
        self.assertNotRegex(s, r"(?m)(?:^|[;|&])\s*(?:eval|source|\.)\s")
        external = set(re.findall(r"(?<![\w/])/(?:usr/bin|bin)/[A-Za-z0-9_-]+", s))
        self.assertEqual(external, {"/bin/bash", "/usr/bin/env", "/bin/ls", "/usr/bin/stat", "/usr/bin/uname", "/usr/bin/id", "/usr/bin/dscl", "/usr/bin/shasum", "/usr/bin/osascript"})
        self.assertNotIn("--execute-read-only", s)
        self.assertEqual(re.findall(r'cle "\$NODE" ([^\n]+)', s), [
            '--version </dev/null 2>/dev/null)" == v22.23.3 ]]; then node_status=PASS; else add NODE_VERSION_NOT_22_23_3; fi',
            '"$kit/owner-source-token-check.mjs" --offline-validate </dev/null 2>/dev/null)"; node_exit=$?'])
        self.assertEqual(len(re.findall(r"(?m)^\s*(?:IFS=' '\s+)?builtin read\b", s)), 1)
        for line in s.splitlines():
            if "source_token" in line:
                self.assertIn(line, ("builtin unset -v source_token", "builtin export -n source_token"))
            if "Run_Owner_Check.command" in line:
                self.assertTrue(line.startswith("#") or line.strip().startswith("for f in SHA256SUMS"))
        # All filesystem-output redirections go to /dev/null; <<< is metadata input.
        redirections = re.findall(r"(?<![<>])(?:[0-9]*>>?)(?!>)[ \t]*([^ ;)&\n]+)", s)
        self.assertTrue(redirections)
        self.assertTrue(all(target in ("/dev/null", "&1") for target in redirections), redirections)
        dialog = next(line for line in s.splitlines() if 'choice="$(cle' in line)
        self.assertIn('buttons {"No", "Yes"} default button "No" giving up after 60', dialog)
        self.assertNotIn("default answer", dialog.lower())
        self.assertNotIn("text returned", dialog.lower())
        self.assertNotIn("hidden answer", dialog.lower())
        self.assertIn('if gave up of r then return "UNCONFIRMED"', dialog)
        self.assertIn("sourceAuthenticated\":false", s)

    def test_02_full_pass_fictional_fixture(self):
        f = self.fixture()
        d, calls = self.check_run(f, "PASS")
        self.assertEqual([d[k] for k in ("home", "node", "kit", "evidence")], ["PASS"] * 4)
        self.assertEqual(d["actualHome"], str(f.home))
        self.assertEqual(d["safeExistingSourcePossession"], "YES")
        self.assertEqual(d["codes"], [])
        names = self.names(calls)
        self.assertEqual(names.count("node-version"), 1)
        self.assertEqual(names.count("node-offline"), 1)
        self.assertEqual(names.count("osascript"), 1)
        self.assertLess(names.index("shasum-pin"), names.index("shasum-check"))
        self.assertLess(names.index("shasum-check"), names.index("node-offline"))
        self.assertLess(names.index("node-offline"), names.index("osascript"))
        with self.subTest(custody_parent="safe-owner-owned-755"):
            safe = self.fixture()
            safe.base.chmod(0o755)
            safe_d, safe_calls = self.check_run(safe, "PASS")
            self.assertEqual([safe_d[k] for k in ("home", "node", "kit", "evidence")], ["PASS"] * 4)
            self.assertEqual(safe_d["safeExistingSourcePossession"], "YES")
            self.assertEqual(safe_d["codes"], [])
            self.assertEqual(self.names(safe_calls).count("node-offline"), 1)

    def test_03_local_dscl_mismatch_ignores_hostile_home(self):
        f = self.fixture()
        f.cfg["dscl_home"] = str(f.other_home)
        # Child HOME points at the approved-looking tt1 fixture; DSCL disagrees.
        d, calls = self.check_run(f, "BLOCKED")
        self.assertEqual(d["actualHome"], str(f.other_home))
        self.assertEqual([d[k] for k in ("home", "kit", "evidence")], ["BLOCKED"] * 3)
        self.assertEqual(d["node"], "PASS")
        self.assertEqual(d["safeExistingSourcePossession"], "UNCONFIRMED")
        self.assertEqual(d["codes"], ["OWNER_HOME_PIN_OR_OWNERSHIP_MISMATCH", "KIT_AND_EVIDENCE_NOT_INSPECTED_HOME_BLOCKED", "SOURCE_CONFIRMATION_NOT_REQUESTED_HOME_BLOCKED"])
        self.assertEqual(self.names(calls), ["uname", "id", "dscl", "stat-usr", "ls-usr", "stat-usr-local", "ls-usr-local", "stat-usr-local-bin", "ls-usr-local-bin", "stat-node", "ls-node", "node-version"])

    def test_04_untrusted_node_prevents_offline(self):
        for fault in ("missing", "wrong-version", "unsafe-mode", "symlink", "unsafe-parent", "acl"):
            with self.subTest(fault=fault):
                f = self.fixture()
                if fault == "missing": f.node.unlink()
                elif fault == "wrong-version": f.cfg["node_version"] = "v22.23.2"
                elif fault == "unsafe-mode": f.node.chmod(0o777)
                elif fault == "symlink":
                    real = f.support / "node-real"
                    real.write_text(f.node.read_text()); real.chmod(0o755)
                    f.node.unlink(); f.node.symlink_to(real)
                elif fault == "unsafe-parent": f.node.parent.chmod(0o775)
                elif fault == "acl": f.cfg["acl"] = ["node"]
                d, calls = self.check_run(f, "BLOCKED")
                self.assertEqual(d["node"], "BLOCKED")
                self.assertEqual(d["kit"], "BLOCKED")
                self.assertEqual([d[k] for k in ("home", "evidence")], ["PASS"] * 2)
                self.assertEqual(d["safeExistingSourcePossession"], "YES")
                self.assertIn("KIT_OFFLINE_REQUIRES_TRUSTED_NODE", d["codes"])
                self.assertIn("NODE_VERSION_NOT_22_23_3" if fault == "wrong-version" else "NODE_ABSOLUTE_PATH_OWNER_MODE_OR_ACL_BLOCKED", d["codes"])
                self.assertNotIn("node-offline", self.names(calls))
                self.assertEqual(self.names(calls).count("osascript"), 1)
                if fault != "wrong-version": self.assertNotIn("node-version", self.names(calls))

    def test_05_checksum_and_kit_tamper_block_before_js(self):
        for fault in ("pin", "content", "private-mode"):
            with self.subTest(fault=fault):
                f = self.fixture()
                if fault == "pin":
                    with (f.kit / "SHA256SUMS").open("a") as out: out.write("FICTIONAL TAMPER\n")
                elif fault == "content":
                    (f.kit / "scripts/lib/cloudflare-readonly.mjs").write_text("FICTIONAL TAMPER; NEVER IMPORT\n")
                else: (f.kit / "owner-source-token-check.mjs").chmod(0o644)
                d, calls = self.check_run(f, "BLOCKED")
                self.assertEqual(d["kit"], "BLOCKED")
                self.assertEqual([d[k] for k in ("home", "node", "evidence")], ["PASS"] * 3)
                self.assertEqual(d["safeExistingSourcePossession"], "YES")
                self.assertIn("KIT_INSTALL_OWNER_PRIVATE_MODE_OR_ACL_BLOCKED" if fault == "private-mode" else "KIT_NOT_EXACT_ACCEPTED_V2", d["codes"])
                self.assertNotIn("node-offline", self.names(calls))
                self.assertEqual(self.names(calls).count("osascript"), 1)
                if fault == "pin": self.assertNotIn("shasum-check", self.names(calls))
                if fault == "private-mode": self.assertNotIn("shasum-pin", self.names(calls))

    def test_06_evidence_owner_mode_acl_block_but_collect(self):
        for fault in ("owner", "mode", "acl"):
            with self.subTest(fault=fault):
                f = self.fixture()
                if fault == "owner": f.cfg["owner_override"] = {"evidence": os.geteuid() + 1}
                elif fault == "mode": f.evidence.chmod(0o755)
                else: f.cfg["acl"] = ["evidence"]
                d, calls = self.check_run(f, "BLOCKED")
                self.assertEqual(d["evidence"], "BLOCKED")
                self.assertEqual([d[k] for k in ("home", "node", "kit")], ["PASS"] * 3)
                self.assertEqual(d["safeExistingSourcePossession"], "YES")
                self.assertEqual(d["codes"], ["EVIDENCE_OWNER_700_OR_ACL_BLOCKED"])
                self.assertEqual(self.names(calls).count("node-offline"), 1)
                self.assertEqual(self.names(calls).count("osascript"), 1)

    def test_07_no_unavailable_timeout_are_bounded_blocked(self):
        for choice in ("No", "unavailable", "UNCONFIRMED"):
            with self.subTest(choice=choice):
                f = self.fixture()
                f.cfg["choice"] = choice
                d, calls = self.check_run(f, "BLOCKED")
                self.assertEqual([d[k] for k in ("home", "node", "kit", "evidence")], ["PASS"] * 4)
                self.assertEqual(d["safeExistingSourcePossession"], "NO" if choice == "No" else "UNCONFIRMED")
                self.assertEqual(d["codes"], ["SOURCE_TOKEN_POSSESSION_NOT_CONFIRMED" if choice == "No" else "SOURCE_POSSESSION_CONFIRMATION_UNAVAILABLE"])
                self.assertEqual(self.names(calls).count("osascript"), 1)


def main():
    started = time.monotonic()
    detail = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ReadinessTests)
    result = unittest.TextTestRunner(stream=detail, verbosity=2).run(suite)
    summary = {
        "protocol": "CREATORLOOP_MAC_READINESS_V2_TESTS", "status": "PASS" if result.wasSuccessful() else "BLOCKED",
        "testsRun": result.testsRun, "fixtureExecutions": ReadinessTests.executions,
        "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped),
        "sourceAuthenticated": False, "networkRequests": 0, "credentialReads": 0, "changesMade": False,
        "scope": "new readiness-only isolated fictional Mac fixtures; real nonroot Bash -p; owner button attestation only",
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }
    bounded_line = json.dumps(summary, separators=(",", ":"))
    with LOG.open("w", encoding="utf-8") as log:
        log.write("NEW READINESS-ONLY TESTS\nNo production/accepted-kit/old-test changes. No old launcher, Team, or verifier tests imported or run.\n")
        log.write("Only fixed literal platform paths and fictional checksum pin translated; real nonroot /bin/bash -p.\n")
        log.write("All stubs network-free; call names/flags only; target bytes/modes/owners/mtime/symlinks unchanged per run.\n")
        log.write("Timeout case simulates AppleScript UNCONFIRMED; real Mac UI/timer and accepted-kit authenticity are NOT tested.\n")
        log.write(detail.getvalue())
        for observation in ReadinessTests.observations:
            log.write(json.dumps(observation, separators=(",", ":")) + "\n")
        log.write(bounded_line + "\n")
    print(bounded_line)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
