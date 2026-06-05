import { beforeEach, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
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

function createClozeNode(overrides: Partial<WorkspaceState['nodesById'][string]> = {}) {
  return {
    id: 'cloze-1',
    parentNodeId: 'node-1',
    kind: 'item' as const,
    title: 'Alpha [...] Gamma',
    hasContent: true,
    content: 'Alpha [...] Gamma',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze' as const,
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    hasReveal: true,
    reveal: 'Beta',
    review: {
      difficulty: 5,
      due: '2026-04-14T00:00:00.000Z',
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      state: 0 as const
    },
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z',
    ...overrides
  };
}

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content: 'Alpha Beta Gamma'
  };
  fixture.nodesById['cloze-1'] = createClozeNode();
  fixture.nodeOrder = [...fixture.nodeOrder, 'cloze-1'];
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  return {
    actions: createWorkspaceNodeActions(harness.setState),
    harness
  };
}

it('updates a single-range cloze locator, prompt, answer, and generated title in place', () => {
  const { actions, harness } = createHarness();

  const updated = actions.updateHighlightAnchorRange?.('cloze-1', { from: 0, to: 10 });

  expect(updated).toBe(true);
  expect(harness.getState().nodesById['cloze-1']).toEqual(expect.objectContaining({
    content: '[...] Gamma',
    reveal: 'Alpha Beta',
    title: '[...] Gamma',
    anchorLink: expect.objectContaining({
      locator: {
        from: 0,
        originalText: 'Alpha Beta',
        to: 10
      }
    })
  }));
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(expect.objectContaining({
    content: '[...] Gamma',
    reveal: 'Alpha Beta',
    title: '[...] Gamma'
  }));
});

it('restores text moved out of the cloze when the original selection had trimmed edges', () => {
  const { actions, harness } = createHarness();
  harness.getState().nodesById['cloze-1'] = createClozeNode({
    content: 'Alpha[...] Gamma',
    title: 'Alpha[...] Gamma'
  });

  const updated = actions.updateHighlightAnchorRange?.('cloze-1', { from: 6, to: 8 });

  expect(updated).toBe(true);
  expect(harness.getState().nodesById['cloze-1']).toEqual(expect.objectContaining({
    content: 'Alpha [...]ta Gamma',
    reveal: 'Be',
    title: 'Alpha [...]ta Gamma',
    anchorLink: expect.objectContaining({
      locator: {
        from: 6,
        originalText: 'Be',
        to: 8
      }
    })
  }));
});

it('does not overwrite edited cloze prompt, answer, or manual title', () => {
  const { actions, harness } = createHarness();
  harness.getState().nodesById['cloze-1'] = createClozeNode({
    content: 'Custom prompt',
    isTitleManual: true,
    reveal: 'Custom answer',
    title: 'Custom cloze title'
  });

  const updated = actions.updateHighlightAnchorRange?.('cloze-1', { from: 0, to: 10 });

  expect(updated).toBe(true);
  expect(harness.getState().nodesById['cloze-1']).toEqual(expect.objectContaining({
    content: 'Custom prompt',
    reveal: 'Custom answer',
    title: 'Custom cloze title',
    anchorLink: expect.objectContaining({
      locator: {
        from: 0,
        originalText: 'Alpha Beta',
        to: 10
      }
    })
  }));
});
