import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeNativeAppForeground = vi.fn();
const companionBootstrapState = vi.hoisted(() => ({
  isNativeCompanionRuntime: vi.fn(() => true)
}));

vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground
}));

vi.mock('../shared/platform/companionBootstrap', () => companionBootstrapState);

describe('useForegroundAutoSync', () => {
  beforeEach(() => {
    subscribeNativeAppForeground.mockReset();
    companionBootstrapState.isNativeCompanionRuntime.mockReturnValue(true);
  });

  it('runs foreground auto sync when the native app resumes', async () => {
    let onForeground: (() => void) | null = null;
    subscribeNativeAppForeground.mockImplementation(async (handler: () => void) => {
      onForeground = handler;
      return () => undefined;
    });

    const { useForegroundAutoSync } = await import('./useCompanionWorkspaceAutoSync');
    const tryForegroundAutoSync = vi.fn(async () => undefined);

    renderHook(() =>
      useForegroundAutoSync(
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        {
          endpoint_url: 'http://10.0.2.2:38641',
          last_synced_at: '2026-04-22T12:00:00.000Z',
          workspace_snapshot: null
        },
        tryForegroundAutoSync
      )
    );

    expect(subscribeNativeAppForeground).toHaveBeenCalledTimes(1);
    expect(onForeground).not.toBeNull();

    await act(async () => {
      onForeground?.();
    });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
  });

  it('runs foreground auto sync once state has a saved endpoint', async () => {
    subscribeNativeAppForeground.mockResolvedValue(() => undefined);
    const { useForegroundAutoSync } = await import('./useCompanionWorkspaceAutoSync');
    const tryForegroundAutoSync = vi.fn(async () => undefined);

    const { rerender } = renderHook(
      ({ endpointUrl }: { endpointUrl: string | null }) =>
        useForegroundAutoSync(
          vi.fn(),
          vi.fn(),
          vi.fn(),
          vi.fn(),
          {
            endpoint_url: endpointUrl,
            last_synced_at: '2026-04-22T12:00:00.000Z',
            workspace_snapshot: null
          },
          tryForegroundAutoSync
        ),
      { initialProps: { endpointUrl: null } }
    );

    expect(tryForegroundAutoSync).not.toHaveBeenCalled();

    rerender({ endpointUrl: 'http://10.0.2.2:38641' });

    expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
  });
});
