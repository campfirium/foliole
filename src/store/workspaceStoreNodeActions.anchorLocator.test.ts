import { beforeEach, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime, syncNodeOrderToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('syncs text locator when creating highlight nodes from selections', () => {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const nodeId = actions.createHighlightNodeFromSelection('node-1', 'Highlighted', 'hl-1', {
    id: 'hl-1',
    kind: 'highlight',
    locator: {
      from: 10,
      originalText: 'Highlighted',
      to: 21
    }
  });

  expect(nodeId).not.toBeNull();
  expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
  expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      id: nodeId,
      parentNodeId: 'node-1',
      content: 'Highlighted',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 10,
          originalText: 'Highlighted',
          to: 21
        }
      }
    })
  );
});

it('remaps direct child text locators when parent content shifts', () => {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1'],
    content: 'Alpha Beta Gamma'
  };
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-2'];
  fixture.nodesById['node-2'] = {
    id: 'node-2',
    parentNodeId: 'node-1',
    kind: 'topic',
    title: 'Highlight child',
    hasContent: true,
    content: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    },
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };

  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const actions = createWorkspaceNodeActions(harness.setState);

  actions.updateNodeContent('node-1', 'Start Alpha Beta Gamma');

  expect(harness.getState().nodesById['node-2']?.anchorLink).toEqual({
    id: 'hl-1',
    kind: 'highlight',
    locator: {
      from: 'Start Alpha Beta Gamma'.indexOf('Beta'),
      originalText: 'Beta',
      to: 'Start Alpha Beta Gamma'.indexOf('Beta') + 'Beta'.length
    }
  });
  expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(2);
  expect(syncNodeContentToRuntime).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      id: 'node-2',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 'Start Alpha Beta Gamma'.indexOf('Beta'),
          originalText: 'Beta',
          to: 'Start Alpha Beta Gamma'.indexOf('Beta') + 'Beta'.length
        }
      }
    })
  );
});
