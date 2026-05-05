import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload(env: Record<string, string | undefined> = {}) {
  const source = readFileSync(PRELOAD_PATH, 'utf8');
  const exposeInMainWorld = vi.fn();
  const ipcInvoke = vi.fn();
  const ipcOn = vi.fn();
  const ipcRemoveListener = vi.fn();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier === 'electron') {
      return {
        contextBridge: { exposeInMainWorld },
        ipcRenderer: {
          invoke: ipcInvoke,
          on: ipcOn,
          removeListener: ipcRemoveListener
        }
      };
    }

    throw new Error(`unsupported require: ${specifier}`);
  });

  const sandbox = {
    __dirname: path.dirname(PRELOAD_PATH),
    __filename: PRELOAD_PATH,
    exports: {},
    module: { exports: {} },
    process: { env },
    require: sandboxRequire
  };

  vm.runInNewContext(source, sandbox, { filename: PRELOAD_PATH });

  return {
    exposeInMainWorld,
    ipcInvoke,
    ipcOn,
    ipcRemoveListener,
    sandboxRequire
  };
}

describe('electron preload', () => {
  it('boots under sandbox-limited require and exposes the bridge API', () => {
    const { exposeInMainWorld } = executePreload();

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.objectContaining({
        invoke: expect.any(Function),
        onNativeMenuCommand: expect.any(Function),
        onWindowResized: expect.any(Function)
      })
    );
  });

  it('exposes a working bridge without touching unsupported preload require helpers', () => {
    const { exposeInMainWorld, ipcInvoke, sandboxRequire } = executePreload();

    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    electronApi.invoke('boot:ping', { probe: true });

    expect(sandboxRequire).toHaveBeenCalledTimes(1);
    expect(sandboxRequire).toHaveBeenCalledWith('electron');
    expect(sandboxRequire).not.toHaveProperty('resolve');
    expect(ipcInvoke).toHaveBeenCalledWith('foliole:invoke', {
      command: 'boot:ping',
      args: { probe: true }
    });
  });

  it('keeps debug metadata when desktop debug probe is enabled', () => {
    const { exposeInMainWorld } = executePreload({
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600/',
      FOLIOLE_RUNTIME_HEAD: 'head-123'
    });

    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    expect(electronApi.debug).toEqual({
      preloadPath: PRELOAD_PATH,
      runtimeHead: 'head-123'
    });
  });
});
