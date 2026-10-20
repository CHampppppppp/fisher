"""Validate a split, hash-indexed handoff archive before extracting into a new directory."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import shutil
import tarfile
import tempfile


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def restore(bundle: Path, destination: Path | None, verify_only: bool) -> None:
    manifest = json.loads((bundle / 'manifest.json').read_text())
    if not verify_only and (destination is None or destination.exists()):
        raise ValueError('Choose a destination that does not already exist; existing files are never overwritten.')
    parts = manifest['parts']
    if not parts or len({part['path'] for part in parts}) != len(parts):
        raise ValueError('Empty or duplicated archive parts.')
    for part in parts:
        name = part['path']
        if not isinstance(name, str) or '\\' in name or PureWindowsPath(name).drive or Path(name).name != name or name in ('.', '..'):
            raise ValueError('Unsafe archive part name.')
        path = bundle / name
        if path.is_symlink() or path.stat().st_size != part['bytes'] or digest(path) != part['sha256']:
            raise ValueError('Part validation failed: ' + name)
    staging = Path(tempfile.mkdtemp(prefix='island-handoff-restore-'))
    (staging / 'AGENTS.md').write_text('# Restore staging\nContains only validated archive assembly. Preserve files; no automatic cleanup.\n')
    archive = staging / 'checkpoint.tar.gz'
    with archive.open('xb') as output:
        for part in parts:
            with (bundle / part['path']).open('rb') as source:
                shutil.copyfileobj(source, output, length=1024 * 1024)
    if digest(archive) != manifest['archive_sha256']:
        raise ValueError('Combined archive hash mismatch.')
    expected = manifest['members']
    seen = set()
    with tarfile.open(archive, 'r:gz') as source:
        for member in source:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '\\' in member.name or PureWindowsPath(member.name).drive or '..' in name.parts or str(name) != member.name or not member.isfile():
                raise ValueError('Unsafe or unsupported archive member: ' + member.name)
            if member.name in seen or member.name not in expected:
                raise ValueError('Duplicate or unlisted archive member: ' + member.name)
            item = expected[member.name]
            if member.size != item['bytes']:
                raise ValueError('Member size mismatch: ' + member.name)
            result = hashlib.sha256()
            stream = source.extractfile(member)
            if stream is None:
                raise ValueError('Unreadable member: ' + member.name)
            with stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    result.update(block)
            if result.hexdigest() != item['sha256']:
                raise ValueError('Member hash mismatch: ' + member.name)
            seen.add(member.name)
    if seen != set(expected):
        raise ValueError('Manifest contains missing archive members.')
    if verify_only:
        print(f'Verified {len(parts)} parts and {len(seen)} members; no files extracted. Assembly retained: {archive}')
        return
    if destination is None:
        raise ValueError('Destination is required.')
    # Recheck immediately before creation. mkdir(exist_ok=False) also rejects concurrent creation.
    destination.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive, 'r:gz') as source:
        source.extractall(destination, filter='data')
    print(f'Restored {len(seen)} verified members to {destination}. Start with CONTINUE.md. No model launched.')
    print(f'Assembly retained: {archive}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path, nargs='?')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    restore(Path(__file__).resolve().parent, args.destination, args.verify_only)


if __name__ == '__main__':
    main()
