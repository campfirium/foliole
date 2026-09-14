import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  joinHandler: null as (() => void) | null,
  overviewHandler: null as (() => void) | null
}));

vi.mock('./runtime', () => ({ isDesktopRuntime: () => true }));
vi.mock('./desktopSyncGroupRuntimeRepository', () => ({
  loadDesktopSyncGroupOverview: vi.fn(),
  onDesktopSyncGroupJoinRequestsChanged: (handler: () => void) => {
    mocks.joinHandler = handler;
    return vi.fn();
  },
  onDesktopSyncGroupOverviewChanged: (handler: () => void) => {
    mocks.overviewHandler = handler;
    return vi.fn();
  }
}));

import { useSyncGroupPushRefresh } from './desktopSyncGroupOverviewHooks';

it('reloads the authoritative overview after topology invalidation', () => {
  const refresh = vi.fn(async () => ({} as never));
  renderHook(() => useSyncGroupPushRefresh(refresh));

  act(() => mocks.overviewHandler?.());

  expect(refresh).toHaveBeenCalledOnce();
});
