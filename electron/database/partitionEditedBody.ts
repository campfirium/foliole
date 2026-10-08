import { loadNodeBodyResolution, NodeBodyUnavailableError } from '../../lib/core/database/nodeBodyResolution.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { expandPartitionedNodeForImport, partitionStoredNodeBody } from '../../lib/core/database/partitionedNodeBodyMutation.js';
import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../../lib/core/nodes/textBodyBudget.js';
import type { NativePartitionBodyMutationArgs } from '../../lib/platform/nativeNodeMutationContract.js';
import { buildPersistedNodeMutationPatch } from '../import/importNodeMutationPatch.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersions.js';

export function partitionEditedBody(input: NativePartitionBodyMutationArgs) {
  if (utf8ByteLength(input.content) <= TEXT_BODY_MAX_BYTES) throw new Error('body_partition_not_required');
  const { driver } = openDatabaseConnection();
  const now = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(now);
  return driver.transaction(() => {
    const node = driver.queryOne<{ kind: string }>('SELECT kind FROM nodes WHERE id = ? AND deleted_at IS NULL', [input.sourceNodeId]);
    if (!node || node.kind !== 'topic') throw new Error('body_partition_source_missing');
    const body = loadNodeBodyResolution(driver, input.sourceNodeId);
    if (!body || body.status === 'unavailable') throw new NodeBodyUnavailableError([input.sourceNodeId]);
    if (body.content !== input.expectedContent) throw new Error('body_partition_source_changed');
    const previous = readPartitionedNodeBody(driver, input.sourceNodeId);
    const content = input.content + previous.slice(body.content.length);
    expandPartitionedNodeForImport(driver, input.sourceNodeId, now);
    const change = applyParentContentChange({ driver, nodeId: input.sourceNodeId, nextContent: content, updatedAt: now });
    const ids = partitionStoredNodeBody(driver, input.sourceNodeId, now);
    const affected = driver.queryAll<{ id: string }>(
      'SELECT id FROM nodes WHERE parent_id = ? OR parent_id IN (SELECT id FROM nodes WHERE parent_id = ?)',
      [input.sourceNodeId, input.sourceNodeId]).map((row) => row.id);
    const updatedNodeIds = [...new Set([input.sourceNodeId, ...affected, ...change.affectedChildIds])];
    for (const id of updatedNodeIds) flushNodeSyncVersionWithDriver(driver, id, hostName, now);
    const patch = buildPersistedNodeMutationPatch(driver, updatedNodeIds);
    return { ...patch, activeNodeId: ids[0] ?? input.sourceNodeId, createdNodeIds: ids, updatedNodeIds };
  });
}
