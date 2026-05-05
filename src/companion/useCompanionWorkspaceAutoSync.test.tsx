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
  tryForegroundAutoSync = vi.fn(async () => 'completed' as const)
) {
  vi.doMock('../shared/platform/companionWorkspaceSyncBridge', () => ({
    isNativeAndroidCompanionRuntime: () => isNativeRuntime
  }));
  const foregroundHandlers: Array<() => void> = [];
  const subscribeNativeAppForeground = vi.fn(async (handler: () => void) => {
    foregroundHandlers.push(handler);
    return vi.fn();
  });
  vi.doMock('../shared/platform/appLifecycle', () => ({
    subscribeNativeAppForeground
  }));
  const { useForegroundAutoSync } = await import('./useCompanionWorkspaceAutoSync');
  const hook = renderHook(({ syncState }) =>
    useForegroundAutoSync(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), syncState, tryForegroundAutoSync),
    { initialProps: { syncState: createSyncState(endpointUrl) } }
  );
  return { foregroundHandlers, hook, subscribeNativeAppForeground, tryForegroundAutoSync };
}

describe('useForegroundAutoSync', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
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

    hook.rerender({ syncState: createSyncState('http://10.0.2.2:38641') });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
  });

  it('retries a failed bootstrap sync with bounded delay', async () => {
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
  });

  it('stops retrying after a backlog sync pass finishes without failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const tryForegroundAutoSync = vi.fn()
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('skipped');
    await renderAutoSyncHook(true, 'http://10.0.2.2:38641', tryForegroundAutoSync);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
  });
});
