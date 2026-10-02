import { BrowserWindow } from 'electron';

import { IPC_DATABASE_BACKUPS_CHANGED_EVENT_CHANNEL } from './contracts.js';

export function notifyDatabaseBackupsChanged() {
  const windows = typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
  for (const window of windows) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send(IPC_DATABASE_BACKUPS_CHANGED_EVENT_CHANNEL);
  }
}
