import { expect, it, vi } from 'vitest';

import { executePreload } from './preload.testSupport.js';

it('exposes a sandbox-safe native blur subscription without the privileged event or payload', () => {
  const preload = executePreload();
  const api = preload.exposeInMainWorld.mock.calls[0]![1];
  const handler = vi.fn();
  const unsubscribe = api.onWindowBlur(handler);
  const [channel, listener] = preload.ipcOn.mock.calls.at(-1)!;
  listener({ sender: 'private' }, { unexpected: true });
  expect(channel).toBe('foliole:window-blur');
  expect(handler).toHaveBeenCalledExactlyOnceWith();
  expect(preload.sandboxRequire.mock.calls.map(call => call[0])).toEqual(['electron']);
  unsubscribe();
  expect(preload.ipcRemoveListener).toHaveBeenCalledWith(channel, listener);
});
