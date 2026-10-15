import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

import type { TryForegroundAutoSync } from './companionForegroundSyncRunner';
import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));
vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: async () => true,
  subscribeNativeAppBackground: async () => () => undefined,
  subscribeNativeAppForeground: async () => () => undefined
}));
afterEach(() => vi.useRealTimers());

it('preserves capped backoff across React effects publishing alternating member endpoints', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
  const first = 'http://first:38641', second = 'http://second:38641';
  const initial: NativeCompanionWorkspaceSyncState = {
    endpoint_url: first, remembered_targets: [first, second], last_synced_at: null,
    sync_events: [], sync_onboarding_status: 'completed', workspace_snapshot: null
  };
  const run = vi.fn<TryForegroundAutoSync>(async args => {
    args.setState({ ...args.state, endpoint_url: args.state.endpoint_url === first ? second : first });
    return 'pending';
  });
  const setError = vi.fn(), setProgress = vi.fn(), setStatus = vi.fn();
  const hook = renderHook(() => {
    const [state, setState] = useState(initial);
    useForegroundAutoSync(setError, setState, setProgress, setStatus, true, state, run);
    return state;
  });
  await act(async () => { await Promise.resolve(); });
  expect(run).toHaveBeenCalledOnce();
  for (const [index, delay] of [2_000, 5_000, 15_000, 30_000, 60_000, 60_000].entries()) {
    await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); });
    expect(run).toHaveBeenCalledTimes(index + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(run).toHaveBeenCalledTimes(index + 2);
  }
  hook.unmount();
});
