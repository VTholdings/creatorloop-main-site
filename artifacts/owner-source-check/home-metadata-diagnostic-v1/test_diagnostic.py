#!/usr/bin/python3
"""Bounded NEW local tests only; neither native-Mac verification nor acceptance.

The production source is loaded once per suite, never executed on Linux, and
copied in memory with only the five authorized literal paths translated.
Everything except this test and tests.log lives in a disposable temp fixture.
No application modules, Node, network, credentials, readiness, or prior suites.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parent
SOURCE = PROJECT / 'diagnostic.sh'
OWNER_COMMAND = PROJECT / 'Owner_Home_Metadata_Command.txt'
SAFE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
CLEAN_ENV = {'HOME': '/var/empty', 'PATH': SAFE_PATH, 'LANG': 'C', 'LC_ALL': 'C'}
PARENT_ENV = {
    'HOME': '/FICTIONAL_PARENT_HOME', 'PATH': '/FICTIONAL_PARENT_PATH',
    'LANG': 'C', 'LC_ALL': 'C',
    'source_token': 'FICTIONAL_PRIVATE_MARKER_NEVER_REAL',
    'BASH_ENV': '/FICTIONAL_NONEXISTENT_BASH_ENV',
    'ENV': '/FICTIONAL_NONEXISTENT_ENV',
    'NODE_OPTIONS': '--require=/FICTIONAL_NONEXISTENT_MODULE.cjs',
    'CDPATH': '/FICTIONAL_CDPATH',
}
MARKER = 'FICTIONAL_UNTRUSTED_METADATA_MARKER'
MAX_FIXTURE_INVOCATIONS = 48
TIMEOUT_SECONDS = 5
MAX_CAPTURE_BYTES = 65536
PROTOCOL = 'CREATORLOOP_HOME_METADATA_DIAGNOSTIC_V1'


def native_header(plus=False):
    return 'drwxr-xr-x' + ('+' if plus else '') + ' 3 424242 424242 96 Jan 01 00:00 ' + MARKER


def native_acl(body='0: group:everyone deny delete'):
    return native_header(True) + '\n ' + body


def metadata_snapshot(paths):
    """lstat only: do not read directory contents or change their access times."""
    result = []
    for path in paths:
        try:
            value = path.lstat()
            result.append((str(path), value.st_dev, value.st_ino, value.st_mode,
                           value.st_uid, value.st_gid, value.st_nlink, value.st_size,
                           value.st_atime_ns, value.st_mtime_ns, value.st_ctime_ns))
        except (FileNotFoundError, NotADirectoryError):
            result.append((str(path), 'ABSENT'))
    return result


class DiagnosticTests(unittest.TestCase):
    fixture_invocations = 0
    syntax_invocations = 0
    path_results = 0
    shim_calls = 0
    case_names = []
    owner_syntax = 'NOT_CHECKED'

    @classmethod
    def setUpClass(cls):
        if os.geteuid() == 0:
            raise RuntimeError('Real nonroot runner required; no root diagnostic invocation permitted.')
        cls.source = SOURCE.read_text(encoding='utf-8')  # Exactly one source load per suite.
        cls.source_sha256 = hashlib.sha256(cls.source.encode()).hexdigest()
        cls.temp = tempfile.TemporaryDirectory(prefix='cl_metadata_new_tests_')
        cls.temp_root = Path(cls.temp.name)
        cls.source_syntax = cls.syntax_check(cls.source)
        if cls.source_syntax.returncode != 0:
            raise RuntimeError('Reviewed diagnostic has invalid Bash syntax.')
        cls.syntax_invocations += 1

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @staticmethod
    def syntax_check(text):
        return subprocess.run(
            ['/bin/bash', '--noprofile', '--norc', '-p', '-n'],
            input=text.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=CLEAN_ENV, timeout=TIMEOUT_SECONDS, check=False,
        )

    def run_case(self, name, *, shape='directories', metas=None, listings=None,
                 stat_codes=None, ls_codes=None, uname='Darwin'):
        cls = type(self)
        self.assertLess(cls.fixture_invocations, MAX_FIXTURE_INVOCATIONS)
        case_dir = cls.temp_root / ('case_%02d' % cls.fixture_invocations)
        case_dir.mkdir(mode=0o700)
        users = case_dir / 'Users'
        child = users / 'tt1'
        outside = case_dir / 'fictional_symlink_target'
        observed = [users, child]
        if shape in ('directories', 'child_missing', 'child_symlink', 'child_file'):
            users.mkdir(mode=0o755)
            if shape == 'directories':
                child.mkdir(mode=0o700)
            elif shape == 'child_symlink':
                outside.mkdir(mode=0o700)
                child.symlink_to(outside, target_is_directory=True)
                observed.append(outside)
            elif shape == 'child_file':
                child.write_text('FICTIONAL_INERT_FILE_NOT_READ\n', encoding='ascii')
        elif shape == 'root_symlink':
            outside.mkdir(mode=0o700)
            users.symlink_to(outside, target_is_directory=True)
            observed.append(outside)
        elif shape == 'root_file':
            users.write_text('FICTIONAL_INERT_FILE_NOT_READ\n', encoding='ascii')
        elif shape != 'root_missing':
            self.fail('Unrecognized fixture shape')
        paths = [str(users), str(child)]
        metas = metas if metas is not None else [f'{os.geteuid()} 755'] * 2
        listings = listings if listings is not None else [native_header()] * 2
        stat_codes = stat_codes if stat_codes is not None else [0, 0]
        ls_codes = ls_codes if ls_codes is not None else [0, 0]
        config = {
            'uname': uname,
            'stat': {p: {'text': text, 'exit': code}
                     for p, text, code in zip(paths, metas, stat_codes)},
            'ls': {p: {'text': text, 'exit': code}
                   for p, text, code in zip(paths, listings, ls_codes)},
        }
        config_path = case_dir / 'fictional_config.json'
        audit_path = case_dir / 'shim_calls.jsonl'
        config_path.write_text(json.dumps(config), encoding='ascii')
        audit_path.write_text('', encoding='ascii')
        shims = {}
        for tool in ('uname', 'stat', 'ls'):
            shim = case_dir / ('inert_' + tool)
            # Only stdlib and fixture config are read. Each clean child records
            # known key values and all key NAMES; unknown key values are not read.
            shim.write_text(
                '#!/usr/bin/python3\n'
                'import json, os, sys\n'
                f'TOOL = {tool!r}\n'
                f'CONFIG = {str(config_path)!r}\n'
                f'AUDIT = {str(audit_path)!r}\n'
                "KEYS = ('HOME', 'PATH', 'LANG', 'LC_ALL')\n"
                "record = {'tool': TOOL, 'argv': sys.argv[1:], "
                "'envKeys': sorted(os.environ), "
                "'env': {key: os.getenv(key) for key in KEYS}}\n"
                "with open(AUDIT, 'a', encoding='ascii') as out:\n"
                "    out.write(json.dumps(record) + '\\n')\n"
                "with open(CONFIG, encoding='ascii') as inp:\n"
                "    config = json.load(inp)\n"
                "args = sys.argv[1:]\n"
                "if TOOL == 'uname' and args == ['-s']:\n"
                "    sys.stdout.write(config['uname'] + '\\n')\n"
                "    sys.exit(0)\n"
                "prefix = ['-f', '%u %Lp'] if TOOL == 'stat' else ['-ldne']\n"
                "if args[:-1] != prefix or not args or args[-1] not in config[TOOL]:\n"
                "    sys.exit(94)\n"
                "reply = config[TOOL][args[-1]]\n"
                "sys.stdout.write(reply['text'] + '\\n')\n"
                "sys.exit(reply['exit'])\n",
                encoding='ascii',
            )
            shim.chmod(0o500)
            shims[tool] = str(shim)
        translated = cls.source
        replacements = [
            ('/usr/bin/uname', shims['uname']),
            ('/usr/bin/stat', shims['stat']),
            ('/bin/ls', shims['ls']),
            ('inspect /Users/tt1\n', f'inspect {child}\n'),
            ('inspect /Users\n', f'inspect {users}\n'),
        ]
        for old, new in replacements:
            self.assertEqual(translated.count(old), 1, 'Only reviewed fixed paths may change')
            translated = translated.replace(old, new)
        reconstructed = translated
        for old, new in reversed(replacements):
            reconstructed = reconstructed.replace(new, old)
        self.assertEqual(reconstructed, cls.source)
        fixture_script = case_dir / 'translated_diagnostic.sh'
        fixture_script.write_text(translated, encoding='utf-8')
        fixture_script.chmod(0o500)
        self.assertNotEqual(fixture_script, SOURCE)
        config_path.chmod(0o400)
        before = metadata_snapshot(observed)
        cls.fixture_invocations += 1
        cls.case_names.append(name)
        try:
            completed = subprocess.run(
                ['/bin/bash', '--noprofile', '--norc', '-p', str(fixture_script)],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=case_dir, env=PARENT_ENV, timeout=TIMEOUT_SECONDS, check=False,
            )
        finally:
            self.assertEqual(metadata_snapshot(observed), before,
                             'Target fixture metadata changed during the diagnostic')
        self.assertLessEqual(len(completed.stdout), MAX_CAPTURE_BYTES)
        self.assertLessEqual(len(completed.stderr), MAX_CAPTURE_BYTES)
        self.assertEqual(completed.stderr, b'')
        output = completed.stdout.decode('ascii')
        self.assertEqual(output.count('\n'), 1, 'Exactly one bounded JSON line required')
        for forbidden in (MARKER, 'FICTIONAL_PRIVATE_MARKER_NEVER_REAL',
                          'FICTIONAL_NONEXISTENT_MODULE', '\x1b', '\r'):
            self.assertNotIn(forbidden, output)
        payload = json.loads(output)
        self.assertEqual(payload['protocol'], PROTOCOL)
        self.assertEqual(payload['networkRequests'], 0)
        self.assertEqual(payload['credentialReads'], 0)
        self.assertIs(payload['changesMade'], False)
        self.assertIs(payload['readinessReRun'], False)
        self.assertIs(payload['sourceAuthenticated'], False)
        calls = [json.loads(line) for line in audit_path.read_text(encoding='ascii').splitlines()]
        cls.shim_calls += len(calls)
        expected_calls = [('uname', ['-s'])]
        if uname == 'Darwin':
            self.assertEqual(completed.returncode, 0)
            self.assertEqual(payload['status'], 'METADATA_ONLY')
            self.assertEqual(payload['securityDecision'], 'UNCHANGED_HOLD')
            self.assertEqual(set(payload), {
                'protocol', 'status', 'paths', 'networkRequests', 'credentialReads',
                'changesMade', 'readinessReRun', 'sourceAuthenticated', 'securityDecision',
            })
            expected_kinds = {
                'directories': ['DIRECTORY', 'DIRECTORY'],
                'child_missing': ['DIRECTORY', 'MISSING_OR_UNAVAILABLE'],
                'child_symlink': ['DIRECTORY', 'SYMLINK'],
                'child_file': ['DIRECTORY', 'NOT_DIRECTORY'],
                'root_missing': ['MISSING_OR_UNAVAILABLE', 'MISSING_OR_UNAVAILABLE'],
                'root_symlink': ['SYMLINK', 'MISSING_OR_UNAVAILABLE'],
                'root_file': ['NOT_DIRECTORY', 'MISSING_OR_UNAVAILABLE'],
            }[shape]
            self.assertEqual(len(payload['paths']), 2)
            cls.path_results += 2
            for path, item, kind in zip(paths, payload['paths'], expected_kinds):
                self.assertEqual(item['path'], path)
                self.assertEqual(item['kind'], kind)
                self.assertEqual(set(item), {
                    'path', 'kind', 'ownerUid', 'ownerRelation', 'mode', 'groupWritable',
                    'otherWritable', 'aclPattern', 'readinessNoAclPredicate',
                })
                expected_calls.append(('stat', ['-f', '%u %Lp', path]))
                if kind == 'DIRECTORY':
                    expected_calls.append(('ls', ['-ldne', path]))
                else:
                    self.assertEqual(item['aclPattern'], 'NOT_INSPECTED')
                    self.assertEqual(item['readinessNoAclPredicate'], 'NOT_EVALUATED')
        else:
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(payload['status'], 'BLOCKED')
            self.assertEqual(payload['code'], 'TRUSTED_NONROOT_MAC_SESSION_REQUIRED')
            self.assertEqual(set(payload), {
                'protocol', 'status', 'code', 'networkRequests', 'credentialReads',
                'changesMade', 'readinessReRun', 'sourceAuthenticated',
            })
            self.assertLessEqual(len(completed.stdout), 384)
        self.assertEqual([(call['tool'], call['argv']) for call in calls], expected_calls)
        self.assertLessEqual(len(calls), 5)
        for call in calls:
            self.assertEqual(call['envKeys'], sorted(CLEAN_ENV))
            self.assertEqual(call['env'], CLEAN_ENV)
        return payload

    def assert_pattern(self, payload, pattern, predicate):
        for index, item in enumerate(payload['paths']):
            with self.subTest(path_index=index):
                self.assertEqual(item['aclPattern'], pattern)
                self.assertEqual(item['readinessNoAclPredicate'], predicate)

    def test_01_common_home_single_acl_keeps_old_predicate_blocked(self):
        payload = self.run_case('single_everyone_deny_delete',
                                metas=['0 755', f'{os.geteuid()} 700'],
                                listings=[native_acl()] * 2)
        self.assert_pattern(payload, 'SINGLE_EVERYONE_DENY_DELETE', 'BLOCKED')
        self.assertEqual([item['ownerRelation'] for item in payload['paths']],
                         ['ROOT', 'CURRENT_OWNER'])

    def test_02_plain_directory_none_and_only_predicate_pass(self):
        payload = self.run_case('plain_directory_no_acl')
        self.assert_pattern(payload, 'NONE', 'PASS')
        self.assertEqual(payload['status'], 'METADATA_ONLY')
        self.assertEqual(payload['securityDecision'], 'UNCHANGED_HOLD')

    def test_03_mode_write_bits(self):
        for mode, group, other in [('0777', True, True), ('0700', False, False),
                                   ('0720', True, False), ('0702', False, True)]:
            with self.subTest(mode=mode):
                payload = self.run_case('mode_' + mode, metas=[f'{os.geteuid()} {mode}'] * 2)
                for item in payload['paths']:
                    self.assertEqual(item['mode'], mode)
                    self.assertIs(item['groupWritable'], group)
                    self.assertIs(item['otherWritable'], other)

    def test_04_foreign_owner_is_other(self):
        self.assertNotEqual(os.geteuid(), 424242)
        payload = self.run_case('foreign_owner', metas=['424242 755'] * 2)
        for item in payload['paths']:
            self.assertEqual(item['ownerUid'], 424242)
            self.assertEqual(item['ownerRelation'], 'OTHER')

    def test_05_arbitrary_acl_metadata_is_not_echoed(self):
        bodies = [
            '0: user:' + MARKER + ' allow read,write,delete',
            '0: group:everyone deny delete,' + MARKER,
            '0: group:everyone deny delete\n 1: user:' + MARKER + ' allow read',
            '0: user:' + MARKER + '\tallow\x1b[31m read\r CONTROL',
        ]
        for index, body in enumerate(bodies):
            with self.subTest(case=index):
                payload = self.run_case('untrusted_acl_%d' % index,
                                        listings=[native_acl(body)] * 2)
                self.assert_pattern(payload, 'OTHER_OR_UNRECOGNIZED_ACL', 'BLOCKED')

    def test_06_invalid_stat_never_exposes_unvalidated_numbers(self):
        invalid = [
            ('owner_marker', MARKER + ' 755', 0),
            ('owner_leading_zero', '01000 755', 0),
            ('owner_negative', '-1 755', 0),
            ('owner_too_long', '12345678901 755', 0),
            ('mode_nonoctal', '1000 888', 0),
            ('mode_too_short', '1000 75', 0),
            ('extra_field', '1000 755 ' + MARKER, 0),
            ('embedded_newline', '1000 755\n' + MARKER, 0),
            ('overlong_65', (MARKER * 3)[:65], 0),
            ('empty', '', 0),
            ('stat_failure', '1000 755', 1),
        ]
        for name, text, code in invalid:
            with self.subTest(case=name):
                payload = self.run_case('invalid_stat_' + name,
                                        metas=[text] * 2, stat_codes=[code] * 2)
                for item in payload['paths']:
                    self.assertIsNone(item['ownerUid'])
                    self.assertEqual(item['ownerRelation'], 'UNKNOWN')
                    self.assertEqual(item['mode'], 'UNKNOWN')
                    self.assertIsNone(item['groupWritable'])
                    self.assertIsNone(item['otherWritable'])

    def test_07_malformed_overlong_and_failed_ls_remain_unrecognized(self):
        invalid = [
            ('bad_header', MARKER + '\n 0: group:everyone deny delete', 0,
             'UNAVAILABLE_OR_UNRECOGNIZED', 'BLOCKED'),
            ('empty', '', 0, 'UNAVAILABLE_OR_UNRECOGNIZED', 'NOT_EVALUATED'),
            ('overlong_16385', (native_header() + MARKER * 600)[:16385], 0,
             'UNAVAILABLE_OR_UNRECOGNIZED', 'NOT_EVALUATED'),
            ('ls_failure', native_acl(), 1,
             'UNAVAILABLE_OR_UNRECOGNIZED', 'NOT_EVALUATED'),
            ('plus_missing_body', native_header(True), 0,
             'UNAVAILABLE_OR_UNRECOGNIZED', 'PASS'),
            ('truncated_acl', native_acl('0: group:everyone deny'), 0,
             'OTHER_OR_UNRECOGNIZED_ACL', 'BLOCKED'),
            ('wrong_acl_index', native_acl('1: group:everyone deny delete'), 0,
             'OTHER_OR_UNRECOGNIZED_ACL', 'BLOCKED'),
            # Native ls prints each ACL entry on ONE line. [[:space:]] must not
            # promote a malformed split entry to the known single-entry enum.
            ('split_acl_right', native_acl('0: group:everyone deny\ndelete'), 0,
             'OTHER_OR_UNRECOGNIZED_ACL', 'BLOCKED'),
        ]
        for name, text, code, pattern, predicate in invalid:
            with self.subTest(case=name):
                payload = self.run_case('invalid_ls_' + name,
                                        listings=[text] * 2, ls_codes=[code] * 2)
                self.assert_pattern(payload, pattern, predicate)

    def test_08_symlinks_missing_and_files_never_get_acl_listing(self):
        for shape in ('child_symlink', 'root_symlink', 'child_missing',
                      'root_missing', 'child_file', 'root_file'):
            with self.subTest(shape=shape):
                self.run_case(shape)

    def test_09_false_darwin_precondition_one_bounded_blocked_line(self):
        self.run_case('false_darwin_precondition', uname='Linux')

    def test_10_owner_outer_and_body_syntax_only_if_present(self):
        cls = type(self)
        if not OWNER_COMMAND.is_file():
            cls.owner_syntax = 'ABSENT_NO_WAIT'
            return
        text = OWNER_COMMAND.read_text(encoding='utf-8')
        self.assertLessEqual(len(text.encode()), MAX_CAPTURE_BYTES)
        outer = cls.syntax_check(text)
        cls.syntax_invocations += 1
        self.assertEqual(outer.returncode, 0, outer.stderr.decode())
        self.assertEqual(outer.stdout, b'')
        lines = text.splitlines()
        self.assertTrue(lines)
        match = re.fullmatch(
            r"/usr/bin/env -i HOME=/var/empty PATH=/usr/bin:/bin:/usr/sbin:/sbin "
            r"LANG=C LC_ALL=C /bin/bash --noprofile --norc -p -s <<'([A-Z0-9_]+)'", lines[0])
        self.assertIsNotNone(match, 'Owner outer command differs from the clean Bash-p wrapper')
        delimiter = match.group(1)
        endings = [index for index, line in enumerate(lines) if line == delimiter]
        self.assertEqual(len(endings), 1)
        ending = endings[0]
        self.assertTrue(all(not line.strip() for line in lines[ending + 1:]))
        body = '\n'.join(lines[1:ending]) + '\n'
        self.assertEqual(body.rstrip('\n'), cls.source.rstrip('\n'))
        inner = cls.syntax_check(body)
        cls.syntax_invocations += 1
        self.assertEqual(inner.returncode, 0, inner.stderr.decode())
        self.assertEqual(inner.stdout, b'')
        cls.owner_syntax = 'OUTER_AND_BODY_BASH_N_OK_NOT_EXECUTED'

    def test_11_numeric_everyone_uuid_diagnostic_only(self):
        known = 'ABCDEFAB-CDEF-ABCD-EFAB-CDEF0000000C'
        cases = [
            ('known_numeric_everyone', '0: ' + known + ' deny delete', 'SINGLE_EVERYONE_DENY_DELETE'),
            ('unrelated_numeric_uuid', '0: 11111111-1111-1111-1111-111111111111 deny delete', 'OTHER_OR_UNRECOGNIZED_ACL'),
            ('numeric_allow', '0: ' + known + ' allow delete', 'OTHER_OR_UNRECOGNIZED_ACL'),
            ('numeric_inherited', '0: ' + known + ' inherited deny delete', 'OTHER_OR_UNRECOGNIZED_ACL'),
            ('numeric_extra_grant', '0: ' + known + ' deny delete\n 1: group:everyone allow add_file', 'OTHER_OR_UNRECOGNIZED_ACL'),
            ('numeric_split_right', '0: ' + known + ' deny\ndelete', 'OTHER_OR_UNRECOGNIZED_ACL'),
        ]
        for name, body, expected in cases:
            with self.subTest(case=name):
                payload = self.run_case(name, listings=[native_acl(body)] * 2)
                self.assert_pattern(payload, expected, 'BLOCKED')
                self.assertEqual(payload['securityDecision'], 'UNCHANGED_HOLD')
                self.assertNotIn(known, json.dumps(payload))


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(DiagnosticTests)
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
    cls = DiagnosticTests
    print('\nBOUNDED_NEW_TEST_SUMMARY')
    print('result=' + ('PASS_LOCAL' if result.wasSuccessful() else 'FAIL_LOCAL'))
    print('test_methods=%d fixture_invocations=%d path_results=%d shim_calls=%d syntax_only_invocations=%d'
          % (result.testsRun, cls.fixture_invocations, cls.path_results,
             cls.shim_calls, cls.syntax_invocations))
    print('failed_assertions=%d errors=%d skipped=%d'
          % (len(result.failures), len(result.errors), len(result.skipped)))
    print('source_sha256=' + getattr(cls, 'source_sha256', 'NOT_LOADED'))
    print('source_loads=1_per_suite; translated_paths_only=/Users,/Users/tt1,/usr/bin/uname,/usr/bin/stat,/bin/ls')
    print('runner_uid=%d; real=/bin/bash --noprofile --norc -p; fictional_Darwin_shim_only' % os.geteuid())
    print('limits: fixture_invocations<=%d; timeout=%ds/invocation; calls<=5/invocation; '
          'capture<=%dB/stream; stat_accept<=64chars; ls_accept<=16384chars'
          % (MAX_FIXTURE_INVOCATIONS, TIMEOUT_SECONDS, MAX_CAPTURE_BYTES))
    print('child_env_exact=HOME=/var/empty PATH=' + SAFE_PATH + ' LANG=C LC_ALL=C')
    print('owner_command=' + cls.owner_syntax)
    print('cases=' + ','.join(cls.case_names))
    print('guards=target_lstat_metadata_unchanged; allowed_calls_exact; '
          'no_real_credentials; no_network; no_Node_or_application_imports; '
          'no_kit_or_evidence_or_source_possession; no_readiness_run; '
          'no_production_execution_on_Linux; no_native_Mac_verification; no_independent_acceptance')
    print('artifacts=test_diagnostic.py,tests.log; only other writes=temp_fixtures; temp_cleanup=automatic')
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
