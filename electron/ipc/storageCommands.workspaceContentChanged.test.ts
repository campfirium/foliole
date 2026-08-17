// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { mergeReadwiseTopicHighlights } = vi.hoisted(() => ({
  mergeReadwiseTopicHighlights: vi.fn()
}));
const { reimportCurrentTopicSource } = vi.hoisted(() => ({
  reimportCurrentTopicSource: vi.fn()
}));
const { notifyWorkspaceContentChanged } = vi.hoisted(() => ({
  notifyWorkspaceContentChanged: vi.fn()
}));
const { resetImportData } = vi.hoisted(() => ({
  resetImportData: vi.fn()
}));
const { upsertNodeSnapshot } = vi.hoisted(() => ({
  upsertNodeSnapshot: vi.fn()
}));
const { upsertNodeSnapshotWithOrder } = vi.hoisted(() => ({
  upsertNodeSnapshotWithOrder: vi.fn()
}));
const { upsertVersionedNodeSnapshotWithOrder } = vi.hoisted(() => ({
  upsertVersionedNodeSnapshotWithOrder: vi.fn()
}));

vi.mock('../database/importMaintenance.js', () => ({ resetImportData }));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  flushAllDirtyNodeSyncVersions: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  updateNodeAnchorLinks: vi.fn(),
  upsertNodeSnapshot,
  upsertNodeSnapshotWithOrder
}));
vi.mock('../database/nodeVersionedMutations.js', () => ({
  upsertVersionedNodeContentWithAnchors: vi.fn(),
  upsertVersionedNodeSnapshot: vi.fn(),
  upsertVersionedNodeSnapshotWithOrder
}));
vi.mock('../database/workspaceSearch.js', () => ({ searchWorkspace: vi.fn() }));
vi.mock('../import/currentSourceReimport.js', () => ({ reimportCurrentTopicSource }));
vi.mock('../import/readwiseTopicMerge.js', () => ({ mergeReadwiseTopicHighlights }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged }));

import { handleStorageCommand } from './storageCommands.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('notifies workspace content changes after node mutation commands', async () => {
  await expect(handleStorageCommand('create_topic', {
    anchorLink: null,
    content: '# Topic',
    createdAt: '2026-05-11T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'node-1',
    nodeOrder: ['node-1'],
    parentNodeId: null,
    position: 0,
    reading: null,
    reveal: null,
    title: 'Topic',
    updatedAt: '2026-05-11T00:00:00.000Z'
  })).resolves.toMatchObject({
    createdNodeIds: ['node-1'],
    nodeOrder: ['node-1']
  });

  expect(upsertVersionedNodeSnapshotWithOrder).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'topic',
    nodeId: 'node-1'
  }), ['node-1']);
  expect(notifyWorkspaceContentChanged).toHaveBeenCalledTimes(1);
});

it('notifies workspace content changes after merged Readwise topic highlights', async () => {
  mergeReadwiseTopicHighlights.mockResolvedValue({
    merged_highlight_count: 1,
    node_id: 'node-1',
    status: 'merged'
  });

  await expect(handleStorageCommand('merge_readwise_topic_highlights', { node_id: 'node-1' })).resolves.toEqual({
    merged_highlight_count: 1,
    node_id: 'node-1',
    status: 'merged'
  });

  expect(notifyWorkspaceContentChanged).toHaveBeenCalledTimes(1);
});

it('does not notify workspace content changes for noop Readwise topic highlight merge', async () => {
  mergeReadwiseTopicHighlights.mockResolvedValue({
    merged_highlight_count: 0,
    node_id: 'node-1',
    status: 'noop'
  });

  await expect(handleStorageCommand('merge_readwise_topic_highlights', { node_id: 'node-1' })).resolves.toMatchObject({
    status: 'noop'
  });

  expect(notifyWorkspaceContentChanged).not.toHaveBeenCalled();
});

it('notifies workspace content changes when reset import data deletes nodes', async () => {
  resetImportData.mockReturnValue({
    clearedImportRunCount: 3,
    clearedImportSourceCount: 2,
    clearedKeepImportItemCount: 1,
    deletedNodeCount: 4,
    deletedRootNodeCount: 2
  });

  await expect(handleStorageCommand('reset_import_data', {})).resolves.toMatchObject({
    deletedNodeCount: 4
  });

  expect(notifyWorkspaceContentChanged).toHaveBeenCalledTimes(1);
});

it('notifies workspace content changes after current source reimport', async () => {
  reimportCurrentTopicSource.mockResolvedValue({
    detail: null,
    node_id: 'node-1',
    reimported_at: '2026-05-18T00:00:00.000Z',
    status: 'reimported'
  });

  await expect(handleStorageCommand('dev_reimport_current_topic_source', { node_id: 'node-1' })).resolves.toMatchObject({
    status: 'reimported'
  });

  expect(reimportCurrentTopicSource).toHaveBeenCalledWith('node-1');
  expect(notifyWorkspaceContentChanged).toHaveBeenCalledTimes(1);
});
