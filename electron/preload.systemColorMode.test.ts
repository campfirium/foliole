import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload() {
  const exposeInMainWorld = vi.fn();
  const ipcOn = vi.fn();
  const sandboxRequire = (specifier: string) => {
    if (specifier !== 'electron') throw new Error(`unsupported require: ${specifier}`);
    return {
      contextBridge: { exposeInMainWorld },
      ipcRenderer: {
        invoke: vi.fn(),
        on: ipcOn,
        removeListener: vi.fn(),
        send: vi.fn()
      }
    };
  };
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    __filename: PRELOAD_PATH,
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: sandboxRequire
  }, { filename: PRELOAD_PATH });
  return { exposeInMainWorld, ipcOn };
}

it('forwards only valid system color mode changes through preload', () => {
  const { exposeInMainWorld, ipcOn } = executePreload();
  const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
  const handler = vi.fn();

  expect(electronApi.onSystemColorModeChanged).toEqual(expect.any(Function));
  electronApi.onSystemColorModeChanged(handler);
  const listener = ipcOn.mock.calls[0]?.[1];
  listener({}, 'dark');
  listener({}, 'system');

  expect(ipcOn).toHaveBeenCalledWith('foliole:system-color-mode-changed', expect.any(Function));
  expect(handler).toHaveBeenCalledOnce();
  expect(handler).toHaveBeenCalledWith('dark');
});
