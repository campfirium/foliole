import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime, syncNodeOrderToRuntime, syncNodeRevealToRuntime } from './workspaceRuntimeSync';
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
    setRightSidebarWidth: () => undefined,
    setActiveNode: () => undefined,
    updateNodeTitle: () => undefined,
    updateNodeContent: () => undefined,
    updateNodeReveal: () => undefined,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    startReviewSession: () => false,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    restoreNode: () => undefined,
    deleteNodePermanently: () => undefined,
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
  return {
    setState,
    getState: () => state
  };
}

describe('createWorkspaceNodeActions content/title sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs updateNodeContent through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('node-1', '# Updated title\n\nBody');

    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        content: '# Updated title\n\nBody',
        title: 'Updated title'
      })
    );
  });

  it('syncs updateNodeTitle through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeTitle('node-1', '  Manual title  ');

    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        title: 'Manual title',
        isTitleManual: true
      })
    );
  });

  it('does not sync when target node does not exist', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('missing-node', 'ignored');

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
  });

  it('syncs createRootNode through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const createdNodeId = actions.createRootNode('# Root node');

    expect(createdNodeId).toContain('node-');
    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: createdNodeId,
        parentNodeId: null,
        content: '# Root node',
        title: 'Root node'
      })
    );
  });
});

describe('createWorkspaceNodeActions reveal sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs updateNodeReveal through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const state = harness.getState();
    const node = state.nodesById['node-1'];
    if (!node) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...state.nodesById,
        'node-1': {
          ...node,
          reveal: 'Old reveal'
        }
      }
    });

    actions.updateNodeReveal('node-1', 'New reveal');

    expect(syncNodeRevealToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeRevealToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        reveal: 'New reveal'
      })
    );
  });
});

describe('createWorkspaceNodeActions create sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs createChildNode through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const childNodeId = actions.createChildNode('node-1', 'Child body');

    expect(childNodeId).toContain('node-');
    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: childNodeId,
        parentNodeId: 'node-1',
        content: 'Child body'
      })
    );
  });

  it('syncs createHighlightNodeFromSelection through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const nodeId = actions.createHighlightNodeFromSelection('node-1', 'Highlighted', 'hl-1');

    expect(nodeId).not.toBeNull();
    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: nodeId,
        parentNodeId: 'node-1',
        content: 'Highlighted',
        anchorLink: { id: 'hl-1', kind: 'highlight' }
      })
    );
  });

});

describe('createWorkspaceNodeActions create qa sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs createQANodeFromSelection through runtime command bridge', () => {
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
});

describe('createWorkspaceNodeActions move sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs moved root node through runtime command bridge', () => {
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
