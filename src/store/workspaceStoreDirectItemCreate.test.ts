import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncCreateNodeMutationToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeRevealMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

describe('direct item creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates root items with editable answers and review state', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const itemNodeId = (await actions.createRootNode('', 'item'))!;
    const itemNode = harness.getState().nodesById[itemNodeId];

    expect(itemNode).toMatchObject({
      kind: 'item',
      hasReveal: true,
      reveal: '',
      review: expect.objectContaining({ reps: 0, state: 0 })
    });
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledWith(expect.objectContaining({
      id: itemNodeId,
      kind: 'item',
      reveal: '',
      review: expect.objectContaining({ reps: 0, state: 0 })
    }), expect.any(Array), itemNodeId, expect.any(Number));
  });
});
