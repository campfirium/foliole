// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-restore-rollback';
const initializeState = vi.hoisted(() => ({ failNext: false }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./migrate.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./migrate.js')>();
  return {
    ...original,
    initializeDatabase: (...args: Parameters<typeof original.initializeDatabase>) => {
      if (initializeState.failNext) {
        initializeState.failNext = false;
        throw new Error('injected restored database initialization failure');
      }
      return original.initializeDatabase(...args);
    }
  };
});

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection
} from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-rollback-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  initializeState.failNext = false;
  clearDatabaseConnectionUnavailable();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('rolls back to the current library when restored database initialization fails', async () => {
  seedNode('# backup');
  const backup = await createApplicationDatabaseBackup();
  seedNode('# current');
  initializeState.failNext = true;

  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath }))
    .rejects.toThrow('Your current library has been restored');

  expect(currentContent()).toBe('# current');
});

it('disables database access when restored initialization and rollback both fail', async () => {
  seedNode('# backup');
  const backup = await createApplicationDatabaseBackup();
  seedNode('# current');
  const originalRename = fs.rename.bind(fs);
  let renameCount = 0;
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, targetPath) => {
    renameCount += 1;
    if (renameCount === 2) throw new Error('injected rollback replacement failure');
    await originalRename(sourcePath, targetPath);
  });
  initializeState.failNext = true;

  try {
    await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath }))
      .rejects.toThrow('restart Foliole before making more changes');
    expect(() => currentContent()).toThrow('could not reopen the current library');
  } finally {
    renameSpy.mockRestore();
  }
});

function currentContent() {
  return loadWorkspaceSnapshot({ includeBody: true })?.nodesById['node-1']?.content;
}

function seedNode(content: string) {
  upsertNodeSnapshot({
    nodeId: 'node-1', parentNodeId: null, kind: 'topic', title: 'node-1', isTitleManual: true,
    content, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-03-14T10:00:00.000Z', updatedAt: new Date().toISOString()
  });
}
