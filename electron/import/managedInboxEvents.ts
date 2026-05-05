import { BrowserWindow } from 'electron';

import { IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL } from '../ipc/contracts.js';

export function notifyManagedInboxUpdated(importId: string) {
  if (!importId.trim()) {
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send(IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL, { importId });
  }
}
