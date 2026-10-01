import type { DatabaseDriver } from './driver.js';
import { rewriteExistingNodeOrder } from './nodeOrderMutations.js';
import { recordNodeRelatedStateDeletion, retireUnversionedDeletedNodeState } from './nodeRelatedStateDeletion.js';
import { writeNodeSyncTombstonesForPermanentDelete } from './nodeSyncTombstones.js';
import { readParentChildOrders } from './parentChildOrder.js';
import { DELETE_NODE_SEARCH_PENDING_SQL } from './searchPendingState.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';
import {
  advanceWorkspaceSearchSourceRevision,
  markWorkspaceSearchSourceIndexedIfSettled,
  markWorkspaceSearchSourceRevisionQueued
} from './workspaceSearchSourceState.js';
import { deleteWorkspaceSearchIndexForExistingSubtreeRootIds } from './workspaceSearchSubtreeIndex.js';

export interface DeleteNodesPermanentlyInput {
  deletedAt?: string;
  nodeIds: string[];
  nodeOrder: string[];
}

export function deleteNodesPermanently(driver: DatabaseDriver, input: DeleteNodesPermanentlyInput): string[] {
  const deleteReviewLogStatement = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReviewStatement = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingHostStateStatement = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');
  const deleteNodeTextAlternativesStatement = driver.prepare('DELETE FROM node_text_alternatives WHERE node_id = ?');
  const deleteNodeOpenSyncStateStatement = driver.prepare(
    "DELETE FROM sync_object_state WHERE object_type = 'node_open_state' AND object_id = ?"
  );
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  driver.transaction(() => {
    const now = input.deletedAt ?? new Date().toISOString();
    const ownedOrders = readParentChildOrders(driver);
    advanceWorkspaceSearchSourceRevision(driver);
    writeNodeSyncTombstonesForPermanentDelete(driver, input.nodeIds, now);
    deleteWorkspaceSearchIndexForExistingSubtreeRootIds(driver, input.nodeIds);
    for (const nodeId of input.nodeIds) {
      recordNodeRelatedStateDeletion(driver, nodeId, now);
      retireUnversionedDeletedNodeState(driver, nodeId);
      deleteReviewLogStatement.run([nodeId]);
      deleteNodeReviewStatement.run([nodeId]);
      deleteNodeReadingStatement.run([nodeId]);
      deleteNodeReadingHostStateStatement.run([nodeId]);
      deleteNodeTextAlternativesStatement.run([nodeId]);
      deleteNodeOpenSyncStateStatement.run([nodeId]);
    }
    for (const nodeId of [...input.nodeIds].reverse()) {
      deleteNodeStatement.run([nodeId]);
      driver.execute(DELETE_NODE_SEARCH_PENDING_SQL, [nodeId]);
    }
    for (const nodeId of input.nodeIds) {
      const childIds = ownedOrders.get(nodeId);
      if (!childIds) continue;
      driver.execute('DELETE FROM parent_child_order WHERE parent_id = ?', [nodeId]);
      upsertSyncObjectState(driver, {
        objectType: 'parent_child_order', objectId: nodeId,
        contentHash: computeSyncContentHash('parent_child_order', {
          parent_id: nodeId, child_ids_json: JSON.stringify(childIds)
        }),
        lastModifiedByHostName: requireDatabaseHostName(driver), updatedAt: now,
        deletedAt: now, syncDirty: true
      });
    }
    rewriteExistingNodeOrder(driver, input.nodeOrder);
    markWorkspaceSearchSourceRevisionQueued(driver);
    markWorkspaceSearchSourceIndexedIfSettled(driver);
  });

  return [];
}
