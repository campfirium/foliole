import { openDatabaseConnection } from './connection.js';
import {
  buildNodeSyncSnapshotFromDriver,
  computeNodeSyncVersionHashFromDriver,
  loadNodeSyncVersionSourceFromDriver,
  type NodeSyncVersionSourceRow
} from './nodeSyncVersionSourceFromDriver.js';

export type { NodeSyncVersionSourceRow };

export function loadNodeSyncVersionSource(nodeId: string) {
  return loadNodeSyncVersionSourceFromDriver(openDatabaseConnection().driver, nodeId);
}

export function buildNodeSyncSnapshot(row: NodeSyncVersionSourceRow, nodeId: string) {
  return buildNodeSyncSnapshotFromDriver(openDatabaseConnection().driver, row, nodeId);
}

export function computeNodeSyncVersionHash(row: NodeSyncVersionSourceRow, nodeId: string) {
  return computeNodeSyncVersionHashFromDriver(openDatabaseConnection().driver, row, nodeId);
}
