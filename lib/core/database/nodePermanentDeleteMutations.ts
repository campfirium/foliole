import type { DatabaseDriver } from './driver.js';
import { rewriteExistingNodeOrder } from './nodeOrderMutations.js';
import { writeNodeSyncTombstonesForPermanentDelete } from './nodeSyncTombstones.js';
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
  const deleteNodeReadingDeviceStateStatement = driver.prepare('DELETE FROM node_reading_device_state WHERE node_id = ?');
  const deleteNodeOrderStatement = driver.prepare('DELETE FROM node_order WHERE node_id = ?');
  const deleteNodeTextAlternativesStatement = driver.prepare('DELETE FROM node_text_alternatives WHERE node_id = ?');
  const deleteNodeOpenSyncStateStatement = driver.prepare(
    "DELETE FROM sync_object_state WHERE object_type = 'node_open_state' AND object_id = ?"
  );
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  driver.transaction(() => {
    advanceWorkspaceSearchSourceRevision(driver);
    writeNodeSyncTombstonesForPermanentDelete(driver, input.nodeIds, input.deletedAt);
    deleteWorkspaceSearchIndexForExistingSubtreeRootIds(driver, input.nodeIds);
    for (const nodeId of input.nodeIds) {
      deleteReviewLogStatement.run([nodeId]);
      deleteNodeReviewStatement.run([nodeId]);
      deleteNodeReadingStatement.run([nodeId]);
      deleteNodeReadingDeviceStateStatement.run([nodeId]);
      deleteNodeOrderStatement.run([nodeId]);
      deleteNodeTextAlternativesStatement.run([nodeId]);
      deleteNodeOpenSyncStateStatement.run([nodeId]);
    }
    for (const nodeId of [...input.nodeIds].reverse()) {
      deleteNodeStatement.run([nodeId]);
    }
    rewriteExistingNodeOrder(driver, input.nodeOrder);
    markWorkspaceSearchSourceRevisionQueued(driver);
    markWorkspaceSearchSourceIndexedIfSettled(driver);
  });

  return [];
}
