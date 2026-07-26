// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { upsertVersionedNodeSnapshotWithOrder } from '../database/nodeVersionedMutations.js';

import { handleInvokeRequest } from './commands.js';

const { defaultReviewSchedulerSettings, openExternal, syncAppMenuState } = vi.hoisted(() => ({
  defaultReviewSchedulerSettings: {
    algorithm: 'ts-fsrs@5.4.0 using FSRS-6.0',
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
    enableShortTerm: false,
    pushQueue: {
      defaultPriority: 5,
      priorityRatio: 5,
      queueMixRatio: { reading: 1, fsrs: 5 },
      readingInitialIntervalMs: 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
    },
    updatedAt: '2026-03-06T00:00:00.000Z'
  },
  openExternal: vi.fn().mockResolvedValue(undefined),
  syncAppMenuState: vi.fn()
}));

const mockWindow = {
  close: vi.fn(),
  isMaximized: vi.fn(() => false),
  maximize: vi.fn(),
  minimize: vi.fn(),
  unmaximize: vi.fn()
};

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal }
}));

vi.mock('./menu.js', () => ({ syncAppMenuState }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshots: vi.fn()
}));
vi.mock('../database/nodeVersionedMutations.js', () => ({
  upsertVersionedNodeContentWithAnchors: vi.fn(),
  upsertVersionedNodeSnapshot: vi.fn(),
  upsertVersionedNodeSnapshotWithOrder: vi.fn()
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({ 'foliole-ui-font-preset': 'inter' }),
  saveAppSettingsState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings)
}));
vi.mock('./boot.js', () => ({
  appendBootEvent: vi.fn(),
  bootReport: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn().mockReturnValue({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} }) }));
vi.mock('../mirror/rebuildMirrorOutput.js', () => ({
  rebuildMirrorOutput: vi.fn()
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({
  scheduleMirrorSync: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockWindow.isMaximized.mockReturnValue(false);
});

it.each([
  { command: 'create_folder', kind: 'folder', nodeId: 'node-create-folder', title: 'Created folder' },
  { command: 'create_topic', kind: 'topic', nodeId: 'node-create-topic', title: 'Created topic' },
  { command: 'create_item', kind: 'item', nodeId: 'node-create-item', title: 'Created item' }
] as const)('handles $command with explicit $kind payloads', async ({ command, kind, nodeId, title }) => {
  await expect(
    handleInvokeRequest({
      command,
      args: {
        nodeId,
        parentNodeId: null,
        kind,
        title,
        isTitleManual: false,
        content: '',
        reveal: null,
        anchorLink: null,
        nodeOrder: [nodeId],
        position: 0,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z'
      }
    })
  ).resolves.toEqual({
    activeNodeId: null,
    createdNodeIds: [nodeId],
    nodeOrder: [nodeId],
    nodes: [expect.objectContaining({ nodeId, title })]
  });

  expect(upsertVersionedNodeSnapshotWithOrder).toHaveBeenCalledWith(
    {
      nodeId,
      parentNodeId: null,
      kind,
      priority: null,
      desiredRetention: null,
      enableShortTerm: null,
      sequentialReadingEnabled: null,
      shelvedAt: null,
      manualChildOrder: null,
      hideTitleHeading: false,
      title,
      isTitleManual: false,
      content: '',
      virtualFilter: null,
      reveal: null,
      anchorLink: null,
      imageRegions: null,
      reading: null,
      review: null,
      position: 0,
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:00:00.000Z'
    },
    [nodeId]
  );
});

it('persists review payloads on create_item commands', async () => {
  const review = {
    due: '2026-05-22T00:00:00.000Z',
    lastReviewAt: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };

  await expect(
    handleInvokeRequest({
      command: 'create_item',
      args: {
        nodeId: 'node-create-item',
        parentNodeId: null,
        kind: 'item',
        title: 'Created item',
        isTitleManual: false,
        content: '',
        reveal: 'Answer',
        anchorLink: null,
        review,
        nodeOrder: ['node-create-item'],
        position: 0,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z'
      }
    })
  ).resolves.toEqual({
    activeNodeId: null,
    createdNodeIds: ['node-create-item'],
    nodeOrder: ['node-create-item'],
    nodes: [expect.objectContaining({ nodeId: 'node-create-item', review })]
  });

  expect(upsertVersionedNodeSnapshotWithOrder).toHaveBeenCalledWith(expect.objectContaining({ review }), ['node-create-item']);
});

it('rejects mismatched folder-topic-item creation payload kinds', async () => {
  await expect(
    handleInvokeRequest({
      command: 'create_folder',
      args: {
        nodeId: 'node-bad-folder',
        parentNodeId: null,
        kind: 'topic',
        title: 'Mismatch',
        isTitleManual: false,
        content: '',
        reveal: null,
        anchorLink: null,
        position: 0,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z'
      }
    })
  ).rejects.toThrow('invalid argument: kind');
});
