"""Create an isolated SQLite backup; never change the source database."""
import argparse
import hashlib
import json
import sqlite3
import time
from pathlib import Path


def digest(path):
    with path.open('rb') as source:
        result = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
        return result.hexdigest()


def snapshot(source, output, offline=False):
    source = source.resolve(strict=True)
    output = output.resolve()
    if output.exists() or output.with_suffix(output.suffix + '.json').exists() or output == source:
        raise ValueError('Snapshot output must be a new file')
    if offline and any(Path(str(source) + suffix).exists() for suffix in ('-wal', '-shm')):
        raise ValueError('Offline mode requires a stopped source without WAL/SHM')
    before = digest(source) if offline else None
    output.parent.mkdir(parents=True, exist_ok=True)
    # Match query-foliole-db: live connections observe WAL; immutable is explicit.
    uri = source.as_uri() + ('?mode=ro&immutable=1' if offline else '?mode=ro')
    with output.open('xb'):
        pass
    started = time.monotonic()
    def progress(status, remaining, total):
        if time.monotonic() - started > 30:
            raise TimeoutError('Snapshot exceeded 30 seconds')
    try:
        with sqlite3.connect(uri, uri=True) as reader:
            reader.execute('PRAGMA query_only=ON')
            with sqlite3.connect(output) as target:
                reader.backup(target, pages=1024, progress=progress)
        if offline and (before != digest(source) or any(
                Path(str(source) + suffix).exists() for suffix in ('-wal', '-shm'))):
            raise ValueError('Offline source changed during snapshot; discard result')
        provenance = {'source': str(source), 'mode': 'offline-immutable' if offline else 'wal-aware-ro',
                      'sourceSha256': before, 'snapshotSha256': digest(output),
                      'snapshot': str(output), 'capturedAtUnix': time.time()}
        output.with_suffix(output.suffix + '.json').write_text(json.dumps(provenance, indent=2) + '\n')
        return provenance
    except Exception:
        output.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--offline', action='store_true', help='Source confirmed stopped, without WAL/SHM')
    args = parser.parse_args()
    print(json.dumps(snapshot(args.db, args.out, args.offline), indent=2))
