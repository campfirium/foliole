import { BrowserWindow } from 'electron';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { reconcileSearchAliasMirror } from '../database/searchAliasMirror.js';
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
  if (payload.appliedObjectIds.some((id) => id.endsWith(':search_aliases_document'))) {
    void runWithDatabaseConnectionOwner(() => reconcileSearchAliasMirror()).catch((error) => {
      console.error('[search-aliases] synced document could not be mapped to the local file', error);
    });
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send(IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL, payload);
  }
}
