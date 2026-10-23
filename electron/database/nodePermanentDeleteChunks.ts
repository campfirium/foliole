import { deleteNodesPermanentlyDeferringBodies } from '../../lib/core/database/nodeMutations.js';
import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { assertFoliolePublishedDeleteAllowed } from '../foliolePublish/foliolePublishManagement.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { markKeepImportItemsLocallyDeletedByNodeDeletedAt } from './keepImportItems.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';
import { cleanupOrphanAttachments, createAttachmentCleanupPlan } from './orphanAttachmentCleanup.js';
import { recordNodeSourceDisposition } from './sourceDispositionStates.js';
import { withTransaction } from './transaction.js';

export interface PermanentDeletePlan {
  attachmentCleanupPlan: ReturnType<typeof createAttachmentCleanupPlan>;
  /** Parents precede their descendants; chunks are taken from the end. */
  nodeIds: string[];
}

export function preparePermanentDelete(nodeIds: string[]): PermanentDeletePlan {
  assertFoliolePublishedDeleteAllowed(nodeIds);
  return {
    attachmentCleanupPlan: createAttachmentCleanupPlan(nodeIds),
    nodeIds: orderParentsFirst(nodeIds)
  };
}

/** Splits the plan so every chunk only removes nodes whose selected descendants are already gone. */
export function splitPermanentDeleteChunks(plan: PermanentDeletePlan, chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let end = plan.nodeIds.length; end > 0; end -= chunkSize) {
    chunks.push(plan.nodeIds.slice(Math.max(0, end - chunkSize), end));
  }
  return chunks;
}

/** Removes one chunk and returns the text body hashes it released. */
export function deletePermanentDeleteChunk(nodeIds: string[]): string[] {
  const connection = openDatabaseConnection();
  const deletedAt = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(deletedAt);
  const nodeDeletedAt = readNodeDeletedAt(nodeIds, deletedAt);
  for (const row of nodeDeletedAt) {
    recordNodeSourceDisposition(row.nodeId, 'hard_deleted', row.deletedAt);
  }
  markKeepImportItemsLocallyDeletedByNodeDeletedAt(nodeDeletedAt);
  withTransaction(connection.driver, () => {
    for (const nodeId of nodeIds) {
      connection.driver.execute(
        `UPDATE nodes
         SET deleted_at = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1
         WHERE id = ?`,
        [deletedAt, deletedAt, hostName, nodeId]
      );
    }
  });
  for (const nodeId of nodeIds) {
    flushNodeSyncVersion(nodeId, deletedAt);
  }
  return deleteNodesPermanentlyDeferringBodies(connection.driver, { deletedAt, nodeIds });
}

export function finishPermanentDelete(plan: PermanentDeletePlan, nodeOrder: string[]) {
  const { driver } = openDatabaseConnection();
  withTransaction(driver, () => {
    rewriteExistingNodeOrder(driver, nodeOrder);
    return cleanupOrphanAttachments(driver, plan.attachmentCleanupPlan);
  });
}

function orderParentsFirst(nodeIds: string[]) {
  const selected = new Set(nodeIds);
  const parents = new Map(readParentRows(nodeIds).map((row) => [row.id, row.parent_id]));
  const depth = new Map<string, number>();
  const depthOf = (nodeId: string): number => {
    const known = depth.get(nodeId);
    if (known !== undefined) return known;
    depth.set(nodeId, 0);
    const parentId = parents.get(nodeId);
    const value = parentId && selected.has(parentId) ? depthOf(parentId) + 1 : 0;
    depth.set(nodeId, value);
    return value;
  };
  return [...nodeIds].sort((left, right) => depthOf(left) - depthOf(right));
}

function readParentRows(nodeIds: string[]) {
  if (nodeIds.length === 0) return [];
  const placeholders = nodeIds.map(() => '?').join(', ');
  return openDatabaseConnection().driver.queryAll<{ id: string; parent_id: string | null }>(
    `SELECT id, parent_id FROM nodes WHERE id IN (${placeholders})`,
    nodeIds
  );
}

function readNodeDeletedAt(nodeIds: string[], fallbackDeletedAt: string) {
  if (nodeIds.length === 0) return [];
  const placeholders = nodeIds.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<{ deleted_at: string | null; id: string }>(
    `SELECT id, deleted_at FROM nodes WHERE id IN (${placeholders})`,
    nodeIds
  );
  return rows.map((row) => ({ deletedAt: row.deleted_at ?? fallbackDeletedAt, nodeId: row.id }));
}
