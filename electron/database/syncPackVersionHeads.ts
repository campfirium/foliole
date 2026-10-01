import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import type { NodePackRow } from './syncPackRows.js';
import type { SyncPackTombstoneRow } from './syncPackTombstoneRows.js';

export type VersionHead = Pick<NodePackRow, 'id' | 'current_version_id'>;

export function syncPackVersionHeads(driver: DatabaseDriver, nodes: VersionHead[], tombstones: SyncPackTombstoneRow[]) {
  const ids = new Set(nodes.map(node => node.id));
  return [...nodes, ...tombstones.flatMap(tomb => {
    if (ids.has(tomb.node_id) || !driver.queryOne(
      'SELECT 1 FROM node_sync_versions WHERE object_id = ? AND version_id = ?', [tomb.node_id, tomb.version_id])) return [];
    return [{ id: tomb.node_id, current_version_id: tomb.version_id }];
  })];
}
