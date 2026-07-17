import { vi } from 'vitest';

function createWorkspaceNode() {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic' as const,
    title: 'Node 1',
    content: 'Hello',
    reveal: null,
    review: null,
    createdAt: '2026-04-13T00:00:00.000Z',
    updatedAt: '2026-04-13T00:00:00.000Z'
  };
}

function createWorkspaceReviewSession() {
  return {
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    totalNodeCount: 0
  };
}

function createWorkspaceNavigation() {
  return {
    backStack: [],
    forwardStack: []
  };
}

function createWorkspaceEditorOperationState() {
  return {
    editorOperationHistory: { redoStack: [], undoStack: [] },
    pushEditorOperationEntry: vi.fn(),
    redoEditorOperation: vi.fn(),
    undoEditorOperation: vi.fn()
  };
}

function createWorkspaceLayoutState() {
  return {
    documentMaxWidth: 720,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    listWidth: 280,
    rightSidebarWidth: 320
  };
}

function createWorkspaceCreationActions() {
  return {
    createChildNode: vi.fn(),
    createFormulaClozeNode: vi.fn(),
    createHighlightNodeFromSelection: vi.fn(),
    createImageClozeNodes: vi.fn(),
    createQANodeFromSelection: vi.fn(),
    createRootNode: vi.fn(),
    createVirtualNode: vi.fn()
  };
}

function createWorkspaceBrowseState() {
  return {
    activeNodeId: 'node-1',
    browseRootNodeId: 'special-home',
    setBrowseRootNode: vi.fn()
  };
}

export function createWorkspaceState() {
  return {
    ...createWorkspaceBrowseState(),
    appActionHistory: { redoStack: [], undoStack: [] },
    ...createWorkspaceEditorOperationState(),
    ...createWorkspaceLayoutState(),
    ...createWorkspaceCreationActions(),
    readReviewTopic: vi.fn(),
    postponeReviewTopic: vi.fn(),
    setReviewTopicDelay: vi.fn(),
    revisitReviewTopicSoon: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    deleteNode: vi.fn(),
    deleteEditorAnnotationNodes: vi.fn(),
    deleteNodePermanently: vi.fn(),
    dismissReviewTopic: vi.fn(),
    continueReviewSessionReading: vi.fn(),
    exitReviewSession: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    goToParent: vi.fn(),
    gradeReviewCard: vi.fn(),
    isHydrated: true,
    jumpToAncestorNode: vi.fn(),
    moveNode: vi.fn(),
    moveNodes: vi.fn(),
    navigation: createWorkspaceNavigation(),
    nodeOrder: ['node-1'],
    nodeViewById: {},
    nodesById: {
      'node-1': createWorkspaceNode()
    },
    openNode: vi.fn(),
    redoWorkspaceAction: vi.fn(),
    resetLayout: vi.fn(),
    revealReviewAnswer: vi.fn(),
    reviewSession: createWorkspaceReviewSession(),
    reviewSessionMode: 'recommended' as const,
    resumeReviewSession: vi.fn(),
    setReviewSessionMode: vi.fn(),
    setDocumentMaxWidth: vi.fn(),
    setListCollapsed: vi.fn(),
    setListWidth: vi.fn(),
    setNodeViewState: vi.fn(),
    setRightSidebarCollapsed: vi.fn(),
    setRightSidebarWidth: vi.fn(),
    startReviewSession: vi.fn(),
    trashedNodeIds: [],
    undoWorkspaceAction: vi.fn(),
    updateHighlightAnchorRange: vi.fn(() => false),
    updateNodeContent: vi.fn(),
    updateNodeDerivedTitle: vi.fn(),
    updateNodeDesiredRetention: vi.fn(),
    updateNodePriority: vi.fn(),
    updateNodeShortTerm: vi.fn(),
    updateNodeReveal: vi.fn(),
    updateVirtualNodeFilter: vi.fn()
  };
}
