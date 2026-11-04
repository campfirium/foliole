import type { AttachmentBlockSource } from '../../../../../lib/core/sync/attachmentBlockTransfer.js';
import type { FolderSyncSourceHost } from '../../../../../lib/core/sync/folderSync/sourceSnapshot.js';
import { writeFolderSyncRound } from '../../../../../lib/core/sync/folderSync/writeRound.js';
import type { FolderSyncNativePlugin } from '../../../../../lib/platform/nativeFolderSyncContract.js';

import { createFolderSyncTarget } from './folderSyncTarget.js';

export interface FolderSyncSourceSession {
  sourceId: string;
  source: FolderSyncSourceHost;
  attachments: AttachmentBlockSource;
  assertCurrent(): void;
}

export function createFolderSyncService(plugin: FolderSyncNativePlugin, openSource: () => Promise<FolderSyncSourceSession>) {
  let busy = false;
  return {
    read: () => plugin.readLocation(),
    async choose() {
      if (busy) throw new Error('folder_sync_busy');
      busy = true;
      try { return await plugin.chooseLocation(); }
      finally { busy = false; }
    },
    async write() {
      if (busy) throw new Error('folder_sync_busy');
      busy = true;
      let acquired: { token: string; lease: string } | undefined;
      try {
        const { location } = await plugin.readLocation();
        if (!location?.authorized) throw new Error('folder_sync_authorization_required');
        const session = await openSource();
        acquired = { token: location.token, ...(await plugin.acquire({ token: location.token })) };
        session.assertCurrent();
        const result = await writeFolderSyncRound({ sourceId: session.sourceId, source: session.source,
          sourceAttachments: session.attachments, target: createFolderSyncTarget(plugin, acquired.token, acquired.lease),
          assertCurrent: session.assertCurrent });
        session.assertCurrent();
        await plugin.saveCompletion({ ...acquired, completion: { sourceId: session.sourceId,
          checkedAt: new Date().toISOString(), generation: result.generation, pendingResources: result.pendingResources.length } });
        session.assertCurrent();
        return result;
      } finally {
        try { if (acquired) await plugin.release(acquired); }
        finally { busy = false; }
      }
    }
  };
}
