import { bodyPartNodeId, bodyPartPrefix } from './bodyPartitionIdentity.js';
import type { DatabaseDriver } from './driver.js';
import { loadNodeBodyResolution, NodeBodyUnavailableError } from './nodeBodyResolution.js';

export function readBodyPartIds(driver: DatabaseDriver, nodeId: string) {
  return driver.queryAll<{ id: string }>(
    'SELECT id FROM nodes WHERE parent_id = ? AND id LIKE ? AND deleted_at IS NULL ORDER BY id',
    [nodeId, `${bodyPartPrefix(nodeId)}%`]
  ).map((row) => row.id);
}

export function readPartitionedNodeBody(driver: DatabaseDriver, nodeId: string): string {
  const ids = readBodyPartIds(driver, nodeId);
  const body = loadNodeBodyResolution(driver, nodeId);
  if (!body) throw new NodeBodyUnavailableError([nodeId]);
  return body.content + ids.map((id, index) => {
    if (id !== bodyPartNodeId(nodeId, index)) throw new Error('body_partition_incomplete');
    return readPartitionedNodeBody(driver, id);
  }).join('');
}
