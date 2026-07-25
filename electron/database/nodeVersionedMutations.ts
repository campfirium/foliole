import type { UpsertNodeSnapshotOptions } from '../../lib/core/database/nodeMutations.js';
import type {
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
} from '../../lib/core/database/nodeMutations.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import {
  updateNodeAnchorLinks,
  upsertNodeSnapshot,
  upsertNodeSnapshotWithOrder
} from './nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { withTransaction } from './transaction.js';

function flushVersion(driver: ReturnType<typeof openDatabaseConnection>['driver'], nodeId: string, deviceId: string, now: string) {
  return flushNodeSyncVersionWithDriver(driver, nodeId, deviceId, now);
}

export function upsertVersionedNodeSnapshot(
  input: UpsertNodeSnapshotInput,
  options: UpsertNodeSnapshotOptions = {}
): void {
  const driver = openDatabaseConnection().driver;
  const deviceId = loadOrCreateDesktopDeviceId(input.updatedAt);
  withTransaction(driver, () => {
    upsertNodeSnapshot(input, options);
    flushVersion(driver, input.nodeId, deviceId, input.updatedAt);
  });
}

export function upsertVersionedNodeSnapshotWithOrder(input: UpsertNodeSnapshotInput, nodeOrder: string[]): void {
  const driver = openDatabaseConnection().driver;
  const deviceId = loadOrCreateDesktopDeviceId(input.updatedAt);
  withTransaction(driver, () => {
    upsertNodeSnapshotWithOrder(input, nodeOrder);
    flushVersion(driver, input.nodeId, deviceId, input.updatedAt);
  });
}

export function upsertVersionedNodeContentWithAnchors(
  parent: UpsertNodeSnapshotInput,
  affectedAnchors: UpdateNodeAnchorLinkInput[],
  options: UpsertNodeSnapshotOptions = {}
): void {
  const driver = openDatabaseConnection().driver;
  const deviceId = loadOrCreateDesktopDeviceId(parent.updatedAt);
  withTransaction(driver, () => {
    upsertNodeSnapshot(parent, options);
    updateNodeAnchorLinks(affectedAnchors);
    flushVersion(driver, parent.nodeId, deviceId, parent.updatedAt);
    for (const anchor of affectedAnchors) {
      driver.execute(
        `UPDATE nodes SET last_modified_by_device_id = ?, sync_dirty = 1 WHERE id = ?`,
        [deviceId, anchor.nodeId]
      );
      flushVersion(driver, anchor.nodeId, deviceId, anchor.updatedAt);
    }
  });
}
