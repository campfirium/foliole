import { ipcMain, type BrowserWindow as ElectronBrowserWindow, type Input } from 'electron';

import {
  IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL,
  IPC_MENU_EVENT_CHANNEL,
  IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL,
  type NativeKeyboardInputEvent
} from './contracts.js';
import { canDispatchNativeMenuAccelerator } from './menu.js';

const PRIORITY_COMMAND_ID = 'nodes.enterPriorityMode';
const PRIORITY_MACOS_ACCELERATOR = 'Control+M';

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

function isPriorityShortcutInput(input: Input) {
  return (
    input.control &&
    !input.alt &&
    !input.meta &&
    !input.shift &&
    (input.code === 'KeyM' || input.key.toLowerCase() === 'm')
  );
}

export function bindHotkeyRecorderInput(
  window: ElectronBrowserWindow,
  canDispatchMenuAccelerator = canDispatchNativeMenuAccelerator
) {
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
    if (!isRecorderActive && input.key !== 'Escape' && !isPriorityShortcutInput(input)) {
      return;
    }
    if (
      !isRecorderActive &&
      isPriorityShortcutInput(input) &&
      canDispatchMenuAccelerator(PRIORITY_COMMAND_ID, PRIORITY_MACOS_ACCELERATOR)
    ) {
      event.preventDefault();
      window.webContents.send(IPC_MENU_EVENT_CHANNEL, { commandId: PRIORITY_COMMAND_ID });
      return;
    }
    if (isRecorderActive) {
      event.preventDefault();
    }
    window.webContents.send(IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL, toNativeKeyboardInputEvent(input));
  });
}
