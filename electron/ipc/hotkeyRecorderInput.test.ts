import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn()
  }
}));

import { bindHotkeyRecorderInput } from './hotkeyRecorderInput.js';

function createWindow() {
  const window = new EventEmitter() as EventEmitter & {
    webContents: EventEmitter & { send: ReturnType<typeof vi.fn> };
  };
  window.webContents = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn> };
  window.webContents.send = vi.fn();
  return window;
}

function emitInput(window: ReturnType<typeof createWindow>, input: Record<string, unknown>) {
  const event = { preventDefault: vi.fn() };
  window.webContents.emit('before-input-event', event, {
    alt: false,
    code: '',
    control: false,
    key: '',
    meta: false,
    shift: false,
    type: 'keyDown',
    ...input
  });
  return event;
}

describe('bindHotkeyRecorderInput command shortcuts', () => {
  it('leaves formal command shortcuts to the configured native menu and renderer map', () => {
    const window = createWindow();
    bindHotkeyRecorderInput(window as unknown as Parameters<typeof bindHotkeyRecorderInput>[0]);

    const importFileEvent = emitInput(window, { control: true, key: 'o' });
    const clipboardEvent = emitInput(window, { alt: true, control: true, key: 'v' });
    const undoEvent = emitInput(window, { control: true, key: 'z' });
    const redoShiftEvent = emitInput(window, { control: true, key: 'z', shift: true });
    const redoYEvent = emitInput(window, { control: true, key: 'y' });

    expect(importFileEvent.preventDefault).not.toHaveBeenCalled();
    expect(clipboardEvent.preventDefault).not.toHaveBeenCalled();
    expect(undoEvent.preventDefault).not.toHaveBeenCalled();
    expect(redoShiftEvent.preventDefault).not.toHaveBeenCalled();
    expect(redoYEvent.preventDefault).not.toHaveBeenCalled();
    expect(window.webContents.send).not.toHaveBeenCalled();
  });

  it('leaves unrelated shortcuts on the normal page path', () => {
    const window = createWindow();
    bindHotkeyRecorderInput(window as unknown as Parameters<typeof bindHotkeyRecorderInput>[0]);

    const event = emitInput(window, { control: true, key: 'f' });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});
