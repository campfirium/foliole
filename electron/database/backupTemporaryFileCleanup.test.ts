// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { cleanupOrphanedBackupTemporaryFiles } from './backupTemporaryFileCleanup.js';
import { compressSqliteFile } from './compressedSqliteBackup.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-temp-cleanup-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('removes only exact inactive private files and reports actual bytes idempotently', async () => {
  const exactSource = `.foliole-auto-backup-260812-120000.db.gz-${UUID_A}.source.db`;
  const exactCompressed = `.pre-restore-2026-08-12_12-00-00-000.db.gz-${UUID_B}.compressed.tmp`;
  const emptySource = `.manual-2026-08-12_10-00-00-000.db.gz-${UUID_B}.source.db`;
  const retained = [
    'manual-2026-08-12_11-00-00-000.db',
    'pre-restore-2026-08-12_12-00-00-000.db.gz',
    `.manual-2026-08-12_11-00-00-000.db-${UUID_A}.source.db`,
    `.foliole-auto-backup-260812-120000.db.gz-${UUID_A}.source.db-copy`
  ];
  await Promise.all([
    write(exactSource, 7), write(exactCompressed, 11), write(emptySource, 0),
    ...retained.map((fileName) => write(fileName, 3))
  ]);

  await expect(cleanupOrphanedBackupTemporaryFiles(tempRoot)).resolves.toEqual({
    deletedCount: 3,
    releasedBytes: 18
  });
  expect((await fs.readdir(tempRoot)).sort()).toEqual(retained.sort());
  await expect(cleanupOrphanedBackupTemporaryFiles(tempRoot)).resolves.toEqual({
    deletedCount: 0,
    releasedBytes: 0
  });
});

it.each(['EBUSY', 'EPERM'])('keeps a private file when removal fails with %s', async (code) => {
  const fileName = `.manual-2026-08-12_11-00-00-000.db.gz-${UUID_A}.source.db`;
  await write(fileName, 9);
  const failure = Object.assign(new Error(code), { code });

  const result = await cleanupOrphanedBackupTemporaryFiles(tempRoot, {
    removeFile: async () => { throw failure; }
  });

  expect(result).toEqual({ deletedCount: 0, releasedBytes: 0 });
  await expect(fs.access(path.join(tempRoot, fileName))).resolves.toBeUndefined();
});

it('keeps a compression file owned by the current process', async () => {
  const sourcePath = path.join(tempRoot, 'source.db');
  const destinationPath = path.join(tempRoot, 'manual-2026-08-12_11-00-00-000.db.gz');
  await fs.writeFile(sourcePath, Buffer.alloc(1024, 1));
  let releaseLink: (() => void) | undefined;
  let reportLink: (() => void) | undefined;
  const linkGate = new Promise<void>((resolve) => { releaseLink = resolve; });
  const linkStarted = new Promise<void>((resolve) => { reportLink = resolve; });
  const originalLink = fs.link.bind(fs);
  vi.spyOn(fs, 'link').mockImplementation(async (existingPath, newPath) => {
    reportLink?.();
    await linkGate;
    await originalLink(existingPath, newPath);
  });
  const compression = compressSqliteFile(sourcePath, destinationPath);
  await linkStarted;

  await expect(cleanupOrphanedBackupTemporaryFiles(tempRoot)).resolves.toEqual({
    deletedCount: 0,
    releasedBytes: 0
  });
  expect((await fs.readdir(tempRoot)).some((fileName) => fileName.endsWith('.compressed.tmp'))).toBe(true);
  releaseLink?.();
  await compression;
});

async function write(fileName: string, size: number) {
  await fs.writeFile(path.join(tempRoot, fileName), Buffer.alloc(size, 1));
}
