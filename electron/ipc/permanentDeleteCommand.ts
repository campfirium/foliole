import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { isCurrentDatabaseConnection, openDatabaseConnection, type DatabaseConnection } from '../database/connection.js';
import { runDesktopDatabaseWrite } from '../database/desktopDatabaseWriteQueue.js';
import {
  deletePermanentDeleteChunk,
  finishPermanentDelete,
  preparePermanentDelete,
  splitPermanentDeleteChunks
} from '../database/nodePermanentDeleteChunks.js';
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

function loadChunkParents(connection: DatabaseConnection, nodeIds: string[]) {
  return connection.driver.queryAll<{ parent_id: string }>(
    'SELECT DISTINCT parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?)) AND parent_id IS NOT NULL',
    [JSON.stringify(nodeIds)]).map(row => row.parent_id);
}

/** Deletes in short write tasks; a failure leaves the remaining nodes in the trash. */
export async function handlePermanentDeleteNodeCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const parsed = parseDeleteNodesPermanentlyArgs(args);
  const { plan, libraryScope, connection } = await runDesktopDatabaseWrite('foreground', () => ({
    connection: openDatabaseConnection(), libraryScope: currentLibraryScope(),
    plan: preparePermanentDelete(parsed.nodeIds)
  }));
  const removed: string[] = [];
  const parents = new Set<string>();
  const affectedArticleIds = new Set<string>();
  const refreshScope = () => ({ kind: 'nodes' as const, nodeIds: [...new Set([...removed, ...parents])], structure: true });
  try {
    for (const chunk of splitPermanentDeleteChunks(plan, PERMANENT_DELETE_CHUNK_SIZE)) {
      const mirrors = await runDesktopDatabaseWrite('foreground', () => {
        assertPermanentDeleteConnection(connection);
        const retiredMirrors = capturePermanentMirrorPaths(chunk);
        const articleIds = chunk.flatMap(resolveArticleIdsFromNodeId);
        const chunkParents = loadChunkParents(connection, chunk);
        const released = deletePermanentDeleteChunk(chunk);
        removed.push(...chunk);
        for (const parent of chunkParents) parents.add(parent);
        for (const articleId of articleIds) affectedArticleIds.add(articleId);
        enqueueReleasedBodyCollection(released);
        return retiredMirrors;
      });
      await retirePermanentMirrorPaths(mirrors);
      await yieldToEventLoop();
    }
    return await runDesktopDatabaseWrite('foreground', () => {
      assertPermanentDeleteConnection(connection);
      finishPermanentDelete(plan);
      return completeWorkspaceMutation({ removedNodeIds: parsed.nodeIds }, originWindow, refreshScope(), libraryScope);
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
