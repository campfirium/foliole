import { afterEach, expect, it, vi } from 'vitest';

import { createForegroundSyncRunner, type ForegroundAutoSyncOutcome } from './companionForegroundSyncRunner';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));
afterEach(() => vi.useRealTimers());

function setup(outcome: ForegroundAutoSyncOutcome = 'pending') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
  const active = { current: true };
  const ready = { current: true };
  let cancelled = false;
  const run = vi.fn(async () => outcome);
  const retryAttempt = { current: 0 };
  const runner = createForegroundSyncRunner({
    cancelled: () => cancelled, inFlightRef: { current: false }, isAppActiveRef: active,
    isSyncGroupReadyRef: ready, lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
    readAppActiveState: async () => active.current, resourceContinuationModeRef: { current: 'full' },
    retryAttemptRef: retryAttempt, retryTimerRef: { current: null }, setError: vi.fn(),
    setState: vi.fn(), setSyncProgress: vi.fn(), setStatus: vi.fn(),
    stateRef: { current: { endpoint_url: 'http://peer:38641', last_synced_at: null,
      remembered_targets: [], sync_events: [], sync_onboarding_status: 'completed', workspace_snapshot: null } },
    tryForegroundAutoSync: run
  });
  return { active, ready, retryAttempt, run, runner, cancel: () => { cancelled = true; } };
}

it('backs off repeated pending rounds through the existing capped retry delays', async () => {
  const { run, runner } = setup();
  await runner('foreground');
  for (const [index, delay] of [2_000, 5_000, 15_000, 30_000, 60_000, 60_000].entries()) {
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(run).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(index + 2);
  }
});

it('resumes fast continuation after real progress and clears retry after completion', async () => {
  const { run, runner, retryAttempt } = setup();
  run.mockResolvedValueOnce('pending').mockResolvedValueOnce('backlog').mockResolvedValueOnce('completed');
  await runner('foreground');
  await vi.advanceTimersByTimeAsync(2_000);
  expect(retryAttempt.current).toBe(0);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(run).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(run).toHaveBeenCalledTimes(3);
});

it('does not let freshness or repeated endpoint events shorten scheduled backoff', async () => {
  const { run, runner } = setup();
  await runner('foreground');
  await vi.advanceTimersByTimeAsync(1_000);
  await runner('freshness');
  await runner('endpoint-ready');
  expect(run).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(run).toHaveBeenCalledTimes(2);
});

it.each(['background', 'cancelled', 'paused'] as const)('does not retry while %s', async condition => {
  const { run, runner, active, ready, cancel } = setup();
  await runner('foreground');
  if (condition === 'background') active.current = false;
  if (condition === 'cancelled') cancel();
  if (condition === 'paused') ready.current = false;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(run).toHaveBeenCalledOnce();
});
