import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncRelearnNodeToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
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
    updateVirtualNodeFilter: () => undefined,
    updateNodeReveal: () => undefined,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    updateNodeShortTerm: () => undefined,
    setNodeSequentialReading: () => false,
    dismissNode: () => false,
    undoWorkspaceAction: () => false,
    redoWorkspaceAction: () => false,
    pushEditorOperationEntry: () => undefined,
    deleteEditorAnnotationNodes: () => undefined,
    undoEditorOperation: () => false,
    redoEditorOperation: () => false,
    relearnNode: () => false,
    startReviewSession: () => false,
    resumeReviewSession: () => false,
    setReviewSessionMode: () => undefined,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    completeReviewItem: () => false,
    deferReviewItem: () => false,
    dismissReviewItem: () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    deleteImageClozeRegion: () => undefined,
    deleteNodes: () => undefined,
    restoreNode: async () => null,
    deleteNodePermanently: () => undefined,
    deleteNodesPermanently: () => undefined,
    createRootNode: () => 'unused',
    createChildNode: () => 'unused',
    createVirtualNode: () => 'unused',
    createHighlightNodeFromSelection: () => null,
    createQANodeFromSelection: () => null,
    createFormulaClozeNode: () => null,
    createImageClozeNodes: () => [],
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

describe('createWorkspaceNodeActions relearn sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets item review cards to an uninitialized state and syncs runtime reset', () => {
    const harness = createSetStateHarness(createWorkspaceFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const seedNodeId = actions.createRootNode('');
    const state = harness.getState();
    const node = state.nodesById[seedNodeId];
    if (!node) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...state.nodesById,
        [seedNodeId]: {
          ...node,
          content: 'Prompt',
          hasContent: true,
          kind: 'item',
          reveal: 'Answer',
          hasReveal: true,
          review: {
            due: '2026-03-10T00:00:00.000Z',
            lastReviewAt: '2026-03-06T00:00:00.000Z',
            state: 2,
            stability: 7,
            difficulty: 4,
            elapsedDays: 2,
            scheduledDays: 4,
            reps: 5,
            lapses: 1
          }
        }
      }
    });

    const relearned = actions.relearnNode(seedNodeId, '2026-03-18T00:00:00.000Z');

    expect(relearned).toBe(true);
    expect(harness.getState().nodesById[seedNodeId]?.review).toBeNull();
    expect(syncRelearnNodeToRuntime).toHaveBeenCalledWith({ nodeId: seedNodeId });
  });
});
