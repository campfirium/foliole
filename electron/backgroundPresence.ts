import path from 'node:path';

import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron';

import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
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

function resolveTrayIconPath(platform: NodeJS.Platform = process.platform) {
  const iconName = platform === 'win32' ? 'icon.ico' : 'icon.png';
  const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(basePath, 'build', iconName);
}

function createTrayIcon(platform: NodeJS.Platform = process.platform) {
  const iconPath = resolveTrayIconPath(platform);
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    return icon;
  }
  appendMainProcessDiagnosticLog('tray_icon_empty', {
    icon_path: iconPath,
    is_packaged: app.isPackaged,
    platform
  });
  return null;
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

function toggleMainWindow(window: BrowserWindow | null) {
  if (!window || window.isDestroyed()) {
    return false;
  }
  if (window.isVisible() && !window.isMinimized()) {
    window.hide();
    return true;
  }
  showMainWindow(window);
  return true;
}

export function installBackgroundTray(args: {
  getMainWindow: () => BrowserWindow | null;
  openMainWindow: () => Promise<BrowserWindow | null>;
  platform?: NodeJS.Platform;
}) {
  if ((args.platform ?? process.platform) !== 'win32' || tray) {
    return;
  }

  const trayIcon = createTrayIcon(args.platform);
  if (!trayIcon) {
    return;
  }
  tray = new Tray(trayIcon);
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
  tray.on('click', () => {
    const window = args.getMainWindow();
    if (toggleMainWindow(window)) {
      return;
    }
    void args.openMainWindow();
  });
}
