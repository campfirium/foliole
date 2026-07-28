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

function assertSourceNodeMatches(input: NativeSplitTopicMutationArgs) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM nodes WHERE id = ?',
    [input.sourceNodeId]
  );
  if (!row) {
    throw new Error('split topic source node not found');
  }
  if (row.parent_id !== input.sourceParentNodeId) throw new Error('split topic source parent mismatch');
}

export function splitTopic(input: NativeSplitTopicMutationArgs) {
  if (input.disposition === 'replace') assertFoliolePublishedDeleteAllowed([input.sourceNodeId]);
  assertSourceNodeMatches(input);
  const expectedParentNodeId = input.disposition === 'replace' ? input.sourceParentNodeId : input.sourceNodeId;
  if (input.generatedNodes.some((node) => node.parentNodeId !== expectedParentNodeId)) {
    throw new Error('split topic generated parent mismatch');
  }
  const connection = openDatabaseConnection();
  const mutationAt = input.disposition === 'replace' ? input.deletedAt : input.generatedNodes[0]!.updatedAt;
  const deviceId = loadOrCreateDesktopDeviceId(mutationAt);
  const generatedNodeIds = input.generatedNodes.map((node) => node.nodeId);
  withTransaction(connection.driver, () => {
    for (const node of input.generatedNodes) {
      upsertNodeSnapshotViaDriver(connection.driver, { ...node, deviceId });
      flushNodeSyncVersionWithDriver(connection.driver, node.nodeId, deviceId, node.updatedAt);
    }
    replaceNodeOrderViaDriver(connection.driver, input.nodeOrder);
    if (input.disposition === 'replace') {
      connection.driver.execute(
        `UPDATE nodes
         SET deleted_at = ?, updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
         WHERE id = ?`,
        [input.deletedAt, input.deletedAt, deviceId, input.sourceNodeId]
      );
      recordNodeSourceDispositionWithDriver(connection.driver, input.sourceNodeId, 'soft_deleted', input.deletedAt);
      flushNodeSyncVersionWithDriver(connection.driver, input.sourceNodeId, deviceId, input.deletedAt);
    }
  });
  return {
    activeNodeId: input.activeNodeId,
    createdNodeIds: generatedNodeIds,
    deletedNodeIds: input.disposition === 'replace' ? [input.sourceNodeId] : [],
    nodeOrder: input.nodeOrder,
    nodes: input.generatedNodes
  };
}
