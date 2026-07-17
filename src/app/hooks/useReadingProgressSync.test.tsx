import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';

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
      source: 'user-scroll',
      updatedAt: expect.any(String)
    });
  });

  it('syncs a changed browse root even when the active topic stays the same', () => {
    const view = render(
      <HookHarness activeNodeId="node-2" browseRootNodeId="special-home" isWorkspaceHydrated />
    );
    vi.clearAllMocks();

    view.rerender(
      <HookHarness activeNodeId="node-2" browseRootNodeId="folder-a" isWorkspaceHydrated />
    );

    expect(syncReadingProgressToRuntime).toHaveBeenCalledWith({
      activeNodeId: 'node-2',
      browseRootNodeId: 'folder-a',
      nodeViewStates: [],
      source: 'user-scroll',
      updatedAt: expect.any(String)
    });
  });
}

function registerNodeSwitchTests() {
  it('does not overwrite stored reading position during node switching', () => {
    const setNodeViewState = vi.fn();
    const view = render(<HookHarness {...buildPreviousNodeHarnessProps(setNodeViewState)} />);

    vi.clearAllMocks();
    view.rerender(
      <HookHarness
        {...buildNodeSwitchHarnessProps(setNodeViewState)}
        nodeViewById={{
          'node-2': {
            scrollTop: 24,
            selection: { from: 2, to: 6 },
            updatedAt: '2026-04-05T10:00:00.000Z'
          }
        }}
      />
    );

    expect(syncReadingProgressToRuntime).toHaveBeenLastCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 24,
          selectionFrom: 2,
          selectionTo: 6,
          updatedAt: '2026-04-05T10:00:00.000Z'
        }
      ],
      source: 'user-scroll',
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
  registerNodeSwitchTests();
});
