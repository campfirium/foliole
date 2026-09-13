// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { cleanupOrphanedBackupSidecars } from './orphanedBackupSidecars.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sidecar-cleanup-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('permanently removes only proven orphaned sidecars with managed backup names', async () => {
  const orphanWal = 'manual-2026-09-13_10-00-00-000.db-wal';
  const orphanShm = 'foliole-auto-backup-260913-100000.db-shm';
  const retainedByDatabase = 'auto-hourly-2026-09-13_11-00-00-000.db-wal';
  const retainedByCompressed = 'pre-restore-2026-09-13_12-00-00-000.db-shm';
  const unrelated = 'other-2026-09-13_10-00-00-000.db-wal';
  await Promise.all([
    fs.writeFile(path.join(tempRoot, orphanWal), Buffer.alloc(7)),
    fs.writeFile(path.join(tempRoot, orphanShm), Buffer.alloc(11)),
    fs.writeFile(path.join(tempRoot, retainedByDatabase), 'sidecar'),
    fs.writeFile(path.join(tempRoot, retainedByDatabase.replace('-wal', '')), 'database'),
    fs.writeFile(path.join(tempRoot, retainedByCompressed), 'sidecar'),
    fs.writeFile(path.join(tempRoot, `${retainedByCompressed.replace('-shm', '')}.gz`), 'compressed'),
    fs.writeFile(path.join(tempRoot, unrelated), 'unrelated')
  ]);

  await expect(cleanupOrphanedBackupSidecars(tempRoot)).resolves.toEqual({
    deletedCount: 2,
    failedCount: 0,
    releasedBytes: 18
  });
  expect((await fs.readdir(tempRoot)).sort()).toEqual([
    'auto-hourly-2026-09-13_11-00-00-000.db',
    retainedByDatabase,
    retainedByCompressed,
    'pre-restore-2026-09-13_12-00-00-000.db.gz',
    unrelated
  ].sort());
});

it('preserves a sidecar while a matching private backup file is present', async () => {
  const sidecar = 'manual-2026-09-13_10-00-00-000.db-wal';
  const temporary = '.manual-2026-09-13_10-00-00-000.db.gz-11111111-1111-4111-8111-111111111111.source.db';
  await fs.writeFile(path.join(tempRoot, sidecar), 'sidecar');
  await fs.writeFile(path.join(tempRoot, temporary), 'temporary');

  await expect(cleanupOrphanedBackupSidecars(tempRoot, {
    isTemporaryActive: (filePath) => filePath.endsWith(temporary)
  })).resolves.toEqual({
    deletedCount: 0,
    failedCount: 0,
    releasedBytes: 0
  });
  await expect(fs.access(path.join(tempRoot, sidecar))).resolves.toBeUndefined();
});
