import hashlib
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
import zipfile

module = runpy.run_path(str(Path(__file__).with_name('stage-backup-history.py')))
stage, groups, utility = (module[key] for key in ('stage', 'GROUPS', 'UTILITY'))
digest = lambda data: hashlib.sha256(data).hexdigest()


class Recovery(unittest.TestCase):
    def test_authenticated_history_and_refusals(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            env = dict(os.environ, CREATORLOOP_BACKUP_PASSPHRASE='synthetic-recovery-fixture-passphrase-only')
            from unittest.mock import patch
            with patch.dict(os.environ, env):
                for case in ('valid', 'outer', 'inner', 'missing', 'traversal', 'wrong-key'):
                    with self.subTest(case=case):
                        work = root / case
                        work.mkdir()
                        plain, payload, outer, output = (work / n for n in ('plain.zip','immediate.clbackup','outer.zip','stage'))
                        with zipfile.ZipFile(plain, 'w') as archive:
                            archive.writestr('PRODUCTION.sql', 'synthetic SQL must not be staged')
                            for group in groups:
                                if case != 'missing' or group != 'forensics':
                                    archive.writestr(f'history/{group}/receipt.json', '{}')
                            if case == 'traversal':
                                archive.writestr('history/../bad', 'invalid')
                        subprocess.run(['node', str(utility), 'encrypt', str(plain), str(payload)],
                                       check=True, stdout=subprocess.DEVNULL)
                        content = payload.read_bytes()
                        inner = digest(content)
                        with zipfile.ZipFile(outer, 'w') as archive:
                            archive.writestr(payload.name, content)
                            archive.writestr(payload.name + '.sha256', f'{inner}  {payload.name}\n')
                        args = (outer, output, '0' * 64 if case == 'outer' else digest(outer.read_bytes()),
                                '0' * 64 if case == 'inner' else inner)
                        if case == 'valid':
                            stage(*args)
                            self.assertEqual(len(list((output / 'history').rglob('*.json'))), 4)
                            self.assertFalse((output / 'PRODUCTION.sql').exists())
                        else:
                            with patch.dict(os.environ, {'CREATORLOOP_BACKUP_PASSPHRASE':
                                            'synthetic-wrong-passphrase-only'} if case == 'wrong-key' else {}):
                                with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                                    stage(*args)
                            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
