import {
  replaceNodeOrder as replaceNodeOrderViaDriver,
  upsertNodeSnapshot as upsertNodeSnapshotViaDriver
} from '../../lib/core/database/nodeMutations.js';
import type { NativeSplitTopicMutationArgs } from '../../lib/platform/nativeNodeMutationContract.js';
import { assertFoliolePublishedDeleteAllowed } from '../foliolePublish/foliolePublishManagement.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersions.js';
import { recordNodeSourceDispositionWithDriver } from './sourceDispositionStates.js';
import { withTransaction } from './transaction.js';

function assertSourceNodeExists(sourceNodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>(
    'SELECT id FROM nodes WHERE id = ?',
    [sourceNodeId]
  );
  if (!row) {
    throw new Error('split topic source node not found');
  }
}

export function splitTopic(input: NativeSplitTopicMutationArgs) {
  assertFoliolePublishedDeleteAllowed([input.sourceNodeId]);
  assertSourceNodeExists(input.sourceNodeId);
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(input.deletedAt);
  const generatedNodeIds = input.generatedNodes.map((node) => node.nodeId);
  withTransaction(connection.driver, () => {
    for (const node of input.generatedNodes) {
      upsertNodeSnapshotViaDriver(connection.driver, { ...node, deviceId });
      flushNodeSyncVersionWithDriver(connection.driver, node.nodeId, deviceId, node.updatedAt);
    }
    replaceNodeOrderViaDriver(connection.driver, input.nodeOrder);
    connection.driver.execute(
      `UPDATE nodes
       SET deleted_at = ?, updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
       WHERE id = ?`,
      [input.deletedAt, input.deletedAt, deviceId, input.sourceNodeId]
    );
    recordNodeSourceDispositionWithDriver(connection.driver, input.sourceNodeId, 'soft_deleted', input.deletedAt);
    flushNodeSyncVersionWithDriver(connection.driver, input.sourceNodeId, deviceId, input.deletedAt);
  });
  return {
    activeNodeId: input.activeNodeId,
    createdNodeIds: generatedNodeIds,
    deletedNodeIds: [input.sourceNodeId],
    nodeOrder: input.nodeOrder,
    nodes: input.generatedNodes
  };
}
