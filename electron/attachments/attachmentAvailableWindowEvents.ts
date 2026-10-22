import { BrowserWindow } from 'electron';

import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { IPC_ATTACHMENT_RESOURCE_AVAILABLE_EVENT_CHANNEL } from '../ipc/contracts.js';

import { setAttachmentPublishedListener } from './attachmentPublishedEvents.js';

/** Lets open documents show attachments whose verified bytes were published after they rendered. */
export function installAttachmentAvailableWindowEvents() {
  setAttachmentPublishedListener((storageKey) => {
    if (!parseCanonicalAttachmentStorageKey(storageKey)) return;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_ATTACHMENT_RESOURCE_AVAILABLE_EVENT_CHANNEL, storageKey);
    }
  });
}
