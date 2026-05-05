import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';

import { useReadingProgressSync } from './useReadingProgressSync';
import { HookHarness } from './useReadingProgressSync.testSupport';

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
    nodeViewStates: [{ nodeId: 'node-2', scrollTop: 5400, selectionFrom: 48000, selectionTo: 48000 }],
    updatedAt: expect.any(String)
  });
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

function registerRuntimeDebouncePersistenceTests() {
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

}

function registerRestoreGuardDebounceTest() {
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
}

function registerVisiblePositionPreferenceTests() {
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
      nodeViewStates: [{ nodeId: 'node-2', scrollTop: 5400, selectionFrom: 3, selectionTo: 3 }],
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
