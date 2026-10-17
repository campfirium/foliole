import { afterEach, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

import { createForegroundSyncRunner, type ForegroundAutoSyncOutcome, type TryForegroundAutoSync } from './companionForegroundSyncRunner';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));
afterEach(() => vi.useRealTimers());

function setup(outcome: ForegroundAutoSyncOutcome = 'pending', rememberedTargets: string[] = []) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
  const active = { current: true };
  const ready = { current: true };
  let cancelled = false;
  const run = vi.fn<TryForegroundAutoSync>(async () => outcome);
  const retryAttempt = { current: 0 };
  const stateRef: { current: NativeCompanionWorkspaceSyncState } = { current: { endpoint_url: 'http://peer:38641', last_synced_at: null,
    remembered_targets: rememberedTargets, sync_events: [], sync_onboarding_status: 'completed' as const, workspace_snapshot: null } };
  const runner = createForegroundSyncRunner({
    cancelled: () => cancelled, inFlightRef: { current: false }, isAppActiveRef: active,
    isSyncGroupReadyRef: ready, lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
    readAppActiveState: async () => active.current, resourceContinuationModeRef: { current: 'full' },
    retryAttemptRef: retryAttempt, retryTimerRef: { current: null }, setError: vi.fn(),
    setState: vi.fn(), setSyncProgress: vi.fn(), setStatus: vi.fn(),
    stateRef,
    tryForegroundAutoSync: run
  });
  return { active, ready, retryAttempt, run, runner, stateRef, cancel: () => { cancelled = true; } };
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

it('keeps successive backlog rounds at one second without increasing retry attempts', async () => {
  const { run, runner, retryAttempt } = setup('backlog');
  await runner('foreground');
  for (let index = 0; index < 5; index++) {
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(index + 2);
    expect(retryAttempt.current).toBe(0);
  }
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

it.each(['failed', 'pending'] as const)('tries a changed endpoint immediately after %s', async outcome => {
  const { runner, run, stateRef, retryAttempt } = setup(outcome);
  await runner('foreground');
  for (const delay of [2_000, 5_000, 15_000, 30_000]) await vi.advanceTimersByTimeAsync(delay);
  expect(run).toHaveBeenCalledTimes(5);
  stateRef.current = { ...stateRef.current, endpoint_url: 'http://new-peer:38642' };
  await runner('endpoint-ready');
  expect(run).toHaveBeenCalledTimes(6);
  expect(run.mock.calls.at(-1)?.[0]).toMatchObject({ state: { endpoint_url: 'http://new-peer:38642' } });
  expect(retryAttempt.current).toBe(1);
  await runner('endpoint-ready');
  expect(run).toHaveBeenCalledTimes(6);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(run).toHaveBeenCalledTimes(7);
});

it('keeps escalating while known members alternate after each completed attempt', async () => {
  const endpoints = ['http://peer:38641', 'http://second:38641'];
  const { runner, run, stateRef } = setup('pending', endpoints);
  await runner('foreground');
  for (const [index, delay] of [2_000, 5_000, 15_000, 30_000, 60_000, 60_000].entries()) {
    stateRef.current = { ...stateRef.current, endpoint_url: endpoints[(index + 1) % 2] ?? null };
    await runner('endpoint-ready');
    expect(run).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(run).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(index + 2);
  }
});

it('does not restart for a discovered member already attempted by the current round', async () => {
  const { runner, run, stateRef } = setup();
  const discoveredState = { ...stateRef.current, endpoint_url: 'http://second:38641',
    remembered_targets: ['http://peer:38641', 'http://second:38641'] };
  run.mockImplementationOnce(async args => { args.setState(discoveredState); return 'pending'; });
  await runner('foreground');
  // React may publish the saved endpoint after the async round has settled.
  stateRef.current = discoveredState;
  await runner('endpoint-ready');
  expect(run).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(run).toHaveBeenCalledTimes(2);
});

it('rechecks a new address that arrived while the previous round was active', async () => {
  const { runner, run, stateRef } = setup();
  let finish: (outcome: ForegroundAutoSyncOutcome) => void = () => undefined;
  run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  run.mockResolvedValueOnce('completed');
  const first = runner('foreground');
  stateRef.current = { ...stateRef.current, endpoint_url: 'http://new-peer:38642' };
  await runner('endpoint-ready');
  expect(run).toHaveBeenCalledOnce();
  finish('pending');
  await first;
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[1]?.[0].state.endpoint_url).toBe('http://new-peer:38642');
});

it.each(['background', 'cancelled'] as const)('does not run a queued new address after %s', async condition => {
  const { runner, run, stateRef, active, cancel } = setup();
  let finish: (outcome: ForegroundAutoSyncOutcome) => void = () => undefined;
  run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = runner('foreground');
  stateRef.current = { ...stateRef.current, endpoint_url: 'http://new-peer:38642' };
  await runner('endpoint-ready');
  if (condition === 'background') active.current = false;
  else cancel();
  finish('pending');
  await first;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(run).toHaveBeenCalledOnce();
});
