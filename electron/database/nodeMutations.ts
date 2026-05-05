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
import { cleanupOrphanAttachments, createAttachmentCleanupPlan } from './orphanAttachmentCleanup.js';
import { flushDirtyNodeSyncVersions } from './nodeSyncVersions.js';
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
    for (let index = 0; index < nodeIds.length; index += 1) {
      connection.driver.execute(
        `UPDATE nodes
         SET position = ?, updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [index, now, deviceId, nodeIds[index]]
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
  const attachmentCleanupPlan = createAttachmentCleanupPlan(input.nodeIds);
  const affectedParentNodeIds = deleteNodesPermanentlyViaDriver(connection.driver, input);
  withTransaction(connection.driver, () => {
    cleanupOrphanAttachments(connection.driver, attachmentCleanupPlan);
  });
  return affectedParentNodeIds;
}

export function flushAllDirtyNodeSyncVersions() {
  return flushDirtyNodeSyncVersions();
}
