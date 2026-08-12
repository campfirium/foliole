import { BrowserWindow, type BrowserWindow as ElectronBrowserWindow } from 'electron';

import { refreshCompanionMdnsAdvertisement } from '../sync/companionMdnsAdvertisement.js';

import {
  IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
  type WorkspaceContentChangedEvent
} from './contracts.js';

const WORKSPACE_CONTENT_CHANGED_PAYLOAD: WorkspaceContentChangedEvent = {
  scope: 'workspace'
};

export function notifyWorkspaceContentChanged(excludedWindow: ElectronBrowserWindow | null = null) {
  refreshCompanionMdnsAdvertisement();
  const windows = typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
  for (const window of windows) {
    if (window === excludedWindow || window.isDestroyed()) {
      continue;
    }
    window.webContents.send(
      IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
      WORKSPACE_CONTENT_CHANGED_PAYLOAD
    );
  }
}
