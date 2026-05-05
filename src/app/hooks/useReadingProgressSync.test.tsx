import { act, render } from '@testing-library/react';
import { useRef, type MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

import { useReadingProgressSync } from './useReadingProgressSync';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../store/workspaceRuntimeSync', () => ({
  syncReadingProgressToRuntime: vi.fn()
}));

interface HarnessProps {
  activeNodeId: string | null;
  readingSelection?: { from: number; to: number } | null;
  readingPositionSyncState?: { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null;
  isWorkspaceHydrated: boolean;
  nodeViewById?: Record<string, NodeViewState | undefined>;
  scrollTop?: number;
  selection?: { from: number; to: number };
  setNodeViewState?: (nodeId: string, viewState: NodeViewState) => void;
}

function createEditorRef(
  scrollTop: number,
  selection: { from: number; to: number }
): MutableRefObject<{
  getScrollTop: () => number;
  getSelection: () => { from: number; to: number };
  onScroll: (listener: () => void) => () => void;
} | null> {
  const scrollListeners = new Set<() => void>();
  return {
    current: {
      getScrollTop: () => scrollTop,
      getSelection: () => selection,
      onScroll: (listener: () => void) => {
        scrollListeners.add(listener);
        return () => {
          scrollListeners.delete(listener);
        };
      }
    }
  };
}

function HookHarness({
  activeNodeId,
  readingSelection = null,
  readingPositionSyncState = null,
  isWorkspaceHydrated,
  nodeViewById = {},
  scrollTop = 120,
  selection = { from: 8, to: 13 },
  setNodeViewState = () => undefined
}: HarnessProps) {
  const editorRef = useRef<EditorAdapter | null>(createEditorRef(scrollTop, selection).current as unknown as EditorAdapter);
  editorRef.current = createEditorRef(scrollTop, selection).current as unknown as EditorAdapter;
  useReadingProgressSync({
    activeNodeId,
    editorRef,
    getReadingPositionSelection: () => readingSelection,
    getReadingPositionSyncState: () => readingPositionSyncState,
    isViewingTrashNode: false,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
  });
  return null;
}

function buildNodeSwitchHarnessProps(setNodeViewState: (nodeId: string, viewState: NodeViewState) => void): HarnessProps {
  return {
    activeNodeId: 'node-2',
    isWorkspaceHydrated: true,
    nodeViewById: {
      'node-2': {
        scrollTop: 24,
        selection: { from: 2, to: 6 }
      }
    },
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 },
    setNodeViewState
  };
}

function buildPreviousNodeHarnessProps(setNodeViewState: (nodeId: string, viewState: NodeViewState) => void): HarnessProps {
  return {
    activeNodeId: 'node-1',
    isWorkspaceHydrated: true,
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 },
    setNodeViewState
  };
}

function runRuntimeReadingPositionPersistenceTest() {
  render(
    <HookHarness
      activeNodeId="node-2"
      isWorkspaceHydrated={true}
      readingSelection={{ from: 48000, to: 48000 }}
      scrollTop={5400}
      selection={{ from: 3, to: 8 }}
    />
  );

  act(() => {
    vi.advanceTimersByTime(1600);
  });

  expect(syncReadingProgressToRuntime).toHaveBeenLastCalledWith({
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-2',
        scrollTop: 5400,
        selectionFrom: 48000,
        selectionTo: 48000
      }
    ],
    updatedAt: expect.any(String)
  });
}

describe('useReadingProgressSync sync lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not sync before workspace hydration completes', () => {
    render(<HookHarness activeNodeId="node-2" isWorkspaceHydrated={false} />);

    act(() => {
      vi.advanceTimersByTime(3000);
      window.dispatchEvent(new Event('beforeunload'));
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
  });

  it('syncs active node and view state after workspace hydration', () => {
    render(<HookHarness activeNodeId="node-2" isWorkspaceHydrated={true} />);

    expect(syncReadingProgressToRuntime).toHaveBeenCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [],
      updatedAt: expect.any(String)
    });
  });

  it('updates the in-memory reading position immediately when the editor scrolls', () => {
    const setNodeViewState = vi.fn();
    const scrollListeners = new Set<() => void>();

    function ImmediateCaptureHarness() {
      const ref = useRef<EditorAdapter | null>({
        getScrollTop: () => 5400,
        getSelection: () => ({ from: 48000, to: 48024 }),
        onScroll: (listener: () => void) => {
          scrollListeners.add(listener);
          return () => {
            scrollListeners.delete(listener);
          };
        }
      } as unknown as EditorAdapter);
      useReadingProgressSync({
        activeNodeId: 'node-2',
        editorRef: ref,
        getReadingPositionSelection: () => null,
        isViewingTrashNode: false,
        isWorkspaceHydrated: true,
        nodeViewById: {},
        setNodeViewState
      });
      return null;
    }

    render(<ImmediateCaptureHarness />);

    act(() => {
      for (const listener of scrollListeners) {
        listener();
      }
    });

    expect(setNodeViewState).toHaveBeenCalledWith('node-2', {
      scrollTop: 5400,
      selection: { from: 48000, to: 48024 }
    });
  });

  it('persists reading progress shortly after scrolling stops', () => {
    const listeners = new Set<() => void>();
    function DebouncedHarness() {
      const editorRef = useRef<EditorAdapter | null>({
        getScrollTop: () => 5400,
        getSelection: () => ({ from: 48000, to: 48024 }),
        onScroll: (listener: () => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        }
      } as unknown as EditorAdapter);
      useReadingProgressSync({
        activeNodeId: 'node-2',
        editorRef,
        getReadingPositionSelection: () => ({ from: 48000, to: 48000 }),
        isViewingTrashNode: false,
        isWorkspaceHydrated: true,
        nodeViewById: {},
        setNodeViewState: vi.fn()
      });
      return null;
    }

    render(<DebouncedHarness />);
    vi.clearAllMocks();

    act(() => {
      for (const listener of listeners) {
        listener();
      }
      vi.advanceTimersByTime(399);
    });
    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(syncReadingProgressToRuntime).toHaveBeenCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 5400,
          selectionFrom: 48000,
          selectionTo: 48000
        }
      ],
      updatedAt: expect.any(String)
    });
  });

  it('persists the runtime reading position instead of the raw editor selection', () => {
    runRuntimeReadingPositionPersistenceTest();
  });

  it('does not overwrite stored reading position during node switching', () => {
    const setNodeViewState = vi.fn();
    const view = render(<HookHarness {...buildPreviousNodeHarnessProps(setNodeViewState)} />);

    vi.clearAllMocks();

    view.rerender(<HookHarness {...buildNodeSwitchHarnessProps(setNodeViewState)} />);

    expect(syncReadingProgressToRuntime).toHaveBeenLastCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 24,
          selectionFrom: 2,
          selectionTo: 6
        }
      ],
      updatedAt: expect.any(String)
    });
  });

  it('skips node-switch persistence while reading position restore is still applying', () => {
    const setNodeViewState = vi.fn();
    const view = render(<HookHarness {...buildPreviousNodeHarnessProps(setNodeViewState)} />);

    vi.clearAllMocks();

    view.rerender(
      <HookHarness
        {...buildNodeSwitchHarnessProps(setNodeViewState)}
        readingPositionSyncState={{
          reason: 'editor-restore-selection',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48024 }
        }}
      />
    );

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
  });
});

describe('useReadingProgressSync close flush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes the latest reading position through the close bridge handler', async () => {
    const invoke = vi.fn(() => Promise.resolve(null));
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    render(
      <HookHarness
        activeNodeId="node-2"
        isWorkspaceHydrated={true}
        readingSelection={{ from: 48000, to: 48000 }}
        scrollTop={5400}
        selection={{ from: 3, to: 8 }}
      />
    );

    await expect(window.__folioleFlushReadingProgressBeforeClose?.()).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('save_reading_progress', {
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 5400,
          selectionFrom: 48000,
          selectionTo: 48000
        }
      ],
      updatedAt: expect.any(String)
    });
  });

  it('does not flush again from effect cleanup during unmount', () => {
    const view = render(<HookHarness activeNodeId="node-2" isWorkspaceHydrated={true} />);

    vi.clearAllMocks();
    view.unmount();

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
  });
});
