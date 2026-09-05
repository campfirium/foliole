import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  events: [] as string[],
  complete: vi.fn(async () => {
    runtime.events.push('complete');
    return { current_device: { device_name: 'V', platform: 'win32' } };
  }),
  request: vi.fn(async () => {
    runtime.events.push('request');
    return {
      current_device: null,
      join_request: { expires_at: new Date(Date.now() + 60_000).toISOString() }
    };
  }),
  stop: vi.fn(async () => {
    runtime.events.push('stop');
  })
}));

vi.mock('../desktopSyncGroupRuntimeRepository', () => ({
  completeDesktopSyncGroupJoin: runtime.complete,
  discoverDesktopSyncGroups: vi.fn(),
  onDesktopSyncGroupDiscoveryChanged: vi.fn(),
  requestDesktopSyncGroupJoin: runtime.request,
  stopDiscoveringDesktopSyncGroups: runtime.stop
}));

import { useDesktopSyncGroupJoinActions } from './useSyncGroupJoinActions';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.events.length = 0;
});

afterEach(() => vi.useRealTimers());

function renderActions(setOverview = vi.fn()) {
  const hook = renderHook(() => useDesktopSyncGroupJoinActions({
    setError: vi.fn(), setIsLoading: vi.fn(), setOverview, setPendingActionId: vi.fn()
  }));
  return { ...hook, setOverview };
}

it('requests admission before stopping discovery, then completes after approval', async () => {
  const { result, setOverview } = renderActions();

  await act(() => result.current.requestJoin('http://maci.local:38641'));

  expect(runtime.events).toEqual(['request', 'stop', 'complete']);
  expect(setOverview).toHaveBeenLastCalledWith({
    current_device: { device_name: 'V', platform: 'win32' }
  });
});

it('retries completion while approval remains pending', async () => {
  vi.useFakeTimers();
  runtime.complete.mockImplementationOnce(async () => {
    runtime.events.push('complete-pending');
    throw new Error('sync_group_join_not_accepted');
  });
  const { result } = renderActions();

  const completion = result.current.requestJoin('http://maci.local:38641');
  await vi.waitFor(() => expect(runtime.complete).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(1_000);
  await act(() => completion);

  expect(runtime.events).toEqual(['request', 'stop', 'complete-pending', 'complete']);
});
