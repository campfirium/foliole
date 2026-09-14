import { IPC_SYNC_GROUP_OVERVIEW_CHANGED_CHANNEL } from '../ipc/contracts.js';
import { getMainWindow } from '../mainWindowRegistry.js';

export function notifyDesktopSyncGroupOverviewChanged() {
  getMainWindow()?.webContents.send(IPC_SYNC_GROUP_OVERVIEW_CHANGED_CHANNEL);
}
