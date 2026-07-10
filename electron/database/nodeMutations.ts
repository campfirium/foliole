import {
  deleteNodesPermanently as deleteNodesPermanentlyViaDriver,
  moveNodes as moveNodesViaDriver,
  replaceNodeOrder as replaceNodeOrderViaDriver,
  restoreNodes as restoreNodesViaDriver,
  softDeleteNodes as softDeleteNodesViaDriver,
  updateNodeAnchorLinks as updateNodeAnchorLinksViaDriver,
  upsertNodeSnapshot as upsertNodeSnapshotViaDriver
} from '../../lib/core/database/nodeMutations.js';
import type {
  DeleteNodesPermanentlyInput,
  MoveNodesInput,
  MoveNodesResult,
  RestoreNodesInput,
  RestoreNodesResult,
  SoftDeleteNodesInput,
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
} from '../../lib/core/database/nodeMutations.js';
import type { UpsertNodeSnapshotOptions } from '../../lib/core/database/nodeMutations.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { markKeepImportItemsLocallyDeletedByNodeDeletedAt } from './keepImportItems.js';
import { flushDirtyNodeSyncVersions, flushNodeSyncVersion } from './nodeSyncVersions.js';
import {
  cleanupOrphanAttachments,
  createAttachmentCleanupPlan,
  deleteAttachmentFiles
} from './orphanAttachmentCleanup.js';
import {
  clearNodeSourceDisposition,
  recordNodeSourceDisposition
} from './sourceDispositionStates.js';
import { withTransaction } from './transaction.js';

export type {
  DeleteNodesPermanentlyInput,
  MoveNodesInput,
  MoveNodesResult,
  RestoreNodesInput,
  RestoreNodesResult,
  SoftDeleteNodesInput,
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
};

export function upsertNodeSnapshot(input: UpsertNodeSnapshotInput, options: UpsertNodeSnapshotOptions = {}): void {
  upsertNodeSnapshotViaDriver(openDatabaseConnection().driver, {
    ...input,
    deviceId: loadOrCreateDesktopDeviceId(input.updatedAt)
  }, options);
  if ('reading' in input) {
    if (input.reading?.state === 'dismissed') {
      recordNodeSourceDisposition(input.nodeId, 'dismissed', input.updatedAt);
    } else {
      clearNodeSourceDisposition(input.nodeId);
    }
  }
}

export function upsertNodeSnapshotWithOrder(input: UpsertNodeSnapshotInput, nodeOrder: string[]): void {
  const connection = openDatabaseConnection();
  withTransaction(connection.driver, () => {
    upsertNodeSnapshotViaDriver(connection.driver, {
      ...input,
      deviceId: loadOrCreateDesktopDeviceId(input.updatedAt)
    });
    replaceNodeOrderViaDriver(connection.driver, nodeOrder);
  });
  if ('reading' in input) {
    if (input.reading?.state === 'dismissed') {
      recordNodeSourceDisposition(input.nodeId, 'dismissed', input.updatedAt);
    } else {
      clearNodeSourceDisposition(input.nodeId);
    }
  }
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

export function moveNodes(input: MoveNodesInput): MoveNodesResult {
  const connection = openDatabaseConnection();
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  return withTransaction(connection.driver, () => {
    const result = moveNodesViaDriver(connection.driver, {
      nodeOrder: input.nodeOrder,
      nodes: input.nodes.map((node) => ({ ...node, deviceId }))
    });
    for (const node of input.nodes) {
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [deviceId, node.nodeId]
      );
    }
    return result;
  });
}

export function updateNodeAnchorLinks(inputs: UpdateNodeAnchorLinkInput[]): void {
  updateNodeAnchorLinksViaDriver(openDatabaseConnection().driver, inputs);
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
      recordNodeSourceDisposition(nodeId, 'soft_deleted', input.deletedAt);
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

export function restoreNodes(input: RestoreNodesInput): RestoreNodesResult {
  const connection = openDatabaseConnection();
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  return withTransaction(connection.driver, () => {
    const result = restoreNodesViaDriver(connection.driver, input);
    for (const nodeId of result.restoredNodeIds) {
      clearNodeSourceDisposition(nodeId);
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [deviceId, nodeId]
      );
    }
    return result;
  });
}

export function deleteNodesPermanently(input: DeleteNodesPermanentlyInput): string[] {
  const connection = openDatabaseConnection();
  const deletedAt = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(deletedAt);
  const attachmentCleanupPlan = createAttachmentCleanupPlan(input.nodeIds);
  const nodeDeletedAt = readNodeDeletedAtForPermanentDelete(input.nodeIds, deletedAt);
  for (const row of nodeDeletedAt) {
    recordNodeSourceDisposition(row.nodeId, 'hard_deleted', row.deletedAt);
  }
  markKeepImportItemsLocallyDeletedByNodeDeletedAt(nodeDeletedAt);
  withTransaction(connection.driver, () => {
    for (const nodeId of input.nodeIds) {
      connection.driver.execute(
        `UPDATE nodes
         SET deleted_at = ?, updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [deletedAt, deletedAt, deviceId, nodeId]
      );
    }
  });
  for (const nodeId of input.nodeIds) {
    flushNodeSyncVersion(nodeId, deletedAt);
  }
  const affectedParentNodeIds = deleteNodesPermanentlyViaDriver(connection.driver, {
    ...input,
    deletedAt
  });
  const attachmentFilesToDelete = withTransaction(connection.driver, () => {
    return cleanupOrphanAttachments(connection.driver, attachmentCleanupPlan);
  });
  deleteAttachmentFiles(attachmentFilesToDelete);
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
