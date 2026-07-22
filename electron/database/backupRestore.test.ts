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

import { upsertAssistantThreadIndex } from './assistantThreadIndex.js';
import {
  appendAssistantThreadMessages,
  listAssistantThreadMessages
} from './assistantThreadMessages.js';
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
import { flushNodeSyncVersion } from './nodeSyncVersions.js';
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
        attachments: [],
        id: 'node-1',
        parentNodeId: null,
        position: null,
        kind: 'topic',
        title: 'node-1',
        isTitleManual: true,
        hideTitleHeading: false,
        bodyBlobHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        content: '# original',
        currentVersionId: null,
        importContentFingerprint: null,
        importSourceFingerprint: null,
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

  const restored = createRestoredWorkspaceSnapshot();
  expect(loadWorkspaceSnapshot({ includeBody: true })).toEqual({
    ...restored,
    nodesById: Object.fromEntries(Object.entries(restored.nodesById).map(([nodeId, node]) => [nodeId, {
      ...node,
      importContentFingerprint: null,
      importSourceFingerprint: null
    }]))
  });
  expect(selectReviewLogCount('node-qa')).toBe(1);
  expect(selectNodeCount('node-later')).toBe(0);

  applyFollowupReviewGrade();

  expect(selectReviewLogCount('node-qa')).toBe(2);
});

it('stamps a restore incarnation before minting post-restore node sync versions', async () => {
  seedNode('node-1', '# original');
  const preBackupVersionId = flushNodeSyncVersion('node-1', '2026-03-14T10:00:30.000Z');
  const backup = await createApplicationDatabaseBackup();

  seedNode('node-1', '# after backup');
  const distributedAfterBackupVersionId = flushNodeSyncVersion('node-1', '2026-03-14T10:01:30.000Z');

  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  seedNode('node-1', '# restored mutation');
  const restoredVersionId = flushNodeSyncVersion('node-1', '2026-03-14T10:02:30.000Z');

  expect(preBackupVersionId).toMatch(/^device-.*#0$/);
  expect(distributedAfterBackupVersionId).toMatch(/^device-.*#1$/);
  expect(restoredVersionId).toMatch(/^device-.*#zrestore-[0-9a-f-]+#1$/);
  expect(restoredVersionId).not.toBe(distributedAfterBackupVersionId);
  expect(selectSettingSyncRecordCount('desktop_node_sync_restore_incarnation')).toBe(0);
});

it('leaves device-local assistant history unchanged when restoring the main database', async () => {
  upsertAssistantThreadIndex({
    location: { nodeId: 'node-1', type: 'node' },
    message: 'Before backup',
    now: '2026-03-14T10:00:00.000Z',
    providerThreadId: 'thread-1'
  });
  appendAssistantThreadMessages([
    {
      createdAt: '2026-03-14T10:00:01.000Z',
      id: 'turn-1:user',
      providerThreadId: 'thread-1',
      role: 'user',
      text: 'Before backup'
    },
    {
      createdAt: '2026-03-14T10:00:02.000Z',
      id: 'turn-1:assistant',
      providerThreadId: 'thread-1',
      role: 'assistant',
      text: 'Persisted answer'
    }
  ]);

  const backup = await createApplicationDatabaseBackup();
  appendAssistantThreadMessages([
    {
      createdAt: '2026-03-14T10:01:00.000Z',
      id: 'turn-2:user',
      providerThreadId: 'thread-1',
      role: 'user',
      text: 'Later drift'
    }
  ]);

  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  expect(listAssistantThreadMessages('thread-1').map((message) => message.text)).toEqual([
    'Before backup',
    'Persisted answer',
    'Later drift'
  ]);
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

function selectSettingSyncRecordCount(key: string) {
  const connection = openDatabaseConnection();
  const row = connection.sqlite
    .prepare(
      `SELECT (
         SELECT COUNT(*) FROM setting_records WHERE key = @key
       ) + (
         SELECT COUNT(*) FROM sync_object_state
         WHERE object_type = 'setting' AND object_id LIKE '%' || @key
       ) AS count`
    )
    .get({ key }) as { count: number };
  return row.count;
}
