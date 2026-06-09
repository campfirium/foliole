import { BrowserWindow, ipcMain } from 'electron';

import { GLOBAL_CAPTURE_TOAST_OPEN_CHANNEL } from './globalCaptureChannels.js';
import { IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL } from './ipc/contracts.js';

let hasInstalledToastOpenHandler = false;

function notifyMainWindowsToOpenCaptureTarget(nodeId: string, senderId: number) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.id === senderId) {
      continue;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
    window.webContents.send(IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL, { nodeId });
  }
}

export function installGlobalCaptureToastOpenHandler() {
  if (hasInstalledToastOpenHandler) {
    return;
  }
  hasInstalledToastOpenHandler = true;
  ipcMain.on(GLOBAL_CAPTURE_TOAST_OPEN_CHANNEL, (event, payload) => {
    const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId.trim() : '';
    if (nodeId) {
      notifyMainWindowsToOpenCaptureTarget(nodeId, event.sender.id);
    }
  });
}
