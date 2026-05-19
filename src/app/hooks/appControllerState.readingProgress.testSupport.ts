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

export function createWorkspaceState() {
  return {
    activeNodeId: 'node-1',
    appActionHistory: { redoStack: [], undoStack: [] },
    createChildNode: vi.fn(),
    createHighlightNodeFromSelection: vi.fn(),
    createImageClozeNodes: vi.fn(),
    createQANodeFromSelection: vi.fn(),
    createRootNode: vi.fn(),
    createVirtualNode: vi.fn(),
    completeReviewItem: vi.fn(),
    deferReviewItem: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    deleteNode: vi.fn(),
    deleteNodePermanently: vi.fn(),
    dismissReviewItem: vi.fn(),
    documentMaxWidth: 720,
    exitReviewSession: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    goToParent: vi.fn(),
    gradeReviewCard: vi.fn(),
    isHydrated: true,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    jumpToAncestorNode: vi.fn(),
    listWidth: 280,
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
    rightSidebarWidth: 320,
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
    updateNodeDesiredRetention: vi.fn(),
    updateNodePriority: vi.fn(),
    updateNodeReveal: vi.fn(),
    updateVirtualNodeFilter: vi.fn()
  };
}
