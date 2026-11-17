import type { DatabaseDriver } from './driver.js';
import { recordNodeRelatedStateDeletion, retireUnversionedDeletedNodeState } from './nodeRelatedStateDeletion.js';
import { writeNodeSyncTombstonesForPermanentDelete } from './nodeSyncTombstones.js';
import { DELETE_NODE_SEARCH_PENDING_SQL } from './searchPendingState.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';
import {
  advanceWorkspaceSearchSourceRevision,
  markWorkspaceSearchSourceIndexedIfSettled,
  markWorkspaceSearchSourceRevisionQueued
} from './workspaceSearchSourceState.js';
import { deleteWorkspaceSearchIndexForExistingSubtreeRootIds } from './workspaceSearchSubtreeIndex.js';

export interface DeleteNodesPermanentlyInput {
  deletedAt?: string;
  nodeIds: string[];
}

export function deleteNodesPermanently(driver: DatabaseDriver, input: DeleteNodesPermanentlyInput): string[] {
  const released = deleteNodesPermanentlyDeferringBodies(driver, input);
  // Stored text bodies no longer referenced by anything are removed with the deletion.
  if (released.length) collectTextBodyBlobCandidates(driver, released);
  return [];
}

/** Deletes rows and returns released body hashes. */
export function deleteNodesPermanentlyDeferringBodies(
  driver: DatabaseDriver,
  input: DeleteNodesPermanentlyInput
): string[] {
  const deleteReviewLogStatement = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReviewStatement = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingHostStateStatement = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');
  const deleteNodeTextAlternativesStatement = driver.prepare('DELETE FROM node_text_alternatives WHERE node_id = ?');
  const deleteNodeOwnedSyncStateStatement = driver.prepare(
    "DELETE FROM sync_object_state WHERE object_type IN ('node_open_state', 'node_reading_resume', 'parent_child_order') AND object_id = ?"
  );
  const deleteParentOrder = driver.prepare('DELETE FROM parent_order_sources WHERE parent_id = ?');
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  return driver.transaction(() => {
    const now = input.deletedAt ?? new Date().toISOString();
    advanceWorkspaceSearchSourceRevision(driver);
    const hashes = writeNodeSyncTombstonesForPermanentDelete(driver, input.nodeIds, now);
    const searchTablesReady = deleteWorkspaceSearchIndexForExistingSubtreeRootIds(driver, input.nodeIds);
    for (const nodeId of input.nodeIds) {
      recordNodeRelatedStateDeletion(driver, nodeId, now);
      retireUnversionedDeletedNodeState(driver, nodeId);
      deleteReviewLogStatement.run([nodeId]);
      deleteNodeReviewStatement.run([nodeId]);
      deleteNodeReadingStatement.run([nodeId]);
      deleteNodeReadingHostStateStatement.run([nodeId]);
      deleteNodeTextAlternativesStatement.run([nodeId]);
      deleteNodeOwnedSyncStateStatement.run([nodeId]);
      deleteParentOrder.run([nodeId]);
    }
    for (const nodeId of [...input.nodeIds].reverse()) {
      deleteNodeStatement.run([nodeId]);
      driver.execute(DELETE_NODE_SEARCH_PENDING_SQL, [nodeId]);
    }
    markWorkspaceSearchSourceRevisionQueued(driver);
    // Missing search tables are rebuilt by normal initialization from the remaining main rows.
    if (searchTablesReady) markWorkspaceSearchSourceIndexedIfSettled(driver);
    return hashes;
  });
}
