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
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { saveReadingProgress } from './readingProgress.js';
import { applyReviewGrade } from './reviewMutations.js';
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

function seedBackupBaseline() {
  seedNode('node-root', '# root', 0);
  seedNode('node-qa', 'Prompt [...]', 1, 'Answer');
  seedNode('node-trash', '# trash', 2);

  softDeleteNodes({ nodeIds: ['node-trash'], deletedAt: '2026-03-14T10:01:00.000Z' });
  applyReviewGrade({
    nodeId: 'node-qa',
    grade: 3,
    reviewedAt: '2026-03-14T10:02:00.000Z',
    schedulerVersion: 'ts-fsrs@4:backup',
    cardBefore: createSchedulerCard('2026-03-14T10:00:00.000Z'),
    cardAfter: {
      ...createSchedulerCard('2026-03-17T10:02:00.000Z'),
      last_review: '2026-03-14T10:02:00.000Z',
      state: 1,
      stability: 2.7,
      difficulty: 3.4,
      elapsed_days: 1,
      scheduled_days: 3,
      reps: 1
    }
  });
}

function mutateWorkspaceAfterBackup() {
  seedNode('node-root', '# mutated after backup', 0);
  seedNode('node-later', '# later node', 3);
  deleteNodesPermanently({
    nodeIds: ['node-qa', 'node-trash'],
    nodeOrder: ['node-root', 'node-later']
  });
}

function createRestoredNodeSnapshot(nodeId: string, content: string, reveal: string | null = null) {
  return {
    id: nodeId,
    parentNodeId: null,
    kind: reveal === null ? 'topic' : 'item',
    title: nodeId,
    isTitleManual: true,
    hideTitleHeading: false,
    bodyBlobHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    content,
    openingText: reveal === null ? null : content,
    virtualFilter: null,
    reveal,
    anchorLink: null,
    reading: null,
    review: null,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z'
  };
}

function createRestoredWorkspaceSnapshot() {
  return {
    activeNodeId: 'node-root',
    nodeOrder: ['node-root', 'node-qa', 'node-trash'],
    nodesById: {
      'node-root': createRestoredNodeSnapshot('node-root', '# root'),
      'node-qa': {
        ...createRestoredNodeSnapshot('node-qa', 'Prompt [...]', 'Answer'),
        review: {
          due: '2026-03-17T10:02:00.000Z',
          lastReviewAt: '2026-03-14T10:02:00.000Z',
          state: 1,
          stability: 2.7,
          difficulty: 3.4,
          elapsedDays: 1,
          scheduledDays: 3,
          reps: 1,
          lapses: 0
        },
      },
      'node-trash': {
        ...createRestoredNodeSnapshot('node-trash', '# trash'),
        updatedAt: '2026-03-14T10:01:00.000Z'
      }
    },
    trashedNodeIds: ['node-trash'],
    untitledSequenceByParent: {}
  };
}

function applyFollowupReviewGrade() {
  applyReviewGrade({
    nodeId: 'node-qa',
    grade: 1,
    reviewedAt: '2026-03-17T10:02:00.000Z',
    schedulerVersion: 'ts-fsrs@4:followup',
    cardBefore: {
      ...createSchedulerCard('2026-03-17T10:02:00.000Z'),
      last_review: '2026-03-14T10:02:00.000Z',
      state: 1,
      stability: 2.7,
      difficulty: 3.4,
      elapsed_days: 1,
      scheduled_days: 3,
      reps: 1
    },
    cardAfter: {
      ...createSchedulerCard('2026-03-17T10:12:00.000Z'),
      last_review: '2026-03-17T10:02:00.000Z',
      state: 3,
      stability: 1.1,
      difficulty: 4.2,
      elapsed_days: 3,
      scheduled_days: 0,
      reps: 2,
      lapses: 1
    }
  });
}

function seedNode(nodeId: string, content: string, position = 0, reveal: string | null = null) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: reveal === null ? 'topic' : 'item',
    title: nodeId,
    isTitleManual: true,
    content,
    reveal,
    anchorLink: null,
    position,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z'
  });
}

function createSchedulerCard(due: string) {
  return {
    due,
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  };
}

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
