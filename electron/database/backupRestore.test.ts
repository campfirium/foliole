// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-restore-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { saveReadingProgress } from './readingProgress.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-restore-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('restores the application sqlite state from an online backup snapshot', async () => {
  seedNode('node-1', '# original');
  saveReadingProgress({
    activeNodeId: 'node-1',
    nodeViewStates: [{ nodeId: 'node-1', scrollTop: 24, selectionFrom: 1, selectionTo: 3 }],
    updatedAt: '2026-03-14T10:00:00.000Z'
  });

  const backup = await createApplicationDatabaseBackup();
  expect(await fs.stat(backup.destinationPath)).toBeDefined();

  seedNode('node-1', '# mutated');
  seedNode('node-2', '# added later');

  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  expect(loadWorkspaceSnapshot()).toEqual({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        id: 'node-1',
        parentNodeId: null,
        title: 'node-1',
        isTitleManual: true,
        content: '# original',
        reveal: null,
        anchorLink: null,
        review: null,
        createdAt: '2026-03-14T10:00:00.000Z',
        updatedAt: '2026-03-14T10:00:00.000Z'
      }
    },
    trashedNodeIds: []
  });
});

function seedNode(nodeId: string, content: string) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    title: nodeId,
    isTitleManual: true,
    content,
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z'
  });
}
