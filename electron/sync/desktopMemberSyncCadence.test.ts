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
  requestDesktopRelaySync,
  updateDesktopSyncFreshness
} from './desktopMemberSyncCadence.js';

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  updateDesktopSyncFreshness(false);
  vi.useRealTimers();
});

it('runs desktop idle commits immediately, merges busy commits, and keeps minute freshness', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  updateDesktopSyncFreshness(true, 1_000);

  requestDesktopHighValueSync();
  await vi.advanceTimersByTimeAsync(1_000);
  requestDesktopHighValueSync();
  expect(runtime.run).toHaveBeenCalledTimes(2);
  requestDesktopHighValueSync();
  await vi.advanceTimersByTimeAsync(4_000);
  expect(runtime.run).toHaveBeenCalledTimes(3);

  await vi.advanceTimersByTimeAsync(60_000);
  expect(runtime.run).toHaveBeenCalledTimes(4);
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

it('skips the pushing peer only while every queued change came from that peer', async () => {
  vi.useFakeTimers();
  updateDesktopSyncFreshness(true, Date.now());
  let finish!: () => void;
  runtime.active = new Promise(resolve => { finish = () => resolve({ status: 'completed' }); });

  const relay = (sources: (string | null)[]) => {
    for (const source of sources) {
      if (source) requestDesktopRelaySync(source); else requestDesktopHighValueSync();
    }
  };
  relay(['peer-a', 'peer-a']);
  runtime.active = null;
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(runtime.run).toHaveBeenLastCalledWith('automatic', undefined, false, 'peer-a');

  for (const sources of [['peer-a', 'peer-b'], ['peer-a', null]]) {
    runtime.active = new Promise(resolve => { finish = () => resolve({ status: 'completed' }); });
    relay(sources);
    runtime.active = null;
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.run).toHaveBeenLastCalledWith('automatic', undefined, false, undefined);
  }
});
