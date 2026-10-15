import { expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));

import { createForegroundSyncRunner } from './companionForegroundSyncRunner';

const endpointUrl = 'http://192.168.0.10:38641';
const state: NativeCompanionWorkspaceSyncState = {
  endpoint_url: endpointUrl,
  last_synced_at: '2026-09-06T00:00:00.000Z',
  remembered_targets: [endpointUrl],
  sync_events: [],
  sync_onboarding_status: 'completed',
  workspace_snapshot: null
};

it('does not continue a backlog after automatic sync is paused', async () => {
  vi.useFakeTimers();
  const ready = { current: true };
  const setStatus = vi.fn();
  let finishRun: (() => void) | undefined;
  const tryForegroundAutoSync = vi.fn(async (args: { setStatus(status: 'idle'): void }) => {
    await new Promise<void>((resolve) => { finishRun = resolve; });
    args.setStatus('idle');
    return 'backlog' as const;
  });
  const runner = createForegroundSyncRunner({
    cancelled: () => false,
    inFlightRef: { current: false },
    isAppActiveRef: { current: true },
    isSyncGroupReadyRef: ready,
    lastCheckedAtRef: { current: 0 },
    lastForegroundAtRef: { current: 0 },
    readAppActiveState: vi.fn(async () => true),
    resourceContinuationModeRef: { current: 'full' },
    retryAttemptRef: { current: 0 },
    retryTimerRef: { current: null },
    setError: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus,
    stateRef: { current: state },
    tryForegroundAutoSync
  });

  runner('endpoint-ready');
  await vi.waitFor(() => expect(finishRun).toBeTypeOf('function'));
  ready.current = false;
  finishRun?.();
  await vi.waitFor(() => expect(setStatus).toHaveBeenLastCalledWith('idle'));
  await vi.advanceTimersByTimeAsync(60_000);

  expect(tryForegroundAutoSync).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('runs another round when a desktop change arrives during an active round', async () => {
  let finishRun: (() => void) | undefined;
  const tryForegroundAutoSync = vi.fn(async () => 'completed' as const);
  tryForegroundAutoSync.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { finishRun = resolve; });
    return 'completed';
  });
  const runner = createForegroundSyncRunner({
    cancelled: () => false, inFlightRef: { current: false }, isAppActiveRef: { current: true },
    isSyncGroupReadyRef: { current: true }, lastCheckedAtRef: { current: 0 },
    lastForegroundAtRef: { current: 0 }, readAppActiveState: async () => true,
    resourceContinuationModeRef: { current: 'full' }, retryAttemptRef: { current: 0 },
    retryTimerRef: { current: null }, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), stateRef: { current: state }, tryForegroundAutoSync
  });
  const running = runner('foreground');
  expect(tryForegroundAutoSync).toHaveBeenCalledOnce();
  runner('mutation');
  finishRun?.();
  await running;
  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
});
