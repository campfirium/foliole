// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { beforeEach, expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'globalCaptureToastPreload.cjs');

function executeToastPreload() {
  const exposeInMainWorld = vi.fn();
  const ipcSend = vi.fn();
  const ipcHandlers = new Map<string, (_event: unknown, payload: unknown) => void>();
  const sandboxRequire = vi.fn(() => ({
    contextBridge: { exposeInMainWorld },
    ipcRenderer: {
      on: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => void) => {
        ipcHandlers.set(channel, handler);
      }),
      send: ipcSend
    }
  }));
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    require: sandboxRequire,
    window
  }, { filename: PRELOAD_PATH });
  return { exposeInMainWorld, ipcHandlers, ipcSend, sandboxRequire };
}

beforeEach(() => {
  document.body.innerHTML = '<div class="toast" data-clickable="true" data-target-node-id="node-1"><span>Open</span></div>';
});

it('routes a card click through the sandboxed preload and existing open channel', () => {
  const { exposeInMainWorld, ipcSend, sandboxRequire } = executeToastPreload();

  document.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  expect(sandboxRequire).toHaveBeenCalledWith('electron');
  expect(exposeInMainWorld).toHaveBeenCalledWith('globalCaptureToast', { open: expect.any(Function) });
  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-toast:open', { nodeId: 'node-1' });
});

it('uses the latest target sent by the main process when no explicit id is supplied', () => {
  const { exposeInMainWorld, ipcHandlers, ipcSend } = executeToastPreload();
  ipcHandlers.get('foliole:global-capture-toast:target')?.({}, { nodeId: 'node-2' });
  const api = exposeInMainWorld.mock.calls[0]?.[1] as { open: (nodeId?: string) => void };

  api.open();

  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-toast:open', { nodeId: 'node-2' });
});
