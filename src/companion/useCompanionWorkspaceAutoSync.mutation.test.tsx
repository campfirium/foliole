import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  publishCompanionHighValueMutation,
  publishCompanionSyncMutationRevision
} from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

const lifecycle = vi.hoisted(() => ({
  backgroundHandlers: [] as Array<() => void>,
  foregroundHandlers: [] as Array<() => void>
}));

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));
vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: vi.fn(async () => true),
  subscribeNativeAppBackground: vi.fn(async (handler: () => void) => {
    lifecycle.backgroundHandlers.push(handler);
    return vi.fn();
  }),
  subscribeNativeAppForeground: vi.fn(async (handler: () => void) => {
    lifecycle.foregroundHandlers.push(handler);
    return vi.fn();
  })
}));

import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';

const state = {
  endpoint_url: 'http://desktop:38641',
  last_synced_at: '2026-09-09T00:00:00.000Z',
  remembered_targets: ['http://desktop:38641'],
  sync_events: [],
  sync_onboarding_status: 'completed' as const,
  workspace_snapshot: null
};

function renderMutationSchedule() {
  const run = vi.fn(async () => 'completed' as const);
  const hook = renderHook(() => useForegroundAutoSync(
    vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), true, state, run
  ));
  return { hook, run };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  lifecycle.backgroundHandlers.length = 0;
  lifecycle.foregroundHandlers.length = 0;
});

afterEach(() => vi.useRealTimers());

it('runs immediately and merges a five-second high-value burst into one trailing sync', async () => {
  const { hook, run } = renderMutationSchedule();
  await act(async () => Promise.resolve());

  await act(async () => {
    publishCompanionHighValueMutation();
    await Promise.resolve();
  });
  publishCompanionHighValueMutation();
  publishCompanionHighValueMutation();
  await act(async () => vi.advanceTimersByTimeAsync(5_000));

  expect(run).toHaveBeenCalledTimes(3);
  hook.unmount();
});

it('ignores ambient writes and requests no freshness or mutation sync in background', async () => {
  const { hook, run } = renderMutationSchedule();
  await act(async () => Promise.resolve());

  publishCompanionSyncMutationRevision();
  await act(async () => lifecycle.backgroundHandlers[0]?.());
  publishCompanionHighValueMutation();
  await act(async () => vi.advanceTimersByTimeAsync(60_000));

  expect(run).toHaveBeenCalledOnce();
  hook.unmount();
});
