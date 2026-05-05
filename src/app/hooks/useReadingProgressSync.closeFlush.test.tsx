import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';

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

function expectFullTableCloseFlush(invoke: ReturnType<typeof vi.fn>) {
  expect(invoke).toHaveBeenLastCalledWith('save_reading_progress', {
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 1200,
        selectionFrom: 88,
        selectionTo: 88
      },
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
    expectCurrentNodeCloseFlush(invoke);
  });

  it('flushes the full node position table through the close bridge handler', async () => {
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
    expectFullTableCloseFlush(invoke);
  });

  it('does not flush again from effect cleanup during unmount', () => {
    const view = render(<HookHarness activeNodeId="node-2" isWorkspaceHydrated={true} />);

    vi.clearAllMocks();
    view.unmount();

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
  });
});
