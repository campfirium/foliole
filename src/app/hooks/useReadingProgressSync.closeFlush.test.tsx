import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter, EditorScrollEvent } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

import { useReadingProgressSync } from './useReadingProgressSync';
import { HookHarness } from './useReadingProgressSync.testSupport';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../store/workspaceRuntimeSync', () => ({
  syncReadingProgressToRuntime: vi.fn()
}));

function expectCurrentNodeCloseFlush(invoke: ReturnType<typeof vi.fn>) {
  expect(invoke).toHaveBeenLastCalledWith('save_reading_progress', {
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-2',
        scrollTop: 5400,
        selectionFrom: 3,
        selectionTo: 3
      }
    ],
    source: 'close-flush',
    updatedAt: expect.any(String)
  });
}

function expectCurrentNodeOnlyCloseFlush(invoke: ReturnType<typeof vi.fn>) {
  expect(invoke).toHaveBeenLastCalledWith('save_reading_progress', {
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-2',
        scrollTop: 5400,
        selectionFrom: 3,
        selectionTo: 3
      }
    ],
    source: 'close-flush',
    updatedAt: expect.any(String)
  });
}

function expectStoredNodeCloseFlush(invoke: ReturnType<typeof vi.fn>) {
  expect(invoke).toHaveBeenLastCalledWith('save_reading_progress', {
    activeNodeId: 'node-2',
    nodeViewStates: [],
    source: 'close-flush',
    updatedAt: expect.any(String)
  });
}

function createPollutedPendingHarnessArgs() {
  return {
    listeners: new Set<(event: EditorScrollEvent) => void>(),
    setNodeViewState: vi.fn(),
    storedNodeViewById: {
      'node-2': {
        scrollTop: 5400,
        selection: { from: 48000, to: 48000 }
      }
    } satisfies Record<string, NodeViewState>
  };
}

function PollutedPendingHarness(props: {
  listeners: Set<(event: EditorScrollEvent) => void>;
  readingPositionSyncState: { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  storedNodeViewById: Record<string, NodeViewState>;
}) {
  const editorRef = useRef<EditorAdapter | null>({
    getScrollTop: () => 0,
    getSelection: () => ({ from: 0, to: 0 }),
    onScroll: (listener: (event: EditorScrollEvent) => void) => {
      props.listeners.add(listener);
      return () => {
        props.listeners.delete(listener);
      };
    }
  } as EditorAdapter);
  useReadingProgressSync({
    activeNodeId: 'node-2',
    editorRef,
    getReadingPositionSyncState: () => props.readingPositionSyncState,
    isImmersiveMode: false,
    isViewingTrashNode: false,
    isWorkspaceHydrated: true,
    nodeViewById: props.storedNodeViewById,
    setNodeViewState: props.setNodeViewState
  });
  return null;
}

function registerCloseFlushTests() {
  it('flushes the latest reading position through the before-close handler', async () => {
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
    expectCurrentNodeCloseFlush(invoke);
  });

  it('flushes only the current node position through the before-close handler', async () => {
    const invoke = vi.fn(() => Promise.resolve(null));
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    render(
      <HookHarness
        activeNodeId="node-2"
        isWorkspaceHydrated={true}
        nodeViewById={{
          'node-1': {
            scrollTop: 1200,
            selection: { from: 88, to: 88 }
          }
        }}
        readingSelection={{ from: 48000, to: 48000 }}
        scrollTop={5400}
        selection={{ from: 3, to: 8 }}
      />
    );

    await expect(window.__folioleFlushReadingProgressBeforeClose?.()).resolves.toBe(true);
    expectCurrentNodeOnlyCloseFlush(invoke);
  });
}

function registerRestoreGuardCloseFlushTests() {
  it('does not capture a top position while editor restore is still applying during close flush', async () => {
    const invoke = vi.fn(() => Promise.resolve(null));
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    render(
      <HookHarness
        activeNodeId="node-2"
        isWorkspaceHydrated={true}
        nodeViewById={{
          'node-2': {
            scrollTop: 5400,
            selection: { from: 48000, to: 48000 }
          }
        }}
        readingPositionSyncState={{
          reason: 'editor-restore-selection',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48000 }
        }}
        scrollTop={0}
        selection={{ from: 0, to: 0 }}
      />
    );

    await expect(window.__folioleFlushReadingProgressBeforeClose?.()).resolves.toBe(true);
    expect(invoke).toHaveBeenLastCalledWith('save_reading_progress', {
      activeNodeId: 'node-2',
      nodeViewStates: [],
      source: 'close-flush',
      updatedAt: expect.any(String)
    });
  });
}

function registerPollutedPendingCloseFlushTests() {
  it('keeps stored progress when pending was polluted before the restore lock appeared', async () => {
    const invoke = vi.fn(() => Promise.resolve(null));
    const harnessArgs = createPollutedPendingHarnessArgs();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const view = render(<PollutedPendingHarness {...harnessArgs} readingPositionSyncState={null} />);
    act(() => {
      for (const listener of harnessArgs.listeners) {
        listener({ userInitiated: true });
      }
    });
    expect(harnessArgs.setNodeViewState).not.toHaveBeenCalled();

    view.rerender(
      <PollutedPendingHarness
        {...harnessArgs}
        readingPositionSyncState={{
          reason: 'editor-restore-pending',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48000 }
        }}
      />
    );
    await expect(window.__folioleFlushReadingProgressBeforeClose?.()).resolves.toBe(true);

    expectStoredNodeCloseFlush(invoke);
  });
}

function registerCloseFlushLifecycleTests() {
  it('does not flush again from effect cleanup during unmount', () => {
    const view = render(<HookHarness activeNodeId="node-2" isWorkspaceHydrated={true} />);

    vi.clearAllMocks();
    view.unmount();

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
  });
}

describe('useReadingProgressSync close flush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  registerCloseFlushTests();
  registerRestoreGuardCloseFlushTests();
  registerPollutedPendingCloseFlushTests();
  registerCloseFlushLifecycleTests();
});
