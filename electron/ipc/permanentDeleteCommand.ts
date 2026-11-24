import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import {
  getOpenDatabaseConnection, isCurrentDatabaseConnection, openDatabaseConnection, type DatabaseConnection
} from '../database/connection.js';
import { runDesktopDatabaseWrite } from '../database/desktopDatabaseWriteQueue.js';
import {
  deletePermanentDeleteChunk,
  preparePermanentDelete,
  readTrashDeleteChunk,
  splitPermanentDeleteChunks
} from '../database/nodePermanentDeleteChunks.js';
import {
  cleanupAttachmentsAfterDelete, collectAttachmentCleanupCandidates, type AttachmentFileRow
} from '../database/orphanAttachmentCleanup.js';
import { enqueueReleasedBodyCollection } from '../database/releasedBodyCollectionTask.js';
import { resolveArticleIdsFromNodeId } from '../mirror/mirrorArticleResolver.js';
import { capturePermanentMirrorPaths, retirePermanentMirrorPaths } from '../mirror/mirrorPermanentDelete.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { parseDeleteNodesPermanentlyArgs } from './nodeCommandArgs.js';
import { completeWorkspaceMutation, type OriginWindow } from './storageNodeMutationResult.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

// Keeps each main-thread write short enough that input and other writes run between chunks.
const PERMANENT_DELETE_CHUNK_SIZE = 10;

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function assertPermanentDeleteConnection(connection: DatabaseConnection) {
  if (!isCurrentDatabaseConnection(connection)) throw new Error('permanent_delete_library_changed');
}

/** Deletes in short write tasks; a failure leaves the remaining nodes in the trash. */
export async function handlePermanentDeleteNodeCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const parsed = parseDeleteNodesPermanentlyArgs(args);
  const libraryScope = parsed.libraryScope ?? currentLibraryScope();
  const connectionAtDispatch = getOpenDatabaseConnection();
  const { plan, connection } = await runDesktopDatabaseWrite('foreground', () => {
    if (currentLibraryScope() !== libraryScope) throw new Error('permanent_delete_library_changed');
    if (connectionAtDispatch) assertPermanentDeleteConnection(connectionAtDispatch);
    return { connection: openDatabaseConnection(), plan: preparePermanentDelete(parsed.nodeIds) };
  });
  const removed: string[] = [];
  const parents = new Set<string>();
  const affectedArticleIds = new Set<string>();
  const attachments = new Map<string, AttachmentFileRow>();
  const refreshScope = () => ({ kind: 'nodes' as const, nodeIds: [...new Set([...removed, ...parents])], structure: true });
  try {
    for (const chunk of splitPermanentDeleteChunks(plan, PERMANENT_DELETE_CHUNK_SIZE)) {
      const mirrors = await runDesktopDatabaseWrite('foreground', () => {
        assertPermanentDeleteConnection(connection);
        const eligible = readTrashDeleteChunk(connection.driver, chunk);
        if (!eligible.length) return [];
        const ids = eligible.map(row => row.id);
        const retiredMirrors = capturePermanentMirrorPaths(ids);
        const articleIds = ids.flatMap(resolveArticleIdsFromNodeId);
        const candidates = collectAttachmentCleanupCandidates(connection.driver, ids);
        const released = deletePermanentDeleteChunk(ids);
        removed.push(...ids);
        for (const row of eligible) if (row.parent_id !== null) parents.add(row.parent_id);
        for (const articleId of articleIds) affectedArticleIds.add(articleId);
        for (const candidate of candidates) attachments.set(`${candidate.id}:${candidate.mime_type}`, candidate);
        enqueueReleasedBodyCollection(released);
        return retiredMirrors;
      });
      await retirePermanentMirrorPaths(mirrors);
      await yieldToEventLoop();
    }
    return await runDesktopDatabaseWrite('foreground', () => {
      assertPermanentDeleteConnection(connection);
      cleanupAttachmentsAfterDelete(connection.driver, [...attachments.values()]);
      const removedIds = new Set(removed);
      const result = { removedNodeIds: parsed.nodeIds.filter(id => removedIds.has(id)) };
      return completeWorkspaceMutation(result, originWindow, refreshScope(), libraryScope);
    });
  } catch (error) {
    // The origin window reloads on its own failure path; other windows learn about removed chunks here.
    if (removed.length) notifyWorkspaceContentChanged(originWindow, {
      libraryScope, workspaceScope: refreshScope(),
      ...(!isCurrentDatabaseConnection(connection) && { requestSync: false })
    });
    throw error;
  } finally {
    if (removed.length && isCurrentDatabaseConnection(connection)) {
      scheduleMirrorSync([...new Set([...removed, ...affectedArticleIds])]);
    }
  }
}
