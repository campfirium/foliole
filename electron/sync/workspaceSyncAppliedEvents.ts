import { BrowserWindow } from 'electron';

import {
  IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL,
  type WorkspaceSyncAppliedEvent
} from '../ipc/contracts.js';

function hasAppliedChanges(payload: WorkspaceSyncAppliedEvent) {
  return payload.appliedNodeIds.length > 0 || payload.appliedObjectIds.length > 0 || payload.appliedReviewOpIds.length > 0;
}

export function notifyWorkspaceSyncApplied(payload: WorkspaceSyncAppliedEvent) {
  if (!hasAppliedChanges(payload)) {
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send(IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL, payload);
  }
}
