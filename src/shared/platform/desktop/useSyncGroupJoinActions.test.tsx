import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  events: [] as string[],
  request: vi.fn(async () => {
    runtime.events.push('request');
    return { current_device: null };
  }),
  stop: vi.fn(async () => {
    runtime.events.push('stop');
  })
}));

vi.mock('../desktopSyncGroupRuntimeRepository', () => ({
  completeDesktopSyncGroupJoin: vi.fn(),
  discoverDesktopSyncGroups: vi.fn(),
  onDesktopSyncGroupDiscoveryChanged: vi.fn(),
  requestDesktopSyncGroupJoin: runtime.request,
  stopDiscoveringDesktopSyncGroups: runtime.stop
}));

import { useDesktopSyncGroupJoinActions } from './useSyncGroupJoinActions';

it('requests admission before stopping discovery so the selected candidate remains available', async () => {
  const setOverview = vi.fn();
  const { result } = renderHook(() => useDesktopSyncGroupJoinActions({
    setError: vi.fn(),
    setIsLoading: vi.fn(),
    setOverview,
    setPendingActionId: vi.fn()
  }));

  await act(() => result.current.requestJoin('http://maci.local:38641'));

  expect(runtime.events).toEqual(['request', 'stop']);
  expect(setOverview).toHaveBeenCalledWith({ current_device: null });
});
