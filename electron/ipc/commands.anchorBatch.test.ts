// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { upsertVersionedNodeContentWithAnchors } from '../database/nodeVersionedMutations.js';
import { enqueueCoalescedWorkspaceSearchInvalidation } from '../database/searchIndexInvalidationCoalescer.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { handleInvokeRequest } from './commands.js';

vi.mock('../database/connection.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../database/connection.js')>(),
  runWithDatabaseConnectionOwner: vi.fn((execute: () => unknown) => execute())
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: vi.fn().mockReturnValue({}) }));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn()
}));
vi.mock('../database/nodeVersionedMutations.js', () => ({
  upsertVersionedNodeContentWithAnchors: vi.fn(),
  upsertVersionedNodeSnapshot: vi.fn(),
  upsertVersionedNodeSnapshotWithOrder: vi.fn()
}));
vi.mock('../database/searchIndexInvalidationCoalescer.js', () => ({
  enqueueCoalescedWorkspaceSearchInvalidation: vi.fn()
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn(),
  saveAppSettingsState: vi.fn()
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn(),
  saveReviewSchedulerSettings: vi.fn()
}));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn(), bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn() }));
vi.mock('../mirror/rebuildMirrorOutput.js', () => ({ rebuildMirrorOutput: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('handles batched parent and text-anchor mutations in one command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'update_node_content_with_anchors',
      args: {
        parent: {
          nodeId: 'node-parent',
          parentNodeId: null,
          kind: 'topic',
          title: 'Parent',
          isTitleManual: false,
          content: 'Alpha Better Gamma',
          reveal: null,
          anchorLink: null,
          position: 1,
          createdAt: '2026-03-06T00:00:00.000Z',
          updatedAt: '2026-03-06T00:00:03.000Z'
        },
        affectedAnchors: [{
          nodeId: 'node-child',
          anchorLink: {
            id: 'hl-1',
            kind: 'highlight',
            locator: { from: 6, to: 12, originalText: 'Better' }
          },
          imageRegions: [{
            attachmentId: 'asset-1',
            regions: [{ height: 1, id: 'hl-1-image-0', width: 1, x: 0, y: 0 }]
          }],
          updatedAt: '2026-03-06T00:00:03.000Z'
        }]
      }
    })
  ).resolves.toEqual({
    anchorUpdates: [expect.objectContaining({ nodeId: 'node-child' })],
    nodes: [expect.objectContaining({ nodeId: 'node-parent', content: 'Alpha Better Gamma' })],
    updatedNodeIds: ['node-parent', 'node-child']
  });

  expect(upsertVersionedNodeContentWithAnchors).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'Alpha Better Gamma',
      nodeId: 'node-parent'
    }),
    [
      expect.objectContaining({
        nodeId: 'node-child',
        anchorLink: expect.objectContaining({
          locator: { from: 6, to: 12, originalText: 'Better' }
        }),
        imageRegions: [{
          attachmentId: 'asset-1',
          regions: [{ height: 1, id: 'hl-1-image-0', width: 1, x: 0, y: 0 }]
        }]
      })
    ],
    { searchInvalidation: { workspaceInvalidation: 'defer' } }
  );
  expect(enqueueCoalescedWorkspaceSearchInvalidation).toHaveBeenCalledWith(['node-parent']);
  expect(scheduleMirrorSync).toHaveBeenCalledWith(['node-parent', 'node-child']);
});
