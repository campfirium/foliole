import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload() {
  const source = readFileSync(PRELOAD_PATH, 'utf8');
  const exposeInMainWorld = vi.fn();
  const ipcOn = vi.fn();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier === 'electron') {
      return {
        contextBridge: { exposeInMainWorld },
        ipcRenderer: {
          invoke: vi.fn(),
          on: ipcOn,
          removeListener: vi.fn(),
          send: vi.fn()
        }
      };
    }
    throw new Error(`unsupported require: ${specifier}`);
  });

  vm.runInNewContext(source, {
    __filename: PRELOAD_PATH,
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: sandboxRequire
  }, { filename: PRELOAD_PATH });

  return { exposeInMainWorld, ipcOn };
}

it('forwards sanitized external document file open events through preload', () => {
  const { exposeInMainWorld, ipcOn } = executePreload();
  const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
  const handler = vi.fn();

  electronApi.onExternalDocumentFileOpened(handler);
  const listener = ipcOn.mock.calls[0]?.[1];
  listener({}, { absolutePath: '/library/recent.md', folderId: 'opened-external-documents' });

  expect(ipcOn).toHaveBeenCalledWith('foliole:external-document-file-opened', expect.any(Function));
  expect(handler).toHaveBeenCalledWith({
    absolutePath: '/library/recent.md',
    folderId: 'opened-external-documents'
  });
});

it('forwards sanitized local file open events through preload', () => {
  const { exposeInMainWorld, ipcOn } = executePreload();
  const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
  const handler = vi.fn();

  electronApi.onLocalFileOpened(handler);
  const listener = ipcOn.mock.calls.find((call) => call[0] === 'foliole:local-file-opened')?.[1];
  listener({}, { absolutePath: '/notes/recent.md' });

  expect(ipcOn).toHaveBeenCalledWith('foliole:local-file-opened', expect.any(Function));
  expect(handler).toHaveBeenCalledWith({ absolutePath: '/notes/recent.md' });
});
