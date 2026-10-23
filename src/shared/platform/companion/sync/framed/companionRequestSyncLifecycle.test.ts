import { afterEach, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ active: true, background: undefined as (() => void) | undefined,
  remove: vi.fn() }));
vi.mock('../../../appLifecycle.js', () => ({
  readNativeAppActiveState: async () => lifecycle.active,
  subscribeNativeAppEnteredBackground: async (listener: () => void) => {
    lifecycle.background = listener;
    return lifecycle.remove;
  }
}));

const screen = vi.hoisted(() => ({ held: 0 }));
vi.mock('../../runtime/companionSyncScreenAwake.js', () => ({
  holdCompanionSyncScreenAwake: () => {
    screen.held += 1;
    return () => { screen.held -= 1; };
  }
}));

import { combineCompanionRequestSignals, withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';

afterEach(() => { screen.held = 0; lifecycle.active = true; lifecycle.background = undefined; lifecycle.remove.mockClear(); });

it.each([0, 1])('propagates cancellation from source %s and preserves the first reason', index => {
  const sources = [new AbortController(), new AbortController()];
  const combined = combineCompanionRequestSignals(sources.map(source => source.signal));
  const reason = new Error('request_cancelled');
  sources[index]!.abort(reason);
  sources[1 - index]!.abort(new Error('later'));
  expect(combined.signal.aborted).toBe(true);
  expect(combined.signal.reason).toBe(reason);
  combined.dispose();
});

it('preserves an already cancelled source and detaches completed request listeners', () => {
  const cancelled = new AbortController();
  cancelled.abort(new Error('already_cancelled'));
  const prior = combineCompanionRequestSignals([cancelled.signal]);
  expect(() => prior.signal.throwIfAborted()).toThrow('already_cancelled');
  prior.dispose();
  const parent = new AbortController();
  const remove = vi.spyOn(parent.signal, 'removeEventListener');
  const completed = combineCompanionRequestSignals([parent.signal]);
  completed.dispose();
  parent.abort(new Error('after_completion'));
  expect(completed.signal.aborted).toBe(false);
  expect(remove).toHaveBeenCalledOnce();
});

it('rejects an already backgrounded request before acquiring storage', async () => {
  lifecycle.active = false;
  const acquire = vi.fn();
  await expect(withCompanionRequestSyncLifecycle(acquire)).rejects.toThrow('request_sync_foreground_ended');
  expect(acquire).not.toHaveBeenCalled();
  expect(lifecycle.remove).toHaveBeenCalledOnce();
});

it('waits for owned cleanup when background interrupts a request', async () => {
  let release!: () => void;
  const cleanup = new Promise<void>(resolve => { release = resolve; });
  let settled = false;
  const request = withCompanionRequestSyncLifecycle(async signal => {
    lifecycle.background!();
    try { signal.throwIfAborted(); } finally { await cleanup; }
  }).finally(() => { settled = true; });
  const rejected = expect(request).rejects.toThrow('request_sync_foreground_ended');
  await vi.waitFor(() => expect(lifecycle.background).toBeDefined());
  expect(settled).toBe(false);
  expect(lifecycle.remove).not.toHaveBeenCalled();
  release();
  await rejected;
  expect(lifecycle.remove).toHaveBeenCalledOnce();
});

it('keeps the screen on only while a round runs, including when it fails', async () => {
  await expect(withCompanionRequestSyncLifecycle(async () => {
    expect(screen.held).toBe(1);
    throw new Error('round_failed');
  })).rejects.toThrow('round_failed');
  expect(screen.held).toBe(0);
  lifecycle.active = false;
  await expect(withCompanionRequestSyncLifecycle(async () => undefined)).rejects.toThrow('request_sync_foreground_ended');
  expect(screen.held).toBe(0);
});
