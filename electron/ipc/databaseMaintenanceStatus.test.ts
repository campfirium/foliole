import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedDatabasePath = '';

vi.mock('./libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ database_path: mockedDatabasePath })
}));

import {
  databaseMaintenanceStatusTestExports,
  loadDatabaseMaintenanceStatus
} from './databaseMaintenanceStatus.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-maintenance-status-'));
  mockedDatabasePath = path.join(tempRoot, 'foliole.db');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

async function writeSizedFile(filePath: string, size: number) {
  await fs.writeFile(filePath, Buffer.alloc(size, 1));
}

it('groups main, search, and external database file sizes without scanning archives', async () => {
  await writeSizedFile(mockedDatabasePath, 10);
  await writeSizedFile(`${mockedDatabasePath}-wal`, 30);
  await writeSizedFile(path.join(tempRoot, 'foliole-index.db'), 20);
  await writeSizedFile(path.join(tempRoot, 'foliole-external.db'), 8);
  await fs.mkdir(path.join(tempRoot, 'pre-filename-migration'));
  await writeSizedFile(path.join(tempRoot, 'pre-filename-migration', 'foliole-external.db'), 200);

  await expect(loadDatabaseMaintenanceStatus()).resolves.toMatchObject({
    entries: [
      {
        backup_role: 'included',
        key: 'main-data',
        rebuild_role: 'not-applicable',
        size_bytes: 40,
        state: 'present'
      },
      {
        backup_role: 'excluded',
        key: 'search-data',
        rebuild_role: 'rebuildable-from-main-data',
        size_bytes: 20,
        state: 'present'
      },
      {
        backup_role: 'excluded',
        key: 'external-sources-data',
        rebuild_role: 'rebuildable-from-main-data',
        size_bytes: 8,
        state: 'present'
      }
    ]
  });
});

it('marks missing side databases as absent without treating them as empty files', async () => {
  await writeSizedFile(mockedDatabasePath, 10);

  await expect(loadDatabaseMaintenanceStatus()).resolves.toMatchObject({
    entries: [
      expect.objectContaining({ key: 'main-data', size_bytes: 10, state: 'present' }),
      expect.objectContaining({ key: 'search-data', size_bytes: 0, state: 'absent' }),
      expect.objectContaining({ key: 'external-sources-data', size_bytes: 0, state: 'absent' })
    ]
  });
});

it('marks one file group unreadable without blocking other groups', async () => {
  const originalStat = fs.stat;
  const stat = vi.spyOn(fs, 'stat');
  stat.mockImplementation(async (filePath) => {
    if (String(filePath).endsWith('foliole-index.db-wal')) {
      const error = new Error('blocked') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      throw error;
    }
    return originalStat(filePath);
  });
  await writeSizedFile(mockedDatabasePath, 10);
  await writeSizedFile(path.join(tempRoot, 'foliole-index.db'), 20);

  await expect(loadDatabaseMaintenanceStatus()).resolves.toMatchObject({
    entries: [
      expect.objectContaining({ key: 'main-data', size_bytes: 10, state: 'present' }),
      expect.objectContaining({ key: 'search-data', size_bytes: null, state: 'unreadable' }),
      expect.objectContaining({ key: 'external-sources-data', state: 'absent' })
    ]
  });
});

it('uses fixed database file groups derived from the main database path', () => {
  expect(databaseMaintenanceStatusTestExports.createDatabaseFileGroups('D:/Data/foliole.db')).toMatchObject([
    { key: 'main-data', path: 'D:/Data/foliole.db' },
    { key: 'search-data', path: expect.stringContaining('foliole-index.db') },
    { key: 'external-sources-data', path: expect.stringContaining('foliole-external.db') }
  ]);
});
