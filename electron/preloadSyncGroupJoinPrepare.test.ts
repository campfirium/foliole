import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron/preloadSyncGroupJoinPrepare.cjs');

it('keeps the inactive Sync Group join bridge narrow in a sandbox-limited preload', async () => {
  const exposeInMainWorld = vi.fn();
  const invoke = vi.fn().mockResolvedValue({});
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier !== 'electron') throw new Error(`unsupported require: ${specifier}`);
    return { contextBridge: { exposeInMainWorld }, ipcRenderer: { invoke } };
  });
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    require: sandboxRequire
  }, { filename: PRELOAD_PATH });

  expect(sandboxRequire).toHaveBeenCalledTimes(1);
  expect(sandboxRequire).toHaveBeenCalledWith('electron');
  const [name, bridge] = exposeInMainWorld.mock.calls[0] as [string, Record<string, (...args: unknown[]) => unknown>];
  expect(name).toBe('folioleSyncGroupJoinPrepare');
  expect(Object.keys(bridge).sort()).toEqual([
    'acceptRequest', 'collectAcceptance', 'loadRequests', 'receiveRequest', 'rejectRequest'
  ]);
  await bridge.acceptRequest?.('request-a');
  expect(invoke).toHaveBeenCalledWith('foliole:sync-group-join-prepare', {
    operation: 'accept_request', payload: { request_id: 'request-a' }
  });
});

it('does not register the prepare preload in the production preload', () => {
  const production = readFileSync(path.resolve(process.cwd(), 'electron/preload.cjs'), 'utf8');
  expect(production).not.toContain('folioleSyncGroupJoinPrepare');
  expect(production).not.toContain('sync-group-join-prepare');
});
