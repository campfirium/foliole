import { BrowserWindow } from 'electron';

import type { NativeNodeMutationPatchResult } from '../../lib/platform/nativeContract.js';
import { IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL } from '../ipc/contracts.js';

export interface ManagedInboxUpdatedPayload {
  importId: string;
  nodeMutationPatch?: NativeNodeMutationPatchResult | null;
}

export function notifyManagedInboxUpdated(importId: string, nodeMutationPatch?: NativeNodeMutationPatchResult | null) {
  if (!importId.trim()) {
    return;
  }
  const payload: ManagedInboxUpdatedPayload = {
    importId,
    ...(nodeMutationPatch ? { nodeMutationPatch } : {})
  };
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send(IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL, payload);
  }
}
