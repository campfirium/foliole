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
  it('routes import shortcuts through the native menu command channel before page keydown', () => {
    const window = createWindow();
    bindHotkeyRecorderInput(window as unknown as Parameters<typeof bindHotkeyRecorderInput>[0]);

    const importFileEvent = emitInput(window, { control: true, key: 'o' });
    const clipboardEvent = emitInput(window, { alt: true, control: true, key: 'v' });

    expect(importFileEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(clipboardEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenNthCalledWith(1, 'foliole:native-menu-command', {
      commandId: 'import.singleFileToInbox'
    });
    expect(window.webContents.send).toHaveBeenNthCalledWith(2, 'foliole:native-menu-command', {
      commandId: 'import.clipboard'
    });
  });

  it('routes undo and redo shortcuts through the native menu command channel before page keydown', () => {
    const window = createWindow();
    bindHotkeyRecorderInput(window as unknown as Parameters<typeof bindHotkeyRecorderInput>[0]);

    const undoEvent = emitInput(window, { control: true, key: 'z' });
    const redoShiftEvent = emitInput(window, { control: true, key: 'z', shift: true });
    const redoYEvent = emitInput(window, { control: true, key: 'y' });

    expect(undoEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(redoShiftEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(redoYEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenNthCalledWith(1, 'foliole:native-menu-command', {
      commandId: 'app.undo'
    });
    expect(window.webContents.send).toHaveBeenNthCalledWith(2, 'foliole:native-menu-command', {
      commandId: 'app.redo'
    });
    expect(window.webContents.send).toHaveBeenNthCalledWith(3, 'foliole:native-menu-command', {
      commandId: 'app.redo'
    });
  });

  it('leaves unrelated shortcuts on the normal page path', () => {
    const window = createWindow();
    bindHotkeyRecorderInput(window as unknown as Parameters<typeof bindHotkeyRecorderInput>[0]);

    const event = emitInput(window, { control: true, key: 'f' });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});
