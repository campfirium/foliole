// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { beforeEach, expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'globalCapturePanelPreload.cjs');

function executePanelPreload() {
  const ipcSend = vi.fn();
  const ipcHandlers = new Map<string, () => void>();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier === 'electron') {
      return {
        ipcRenderer: {
          on: vi.fn((channel: string, handler: () => void) => {
            ipcHandlers.set(channel, handler);
          }),
          send: ipcSend
        }
      };
    }
    throw new Error(`unsupported require: ${specifier}`);
  });
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    document,
    require: sandboxRequire,
    window
  }, { filename: PRELOAD_PATH });
  window.dispatchEvent(new Event('DOMContentLoaded'));
  return {
    emitFocus: () => ipcHandlers.get('foliole:global-capture-panel:focus')?.(),
    ipcSend
  };
}

function setInputScrollHeight(input: HTMLTextAreaElement, value: number) {
  Object.defineProperty(input, 'scrollHeight', {
    configurable: true,
    value
  });
}

function countChannelCalls(ipcSend: ReturnType<typeof vi.fn>, channel: string) {
  return ipcSend.mock.calls.filter((call) => call[0] === channel).length;
}

async function waitForChannel(ipcSend: ReturnType<typeof vi.fn>, channel: string) {
  for (let index = 0; index < 20 && countChannelCalls(ipcSend, channel) === 0; index += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 5));
  }
}

beforeEach(() => {
  document.body.innerHTML = [
    '<form id="form">',
    '<textarea id="capture"></textarea>',
    '<button id="hide-hint" type="button">Hide</button>',
    '<button id="show-hint" type="button">Hint</button>',
    '<button id="close" type="button">x</button>',
    '</form>'
  ].join('');
});

it('does not need shell chrome controls to preserve typed text', () => {
  executePanelPreload();
  const input = document.getElementById('capture') as HTMLTextAreaElement;

  input.value = '  first line\nsecond line  ';
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));

  expect(input.value).toBe('  first line\nsecond line  ');
});

it('asks the main process to grow until the capture max height', () => {
  const { ipcSend } = executePanelPreload();
  const input = document.getElementById('capture') as HTMLTextAreaElement;

  setInputScrollHeight(input, 220);
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));

  setInputScrollHeight(input, 400);
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));

  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:resize', 316);
  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:resize', 472);
  expect(input.style.overflowY).toBe('auto');
});

it('signals readiness after the first layout paint', async () => {
  const { ipcSend } = executePanelPreload();

  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:resize', 240);
  expect(ipcSend).not.toHaveBeenCalledWith('foliole:global-capture-panel:ready');

  await waitForChannel(ipcSend, 'foliole:global-capture-panel:ready');

  const calls = ipcSend.mock.calls.map((call) => call[0]);
  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:ready');
  expect(calls.indexOf('foliole:global-capture-panel:resize')).toBeLessThan(
    calls.indexOf('foliole:global-capture-panel:ready')
  );
});

it('toggles the persisted hint visibility from the footer buttons', () => {
  const { ipcSend } = executePanelPreload();

  document.getElementById('hide-hint')?.click();
  expect(document.body.dataset.hintVisible).toBe('false');
  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:hint-visible', false);

  document.getElementById('show-hint')?.click();
  expect(document.body.dataset.hintVisible).toBe('true');
  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:hint-visible', true);
});

it('submits Enter and keeps Shift+Enter for newlines', () => {
  const { emitFocus, ipcSend } = executePanelPreload();
  const input = document.getElementById('capture') as HTMLTextAreaElement;
  input.value = 'quick thought';
  document.body.focus();
  emitFocus();
  expect(document.activeElement).toBe(input);

  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true }));

  expect(countChannelCalls(ipcSend, 'foliole:global-capture-panel:submit')).toBe(1);
  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:submit', 'quick thought');
});

it('cancels on Escape or close button', () => {
  const { ipcSend } = executePanelPreload();

  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  document.getElementById('close')?.click();

  expect(ipcSend).toHaveBeenCalledWith('foliole:global-capture-panel:cancel');
  expect(countChannelCalls(ipcSend, 'foliole:global-capture-panel:cancel')).toBe(2);
});
