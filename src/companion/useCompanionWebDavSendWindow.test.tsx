import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useCompanionWebDavSendWindow } from './useCompanionWebDavSendWindow';

const events = vi.hoisted(() => ({
  active: true,
  lifecycle: (() => {}) as (active: boolean) => void,
  mutation: () => {},
  kind: 'android-native'
}));

vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: async () => events.active,
  subscribeNativeAppActiveState: async (callback: (active: boolean) => void) => {
    events.lifecycle = callback;
    return () => { events.lifecycle = () => {}; };
  }
}));
vi.mock('../shared/platform/companionRuntimeCapabilities', () => ({
  getCompanionRuntimeCapability: () => ({ kind: events.kind })
}));
vi.mock('../shared/platform/companion/sync/mutation/companionSyncMutationRevision', () => ({
  subscribeCompanionHighValueMutation: (callback: () => void) => {
    events.mutation = callback;
    return () => { events.mutation = () => {}; };
  }
}));
vi.mock('../shared/platform/companion/sync/companionWebDavRelayStore', () => ({
  subscribeCompanionWebDavRelay: () => () => {}
}));

beforeEach(() => {
  events.active = true;
  events.kind = 'android-native';
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

it('keeps the first save deadline while away and sends on return only once', async () => {
  const send = vi.fn(async () => {});
  const hook = renderHook(() => useCompanionWebDavSendWindow(true, send));
  try {
    await tick(10_000);
    act(() => events.mutation());
    await tick(30_000);
    act(() => events.mutation());
    act(() => events.lifecycle(false));
    await tick(45_000);
    expect(send).not.toHaveBeenCalled();
    act(() => { events.lifecycle(true); events.lifecycle(true); });
    await tick(1);
    expect(send).toHaveBeenCalledOnce();
    await tick(120_000);
    expect(send).toHaveBeenCalledOnce();
  } finally { hook.unmount(); }
});

it('cancels a send on background and waits for it to release before resuming', async () => {
  let release!: () => void;
  const send = vi.fn<(signal: AbortSignal) => Promise<void>>()
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValue(undefined);
  const hook = renderHook(() => useCompanionWebDavSendWindow(true, send));
  try {
    await tick(60_000);
    const first = send.mock.calls[0]![0];
    expect(first.aborted).toBe(false);
    act(() => events.lifecycle(false));
    expect(first.aborted).toBe(true);
    act(() => events.lifecycle(true));
    await tick(10_000);
    expect(send).toHaveBeenCalledOnce();
    release();
    await tick(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0].aborted).toBe(false);
  } finally { hook.unmount(); }
});

it('does not schedule automatic WebDAV when paused or on iOS', async () => {
  const send = vi.fn(async () => {});
  const paused = renderHook(() => useCompanionWebDavSendWindow(false, send));
  await tick(90_000);
  paused.unmount();
  events.kind = 'ios-native';
  const ios = renderHook(() => useCompanionWebDavSendWindow(true, send));
  await tick(90_000);
  ios.unmount();
  expect(send).not.toHaveBeenCalled();
});
