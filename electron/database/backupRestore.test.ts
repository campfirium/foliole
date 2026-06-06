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

import {
  applyFollowupReviewGrade,
  createRestoredWorkspaceSnapshot,
  mutateWorkspaceAfterBackup,
  seedBackupBaseline,
  seedNode
} from './backupRestore.fixture.js';
import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { initializeDatabase } from './migrate.js';
import { saveReadingProgress } from './readingProgress.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-restore-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  resetSeededWorkspace();
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

  expect(loadWorkspaceSnapshot({ includeBody: true })).toEqual({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        id: 'node-1',
        parentNodeId: null,
        kind: 'topic',
        title: 'node-1',
        isTitleManual: true,
        hideTitleHeading: false,
        bodyBlobHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        content: '# original',
        openingText: null,
        virtualFilter: null,
        reveal: null,
        anchorLink: null,
        reading: null,
        review: null,
        shelvedAt: null,
        createdAt: '2026-03-14T10:00:00.000Z',
        updatedAt: '2026-03-14T10:00:00.000Z'
      }
    },
    persistedNodeViewById: {
      'node-1': {
        nodeId: 'node-1',
        scrollTop: 24,
        selectionFrom: 1,
        selectionTo: 3,
        source: 'user-scroll',
        updatedAt: '2026-03-14T10:00:00.000Z'
      }
    },
    trashedNodeDeletedAtById: {},
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  });
});

it('restores review history, node lifecycle state, and backup truth after later CRUD drift', async () => {
  seedBackupBaseline();

  const backup = await createApplicationDatabaseBackup();

  mutateWorkspaceAfterBackup();

  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  expect(loadWorkspaceSnapshot({ includeBody: true })).toEqual(createRestoredWorkspaceSnapshot());
  expect(selectReviewLogCount('node-qa')).toBe(1);
  expect(selectNodeCount('node-later')).toBe(0);

  applyFollowupReviewGrade();

  expect(selectReviewLogCount('node-qa')).toBe(2);
});

function selectReviewLogCount(nodeId: string) {
  const connection = openDatabaseConnection();
  const row = connection.sqlite
    .prepare('SELECT COUNT(*) as count FROM review_log WHERE node_id = ?')
    .get(nodeId) as { count: number };
  return row.count;
}

function selectNodeCount(nodeId: string) {
  const connection = openDatabaseConnection();
  const row = connection.sqlite
    .prepare('SELECT COUNT(*) as count FROM nodes WHERE id = ?')
    .get(nodeId) as { count: number };
  return row.count;
}
