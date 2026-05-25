import { ipcMain, type BrowserWindow as ElectronBrowserWindow, type Input } from 'electron';

import {
  IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL,
  IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL,
  type NativeKeyboardInputEvent
} from './contracts.js';

function toNativeKeyboardInputEvent(input: Input): NativeKeyboardInputEvent {
  return {
    altKey: input.alt,
    code: input.code,
    controlKey: input.control,
    key: input.key,
    metaKey: input.meta,
    shiftKey: input.shift,
    type: input.type
  };
}

export function bindHotkeyRecorderInput(window: ElectronBrowserWindow) {
  let isRecorderActive = false;
  ipcMain.on(IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL, (event, payload: unknown) => {
    if (event.sender !== window.webContents) {
      return;
    }
    isRecorderActive = payload === true;
  });
  window.on('blur', () => {
    isRecorderActive = false;
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }
    if (!isRecorderActive && input.key !== 'Escape') {
      return;
    }
    if (isRecorderActive) {
      event.preventDefault();
    }
    window.webContents.send(IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL, toNativeKeyboardInputEvent(input));
  });
}
