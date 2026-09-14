// @vitest-environment node

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { BackupSearchWorkerEngine, materializeBackupForSearch } from './backupSearchWorker.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
let tempRoot = '';
let sessionDirectory = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-search-worker-'));
  sessionDirectory = path.join(tempRoot, 'session');
  await fs.mkdir(sessionDirectory);
});

afterEach(async () => fs.rm(tempRoot, { force: true, recursive: true }));

function createBackup(fileName: string, rows: Array<{ content: string; deleted?: boolean; id: string; title: string }>) {
  const filePath = path.join(tempRoot, fileName);
  const sqlite = new BetterSqlite3(filePath);
  sqlite.exec(`CREATE TABLE nodes (
    id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, content TEXT, deleted_at TEXT
  )`);
  const insert = sqlite.prepare('INSERT INTO nodes VALUES (?, NULL, ?, ?, ?)');
  rows.forEach((row) => insert.run(row.id, row.title, row.content, row.deleted ? 'deleted' : null));
  sqlite.close();
  return filePath;
}

async function gzip(sourcePath: string) {
  const destinationPath = `${sourcePath}.gz`;
  await pipeline(createReadStream(sourcePath), createGzip(), createWriteStream(destinationPath));
  return destinationPath;
}

async function sha256(filePath: string) {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

it('walks compressed and plain backups one match at a time and skips duplicates and damage', async () => {
  const newestPlain = createBackup('manual-new.db', []);
  const newest = await gzip(newestPlain);
  await fs.rm(newestPlain);
  const matchingPlain = createBackup('manual-match.db', [
    { content: 'needle one', deleted: true, id: 'same', title: 'First' },
    { content: 'needle two', id: 'second', title: 'Second' }
  ]);
  const duplicate = createBackup('manual-duplicate.db', [
    { content: 'needle one', id: 'same', title: 'Older title' }
  ]);
  const older = createBackup('manual-older.db', [
    { content: 'needle old', id: 'older', title: 'Older' }
  ]);
  const corrupt = path.join(tempRoot, 'manual-corrupt.db');
  await fs.writeFile(corrupt, 'not sqlite');
  const missing = path.join(tempRoot, 'manual-gone.db');
  const sources = [newest, matchingPlain, duplicate, corrupt, older];
  const hashes = await Promise.all(sources.map(sha256));
  const engine = new BackupSearchWorkerEngine({
    backups: [...sources, missing].map((filePath, index) => ({
      fileName: path.basename(filePath),
      filePath,
      updatedAt: `2026-09-${10 - index}T00:00:00.000Z`
    })),
    query: 'needle',
    sessionDirectory
  });

  await expect(engine.next()).resolves.toMatchObject({
    status: 'match', match: { backup_name: 'manual-match.db', deleted: true, node_id: 'same' }
  });
  await expect(engine.next()).resolves.toMatchObject({ status: 'match', match: { node_id: 'second' } });
  await expect(engine.next()).resolves.toMatchObject({ status: 'match', match: { node_id: 'older' } });
  await expect(engine.next()).resolves.toEqual({ skipped_backup_count: 2, status: 'complete' });
  await engine.dispose();

  expect(await fs.readdir(sessionDirectory)).toEqual([]);
  await expect(Promise.all(sources.map(sha256))).resolves.toEqual(hashes);
});

it('cleans incomplete private copies when the source disappears during copy or decompression', async () => {
  const source = createBackup('manual-source.db', []);
  const io = {
    copyFile: vi.fn(async (_source: import('node:fs').PathLike, destination: import('node:fs').PathLike) => {
      await fs.writeFile(destination, 'partial');
      throw Object.assign(new Error('gone during copy'), { code: 'ENOENT' });
    }),
    materializeCompressed: vi.fn(async () => {
      const destination = path.join(sessionDirectory, '.partial.db');
      await fs.writeFile(destination, 'partial');
      throw Object.assign(new Error('gone during decompress'), { code: 'ENOENT' });
    }),
    rename: fs.rename,
    stat: fs.stat
  };
  await expect(materializeBackupForSearch(source, sessionDirectory, io)).rejects.toThrow('gone during copy');
  await fs.rm(path.join(sessionDirectory, '.partial.db'), { force: true });
  await expect(materializeBackupForSearch(`${source}.gz`, sessionDirectory, io)).rejects.toThrow('gone during decompress');
  expect((await fs.readdir(sessionDirectory)).filter((name) => name.startsWith('.copy-'))).toEqual([]);
});
