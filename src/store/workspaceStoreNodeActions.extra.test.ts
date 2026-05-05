import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime, syncNodeContentWithAnchorsToRuntime, syncNodeOrderToRuntime } from './workspaceRuntimeSync';
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

describe('workspaceStoreNodeActions extra sync coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears imported title-heading hiding after manual content edits', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const node = harness.getState().nodesById['node-1'];
    if (!node) throw new Error('missing seed node');
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': { ...node, hideTitleHeading: true }
      }
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('node-1', '# Updated title\n\nBody');

    expect(syncNodeContentWithAnchorsToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        hideTitleHeading: false,
        title: 'Updated title'
      }),
      [],
      expect.any(Array)
    );
  });

  it('ignores content edits until the node document is fully loaded', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const node = harness.getState().nodesById['node-1'];
    if (!node) throw new Error('missing seed node');
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': {
          ...node,
          content: '',
          hasContent: true,
          reveal: null,
          hasReveal: true
        }
      }
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('node-1', 'Typed too early');

    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '',
      hasContent: true,
      reveal: null,
      hasReveal: true
    });
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentWithAnchorsToRuntime).not.toHaveBeenCalled();
  });
});

describe('workspaceStoreNodeActions extra sync coverage command bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs create qa nodes through runtime command bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const nodeId = actions.createQANodeFromSelection('node-1', 'Prompt', 'Answer', 'cloze-1', {
      id: 'cloze-1',
      kind: 'cloze',
      locator: {
        from: 0,
        originalText: 'Answer',
        to: 6
      }
    });

    expect(nodeId).not.toBeNull();
    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: nodeId,
        parentNodeId: 'node-1',
        content: 'Prompt',
        reveal: 'Answer',
        anchorLink: {
          id: 'cloze-1',
          kind: 'cloze',
          locator: {
            from: 0,
            originalText: 'Answer',
            to: 6
          }
        }
      })
    );
  });

  it('syncs moved root nodes through runtime command bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const rootNodeId = actions.createRootNode('Root B');

    vi.clearAllMocks();
    const moved = actions.moveNode(rootNodeId, 'node-1');

    expect(moved).toBe(true);
    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: rootNodeId,
        parentNodeId: 'node-1'
      })
    );
  });
});
