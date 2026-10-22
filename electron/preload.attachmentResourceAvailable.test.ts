import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

import { IPC_ATTACHMENT_RESOURCE_AVAILABLE_EVENT_CHANNEL } from './ipc/contracts.js';

it('forwards only string storage keys under sandbox-limited require without exposing IPC events', () => {
  const exposeInMainWorld = vi.fn();
  const on = vi.fn();
  const removeListener = vi.fn();
  const preloadPath = path.resolve('electron/preload.cjs');
  vm.runInNewContext(readFileSync(preloadPath, 'utf8'), {
    __filename: preloadPath, process: { env: {} },
    require: (specifier: string) => {
      if (specifier !== 'electron') throw new Error(`unsupported require: ${specifier}`);
      return { contextBridge: { exposeInMainWorld },
        ipcRenderer: { on, removeListener, invoke: vi.fn(), send: vi.fn() } };
    }
  });
  const handler = vi.fn();
  const unsubscribe = exposeInMainWorld.mock.calls[0]![1].onAttachmentResourceAvailable(handler);
  expect(on).toHaveBeenCalledWith(IPC_ATTACHMENT_RESOURCE_AVAILABLE_EVENT_CHANNEL, expect.any(Function));
  const listener = on.mock.calls[0]![1];
  listener({ sender: 'private IPC event' }, { storageKey: 'not-a-string' });
  listener({ sender: 'private IPC event' }, `${'a'.repeat(64)}.png`);
  expect(handler.mock.calls).toEqual([[`${'a'.repeat(64)}.png`]]);
  unsubscribe();
  expect(removeListener).toHaveBeenCalledWith(IPC_ATTACHMENT_RESOURCE_AVAILABLE_EVENT_CHANNEL, listener);
});
