"""Migration safety cases; all mutations and credentials are mocked."""
import contextlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('migrate_20261015.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class MigrationSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        m.EVIDENCE = Path(self.temp.name)
        self.log = mock.patch.object(m, 'log').start()
        self.addCleanup(mock.patch.stopall)
        self.before = {'dns': [], 'old_domains': [], 'old_project': {'id': 'old', 'canonical_deployment_id': 'original'}}
        self.project = {'id': 'corporate', 'canonical_deployment': {'id': 'staged',
            'latest_stage': {'status': 'success'},
            'deployment_trigger': {'metadata': {'commit_hash': m.ACCEPTED}}}}

    def test_payload_is_only_accepted_files_with_single_robots_removal(self):
        files = m.corporate_files()
        self.assertEqual(set(files), {'index.html', 'styles.css', 'assets/approved-brand-artwork.webp', 'assets/global-infrastructure.webp'})
        self.assertEqual(files['index.html'], m.git_bytes('corporate/index.html').replace(
            b'  <meta name="robots" content="noindex, nofollow">\n', b'', 1))
        for name in set(files) - {'index.html'}:
            self.assertEqual(files[name], m.git_bytes('corporate/' + name))

    def test_html_normalizer_retains_unrelated_scripts_and_copy(self):
        source = b'<main>Accepted copy</main>\n<script src="https://example.com/beacon.min.js"></script>\n'
        self.assertEqual(m.normalized_html(source), source)
        edge = b'<script src="https://static.cloudflareinsights.com/beacon.min.js/known-version" data-cf-beacon="edge"></script>\n'
        self.assertEqual(m.normalized_html(source + edge), source)

    def test_email_obfuscation_is_decoded_without_hiding_changed_copy(self):
        address = 'team@creatorloop.net'
        encoded = bytes([0x42] + [b ^ 0x42 for b in address.encode()]).hex()
        source = '<a class="email" href="mailto:' + address + '">' + address + '</a>\n'
        edge = '<a class="email" href="/cdn-cgi/l/email-protection#' + encoded + '"><span class="__cf_email__" data-cfemail="' + encoded + '">[email&#160;protected]</span></a>\n'
        decoder = '<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>'
        self.assertEqual(m.normalized_html((edge + decoder).encode()), source.encode())
        self.assertNotEqual(m.normalized_html(('Changed copy' + edge + decoder).encode()), source.encode())

    def test_staging_rejects_existing_runtime_bindings_without_mutation(self):
        for unsafe in [{'source': {'type': 'github'}}, {'domains': ['other.example']},
                       {'deployment_configs': {'production': {'d1_databases': {'DB': {}}}}}]:
            with self.subTest(unsafe=unsafe), mock.patch.object(m, 'maybe_project', return_value=unsafe), mock.patch.object(m, 'api') as api:
                with self.assertRaises(RuntimeError):
                    m.stage({})
                api.assert_not_called()

    def test_failed_loop_verification_prevents_root_cutover(self):
        with contextlib.ExitStack() as stack:
            mocks = {name: stack.enter_context(mock.patch.object(m, name)) for name in
                ['project', 'verify_corporate', 'unchanged', 'verify_loop', 'ensure_domain', 'set_dns', 'wait_domain', 'rollback']}
            mocks['project'].return_value = self.project
            mocks['verify_loop'].side_effect = [{}, RuntimeError('Loop failure')]
            with self.assertRaisesRegex(RuntimeError, 'Loop failure'):
                m.execute(self.before)
            self.assertEqual(mocks['rollback'].call_args.args[1:], (False, True, False))
            mocks['set_dns'].assert_called_once_with(m.LOOP, m.OLD + '.pages.dev')

    def test_failed_corporate_check_invokes_root_rollback(self):
        with contextlib.ExitStack() as stack:
            mocks = {name: stack.enter_context(mock.patch.object(m, name)) for name in
                ['project', 'verify_corporate', 'unchanged', 'verify_loop', 'ensure_domain', 'set_dns', 'wait_domain',
                 'rollback', 'dns_unchanged_except', 'http', 'remove_domain']}
            mocks['project'].return_value = self.project
            mocks['verify_corporate'].side_effect = [{}, RuntimeError('Corporate failure')]
            mocks['http'].return_value = {'normalized_sha256': m.hashlib.sha256(m.git_bytes('index.html', m.LIVE_SHA)).hexdigest()}
            mocks['wait_domain'].return_value = {}
            with self.assertRaisesRegex(RuntimeError, 'Corporate failure'):
                m.execute(self.before)
            self.assertEqual(mocks['rollback'].call_args.args[1:], (True, True, True))

    def test_rollback_restores_routing_even_if_first_cleanup_fails(self):
        with contextlib.ExitStack() as stack:
            mocks = {name: stack.enter_context(mock.patch.object(m, name)) for name in
                ['remove_domain', 'ensure_domain', 'set_dns', 'wait_domain', 'verify_loop', 'unchanged', 'dns_unchanged_except']}
            mocks['remove_domain'].side_effect = RuntimeError('cleanup failed')
            m.rollback(self.before, True, False, True)
            mocks['ensure_domain'].assert_called_once_with(m.OLD, m.ROOT)
            mocks['set_dns'].assert_called_once_with(m.ROOT, m.OLD + '.pages.dev')
            mocks['verify_loop'].assert_called_once_with(m.ROOT)

if __name__ == '__main__':
    unittest.main()
