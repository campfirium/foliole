import type { PersistedNodeViewState } from '../../platform/persistedNodeViewState.js';
import { normalizeNodeViewStateWriteSource } from '../../platform/persistedNodeViewState.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { loadDatabaseHostName } from './syncHostIdentity.js';

interface NodeViewStateSnapshotRow extends DatabaseRow {
  node_id: string;
  scroll_top: number;
  selection_from: number | null;
  selection_to: number | null;
  source?: string | null;
  updated_at: string;
}

function queryPersistedNodeViewRows(driver: DatabaseDriver): NodeViewStateSnapshotRow[] {
  const hostName = loadDatabaseHostName(driver);
  if (!hostName) {
    return [];
  }
  return driver.queryAll<NodeViewStateSnapshotRow>(
    `SELECT
       node_id,
       scroll_top,
       selection_from,
       selection_to,
       source,
       updated_at
     FROM node_view_state
     WHERE host_name = ?`,
    [hostName]
  );
}

export function loadPersistedNodeViewById(driver: DatabaseDriver) {
  const persistedNodeViewById: Record<string, PersistedNodeViewState | undefined> = {};
  for (const row of queryPersistedNodeViewRows(driver)) {
    persistedNodeViewById[row.node_id] = {
      nodeId: row.node_id,
      scrollTop: row.scroll_top,
      selectionFrom: row.selection_from,
      selectionTo: row.selection_to,
      source: normalizeNodeViewStateWriteSource(row.source),
      updatedAt: row.updated_at
    };
  }
  return persistedNodeViewById;
}
