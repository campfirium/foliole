// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-list-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-list-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_config_dir: mockedAppDataDir,
    app_cache_dir: mockedAppDataDir,
    documents_dir: mockedDocumentsDir,
    app_log_dir: mockedAppDataDir
  })
}));

import { listApplicationDatabaseBackups } from './backupRestore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-list-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('lists sqlite backups newest first from the managed backup directory', async () => {
  const backupDirectoryPath = path.join(mockedDocumentsDir, 'Foliole', 'Backups');
  await fs.mkdir(backupDirectoryPath, { recursive: true });

  const olderPath = path.join(backupDirectoryPath, 'manual-2026-03-14_10-00-00-000.db');
  const newerPath = path.join(backupDirectoryPath, 'manual-2026-03-14_11-00-00-000.db');
  const snapshotPath = path.join(backupDirectoryPath, 'pre-restore-2026-03-14_10-30-00-000.db');
  await fs.writeFile(olderPath, 'older-backup');
  await fs.writeFile(newerPath, 'newer-backup');
  await fs.writeFile(snapshotPath, 'snapshot');
  await fs.utimes(olderPath, new Date('2026-03-14T10:00:00.000Z'), new Date('2026-03-14T10:00:00.000Z'));
  await fs.utimes(newerPath, new Date('2026-03-14T11:00:00.000Z'), new Date('2026-03-14T11:00:00.000Z'));
  await fs.utimes(snapshotPath, new Date('2026-03-14T10:30:00.000Z'), new Date('2026-03-14T10:30:00.000Z'));

  await expect(listApplicationDatabaseBackups()).resolves.toEqual([
    {
      autoFrequency: null,
      fileName: 'manual-2026-03-14_11-00-00-000.db',
      filePath: newerPath,
      kind: 'manual',
      snapshotReason: null,
      sizeBytes: 12,
      updatedAt: '2026-03-14T11:00:00.000Z'
    },
    {
      autoFrequency: null,
      fileName: 'pre-restore-2026-03-14_10-30-00-000.db',
      filePath: snapshotPath,
      kind: 'snapshot',
      snapshotReason: 'pre-restore',
      sizeBytes: 8,
      updatedAt: '2026-03-14T10:30:00.000Z'
    },
    {
      autoFrequency: null,
      fileName: 'manual-2026-03-14_10-00-00-000.db',
      filePath: olderPath,
      kind: 'manual',
      snapshotReason: null,
      sizeBytes: 12,
      updatedAt: '2026-03-14T10:00:00.000Z'
    }
  ]);
});

it('returns an empty list when the managed backup directory does not exist', async () => {
  await expect(listApplicationDatabaseBackups()).resolves.toEqual([]);
});
