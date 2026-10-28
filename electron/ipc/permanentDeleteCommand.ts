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

/** Deletes in short write tasks; a failure leaves the remaining nodes in the trash. */
export async function handlePermanentDeleteNodeCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const parsed = parseDeleteNodesPermanentlyArgs(args);
  const plan = await runDesktopDatabaseWrite('foreground', () => preparePermanentDelete(parsed.nodeIds));
  const released: string[] = [];
  const removed: string[] = [];
  const affectedArticleIds = new Set<string>();
  try {
    for (const chunk of splitPermanentDeleteChunks(plan, PERMANENT_DELETE_CHUNK_SIZE)) {
      const result = await runDesktopDatabaseWrite('foreground', () => {
        const mirrors = capturePermanentMirrorPaths(chunk);
        const articleIds = chunk.flatMap(resolveArticleIdsFromNodeId);
        return { released: deletePermanentDeleteChunk(chunk), mirrors, articleIds };
      });
      released.push(...result.released);
      removed.push(...chunk);
      for (const articleId of result.articleIds) affectedArticleIds.add(articleId);
      await retirePermanentMirrorPaths(result.mirrors);
      await yieldToEventLoop();
    }
    await runDesktopDatabaseWrite('foreground', () => finishPermanentDelete(plan));
  } catch (error) {
    // The origin window reloads on its own failure path; other windows learn about removed chunks here.
    if (removed.length) notifyWorkspaceContentChanged(originWindow);
    throw error;
  } finally {
    enqueueReleasedBodyCollection(released);
    if (removed.length) scheduleMirrorSync([...new Set([...removed, ...affectedArticleIds])]);
  }
  return completeWorkspaceMutation({ removedNodeIds: parsed.nodeIds }, originWindow);
}
