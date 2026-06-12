import path from 'node:path';

import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron';

import { focusWindow } from './runtimeMainSupport.js';

let tray: Tray | null = null;
let appIsQuitting = false;

export function isAppQuittingForBackgroundPresence() {
  return appIsQuitting;
}

export function markAppQuittingForBackgroundPresence() {
  appIsQuitting = true;
}

export function resetBackgroundPresenceForTests() {
  tray?.destroy();
  tray = null;
  appIsQuitting = false;
}

function resolveTrayIconPath() {
  return path.join(app.getAppPath(), 'build', 'icon.png');
}

function showMainWindow(window: BrowserWindow | null) {
  if (!window || window.isDestroyed()) {
    return;
  }
  if (!window.isVisible()) {
    window.show();
  }
  focusWindow(window);
}

export function installBackgroundTray(args: {
  getMainWindow: () => BrowserWindow | null;
  openMainWindow: () => Promise<BrowserWindow | null>;
  platform?: NodeJS.Platform;
}) {
  if ((args.platform ?? process.platform) !== 'win32' || tray) {
    return;
  }

  tray = new Tray(nativeImage.createFromPath(resolveTrayIconPath()));
  tray.setToolTip('Foliole');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Foliole',
      click: () => {
        void args.openMainWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Foliole',
      click: () => {
        markAppQuittingForBackgroundPresence();
        app.quit();
      }
    }
  ]));
  tray.on('double-click', () => {
    const window = args.getMainWindow();
    if (window) {
      showMainWindow(window);
      return;
    }
    void args.openMainWindow();
  });
}
