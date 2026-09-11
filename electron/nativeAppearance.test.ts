// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

let appleInterfaceStyle: string | undefined;
let appearanceNotification: (() => void) | undefined;
let nativeShouldUseDarkColors = false;
const send = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }]
  },
  nativeTheme: {
    on: vi.fn((_name: string, callback: () => void) => {
      appearanceNotification = callback;
    }),
    get shouldUseDarkColors() {
      return nativeShouldUseDarkColors;
    },
    themeSource: 'system'
  },
  systemPreferences: {
    getUserDefault: () => appleInterfaceStyle,
    subscribeNotification: (_name: string, callback: () => void) => {
      appearanceNotification = callback;
      return 1;
    }
  }
}));

import { loadSystemColorMode } from './nativeAppearance.js';

beforeEach(() => {
  appleInterfaceStyle = undefined;
  nativeShouldUseDarkColors = false;
  send.mockClear();
});

it('reads host appearance and broadcasts later system changes', () => {
  appleInterfaceStyle = 'Dark';
  nativeShouldUseDarkColors = true;
  expect(loadSystemColorMode()).toBe('dark');

  appleInterfaceStyle = undefined;
  nativeShouldUseDarkColors = false;
  appearanceNotification?.();

  expect(send).toHaveBeenCalledWith('foliole:system-color-mode-changed', 'light');
});
