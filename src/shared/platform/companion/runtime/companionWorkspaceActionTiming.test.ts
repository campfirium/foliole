import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';

import { markWholeLibraryWork, resetWholeLibraryWorkForTests } from './companionWholeLibraryWork';
import { startCompanionWorkspaceActionTiming } from './companionWorkspaceActionTiming';

const mocks = vi.hoisted(() => ({
  totals: { reads: 0, queueMs: 0, readMs: 0 },
  trace: vi.fn()
}));
vi.mock('../companionWorkspaceSnapshotRefresh', () => ({ companionWorkspaceReadTotals: () => ({ ...mocks.totals }) }));
vi.mock('../sync/diagnostics/companionDesktopSyncTrace', () => ({ traceCompanionSyncEvent: mocks.trace }));

beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });

afterEach(() => {
  vi.useRealTimers();
  mocks.trace.mockReset();
  mocks.totals = { reads: 0, queueMs: 0, readMs: 0 };
  resetWholeLibraryWorkForTests();
  companionWorkspaceSnapshots.reset(null);
});

it('reports each stage, the reads its refresh waited for and the frame after the list settled', async () => {
  let frame: (() => void) | undefined;
  const timing = startCompanionWorkspaceActionTiming(undefined, done => { frame = done; });
  const endFlush = timing.stage('flush');
  vi.advanceTimersByTime(40);
  endFlush();
  const endTask = timing.stage('task');
  vi.advanceTimersByTime(300);
  endTask();

  // Another refresh is already reading when this action asks for its own.
  let release!: () => void;
  companionWorkspaceSnapshots.register({ kind: 'full' });
  const running = companionWorkspaceSnapshots.refresh(({ current }) => new Promise(resolve => { release = () => resolve(current); }));
  const endRefresh = timing.stage('refresh');
  mocks.totals = { reads: 2, queueMs: 900.4, readMs: 1200.6 };
  vi.advanceTimersByTime(1000);
  markWholeLibraryWork('full-refresh');
  vi.advanceTimersByTime(1100);
  endRefresh();
  release();
  await running;

  timing.finish('completed');
  expect(mocks.trace).not.toHaveBeenCalled();
  vi.advanceTimersByTime(16);
  frame!();
  expect(mocks.trace).toHaveBeenCalledWith('workspace_action', 'completed', {
    flushMs: 40, taskMs: 300, refreshMs: 2100, refreshJoined: true, refreshReads: 2,
    refreshQueueMs: 900, refreshReadMs: 1201, refreshFullReads: 1, totalMs: 2440, paintMs: 16
  });
});
