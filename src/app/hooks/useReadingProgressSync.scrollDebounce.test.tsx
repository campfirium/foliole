import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter, EditorScrollEvent } from '../../features/editor/adapters/EditorAdapter';
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

function runRuntimeReadingPositionPersistenceTest() {
  const listeners = new Set<(event: EditorScrollEvent) => void>();
  const setNodeViewState = vi.fn();
  renderVisiblePositionHarness(listeners, setNodeViewState, {
    isImmersiveMode: true,
    readingSelection: { from: 48000, to: 48000 },
    selection: { from: 3, to: 8 }
  });
  act(() => {
    for (const listener of listeners) {
      listener({ userInitiated: true });
    }
    vi.advanceTimersByTime(400);
  });
  expect(syncReadingProgressToRuntime).toHaveBeenLastCalledWith({
    activeNodeId: 'node-2',
    nodeViewStates: [{ nodeId: 'node-2', scrollTop: 5400, selectionFrom: 48000, selectionTo: 48000 }],
    source: 'user-scroll',
    updatedAt: expect.any(String)
  });
}

function renderVisiblePositionHarness(
  listeners: Set<(event: EditorScrollEvent) => void>,
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void,
  options: {
    isImmersiveMode?: boolean;
    readingSelection: { from: number; to: number };
    selection: { from: number; to: number };
  }
) {
  function VisiblePositionHarness() {
    const editorRef = {
      current: {
        getScrollTop: () => 5400,
        getSelection: () => options.selection,
        onScroll: (listener: (event: EditorScrollEvent) => void) => {
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
      getReadingPositionSelection: () => options.readingSelection,
      isImmersiveMode: options.isImmersiveMode ?? false,
      isViewingTrashNode: false,
      isWorkspaceHydrated: true,
      nodeViewById: {},
      setNodeViewState
    });
    return null;
  }
  render(<VisiblePositionHarness />);
}

function renderDebouncedHarness(
  listeners: Set<(event: EditorScrollEvent) => void>,
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void
) {
  function DebouncedHarness() {
    const editorRef = {
      current: {
        getScrollTop: () => 5400,
        getSelection: () => ({ from: 48000, to: 48024 }),
        onScroll: (listener: (event: EditorScrollEvent) => void) => {
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

function registerRuntimeDebouncePersistenceTests() {
  it('persists reading progress shortly after scrolling stops', () => {
    const listeners = new Set<(event: EditorScrollEvent) => void>();
    const setNodeViewState = vi.fn();
    renderDebouncedHarness(listeners, setNodeViewState);
    vi.clearAllMocks();

    act(() => {
      for (const listener of listeners) {
        listener({ userInitiated: true });
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
      source: 'user-scroll',
      updatedAt: expect.any(String)
    });
  });

}

function registerRestoreGuardDebounceTest() {
  it('does not persist scroll debounce while anchor navigation restore is applying', () => {
    const listeners = new Set<(event: EditorScrollEvent) => void>();
    const setNodeViewState = vi.fn();

    function DebouncedHarness() {
      const editorRef = {
        current: {
          getScrollTop: () => 5400,
          getSelection: () => ({ from: 48000, to: 48024 }),
          onScroll: (listener: (event: EditorScrollEvent) => void) => {
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
        listener({ userInitiated: true });
      }
      vi.advanceTimersByTime(1000);
    });
    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
    expect(setNodeViewState).not.toHaveBeenCalled();
  });
}

function registerVisiblePositionPreferenceTests() {
  it('persists the runtime reading position while immersive mode is active', () => {
    runRuntimeReadingPositionPersistenceTest();
  });

  it('prefers the current editor-visible position over a stale highlight jump in normal mode', () => {
    const listeners = new Set<(event: EditorScrollEvent) => void>();
    const setNodeViewState = vi.fn();
    renderVisiblePositionHarness(listeners, setNodeViewState, {
      readingSelection: { from: 48000, to: 48000 },
      selection: { from: 3, to: 8 }
    });
    act(() => {
      for (const listener of listeners) {
        listener({ userInitiated: true });
      }
      vi.advanceTimersByTime(400);
    });
    expect(syncReadingProgressToRuntime).toHaveBeenLastCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [{ nodeId: 'node-2', scrollTop: 5400, selectionFrom: 3, selectionTo: 3 }],
      source: 'user-scroll',
      updatedAt: expect.any(String)
    });
  });
}

describe('useReadingProgressSync scroll debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  registerRuntimeDebouncePersistenceTests();
  registerRestoreGuardDebounceTest();
  registerVisiblePositionPreferenceTests();
});
