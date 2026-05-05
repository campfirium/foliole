// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { updateNodeAnchorLinks, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { handleInvokeRequest } from './commands.js';

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
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  updateNodeAnchorLinks: vi.fn()
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn(),
  saveAppSettingsState: vi.fn()
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn(),
  saveReviewSchedulerSettings: vi.fn()
}));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
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
          updatedAt: '2026-03-06T00:00:03.000Z'
        }]
      }
    })
  ).resolves.toBeNull();

  expect(upsertNodeSnapshot).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'node-parent', content: 'Alpha Better Gamma' }));
  expect(updateNodeAnchorLinks).toHaveBeenCalledWith([
    expect.objectContaining({
      nodeId: 'node-child',
      anchorLink: expect.objectContaining({
        locator: { from: 6, to: 12, originalText: 'Better' }
      })
    })
  ]);
});
