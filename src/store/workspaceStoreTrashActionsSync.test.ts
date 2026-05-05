import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('createWorkspaceNodeActions trash sync', () => {
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

  it('syncs permanent delete command with next node order through runtime bridge', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = actions.createRootNode('root 2');

    vi.clearAllMocks();
    actions.deleteNodePermanently(nodeId);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId],
      nodeOrder: ['node-1']
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
