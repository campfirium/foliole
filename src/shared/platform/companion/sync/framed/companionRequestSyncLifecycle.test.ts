import { afterEach, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ active: true, background: undefined as (() => void) | undefined,
  remove: vi.fn() }));
vi.mock('../../../appLifecycle.js', () => ({
  readNativeAppActiveState: async () => lifecycle.active,
  subscribeNativeAppBackground: async (listener: () => void) => {
    lifecycle.background = listener;
    return lifecycle.remove;
  }
}));

import { withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';

afterEach(() => { lifecycle.active = true; lifecycle.background = undefined; lifecycle.remove.mockClear(); });

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
