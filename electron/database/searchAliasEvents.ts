import { BrowserWindow } from 'electron';

import { IPC_SEARCH_ALIASES_CHANGED_EVENT_CHANNEL } from '../ipc/contracts.js';

export function notifySearchAliasesChanged(revision: number) {
  const windows = BrowserWindow?.getAllWindows?.() ?? [];
  for (const window of windows) {
    if (!window.isDestroyed()) window.webContents.send(IPC_SEARCH_ALIASES_CHANGED_EVENT_CHANNEL, revision);
  }
}
