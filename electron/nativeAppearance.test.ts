// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

let appleInterfaceStyle: string | undefined;
let appearanceNotification: (() => void) | undefined;
const send = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }]
  },
  nativeTheme: {
    on: vi.fn(),
    shouldUseDarkColors: false,
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
  send.mockClear();
});

it('reads macOS appearance and broadcasts later system changes', () => {
  appleInterfaceStyle = 'Dark';
  expect(loadSystemColorMode()).toBe('dark');

  appleInterfaceStyle = undefined;
  appearanceNotification?.();

  expect(send).toHaveBeenCalledWith('foliole:system-color-mode-changed', 'light');
});
