import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { vi } from 'vitest';

export const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

export function executePreload(env: Record<string, string | undefined> = {}) {
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
          removeListener: ipcRemoveListener,
          send: vi.fn()
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
