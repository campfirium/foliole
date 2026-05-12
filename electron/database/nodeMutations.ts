import {
  clearNodeOrder as clearNodeOrderViaDriver,
  deleteNodesPermanently as deleteNodesPermanentlyViaDriver,
  replaceNodeOrder as replaceNodeOrderViaDriver,
  restoreNodes as restoreNodesViaDriver,
  softDeleteNodes as softDeleteNodesViaDriver,
  updateNodeAnchorLinks as updateNodeAnchorLinksViaDriver,
  upsertNodeSnapshot as upsertNodeSnapshotViaDriver
} from '../../lib/core/database/nodeMutations.js';
import type {
  DeleteNodesPermanentlyInput,
  RestoreNodesInput,
  SoftDeleteNodesInput,
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
} from '../../lib/core/database/nodeMutations.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { markKeepImportItemsLocallyDeletedByNodeDeletedAt } from './keepImportItems.js';
import { flushDirtyNodeSyncVersions, flushNodeSyncVersion } from './nodeSyncVersions.js';
import { cleanupOrphanAttachments, createAttachmentCleanupPlan } from './orphanAttachmentCleanup.js';
import { withTransaction } from './transaction.js';

export type {
  DeleteNodesPermanentlyInput,
  RestoreNodesInput,
  SoftDeleteNodesInput,
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
};

export function upsertNodeSnapshot(input: UpsertNodeSnapshotInput): void {
  upsertNodeSnapshotViaDriver(openDatabaseConnection().driver, {
    ...input,
    deviceId: loadOrCreateDesktopDeviceId(input.updatedAt)
  });
}

export function upsertNodeSnapshots(inputs: UpsertNodeSnapshotInput[]): void {
  const connection = openDatabaseConnection();
  withTransaction(connection.driver, () => {
    inputs.forEach((input) => {
      upsertNodeSnapshotViaDriver(connection.driver, {
        ...input,
        deviceId: loadOrCreateDesktopDeviceId(input.updatedAt)
      });
    });
  });
}

export function replaceNodeOrder(nodeIds: string[]): void {
  const connection = openDatabaseConnection();
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  withTransaction(connection.driver, () => {
    replaceNodeOrderViaDriver(connection.driver, nodeIds);
    const folderOrderRows = connection.driver.queryAll<{ node_id: string }>(
      'SELECT node_id FROM node_order ORDER BY position ASC'
    );
    for (const row of folderOrderRows) {
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [deviceId, row.node_id]
      );
    }
  });
}

export function updateNodeAnchorLinks(inputs: UpdateNodeAnchorLinkInput[]): void {
  updateNodeAnchorLinksViaDriver(openDatabaseConnection().driver, inputs);
}

export function clearNodeOrder(): void {
  clearNodeOrderViaDriver(openDatabaseConnection().driver);
}

export function softDeleteNodes(input: SoftDeleteNodesInput): void {
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(input.deletedAt);
  for (const nodeId of input.nodeIds) {
    flushNodeSyncVersion(nodeId, input.deletedAt);
  }
  withTransaction(connection.driver, () => {
    softDeleteNodesViaDriver(connection.driver, input);
    for (const nodeId of input.nodeIds) {
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [deviceId, nodeId]
      );
    }
  });
  for (const nodeId of input.nodeIds) {
    flushNodeSyncVersion(nodeId, input.deletedAt);
  }
}

export function restoreNodes(input: RestoreNodesInput): void {
  const connection = openDatabaseConnection();
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  withTransaction(connection.driver, () => {
    restoreNodesViaDriver(connection.driver, input);
    for (const nodeId of input.nodeIds) {
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [deviceId, nodeId]
      );
    }
  });
}

export function deleteNodesPermanently(input: DeleteNodesPermanentlyInput): string[] {
  const connection = openDatabaseConnection();
  const deletedAt = new Date().toISOString();
  const attachmentCleanupPlan = createAttachmentCleanupPlan(input.nodeIds);
  const nodeDeletedAt = readNodeDeletedAtForPermanentDelete(input.nodeIds, deletedAt);
  markKeepImportItemsLocallyDeletedByNodeDeletedAt(nodeDeletedAt);
  const affectedParentNodeIds = deleteNodesPermanentlyViaDriver(connection.driver, input);
  withTransaction(connection.driver, () => {
    cleanupOrphanAttachments(connection.driver, attachmentCleanupPlan);
  });
  return affectedParentNodeIds;
}

function readNodeDeletedAtForPermanentDelete(nodeIds: string[], fallbackDeletedAt: string) {
  if (nodeIds.length === 0) {
    return [];
  }
  const placeholders = nodeIds.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<{ deleted_at: string | null; id: string }>(
    `SELECT id, deleted_at
     FROM nodes
     WHERE id IN (${placeholders})`,
    nodeIds
  );
  return rows.map((row) => ({
    deletedAt: row.deleted_at ?? fallbackDeletedAt,
    nodeId: row.id
  }));
}

export function flushAllDirtyNodeSyncVersions() {
  return flushDirtyNodeSyncVersions();
}
