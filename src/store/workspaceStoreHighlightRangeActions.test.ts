import { beforeEach, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
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

function createHighlightNode(overrides: Partial<WorkspaceState['nodesById'][string]> = {}) {
  return { ...createBaseHighlightNode(), ...overrides };
}

function createBaseHighlightNode() {
  return {
    id: 'highlight-1',
    parentNodeId: 'node-1',
    kind: 'topic' as const,
    title: 'Beta',
    hasContent: true,
    content: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight' as const,
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
}

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content: 'Alpha Beta Gamma'
  };
  fixture.nodesById['highlight-1'] = createHighlightNode();
  fixture.nodeOrder = [...fixture.nodeOrder, 'highlight-1'];
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  return {
    actions: createWorkspaceNodeActions(harness.setState),
    harness
  };
}

it('updates a single-range highlight locator in place', () => {
  const { actions, harness } = createHarness();

  const updated = actions.updateHighlightAnchorRange?.('highlight-1', 'Alpha Beta Gamma', { from: 6, to: 16 });

  expect(updated).toBe(true);
  expect(harness.getState().nodesById['highlight-1']?.anchorLink).toEqual({
    id: 'hl-1',
    kind: 'highlight',
    locator: {
      from: 6,
      originalText: 'Beta Gamma',
      to: 16
    }
  });
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'highlight-1',
      anchorLink: expect.objectContaining({
        locator: expect.objectContaining({ originalText: 'Beta Gamma' })
      })
    })
  );
});

it('rejects ambiguous or invalid highlight range updates', () => {
  const { actions, harness } = createHarness();
  harness.getState().nodesById['multi-range'] = createHighlightNode({
    id: 'multi-range',
    anchorLink: {
      id: 'hl-multi',
      kind: 'highlight',
      locator: {
        ranges: [
          { from: 0, originalText: 'Alpha', to: 5 },
          { from: 6, originalText: 'Beta', to: 10 }
        ]
      }
    }
  });
  harness.getState().nodesById['cloze-1'] = createHighlightNode({
    id: 'cloze-1',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    }
  });
  harness.getState().trashedNodeIds = ['trashed-1'];
  harness.getState().nodesById['trashed-1'] = createHighlightNode({ id: 'trashed-1' });

  expect(actions.updateHighlightAnchorRange?.('multi-range', 'Alpha Beta Gamma', { from: 0, to: 10 })).toBe(false);
  expect(actions.updateHighlightAnchorRange?.('cloze-1', 'Alpha Beta Gamma', { from: 0, to: 10 })).toBe(false);
  expect(actions.updateHighlightAnchorRange?.('trashed-1', 'Alpha Beta Gamma', { from: 0, to: 10 })).toBe(false);
  expect(actions.updateHighlightAnchorRange?.('highlight-1', 'Alpha Beta Gamma', { from: 6, to: 6 })).toBe(false);
  expect(actions.updateHighlightAnchorRange?.('highlight-1', 'Alpha Beta Gamma', { from: 6, to: 99 })).toBe(false);
  expect(actions.updateHighlightAnchorRange?.('highlight-1', 'stale content', { from: 0, to: 5 })).toBe(false);
  expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
});
