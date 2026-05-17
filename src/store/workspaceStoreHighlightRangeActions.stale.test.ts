import { beforeEach, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content: 'Alpha Beta Gamma Delta'
  };
  fixture.nodesById['highlight-1'] = {
    id: 'highlight-1',
    parentNodeId: 'node-1',
    kind: 'topic' as const,
    title: 'Beta Gamma',
    hasContent: true,
    content: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight' as const,
      locator: {
        from: 6,
        originalText: 'Beta Gamma',
        to: 16
      }
    },
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
  fixture.nodeOrder = [...fixture.nodeOrder, 'highlight-1'];
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  return {
    actions: createWorkspaceNodeActions(harness.setState),
    harness
  };
}

it('recovers stale highlight child content after an earlier range move updated only the locator', () => {
  const { actions, harness } = createHarness();

  const updated = actions.updateHighlightAnchorRange?.('highlight-1', { from: 6, to: 22 });

  expect(updated).toBe(true);
  expect(harness.getState().nodesById['highlight-1']).toEqual(expect.objectContaining({
    content: 'Beta Gamma Delta',
    title: 'Beta Gamma Delta',
    anchorLink: expect.objectContaining({
      locator: {
        from: 6,
        originalText: 'Beta Gamma Delta',
        to: 22
      }
    })
  }));
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(expect.objectContaining({
    content: 'Beta Gamma Delta',
    title: 'Beta Gamma Delta'
  }));
});
