import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload(env: Record<string, string | undefined> = {}) {
  const source = readFileSync(PRELOAD_PATH, 'utf8');
  const exposeInMainWorld = vi.fn();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier === 'electron') {
      return {
        contextBridge: { exposeInMainWorld },
        ipcRenderer: {
          invoke: vi.fn(),
          on: vi.fn(),
          removeListener: vi.fn(),
          send: vi.fn()
        }
      };
    }
    throw new Error(`unsupported require: ${specifier}`);
  });

  vm.runInNewContext(
    source,
    {
      __filename: PRELOAD_PATH,
      process: {
        cwd: () => 'D:\\C\\foliole',
        env
      },
      require: sandboxRequire
    },
    { filename: PRELOAD_PATH }
  );

  return exposeInMainWorld.mock.calls[0]?.[1];
}

it('does not expose writable workspace debug for normal desktop debug metadata', () => {
  const electronApi = executePreload({
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600/',
    FOLIOLE_RUNTIME_HEAD: 'head-123'
  });

  expect(electronApi.debug.workspaceDebugBridge).toBe(false);
});

it('exposes writable workspace debug only for isolated desktop test instances', () => {
  const electronApi = executePreload({
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600/',
    FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
    FOLIOLE_WORKDIR: 'D:\\Temp\\foliole-playwright-state'
  });

  expect(electronApi.debug.workspaceDebugBridge).toBe(true);
});
