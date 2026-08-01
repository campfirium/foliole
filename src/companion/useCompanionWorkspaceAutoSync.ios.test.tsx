import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true)
}));
const appState = vi.hoisted(() => ({
  addListener: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: () => ({})
}));
vi.mock('@capacitor/app', () => ({ App: appState }));

import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';

it('cancels failed retries while backgrounded and syncs again on iOS resume', async () => {
  vi.useFakeTimers();
  let resume: (() => void) | null = null;
  const appStateHandlers: Array<(state: { isActive: boolean }) => void> = [];
  appState.addListener.mockImplementation(async (eventName: string, listener: () => void) => {
    if (eventName === 'resume') resume = listener;
    if (eventName === 'appStateChange') {
      appStateHandlers.push(listener as (state: { isActive: boolean }) => void);
    }
    return { remove: vi.fn(async () => undefined) };
  });
  const tryForegroundAutoSync = vi.fn()
    .mockResolvedValueOnce('failed' as const)
    .mockResolvedValueOnce('completed' as const);
  const stableCallbacks = {
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setStatus: vi.fn(),
    setSyncProgress: vi.fn()
  };

  renderHook(() => useForegroundAutoSync(
    stableCallbacks.setError,
    stableCallbacks.setReadableArticle,
    stableCallbacks.setState,
    stableCallbacks.setSyncProgress,
    stableCallbacks.setStatus,
    true,
    {
      endpoint_url: 'http://192.168.1.8:38641',
      last_synced_at: null,
      remembered_targets: ['http://192.168.1.8:38641'],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: null
    },
    tryForegroundAutoSync
  ));

  await act(async () => {
    await Promise.resolve();
  });

  expect(capacitorState.getPlatform).toHaveReturnedWith('ios');
  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
  expect(appState.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
  expect(appState.addListener).toHaveBeenCalledWith('pause', expect.any(Function));
  expect(appState.addListener).toHaveBeenCalledWith('resume', expect.any(Function));

  await act(async () => {
    for (const handler of appStateHandlers) handler({ isActive: false });
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);

  await act(async () => {
    resume?.();
    await Promise.resolve();
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
});
