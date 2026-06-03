import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload(env: Record<string, string | undefined>) {
  const exposeInMainWorld = vi.fn();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier !== 'electron') {
      throw new Error(`unsupported require: ${specifier}`);
    }
    return {
      contextBridge: { exposeInMainWorld },
      ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
        send: vi.fn()
      }
    };
  });
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    __filename: PRELOAD_PATH,
    process: { env },
    require: sandboxRequire
  }, { filename: PRELOAD_PATH });
  return exposeInMainWorld.mock.calls[0]?.[1];
}

describe('preload runtime config bridge', () => {
  it('exposes only supported guided sample locale overrides', () => {
    expect(executePreload({ FOLIOLE_GUIDED_SAMPLE_LOCALE: 'en-US' }).runtimeConfig).toEqual({
      guidedSampleLocale: 'en-US'
    });
    expect(executePreload({ FOLIOLE_GUIDED_SAMPLE_LOCALE: 'fr-FR' }).runtimeConfig).toEqual({
      guidedSampleLocale: null
    });
  });
});
