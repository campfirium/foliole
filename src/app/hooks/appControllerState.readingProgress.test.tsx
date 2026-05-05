import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { useReadingProgressSyncMock } = vi.hoisted(() => ({
  useReadingProgressSyncMock: vi.fn()
}));

vi.mock('./useAppRuntime', () => ({
  useAppRuntime: () => ({
    editorRef: { current: null },
    isViewingTrashNode: false,
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
    },
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
  useWorkspaceNavigation: () => ({
    handleSelectNode: vi.fn()
  })
}));

import { useWorkspaceControllerState } from './appControllerState';

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

describe('useWorkspaceControllerState reading progress wiring', () => {
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
});
