import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true)
}));
const appState = vi.hoisted(() => ({
  addListener: vi.fn(),
  getState: vi.fn(async () => ({ isActive: true }))
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: () => ({
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) }))
  })
}));
vi.mock('@capacitor/app', () => ({ App: appState }));

import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';

it('confirms current iOS state before a failed retry and syncs again on resume', async () => {
  vi.useFakeTimers();
  let resume: (() => void) | null = null;
  appState.addListener.mockImplementation(async (eventName: string, listener: () => void) => {
    if (eventName === 'resume') resume = listener;
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
    appState.getState.mockResolvedValueOnce({ isActive: false });
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);
  expect(appState.getState).toHaveBeenCalledTimes(1);

  await act(async () => {
    resume?.();
    await Promise.resolve();
  });

  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
});

it('runs one deferred sync when foreground arrives during an active pass', async () => {
  vi.useFakeTimers();
  const callbacks: { completeFirst?: (outcome: 'completed') => void; resume?: () => void } = {};
  appState.addListener.mockImplementation(async (eventName: string, listener: () => void) => {
    if (eventName === 'resume') callbacks.resume = listener;
    return { remove: vi.fn(async () => undefined) };
  });
  const tryForegroundAutoSync = vi.fn()
    .mockImplementationOnce(() => new Promise<'completed'>((resolve) => { callbacks.completeFirst = resolve; }))
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

  await act(async () => { await Promise.resolve(); });
  callbacks.resume?.();
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(1);

  callbacks.completeFirst?.('completed');
  await act(async () => {
    await Promise.resolve();
  });
  expect(tryForegroundAutoSync).toHaveBeenCalledTimes(2);
});
