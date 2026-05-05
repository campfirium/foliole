import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  syncDeleteNodesPermanentlyToRuntime,
  syncNodeContentToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRelearnNodeToRuntime: vi.fn(),
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
    createVirtualNode: () => 'unused',
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

describe('createWorkspaceNodeActions soft delete sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs soft delete command and parent cleanup through runtime bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('node-1', 'before <cloze id="1">answer</cloze id="1"> after');
    const nodeId = actions.createQANodeFromSelection('node-1', 'Prompt [...]', 'answer', '1');
    if (!nodeId) {
      throw new Error('expected QA node id');
    }

    vi.clearAllMocks();
    actions.deleteNode(nodeId);

    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        content: 'before answer after'
      })
    );
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId],
      deletedAt: expect.any(String)
    });
  });

  it('syncs multi-select soft delete through one runtime bridge command', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstNodeId = actions.createRootNode('root 2');
    const secondNodeId = actions.createRootNode('root 3');

    vi.clearAllMocks();
    actions.deleteNodes([firstNodeId, secondNodeId]);

    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledWith({
      nodeIds: expect.arrayContaining([firstNodeId, secondNodeId]),
      deletedAt: expect.any(String)
    });
  });

  it('syncs restore command through runtime bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = actions.createChildNode('node-1', 'child');

    actions.deleteNode(nodeId);
    vi.clearAllMocks();
    actions.restoreNode(nodeId);

    expect(syncRestoreNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: [nodeId] });
  });
});

describe('createWorkspaceNodeActions permanent delete sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs permanent delete command with next node order through runtime bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = actions.createRootNode('root 2');

    vi.clearAllMocks();
    actions.deleteNodePermanently(nodeId);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId],
      nodeOrder: [INBOX_NODE_ID, 'special-virtual-root', 'node-1']
    });
  });

  it('syncs multi-select permanent delete through one runtime bridge command', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstNodeId = actions.createRootNode('root 2');
    const secondNodeId = actions.createRootNode('root 3');

    vi.clearAllMocks();
    actions.deleteNodesPermanently([firstNodeId, secondNodeId]);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: expect.arrayContaining([firstNodeId, secondNodeId]),
      nodeOrder: [INBOX_NODE_ID, 'special-virtual-root', 'node-1']
    });
  });

  it('does not sync when deleting a missing node', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.deleteNode('missing-node');

    expect(syncSoftDeleteNodesToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
  });
});
