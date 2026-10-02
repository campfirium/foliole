import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

it('exposes download progress with an unknown total under sandbox-limited require', () => {
  const expose = vi.fn();
  const on = vi.fn();
  const preload = path.resolve('electron/preload.cjs');
  vm.runInNewContext(readFileSync(preload, 'utf8'), {
    process: { env: {} },
    require: (name: string) => {
      if (name !== 'electron') throw new Error(`unsupported require: ${name}`);
      return {
        contextBridge: { exposeInMainWorld: expose },
        ipcRenderer: { on, invoke: vi.fn(), send: vi.fn(), removeListener: vi.fn() }
      };
    }
  }, { filename: preload });
  const handler = vi.fn();
  const api = expose.mock.calls[0]?.[1];
  api.onReadwiseReaderImportProgress(handler);
  const emit = on.mock.calls[0]?.[1];
  emit({}, { phase: 'indexing', processedCount: 8500, totalCount: 0, status: 'running' });
  emit({}, { phase: 'indexing', processedCount: 8600, totalCount: 0, status: 'running' });
  emit({}, { phase: 'writing', processedCount: 8500, totalCount: 0, status: 'running' });
  emit({}, { phase: 'indexing', processedCount: 8500, totalCount: 100, status: 'running' });
  expect(handler.mock.calls.map(([payload]) => payload.processedCount)).toEqual([8500, 8600]);
});
