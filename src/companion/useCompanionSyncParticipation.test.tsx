import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let foreground: (() => void) | null = null;
  let snapshot = {
    lifecycle_active: false, participating: false, sync_enabled: true, sync_paused: false
  };
  const listeners = new Set<() => void>();
  const active = {
    lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
  };
  return {
    active,
    getForeground: () => foreground,
    getSnapshot: () => snapshot,
    load: vi.fn(async () => {
      snapshot = active;
      listeners.forEach((listener) => listener());
      return snapshot;
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeForeground: vi.fn(async (handler: () => void) => {
      foreground = handler;
      return () => { foreground = null; };
    })
  };
});

vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground: mocks.subscribeForeground
}));
vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  getCompanionSyncParticipationSnapshot: mocks.getSnapshot,
  loadCompanionSyncParticipationState: mocks.load,
  subscribeCompanionSyncParticipation: mocks.subscribe
}));

import { useCompanionSyncParticipation } from './useCompanionSyncParticipation';

it('refreshes participation after foreground subscription and every foreground event', async () => {
  const { result } = renderHook(() => useCompanionSyncParticipation());

  await waitFor(() => expect(result.current).toEqual(mocks.active));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));

  await act(async () => mocks.getForeground()?.());

  expect(mocks.load).toHaveBeenCalledTimes(3);
});
