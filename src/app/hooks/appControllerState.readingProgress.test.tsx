import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReadingPositionRestoreCommand } from '../../features/editor/model/editorRestoreCommand';

import { useWorkspaceControllerState } from './appControllerState';
import { createWorkspaceState } from './appControllerState.readingProgress.testSupport';

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
  readingPositionRestoreCommandRef: {
    current: {
      nodeId: null as string | null,
      command: null as ReadingPositionRestoreCommand | null
    }
  },
  readingPositionRestoreCommandSeqRef: { current: 0 },
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
    readingPositionRestoreCommandRef: runtimeRefs.readingPositionRestoreCommandRef,
    readingPositionRestoreCommandSeqRef: runtimeRefs.readingPositionRestoreCommandSeqRef,
    readingPositionSyncRef: runtimeRefs.readingPositionSyncRef,
    setIsImmersiveMode: vi.fn()
  })
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

function getNavigationArgs() {
  const firstCall = useWorkspaceNavigationMock.mock.calls as unknown as Array<[unknown]>;
  return (firstCall[0]?.[0] ?? null) as unknown as {
    applyNavigationReadingPosition: (result: {
      focusAnchor: { id: string; kind: 'highlight'; locator: { from: number; originalText: string; to: number } } | null;
      nodeId: string;
    }) => boolean;
    saveActiveNodeView: (nodeId: string) => void;
  };
}

function Harness({ ws }: { ws: Parameters<typeof useWorkspaceControllerState>[0] }) {
  useWorkspaceControllerState(ws, true);
  return null;
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
  runtimeRefs.readingPositionRestoreCommandRef.current = {
    nodeId: null,
    command: null
  };
  runtimeRefs.readingPositionRestoreCommandSeqRef.current = 0;
}

function runSaveSharedReadingPositionTest() {
  runtimeRefs.editorRef.current = {
    getPrimaryVisiblePosition: () => 999,
    getScrollTop: () => 4321,
    getSelection: () => ({ from: 0, to: 0 }),
    isPositionNearViewportRatio: () => false
  };
  const ws = createWorkspaceState();

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
  const ws = createWorkspaceState();

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
  const ws = createWorkspaceState();

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
  const ws = createWorkspaceState();

  render(<Harness ws={ws} />);

  const navigationArgs = getNavigationArgs();
  navigationArgs.saveActiveNodeView('node-1');

  expect(ws.setNodeViewState).toHaveBeenCalledWith('node-1', {
    scrollTop: 4321,
    selection: { from: 12, to: 12 }
  });
}

function runReadingProgressSyncStateWiringTest() {
  const ws = createWorkspaceState();

  render(<Harness ws={ws} />);

  expect(useReadingProgressSyncMock).toHaveBeenCalledTimes(1);
  const options = useReadingProgressSyncMock.mock.calls[0]![0];
  expect(options.getReadingPositionSelection()).toEqual({ from: 12, to: 12 });
  expect(options.getReadingPositionSyncState()).toEqual({
    reason: 'editor-restore-selection',
    startedAt: 123,
    targetSelection: { from: 12, to: 12 }
  });
}

function runImmersiveModePersistenceWiringTest() {
  runtimeState.isImmersiveMode = true;
  const ws = createWorkspaceState();
  render(<Harness ws={ws} />);

  expect(useReadingProgressSyncMock.mock.calls[0]![0].isImmersiveMode).toBe(true);
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
    runReadingProgressSyncStateWiringTest();
  });

  it('passes immersive mode through to continuous reading progress persistence', () => {
    runImmersiveModePersistenceWiringTest();
  });
});
