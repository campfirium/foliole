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

type ReadingPositionSyncState = {
  reason: string;
  startedAt: number;
  targetSelection: { from: number; to: number };
} | null;

function RuntimeRestoreHarness(props: {
  listeners: Set<(event: EditorScrollEvent) => void>;
  readingPositionSyncState: ReadingPositionSyncState;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  const editorRef = {
    current: {
      getScrollTop: () => 0,
      getSelection: () => ({ from: 0, to: 0 }),
      onScroll: (listener: (event: EditorScrollEvent) => void) => {
        props.listeners.add(listener);
        return () => props.listeners.delete(listener);
      }
    }
  } as unknown as { current: EditorAdapter | null };
  useReadingProgressSync({
    activeNodeId: 'node-2',
    editorRef,
    getReadingPositionSyncState: () => props.readingPositionSyncState,
    isImmersiveMode: false,
    isViewingTrashNode: false,
    isWorkspaceHydrated: true,
    nodeViewById: {
      'node-2': {
        scrollTop: 5400,
        selection: { from: 48000, to: 48000 }
      }
    },
    setNodeViewState: props.setNodeViewState
  });
  return null;
}

function emitScrollAndDebounce(listeners: Set<(event: EditorScrollEvent) => void>, userInitiated = true) {
  act(() => {
    for (const listener of listeners) {
      listener({ userInitiated });
    }
    vi.advanceTimersByTime(400);
  });
}

function registerPollutedPendingGuardTest() {
  it('does not flush polluted pending progress after the restore lock appears', () => {
    const listeners = new Set<(event: EditorScrollEvent) => void>();
    const setNodeViewState = vi.fn();
    const view = render(
      <RuntimeRestoreHarness listeners={listeners} readingPositionSyncState={null} setNodeViewState={setNodeViewState} />
    );
    vi.clearAllMocks();
    act(() => {
      for (const listener of listeners) {
        listener({ userInitiated: true });
      }
    });

    view.rerender(
      <RuntimeRestoreHarness
        listeners={listeners}
        readingPositionSyncState={{
          reason: 'editor-restore-pending',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48000 }
        }}
        setNodeViewState={setNodeViewState}
      />
    );
    act(() => vi.advanceTimersByTime(400));

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
    expect(setNodeViewState).not.toHaveBeenCalled();
  });
}

function registerPostRestoreScrollGuardTests() {
  registerPostRestoreUserScrollTest();
  registerPostRestoreReflowScrollTest();
}

function registerPostRestoreUserScrollTest() {
  it('persists a user scroll after a restore lock is released', () => {
    const listeners = new Set<(event: EditorScrollEvent) => void>();
    const setNodeViewState = vi.fn();
    const view = render(
      <RuntimeRestoreHarness
        listeners={listeners}
        readingPositionSyncState={{
          reason: 'editor-restore-selection',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48000 }
        }}
        setNodeViewState={setNodeViewState}
      />
    );
    view.rerender(
      <RuntimeRestoreHarness listeners={listeners} readingPositionSyncState={null} setNodeViewState={setNodeViewState} />
    );
    vi.clearAllMocks();

    emitScrollAndDebounce(listeners);

    expect(syncReadingProgressToRuntime).toHaveBeenCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 0,
          selectionFrom: null,
          selectionTo: null
        }
      ],
      source: 'user-scroll',
      updatedAt: expect.any(String)
    });
    expect(setNodeViewState).toHaveBeenCalledWith('node-2', {
      scrollTop: 0,
      selection: null
    });
  });
}

function registerPostRestoreReflowScrollTest() {
  it('ignores a non-user reflow scroll after a restore lock is released', () => {
    const listeners = new Set<(event: EditorScrollEvent) => void>();
    const setNodeViewState = vi.fn();
    const view = render(
      <RuntimeRestoreHarness
        listeners={listeners}
        readingPositionSyncState={{
          reason: 'editor-restore-selection',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48000 }
        }}
        setNodeViewState={setNodeViewState}
      />
    );
    view.rerender(
      <RuntimeRestoreHarness listeners={listeners} readingPositionSyncState={null} setNodeViewState={setNodeViewState} />
    );
    vi.clearAllMocks();

    emitScrollAndDebounce(listeners, false);
    act(() => vi.advanceTimersByTime(1500));

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
    expect(setNodeViewState).not.toHaveBeenCalled();
  });
}

describe('useReadingProgressSync restore scroll guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  registerPollutedPendingGuardTest();
  registerPostRestoreScrollGuardTests();
});
