"""Stage only authenticated October 4 history from the pinned encrypted backup."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import zipfile

OUTER = '62d5ab026f965420242432d9404cbb63d52a7a7eb7b061940a3396d34efbd5cd'
INNER = 'd66f063e3c2e9b91acc1c80fc9362a4f0a8d172a5305ed9baa76a96823f27a55'
LIMIT = 140 * 1024 * 1024
GROUPS = ('correction', 'current-state', 'forensics', 'key-delivery')
UTILITY = Path(__file__).resolve().with_name('backup-envelope.mjs')


def members(archive):
    files = {}
    total = 0
    for info in archive.infolist():
        name = info.filename
        mode = stat.S_IFMT(info.external_attr >> 16)
        total += info.file_size
        if (not name or '\\' in name or any(p in ('', '.', '..') for p in name.split('/'))
                or name in files or info.is_dir() or mode not in (0, stat.S_IFREG)
                or total > LIMIT):
            raise ValueError('Invalid backup archive')
        files[name] = info
    return files


def stage(source, output, outer=OUTER, inner=INNER):
    with source.open('rb') as raw:
        if source.stat().st_size > LIMIT or hashlib.file_digest(raw, 'sha256').hexdigest() != outer:
            raise ValueError('Outer digest mismatch')
        raw.seek(0)
        with zipfile.ZipFile(raw) as archive:
            if set(members(archive)) != {'immediate.clbackup', 'immediate.clbackup.sha256'}:
                raise ValueError('Unexpected encrypted archive members')
            encrypted = archive.read('immediate.clbackup')
            checksum = archive.read('immediate.clbackup.sha256')
            if (hashlib.sha256(encrypted).hexdigest() != inner
                    or checksum.split() != [inner.encode(), b'immediate.clbackup']):
                raise ValueError('Inner digest mismatch')
    with tempfile.TemporaryDirectory(prefix='creatorloop-history-') as temp:
        payload = Path(temp) / 'source.clbackup'
        payload.write_bytes(encrypted)
        decoded = Path(temp) / 'authenticated.zip'
        subprocess.run(['node', str(UTILITY), 'decrypt', str(payload), str(decoded)],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=True, timeout=120)
        with zipfile.ZipFile(decoded) as archive:
            files = members(archive)
            selected = {}
            for group in GROUPS:
                names = [name for name in files if name.startswith(f'history/{group}/')]
                if len(names) != 1 or not files[names[0]].file_size:
                    raise ValueError('Unexpected history inventory')
                selected[names[0]] = archive.read(files[names[0]])
            output.mkdir(mode=0o700, exist_ok=False)
            for name, data in selected.items():
                target = output / name
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with target.open('xb') as handle:
                    handle.write(data)
            provenance = {
                'sourceRun': 37242966914,
                'sourceArtifact': 11317931861,
                'archiveSha256': outer,
                'ciphertextSha256': inner,
                'groups': {group: 1 for group in GROUPS},
                'files': {name: hashlib.sha256(data).hexdigest()
                          for name, data in selected.items()},
            }
            with (output / 'history-recovery.json').open('x') as receipt:
                json.dump(provenance, receipt, indent=2)


if __name__ == '__main__':
    try:
        os.umask(0o077)
        stage(Path(sys.argv[1]), Path(sys.argv[2]))
        print('AUTHENTICATED_BACKUP_HISTORY_STAGED')
    except Exception:
        print('BACKUP_HISTORY_RECOVERY_BLOCKED', file=sys.stderr)
        sys.exit(1)
