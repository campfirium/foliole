// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-restore-rollback';
const initializeState = vi.hoisted(() => ({ failNext: false }));
const backupSettingsState = vi.hoisted(() => ({ failNextReapply: false }));

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
vi.mock('./backupSettings.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./backupSettings.js')>();
  return {
    ...original,
    reapplyBackupSettingsAfterRestore: (...args: Parameters<typeof original.reapplyBackupSettingsAfterRestore>) => {
      if (backupSettingsState.failNextReapply) {
        backupSettingsState.failNextReapply = false;
        throw new Error('injected backup settings reapply failure');
      }
      return original.reapplyBackupSettingsAfterRestore(...args);
    }
  };
});

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { loadBackupSettings, saveBackupSettings } from './backupSettings.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection
} from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { saveReadwiseDeviceConnection, loadReadwiseDeviceConnection } from './readwiseDeviceConnection.js';
import { loadReadwiseSourceModeState } from './readwiseSourceMode.js';
import { saveJsonSetting } from './settingsStore.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  backupSettingsState.failNextReapply = false;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-rollback-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  initializeState.failNext = false;
  backupSettingsState.failNextReapply = false;
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

it('rolls back the library when current backup controls cannot be reapplied', async () => {
  seedNode('# backup');
  const backup = await createApplicationDatabaseBackup();
  saveBackupSettings({
    backup_dir: path.join(tempRoot, 'current-backups'),
    daily_max_count: 4,
    hourly_max_count: 6
  });
  const current = loadBackupSettings();
  seedNode('# current');
  backupSettingsState.failNextReapply = true;

  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath }))
    .rejects.toThrow('Your current library has been restored');

  expect(currentContent()).toBe('# current');
  expect(loadBackupSettings()).toEqual(current);
});

it('restores Readwise mode and cutover together without restoring device credentials', async () => {
  const completion = {
    batchId: 'batch-1', completedAt: 'done', sourceHost: 'This Mac', startedAt: 'start'
  };
  saveJsonSetting('readwise_remote_source', {
    connectionRef: 'readwise-device', createdAt: 'created', updatedAt: 'updated', version: 1
  });
  saveJsonSetting('readwise_source_cutover_v2', {
    annotations: [], batchId: completion.batchId, cohortDocumentIds: [],
    completedAt: completion.completedAt, completionVersion: 4, documents: [], phase: null,
    retiredNodeIds: [], sourceHost: completion.sourceHost, startedAt: completion.startedAt,
    status: 'api', version: 2
  });
  saveJsonSetting('readwise_source_mode', { completion, mode: 'api', version: 1 });
  saveReadwiseDeviceConnection({
    secretRef: 'local-secret', state: 'connected', verifiedAt: 'verified'
  });
  const backup = await createApplicationDatabaseBackup();

  saveJsonSetting('readwise_source_mode', { completion, mode: 'off', version: 1 });
  saveReadwiseDeviceConnection({
    secretRef: 'new-local-secret', state: 'connected', verifiedAt: 'new-verified'
  });
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  expect(loadReadwiseSourceModeState()).toEqual({
    completion, conflictReasons: [], mode: 'api'
  });
  expect(loadReadwiseDeviceConnection()).toEqual({
    secretRef: 'new-local-secret', state: 'connected', verifiedAt: 'new-verified'
  });
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
