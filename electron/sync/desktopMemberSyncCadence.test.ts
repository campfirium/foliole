import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  active: null as Promise<unknown> | null,
  run: vi.fn(async () => ({ status: 'completed' }))
}));

vi.mock('./desktopSyncCoordinator.js', () => ({
  loadActiveDesktopSyncRun: () => runtime.active,
  runDesktopSyncCoordinator: runtime.run
}));

import {
  requestDesktopHighValueSync,
  updateDesktopSyncFreshness
} from './desktopMemberSyncCadence.js';

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
