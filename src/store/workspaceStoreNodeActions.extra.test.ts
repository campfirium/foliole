import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime, syncNodeOrderToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';

vi.mock('./workspaceRuntimeSync', () => ({
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createWorkspaceFixture(): WorkspaceState {
  const initial = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
  return {
    ...initial,
    goBack: () => null,
    goForward: () => null,
    goToParent: () => null,
    jumpToAncestorNode: () => null,
    openNode: () => null,
    resetLayout: () => undefined,
    setNodeViewState: () => undefined,
    setDocumentMaxWidth: () => undefined,
    setListWidth: () => undefined,
    setListCollapsed: () => undefined,
    setRightSidebarWidth: () => undefined,
    setRightSidebarCollapsed: () => undefined,
    setActiveNode: () => undefined,
    updateNodeTitle: () => undefined,
    updateNodeContent: () => undefined,
    updateNodeReveal: () => undefined,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    dismissNode: () => false,
    relearnNode: () => false,
    startReviewSession: () => false,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    completeReviewItem: () => false,
    deferReviewItem: () => false,
    dismissReviewItem: () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    deleteNodes: () => undefined,
    restoreNode: () => undefined,
    deleteNodePermanently: () => undefined,
    deleteNodesPermanently: () => undefined,
    createRootNode: () => 'unused',
    createChildNode: () => 'unused',
    createHighlightNodeFromSelection: () => null,
    createQANodeFromSelection: () => null,
    moveNode: () => false,
    moveNodes: () => false
  };
}

function createSetStateHarness(initialState: WorkspaceState) {
  let state = initialState;
  const setState = (partial: WorkspaceSetInput) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  return { getState: () => state, setState };
}

describe('workspaceStoreNodeActions extra sync coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears imported title-heading hiding after manual content edits', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
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

    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        hideTitleHeading: false,
        title: 'Updated title'
      })
    );
  });

  it('syncs create qa nodes through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const nodeId = actions.createQANodeFromSelection('node-1', 'Prompt', 'Answer', 'cloze-1');

    expect(nodeId).not.toBeNull();
    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: nodeId,
        parentNodeId: 'node-1',
        content: 'Prompt',
        reveal: 'Answer',
        anchorLink: { id: 'cloze-1', kind: 'cloze' }
      })
    );
  });

  it('syncs moved root nodes through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
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
