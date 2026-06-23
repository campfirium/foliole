import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createSeedNode(): WorkspaceState['nodesById'][string] {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: false,
    hasContent: true,
    content: '# Seed',
    anchorLink: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  };
}

function createWorkspaceEditActionStubs() {
  return {
    updateNodeTitle: async () => false,
    updateNodeDerivedTitle: async () => false,
    updateNodeContent: async () => false,
    updateHighlightAnchorRange: () => false,
    updateVirtualNodeFilter: () => undefined,
    updateNodeReveal: async () => false,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    updateNodeShortTerm: () => undefined,
    setNodeSequentialReading: () => false,
    shelveNode: () => false,
    unshelveNode: () => false,
    dismissNode: () => false,
    undoWorkspaceAction: () => false,
    redoWorkspaceAction: () => false,
    pushEditorOperationEntry: () => undefined,
    deleteEditorAnnotationNodes: () => undefined,
    undoEditorOperation: () => false,
    redoEditorOperation: () => false,
    relearnNode: () => false,
    startReviewSession: () => false,
    continueReviewSessionReading: () => false,
    resumeReviewSession: () => false,
    setReviewSessionMode: () => undefined,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    readReviewTopic: async () => false,
    postponeReviewTopic: async () => false,
    setReviewTopicDelay: async () => false,
    revisitReviewTopicSoon: async () => false,
    dismissReviewTopic: async () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    deleteImageClozeRegion: () => undefined,
    deleteNodes: () => undefined,
    restoreNode: async () => null,
    deleteNodePermanently: () => undefined,
    deleteNodesPermanently: () => undefined,
    createRootNode: async () => 'unused',
    createChildNode: async () => 'unused',
    createVirtualNode: async () => 'unused',
    createHighlightNodeFromSelection: async () => null,
    createQANodeFromSelection: async () => null,
    createFormulaClozeNode: async () => null,
    createImageClozeNodes: async () => [],
    moveNode: async () => false,
    moveNodes: async () => false
  };
}

function createWorkspaceActionStubs() {
  return {
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
    ...createWorkspaceEditActionStubs()
  };
}

export function createWorkspaceNodeActionsFixture(): WorkspaceState {
  const initial = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
  return {
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: [...initial.nodeOrder, 'node-1'],
    nodesById: {
      ...initial.nodesById,
      'node-1': createSeedNode()
    },
    ...createWorkspaceActionStubs()
  };
}

export function createWorkspaceNodeActionsSetStateHarness(initialState: WorkspaceState) {
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

export function createHighlightLocator(id: string, originalText: string, from = 0) {
  return {
    id,
    kind: 'highlight' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}

export function createClozeLocator(id: string, originalText: string, from = 0) {
  return {
    id,
    kind: 'cloze' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}
