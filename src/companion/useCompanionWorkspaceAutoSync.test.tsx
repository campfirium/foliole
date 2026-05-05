import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useForegroundAutoSync', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  async function renderAutoSyncHook(isNativeRuntime: boolean) {
    vi.doMock('../shared/platform/companionWorkspaceSyncBridge', () => ({
      isNativeAndroidCompanionRuntime: () => isNativeRuntime
    }));
    const { useForegroundAutoSync } = await import('./useCompanionWorkspaceAutoSync');
    const tryForegroundAutoSync = vi.fn(async () => undefined);

    const state = {
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-22T12:00:00.000Z',
      remembered_targets: ['http://10.0.2.2:38641'],
      sync_events: [],
      sync_onboarding_status: 'completed' as const,
      workspace_snapshot: null
    };

    renderHook(() =>
      useForegroundAutoSync(
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        state,
        tryForegroundAutoSync
      )
    );
    return tryForegroundAutoSync;
  }

  it('stays quiet outside the native companion runtime', async () => {
    const tryForegroundAutoSync = await renderAutoSyncHook(false);

    expect(tryForegroundAutoSync).not.toHaveBeenCalled();
  });

  it('runs once on native foreground entry', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    const tryForegroundAutoSync = await renderAutoSyncHook(true);

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
  });

  it('runs again when the app returns to foreground after the interval', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const tryForegroundAutoSync = await renderAutoSyncHook(true);
    now.mockReturnValue(31_000);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
  });
});
