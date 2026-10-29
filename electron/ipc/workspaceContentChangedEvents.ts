import { BrowserWindow, type BrowserWindow as ElectronBrowserWindow } from 'electron';

import type { WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { requestDesktopHighValueSync } from '../sync/desktopMemberSyncCadence.js';

import {
  IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
  type WorkspaceContentChangedEvent
} from './contracts.js';

const WORKSPACE_CONTENT_CHANGED_PAYLOAD: WorkspaceContentChangedEvent = {
  scope: 'workspace'
};

export function notifyWorkspaceContentChanged(
  excludedWindow: ElectronBrowserWindow | null = null,
  options: { requestSync?: boolean; refreshingWindow?: ElectronBrowserWindow | null;
    workspaceScope?: WorkspaceRefreshScope; libraryScope?: string } = {}
) {
  if (options.requestSync !== false) void requestDesktopHighValueSync();
  const windows = typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
  if (!windows.length) return;
  const payload: WorkspaceContentChangedEvent = { ...WORKSPACE_CONTENT_CHANGED_PAYLOAD,
    workspaceScope: options.workspaceScope ?? { kind: 'full' },
    libraryScope: options.libraryScope ?? currentLibraryScope() };
  for (const window of windows) {
    if (window === excludedWindow || window.isDestroyed()) {
      continue;
    }
    window.webContents.send(
      IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
      window === options.refreshingWindow
        ? { ...payload, refreshWorkspace: false }
        : payload
    );
  }
}
