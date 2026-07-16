import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload() {
  const exposeInMainWorld = vi.fn();
  const ipcOn = vi.fn();
  const sandbox = {
    __filename: PRELOAD_PATH,
    process: { env: {} },
    require: () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: { invoke: vi.fn(), on: ipcOn, removeListener: vi.fn(), send: vi.fn() }
    })
  };
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), sandbox, { filename: PRELOAD_PATH });
  return { exposeInMainWorld, ipcOn };
}

it('exposes the dedicated main-process desktop update state event in the sandboxed bridge', () => {
  const { exposeInMainWorld, ipcOn } = executePreload();
  const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
  const handler = vi.fn();

  electronApi.onDesktopUpdateState(handler);
  const listener = ipcOn.mock.calls.find(([channel]) => channel === 'foliole:desktop-update-state')?.[1];
  const state = {
    errorCode: 'download-failed',
    percent: 45,
    phase: 'downloading',
    totalBytes: 200,
    transferredBytes: 100,
    version: '0.7.0'
  };
  listener({}, state);

  expect(handler).toHaveBeenCalledWith(state);
});
