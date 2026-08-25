import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

it('exposes the inactive authorization wrapper with sandbox-limited require', () => {
  const preloadPath = path.resolve('electron/preloadSyncGroupAuthorization.cjs');
  const exposeInMainWorld = vi.fn();
  const invoke = vi.fn();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier !== 'electron') throw new Error(`unsupported require: ${specifier}`);
    return { contextBridge: { exposeInMainWorld }, ipcRenderer: { invoke } };
  });
  vm.runInNewContext(readFileSync(preloadPath, 'utf8'), { require: sandboxRequire }, { filename: preloadPath });
  const bridge = exposeInMainWorld.mock.calls[0]?.[1];

  bridge.signSyncGroupMemberRequest({ route_id: 'route-a' });
  expect(sandboxRequire).toHaveBeenCalledWith('electron');
  expect(exposeInMainWorld).toHaveBeenCalledWith('folioleSyncGroupAuthorizationPrepare', expect.any(Object));
  expect(invoke).toHaveBeenCalledWith('foliole:sync-group-authorization-prepare:sign', { route_id: 'route-a' });
});
