import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createSyncState(endpointUrl: string | null) {
  return {
    endpoint_url: endpointUrl,
    last_synced_at: endpointUrl ? '2026-04-22T12:00:00.000Z' : null,
    remembered_targets: endpointUrl ? [endpointUrl] : [],
    sync_events: [],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: null
  };
}

async function renderAutoSyncHook(
  isNativeRuntime: boolean,
  endpointUrl: string | null = 'http://10.0.2.2:38641',
  tryForegroundAutoSync: (args: unknown) => Promise<'backlog' | 'completed' | 'failed' | 'skipped'> = vi.fn(async () => 'completed' as const),
  isPairingReady = true
) {
  vi.doMock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
    isAvailableNativeAndroidCompanionRuntime: () => isNativeRuntime,
    isAvailableNativeCompanionRuntime: () => isNativeRuntime,
    isNativeAndroidCompanionRuntime: () => isNativeRuntime
  }));
  const foregroundHandlers: Array<() => void> = [];
  const setStatus = vi.fn();
  const subscribeNativeAppForeground = vi.fn(async (handler: () => void) => {
    foregroundHandlers.push(handler);
    return vi.fn();
  });
  vi.doMock('../shared/platform/appLifecycle', () => ({
    readNativeAppActiveState: vi.fn(async () => true),
    subscribeNativeAppBackground: vi.fn(async () => vi.fn()),
    subscribeNativeAppForeground
  }));
  const { useForegroundAutoSync } = await import('./useCompanionWorkspaceAutoSync');
  const hook = renderHook(({ pairingReady, syncState }) =>
    useForegroundAutoSync(vi.fn(), vi.fn(), vi.fn(), vi.fn(), setStatus, pairingReady, syncState, tryForegroundAutoSync),
    { initialProps: { pairingReady: isPairingReady, syncState: createSyncState(endpointUrl) } }
  );
  return { foregroundHandlers, hook, setStatus, subscribeNativeAppForeground, tryForegroundAutoSync };
}

function resetAutoSyncTestModules() {
  vi.resetModules();
  vi.useRealTimers();
}

async function expectFailedBootstrapRetry() {
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const tryForegroundAutoSync = vi.fn()
    .mockResolvedValueOnce('failed')
    .mockResolvedValueOnce('completed');
  await renderAutoSyncHook(true, 'http://10.0.2.2:38641', tryForegroundAutoSync);

  await act(async () => {
    await Promise.resolve();
  });
  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
}

async function expectBacklogContinuesUntilCompleted() {
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const tryForegroundAutoSync = vi.fn()
    .mockResolvedValueOnce('failed')
    .mockResolvedValueOnce('backlog')
    .mockResolvedValueOnce('completed');
  await renderAutoSyncHook(true, 'http://10.0.2.2:38641', tryForegroundAutoSync);

  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(3);
}

async function expectLongBacklogUsesFastCadence() {
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const tryForegroundAutoSync = vi.fn(async () => 'backlog' as const);
  await renderAutoSyncHook(true, 'http://10.0.2.2:38641', tryForegroundAutoSync);

  await act(async () => {
    await Promise.resolve();
  });
  for (const delay of [1_000, 1_000, 1_000, 1_000, 1_000, 1_000]) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delay);
    });
  }

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(7);
}

async function expectBacklogKeepsVisibleSyncingUntilContinuationCompletes() {
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const tryForegroundAutoSync = vi.fn()
    .mockImplementationOnce(async (args: { setStatus(status: string): void }) => {
      args.setStatus('idle');
      return 'backlog' as const;
    })
    .mockImplementationOnce(async (args: { setStatus(status: string): void }) => {
      args.setStatus('idle');
      return 'completed' as const;
    });
  const { setStatus } = await renderAutoSyncHook(true, 'http://10.0.2.2:38641', tryForegroundAutoSync);

  await act(async () => {
    await Promise.resolve();
  });

  expect(setStatus).toHaveBeenLastCalledWith('syncing');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
  expect(setStatus).toHaveBeenLastCalledWith('idle');
}

async function expectSkippedPassDoesNotRetry() {
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const tryForegroundAutoSync = vi.fn(async () => 'skipped' as const);
  await renderAutoSyncHook(true, 'http://10.0.2.2:38641', tryForegroundAutoSync);

  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
}

async function expectWaitsForNativePairing() {
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const { hook, tryForegroundAutoSync } = await renderAutoSyncHook(
    true,
    'http://10.0.2.2:38641',
    vi.fn(async () => 'completed' as const),
    false
  );

  expect(tryForegroundAutoSync).not.toHaveBeenCalled();

  hook.rerender({ pairingReady: true, syncState: createSyncState('http://10.0.2.2:38641') });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
}

describe('useForegroundAutoSync triggers', () => {
  beforeEach(() => {
    resetAutoSyncTestModules();
  });

  it('stays quiet outside the native companion runtime', async () => {
    const { tryForegroundAutoSync } = await renderAutoSyncHook(false);

    expect(tryForegroundAutoSync).not.toHaveBeenCalled();
  });

  it('runs once on native foreground entry', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    const { subscribeNativeAppForeground, tryForegroundAutoSync } = await renderAutoSyncHook(true);

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
    expect(subscribeNativeAppForeground).toHaveBeenCalledWith(expect.any(Function));
  });

  it('runs again when the native app returns to foreground after the interval', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { foregroundHandlers, tryForegroundAutoSync } = await renderAutoSyncHook(true);
    await act(async () => {
      await Promise.resolve();
    });
    now.mockReturnValue(31_000);

    await act(async () => {
      foregroundHandlers[0]?.();
    });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
  });

  it('runs when the native app returns to foreground even inside the bootstrap interval', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { foregroundHandlers, tryForegroundAutoSync } = await renderAutoSyncHook(true);
    await act(async () => {
      await Promise.resolve();
    });
    now.mockReturnValue(1_500);

    await act(async () => {
      foregroundHandlers[0]?.();
    });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
  });

  it('deduplicates paired native foreground events fired together', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { foregroundHandlers, tryForegroundAutoSync } = await renderAutoSyncHook(true);
    await act(async () => {
      await Promise.resolve();
    });
    now.mockReturnValue(1_500);

    await act(async () => {
      foregroundHandlers[0]?.();
      foregroundHandlers[0]?.();
    });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
  });

  it('runs after the native sync endpoint loads during bootstrap', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { hook, tryForegroundAutoSync } = await renderAutoSyncHook(true, null);

    expect(tryForegroundAutoSync).not.toHaveBeenCalled();

    hook.rerender({ pairingReady: true, syncState: createSyncState('http://10.0.2.2:38641') });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
  });

  it('waits for native pairing before syncing a saved endpoint', expectWaitsForNativePairing);
});

describe('useForegroundAutoSync retry cadence', () => {
  beforeEach(() => {
    resetAutoSyncTestModules();
  });

  it('retries a failed bootstrap sync with bounded delay', expectFailedBootstrapRetry);

  it('continues quickly after a backlog sync pass until convergence completes', expectBacklogContinuesUntilCompleted);

  it('keeps continuing long backlog sync passes without failure backoff', expectLongBacklogUsesFastCadence);

  it('keeps backlog continuation visibly syncing until the retry completes', expectBacklogKeepsVisibleSyncingUntilContinuationCompletes);

  it('does not keep retrying a skipped pass with idle visible backlog', expectSkippedPassDoesNotRetry);
});
