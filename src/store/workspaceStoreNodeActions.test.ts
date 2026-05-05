import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncCreateNodeToRuntime, syncNodeContentToRuntime, syncNodeOrderToRuntime, syncNodeRevealToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeToRuntime: vi.fn(),
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
});

describe('createWorkspaceNodeActions root creation sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs createRootNode through runtime command bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const createdNodeId = actions.createRootNode('# Root node');

    expect(createdNodeId).toContain('node-');
    expect(syncCreateNodeToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncCreateNodeToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: createdNodeId,
        kind: 'topic',
        parentNodeId: null,
        content: '# Root node',
        title: 'Root node'
      })
    );
  });

  it('syncs incremented Untitled title for repeated empty root node creation', () => {
    const harness = createSetStateHarness({
      ...createWorkspaceFixture(),
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {}
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.createRootNode();
    const secondNodeId = actions.createRootNode();

    expect(syncCreateNodeToRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: secondNodeId,
        title: 'Untitled 1'
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
    expect(syncCreateNodeToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).toHaveBeenCalledTimes(1);
    expect(syncCreateNodeToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: childNodeId,
        kind: 'topic',
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

describe('createWorkspaceNodeActions dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks pending reading nodes as dismissed from the node menu', () => {
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
          kind: 'topic',
          reveal: 'Answer'
        }
      }
    });

    const dismissed = actions.dismissNode('node-1', '2026-03-18T00:00:00.000Z');

    expect(dismissed).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading).toMatchObject({
      state: 'dismissed',
      repetitionCount: 0
    });
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        reading: expect.objectContaining({
          state: 'dismissed'
        })
      })
    );
  });
});
