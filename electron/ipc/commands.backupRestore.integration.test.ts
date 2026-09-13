// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-ipc-backup-restore-integration';

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => null), getFocusedWindow: vi.fn(() => null) },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/databaseReadiness.js', () => ({ waitForDatabaseReady: vi.fn() }));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn(), bootReport: vi.fn() }));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createApplicationDatabaseBackup } from '../database/backupRestore.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { handleInvokeRequest } from './commands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ipc-restore-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  seedNode('# backup');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('restores through the real storage route and database lifecycle owner', async () => {
  const backup = await createApplicationDatabaseBackup();
  seedNode('# current');

  await expect(handleInvokeRequest({
    command: NATIVE_COMMANDS.restoreSqliteDatabase,
    args: { sourcePath: backup.destinationPath }
  })).resolves.toMatchObject({ sourcePath: path.resolve(backup.destinationPath) });

  expect(currentContent()).toBe('# backup');
});

it('keeps later storage work behind the database replacement', async () => {
  const backup = await createApplicationDatabaseBackup();
  seedNode('# current');
  const originalRename = fs.rename.bind(fs);
  let releaseCommit!: () => void;
  let reportCommitStarted!: () => void;
  const commitStarted = new Promise<void>((resolve) => { reportCommitStarted = resolve; });
  const waitForCommit = new Promise<void>((resolve) => { releaseCommit = resolve; });
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, targetPath) => {
    if (String(sourcePath).includes('.foliole-restore-') && path.basename(String(targetPath)) === 'foliole.db') {
      reportCommitStarted();
      await waitForCommit;
    }
    await originalRename(sourcePath, targetPath);
  });

  try {
    const restore = handleInvokeRequest({
      command: NATIVE_COMMANDS.restoreSqliteDatabase,
      args: { sourcePath: backup.destinationPath }
    });
    await commitStarted;
    let laterResolved = false;
    const later = handleInvokeRequest({ command: NATIVE_COMMANDS.loadWorkspaceListSnapshot })
      .then((value) => { laterResolved = true; return value; });
    await Promise.resolve();
    expect(laterResolved).toBe(false);

    releaseCommit();
    await restore;
    await later;
    expect(currentContent()).toBe('# backup');
  } finally {
    releaseCommit();
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
