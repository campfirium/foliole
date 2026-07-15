import path from 'node:path';

import { Menu, Tray, app, nativeImage, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { getGlobalClipShortcutConfig } from './globalClipShortcut.js';
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
  const iconName = platform === 'win32' ? 'icon.ico' : 'FolioleStatusTemplate.png';
  const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(basePath, 'build', iconName);
}

function createTrayIcon(platform: NodeJS.Platform = process.platform) {
  const iconPath = resolveTrayIconPath(platform);
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    if (platform === 'darwin') icon.setTemplateImage(true);
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
  captureToInbox?: () => Promise<unknown>;
  getMainWindow: () => BrowserWindow | null;
  openMainWindow: () => Promise<BrowserWindow | null>;
  platform?: NodeJS.Platform;
}) {
  const platform = args.platform ?? process.platform;
  if ((platform !== 'win32' && platform !== 'darwin') || tray) {
    return;
  }

  const trayIcon = createTrayIcon(platform);
  if (!trayIcon) {
    return;
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('Foliole');
  const openItem = {
    label: 'Open Foliole',
    click: () => {
      void args.openMainWindow();
    }
  };
  const quitItem = {
    label: 'Quit Foliole',
    click: () => {
      markAppQuittingForBackgroundPresence();
      app.quit();
    }
  };
  const template: MenuItemConstructorOptions[] = platform === 'darwin' ? [
    {
      accelerator: getGlobalClipShortcutConfig(platform)!.accelerator,
      label: 'Capture to Inbox',
      click: () => {
        void args.captureToInbox?.().catch((error) => {
          appendMainProcessDiagnosticLog('global_clip_to_inbox_failed', { error });
        });
      }
    },
    openItem,
    { type: 'separator' },
    quitItem
  ] : [openItem, { type: 'separator' }, quitItem];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  if (platform !== 'win32') return;
  tray.on('click', () => {
    const window = args.getMainWindow();
    if (toggleMainWindow(window)) {
      return;
    }
    void args.openMainWindow();
  });
}
