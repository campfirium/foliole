import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useReadingProgressSyncMock } = vi.hoisted(() => ({
  useReadingProgressSyncMock: vi.fn()
}));

const runtimeRefs = vi.hoisted(() => ({
  editorRef: {
    current: null as {
      getPrimaryVisiblePosition?: () => number | null;
      getScrollTop: () => number;
      getSelection: () => { from: number; to: number };
      isPositionNearViewportRatio?: () => boolean;
    } | null
  },
  readingPositionRef: {
    current: {
      nodeId: 'node-1',
      selection: { from: 12, to: 12 }
    }
  },
  readingPositionSyncRef: {
    current: {
      nodeId: 'node-1',
      state: {
        reason: 'editor-restore-selection',
        startedAt: 123,
        targetSelection: { from: 12, to: 12 }
      }
    }
  }
}));

const runtimeState = vi.hoisted(() => ({
  isImmersiveMode: false
}));

const { useWorkspaceNavigationMock } = vi.hoisted(() => ({
  useWorkspaceNavigationMock: vi.fn(() => ({
    handleSelectNode: vi.fn()
  }))
}));

vi.mock('./useAppRuntime', () => ({
  useAppRuntime: () => ({
    bumpReadingPositionRequest: vi.fn(),
    editorRef: runtimeRefs.editorRef,
    isImmersiveMode: runtimeState.isImmersiveMode,
    isViewingTrashNode: false,
    readingPositionRef: runtimeRefs.readingPositionRef,
    readingPositionSyncRef: runtimeRefs.readingPositionSyncRef,
    setIsImmersiveMode: vi.fn()
  })
}));

vi.mock('./useDocumentWidthResizer', () => ({
  useDocumentWidthResizer: () => ({})
}));

vi.mock('./useEditorContextCommands', () => ({
  useEditorContextCommands: () => ({})
}));

vi.mock('./useListResizer', () => ({
  useListResizer: () => ({})
}));

vi.mock('./useReadingProgressSync', () => ({
  useReadingProgressSync: useReadingProgressSyncMock
}));

vi.mock('./useRightSidebarResizer', () => ({
  useRightSidebarResizer: () => ({})
}));

vi.mock('./useStudyMode', () => ({
  useStudyMode: () => ({})
}));

vi.mock('./useTrashView', () => ({
  useTrashView: () => ({
    selectedTrashNodeId: null
  })
}));

vi.mock('./useVirtualNodeView', () => ({
  useVirtualNodeView: () => ({})
}));

vi.mock('./useWorkspaceActiveNodeDocument', () => ({
  useWorkspaceActiveNodeDocument: () => undefined
}));

vi.mock('./useWorkspaceNavigation', () => ({
  useWorkspaceNavigation: useWorkspaceNavigationMock
}));

import { useWorkspaceControllerState } from './appControllerState';

function getNavigationArgs() {
  return useWorkspaceNavigationMock.mock.calls[0]?.[0] as {
    beginAnchorNavigationRestore: (nodeId: string, selection: { from: number; to: number }) => void;
    saveActiveNodeView: (nodeId: string) => void;
  };
}

function Harness({ ws }: { ws: Parameters<typeof useWorkspaceControllerState>[0] }) {
  useWorkspaceControllerState(ws, true);
  return null;
}

function createWorkspaceNode() {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'Node 1',
    content: 'Hello',
    reveal: null,
    review: null,
    createdAt: '2026-04-13T00:00:00.000Z',
    updatedAt: '2026-04-13T00:00:00.000Z'
  };
}

function createWorkspaceState() {
  return {
    activeNodeId: 'node-1',
    createChildNode: vi.fn(),
    createHighlightNodeFromSelection: vi.fn(),
    createImageClozeNodes: vi.fn(),
    createQANodeFromSelection: vi.fn(),
    createRootNode: vi.fn(),
    createVirtualNode: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    deleteNode: vi.fn(),
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
    navigation: {
      backStack: [],
      forwardStack: []
    },
    nodeOrder: ['node-1'],
    nodeViewById: {},
    nodesById: {
      'node-1': createWorkspaceNode()
    },
    openNode: vi.fn(),
    resetLayout: vi.fn(),
    revealReviewAnswer: vi.fn(),
    reviewSession: null,
    rightSidebarWidth: 320,
    setDocumentMaxWidth: vi.fn(),
    setListCollapsed: vi.fn(),
    setListWidth: vi.fn(),
    setNodeViewState: vi.fn(),
    setRightSidebarCollapsed: vi.fn(),
    setRightSidebarWidth: vi.fn(),
    startReviewSession: vi.fn(),
    trashedNodeIds: [],
    updateNodeContent: vi.fn(),
    updateNodeDesiredRetention: vi.fn(),
    updateNodePriority: vi.fn(),
    updateNodeReveal: vi.fn(),
    updateVirtualNodeFilter: vi.fn()
  };
}

function resetRuntimeRefs() {
  runtimeState.isImmersiveMode = false;
  runtimeRefs.editorRef.current = null;
  runtimeRefs.readingPositionRef.current = {
    nodeId: 'node-1',
    selection: { from: 12, to: 12 }
  };
  runtimeRefs.readingPositionSyncRef.current = {
    nodeId: 'node-1',
    state: {
      reason: 'editor-restore-selection',
      startedAt: 123,
      targetSelection: { from: 12, to: 12 }
    }
  };
}

function runSaveSharedReadingPositionTest() {
  runtimeRefs.editorRef.current = {
    getPrimaryVisiblePosition: () => 999,
    getScrollTop: () => 4321,
    getSelection: () => ({ from: 0, to: 0 }),
    isPositionNearViewportRatio: () => false
  };
  const ws = createWorkspaceState() as never;

  render(<Harness ws={ws} />);

  const navigationArgs = getNavigationArgs();
  navigationArgs.saveActiveNodeView('node-1');

  expect(ws.setNodeViewState).toHaveBeenCalledWith('node-1', {
    scrollTop: 4321,
    selection: { from: 999, to: 999 }
  });
}

function runVisiblePositionFallbackTest() {
  runtimeRefs.readingPositionRef.current = {
    nodeId: 'node-2',
    selection: { from: 300, to: 300 }
  };
  runtimeRefs.editorRef.current = {
    getPrimaryVisiblePosition: () => 4567,
    getScrollTop: () => 4321,
    getSelection: () => ({ from: 0, to: 0 }),
    isPositionNearViewportRatio: () => false
  };
  const ws = createWorkspaceState() as never;

  render(<Harness ws={ws} />);

  const navigationArgs = getNavigationArgs();
  navigationArgs.saveActiveNodeView('node-1');

  expect(ws.setNodeViewState).toHaveBeenCalledWith('node-1', {
    scrollTop: 4321,
    selection: { from: 4567, to: 4567 }
  });
}

function runCurrentSelectionPriorityTest() {
  runtimeRefs.readingPositionRef.current = {
    nodeId: 'node-1',
    selection: { from: 12, to: 12 }
  };
  runtimeRefs.editorRef.current = {
    getPrimaryVisiblePosition: () => 4567,
    getScrollTop: () => 4321,
    getSelection: () => ({ from: 3200, to: 3200 }),
    isPositionNearViewportRatio: () => true
  };
  const ws = createWorkspaceState() as never;

  render(<Harness ws={ws} />);

  const navigationArgs = getNavigationArgs();
  navigationArgs.saveActiveNodeView('node-1');

  expect(ws.setNodeViewState).toHaveBeenCalledWith('node-1', {
    scrollTop: 4321,
    selection: { from: 3200, to: 3200 }
  });
}

function runImmersiveReadingSelectionPriorityTest() {
  runtimeRefs.editorRef.current = {
    getPrimaryVisiblePosition: () => 4567,
    getScrollTop: () => 4321,
    getSelection: () => ({ from: 3200, to: 3200 }),
    isPositionNearViewportRatio: () => true
  };
  const ws = createWorkspaceState() as never;

  render(<Harness ws={ws} />);

  const navigationArgs = getNavigationArgs();
  navigationArgs.saveActiveNodeView('node-1');

  expect(ws.setNodeViewState).toHaveBeenCalledWith('node-1', {
    scrollTop: 4321,
    selection: { from: 12, to: 12 }
  });
}

describe('useWorkspaceControllerState reading progress wiring', () => {
  beforeEach(() => {
    useReadingProgressSyncMock.mockClear();
    useWorkspaceNavigationMock.mockClear();
    resetRuntimeRefs();
  });

  it('prefers the current visible position before leaving the current node', () => {
    runSaveSharedReadingPositionTest();
  });

  it('falls back to the current visible position when the shared reading position is missing', () => {
    runVisiblePositionFallbackTest();
  });

  it('prefers the current editor selection over a stale shared reading position in normal mode', () => {
    runCurrentSelectionPriorityTest();
  });

  it('keeps immersive reading selection priority while immersive mode is active', () => {
    runtimeState.isImmersiveMode = true;
    runImmersiveReadingSelectionPriorityTest();
  });

  it('passes restore sync state through to reading progress persistence', () => {
    const ws = createWorkspaceState() as never;

    render(<Harness ws={ws} />);

    expect(useReadingProgressSyncMock).toHaveBeenCalledTimes(1);
    const options = useReadingProgressSyncMock.mock.calls[0][0];
    expect(options.getReadingPositionSelection()).toEqual({ from: 12, to: 12 });
    expect(options.getReadingPositionSyncState()).toEqual({
      reason: 'editor-restore-selection',
      startedAt: 123,
      targetSelection: { from: 12, to: 12 }
    });
  });

  it('updates the shared reading position value when anchor navigation begins', () => {
    const ws = createWorkspaceState() as never;

    render(<Harness ws={ws} />);

    const navigationArgs = getNavigationArgs();
    navigationArgs.beginAnchorNavigationRestore('node-2', { from: 88, to: 88 });

    expect(runtimeRefs.readingPositionRef.current).toEqual({
      nodeId: 'node-2',
      selection: { from: 88, to: 88 }
    });
    expect(runtimeRefs.readingPositionSyncRef.current).toEqual({
      nodeId: 'node-2',
      state: {
        reason: 'anchor-navigation',
        startedAt: expect.any(Number),
        targetSelection: { from: 88, to: 88 }
      }
    });
  });
});
