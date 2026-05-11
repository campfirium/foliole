import { BrowserWindow } from 'electron';

import {
  IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
  type WorkspaceContentChangedEvent
} from './contracts.js';

const WORKSPACE_CONTENT_CHANGED_PAYLOAD: WorkspaceContentChangedEvent = {
  scope: 'workspace'
};

export function notifyWorkspaceContentChanged() {
  const windows = typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
  for (const window of windows) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send(
      IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
      WORKSPACE_CONTENT_CHANGED_PAYLOAD
    );
  }
}
