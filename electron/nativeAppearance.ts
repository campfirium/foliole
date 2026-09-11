import { BrowserWindow, nativeTheme, systemPreferences } from 'electron';

import { IPC_SYSTEM_COLOR_MODE_CHANGED_EVENT_CHANNEL } from './ipc/contracts.js';

type BaseColorMode = 'dark' | 'light' | 'system';
type ResolvedBaseColorMode = Exclude<BaseColorMode, 'system'>;
let appearanceListenerInstalled = false;

export function readSystemColorMode(): ResolvedBaseColorMode {
  if (process.platform === 'darwin') {
    return systemPreferences.getUserDefault('AppleInterfaceStyle', 'string') === 'Dark'
      ? 'dark'
      : 'light';
  }
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function broadcastSystemColorMode() {
  const mode = readSystemColorMode();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_SYSTEM_COLOR_MODE_CHANGED_EVENT_CHANNEL, mode);
    }
  }
}

function installAppearanceListener() {
  if (appearanceListenerInstalled) return;
  if (process.platform === 'darwin') {
    systemPreferences.subscribeNotification(
      'AppleInterfaceThemeChangedNotification',
      broadcastSystemColorMode
    );
  } else {
    nativeTheme.on('updated', broadcastSystemColorMode);
  }
  appearanceListenerInstalled = true;
}

export function applyNativeBaseColorMode(mode: BaseColorMode) {
  nativeTheme.themeSource = mode;
  installAppearanceListener();
}

export function loadSystemColorMode() {
  installAppearanceListener();
  return readSystemColorMode();
}
