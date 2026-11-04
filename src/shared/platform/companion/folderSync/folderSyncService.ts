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
export type FolderSyncServiceEvent = 'location' | 'activity';
type Result = Awaited<ReturnType<typeof writeFolderSyncRound>>;

export function createFolderSyncService(plugin: FolderSyncNativePlugin, openSource: () => Promise<FolderSyncSourceSession>) {
  let choosing = false;
  let active: Promise<Result> | null = null;
  let controller: AbortController | null = null;
  const listeners = new Set<(event: FolderSyncServiceEvent) => void>();
  const emit = (event: FolderSyncServiceEvent) => {
    for (const listener of listeners) { try { listener(event); } catch { /* Observers cannot fail a committed write. */ } }
  };
  return {
    read: () => plugin.readLocation(),
    async setEnabled(enabled: boolean) {
      if (!enabled) controller?.abort(new Error('folder_sync_disabled'));
      await plugin.setEnabled({ enabled });
      emit('location');
    },
    getActiveRun: () => active,
    cancel: () => controller?.abort(new Error('folder_sync_scope_changed')),
    subscribe(listener: (event: FolderSyncServiceEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async choose() {
      if (choosing || active) throw new Error('folder_sync_busy');
      choosing = true;
      try {
        const result = await plugin.chooseLocation();
        if (!result.cancelled) emit('location');
        return result;
      } finally { choosing = false; }
    },
    write() {
      if (active) return active;
      if (choosing) return Promise.reject(new Error('folder_sync_busy'));
      controller = new AbortController();
      active = writeFolder(plugin, openSource, controller.signal).finally(() => {
        active = null;
        controller = null;
        emit('activity');
      });
      emit('activity');
      return active;
    }
  };
}

async function writeFolder(plugin: FolderSyncNativePlugin, openSource: () => Promise<FolderSyncSourceSession>, signal: AbortSignal) {
  let acquired: { token: string; lease: string } | undefined;
  let identity: { token: string; sourceId: string } | undefined;
  try {
    const { location, enabled } = await plugin.readLocation();
    if (!enabled) throw new Error('folder_sync_disabled');
    if (!location) throw new Error('folder_sync_authorization_required');
    const session = await openSource();
    const check = () => { signal.throwIfAborted(); session.assertCurrent(); };
    identity = { token: location.token, sourceId: session.sourceId };
    check();
    if (!location.authorized) throw new Error('folder_sync_authorization_required');
    acquired = { token: location.token, ...(await plugin.acquire({ token: location.token })) };
    check();
    const result = await writeFolderSyncRound({ sourceId: session.sourceId, source: session.source, signal,
      sourceAttachments: session.attachments, target: createFolderSyncTarget(plugin, acquired.token, acquired.lease), assertCurrent: check });
    check();
    await plugin.saveCompletion({ ...acquired, completion: { sourceId: session.sourceId,
      checkedAt: new Date().toISOString(), generation: result.generation, pendingResources: result.pendingResources.length } });
    check();
    return result;
  } catch (error) {
    if (!signal.aborted && identity) await plugin.saveFailure({ ...identity, occurredAt: new Date().toISOString() }).catch(() => undefined);
    throw error;
  } finally { if (acquired) await plugin.release(acquired); }
}
