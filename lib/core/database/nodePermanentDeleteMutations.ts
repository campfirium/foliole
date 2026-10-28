import { projectStoredParentOrder } from './currentParentOrderStore.js';
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

/** Deletes rows and returns released body hashes; membership triggers update the affected parent projections. */
export function deleteNodesPermanentlyDeferringBodies(
  driver: DatabaseDriver,
  input: DeleteNodesPermanentlyInput
): string[] {
  const deleteReviewLogStatement = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReviewStatement = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingHostStateStatement = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');
  const deleteNodeTextAlternativesStatement = driver.prepare('DELETE FROM node_text_alternatives WHERE node_id = ?');
  const deleteNodeOpenSyncStateStatement = driver.prepare(
    "DELETE FROM sync_object_state WHERE object_type = 'node_open_state' AND object_id = ?"
  );
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  return driver.transaction(() => {
    const now = input.deletedAt ?? new Date().toISOString();
    const parents = driver.queryAll<{ parent_id: string }>(
      `SELECT DISTINCT COALESCE(parent_id, 'parent-child-order:root') AS parent_id FROM nodes
       WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(input.nodeIds)]);
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
      deleteNodeOpenSyncStateStatement.run([nodeId]);
    }
    for (const nodeId of [...input.nodeIds].reverse()) {
      deleteNodeStatement.run([nodeId]);
      driver.execute(DELETE_NODE_SEARCH_PENDING_SQL, [nodeId]);
    }
    for (const { parent_id } of parents) projectStoredParentOrder(driver, parent_id, now);
    markWorkspaceSearchSourceRevisionQueued(driver);
    // Missing search tables are rebuilt by normal initialization from the remaining main rows.
    if (searchTablesReady) markWorkspaceSearchSourceIndexedIfSettled(driver);
    return hashes;
  });
}
