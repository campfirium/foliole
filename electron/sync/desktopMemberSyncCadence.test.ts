import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  active: null as Promise<unknown> | null,
  completed: null as (() => void) | null,
  run: vi.fn(async () => ({ status: 'completed' }))
}));

vi.mock('./desktopSyncCoordinator.js', () => ({
  loadActiveDesktopSyncRun: () => runtime.active,
  runDesktopSyncCoordinator: runtime.run,
  subscribeDesktopSyncCompleted: (listener: () => void) => { runtime.completed = listener; }
}));

import {
  requestDesktopHighValueSync,
  updateDesktopSyncFreshness
} from './desktopMemberSyncCadence.js';

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  updateDesktopSyncFreshness(false);
  vi.useRealTimers();
});

it('projects desktop commits into one leading, one trailing, and minute freshness run', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  updateDesktopSyncFreshness(true, 1_000);

  requestDesktopHighValueSync();
  await vi.advanceTimersByTimeAsync(1_000);
  requestDesktopHighValueSync();
  requestDesktopHighValueSync();
  await vi.advanceTimersByTimeAsync(4_000);
  expect(runtime.run).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(60_000);
  expect(runtime.run).toHaveBeenCalledTimes(3);
});

it('restarts the freshness minute after a manual coordinator completion', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  updateDesktopSyncFreshness(true, 1_000_000);
  await vi.advanceTimersByTimeAsync(30_000);
  runtime.completed?.();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(runtime.run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(runtime.run).toHaveBeenCalledOnce();
});
