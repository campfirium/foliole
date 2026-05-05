import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';

import { useReadingProgressSync } from './useReadingProgressSync';
import {
  buildNodeSwitchHarnessProps,
  buildPreviousNodeHarnessProps,
  HookHarness
} from './useReadingProgressSync.testSupport';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../store/workspaceRuntimeSync', () => ({
  syncReadingProgressToRuntime: vi.fn()
}));

function runRuntimeReadingPositionPersistenceTest() {
  render(
    <HookHarness
      activeNodeId="node-2"
      isImmersiveMode={true}
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

function renderImmediateCaptureHarness(setNodeViewState: ReturnType<typeof vi.fn>, scrollListeners: Set<() => void>) {
  function ImmediateCaptureHarness() {
    const ref = {
      current: {
        getScrollTop: () => 5400,
        getSelection: () => ({ from: 48000, to: 48024 }),
        onScroll: (listener: () => void) => {
          scrollListeners.add(listener);
          return () => {
            scrollListeners.delete(listener);
          };
        }
      }
    } as { current: EditorAdapter | null };
    useReadingProgressSync({
      activeNodeId: 'node-2',
      editorRef: ref,
      getReadingPositionSelection: () => null,
      isImmersiveMode: false,
      isViewingTrashNode: false,
      isWorkspaceHydrated: true,
      nodeViewById: {},
      setNodeViewState
    });
    return null;
  }

  render(<ImmediateCaptureHarness />);
}

function renderDebouncedHarness(listeners: Set<() => void>, setNodeViewState: ReturnType<typeof vi.fn>) {
  function DebouncedHarness() {
    const editorRef = {
      current: {
        getScrollTop: () => 5400,
        getSelection: () => ({ from: 48000, to: 48024 }),
        onScroll: (listener: () => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        }
      }
    } as { current: EditorAdapter | null };
    useReadingProgressSync({
      activeNodeId: 'node-2',
      editorRef,
      getReadingPositionSelection: () => ({ from: 48000, to: 48000 }),
      isImmersiveMode: false,
      isViewingTrashNode: false,
      isWorkspaceHydrated: true,
      nodeViewById: {},
      setNodeViewState
    });
    return null;
  }

  render(<DebouncedHarness />);
}

function registerHydrationLifecycleTests() {
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
}

function registerScrollPersistenceTests() {
  it('does not write reading position into store while the editor is still scrolling', () => {
    const setNodeViewState = vi.fn();
    const scrollListeners = new Set<() => void>();
    renderImmediateCaptureHarness(setNodeViewState, scrollListeners);

    act(() => {
      for (const listener of scrollListeners) {
        listener();
      }
    });

    expect(setNodeViewState).not.toHaveBeenCalled();
  });

  it('does not update the in-memory reading position while anchor navigation restore is applying', () => {
    const setNodeViewState = vi.fn();
    const scrollListeners = new Set<() => void>();

    function ImmediateCaptureHarness() {
      const ref = {
        current: {
          getScrollTop: () => 5400,
          getSelection: () => ({ from: 48000, to: 48024 }),
          onScroll: (listener: () => void) => {
            scrollListeners.add(listener);
            return () => {
              scrollListeners.delete(listener);
            };
          }
        }
      } as { current: EditorAdapter | null };
      useReadingProgressSync({
        activeNodeId: 'node-2',
        editorRef: ref,
        getReadingPositionSelection: () => ({ from: 48000, to: 48024 }),
        getReadingPositionSyncState: () => ({
          reason: 'anchor-navigation',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48024 }
        }),
        isImmersiveMode: false,
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

    expect(setNodeViewState).not.toHaveBeenCalled();
  });

  it('persists reading progress shortly after scrolling stops', () => {
    const listeners = new Set<() => void>();
    const setNodeViewState = vi.fn();
    renderDebouncedHarness(listeners, setNodeViewState);
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
    expect(setNodeViewState).toHaveBeenCalledWith('node-2', {
      scrollTop: 5400,
      selection: { from: 48000, to: 48000 }
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

  it('does not persist scroll debounce while anchor navigation restore is applying', () => {
    const listeners = new Set<() => void>();
    const setNodeViewState = vi.fn();

    function DebouncedHarness() {
      const editorRef = {
        current: {
          getScrollTop: () => 5400,
          getSelection: () => ({ from: 48000, to: 48024 }),
          onScroll: (listener: () => void) => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          }
        }
      } as { current: EditorAdapter | null };
      useReadingProgressSync({
        activeNodeId: 'node-2',
        editorRef,
        getReadingPositionSelection: () => ({ from: 48000, to: 48024 }),
        getReadingPositionSyncState: () => ({
          reason: 'anchor-navigation',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48024 }
        }),
        isImmersiveMode: false,
        isViewingTrashNode: false,
        isWorkspaceHydrated: true,
        nodeViewById: {},
        setNodeViewState
      });
      return null;
    }

    render(<DebouncedHarness />);
    vi.clearAllMocks();

    act(() => {
      for (const listener of listeners) {
        listener();
      }
      vi.advanceTimersByTime(1000);
    });

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
    expect(setNodeViewState).not.toHaveBeenCalled();
  });

  it('persists the runtime reading position while immersive mode is active', () => {
    runRuntimeReadingPositionPersistenceTest();
  });

  it('prefers the current editor-visible position over a stale highlight jump in normal mode', () => {
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
          selectionFrom: 3,
          selectionTo: 3
        }
      ],
      updatedAt: expect.any(String)
    });
  });
}

function registerNodeSwitchTests() {
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

  registerHydrationLifecycleTests();
  registerScrollPersistenceTests();
  registerNodeSwitchTests();
});
