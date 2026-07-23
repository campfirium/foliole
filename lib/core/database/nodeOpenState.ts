import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export interface NodeOpenState {
  lastOpenedAt: string;
  nodeId: string;
}

interface NodeOpenStateRow extends DatabaseRow {
  last_opened_at: string;
  node_id: string;
}

function normalizeTimestamp(value: string) {
  const trimmed = value.trim();
  return trimmed && Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
}

export function loadNodeOpenStateById(driver: DatabaseDriver) {
  const result: Record<string, NodeOpenState | undefined> = {};
  const rows = driver.queryAll<NodeOpenStateRow>(
    'SELECT node_id, last_opened_at FROM node_open_state'
  );
  for (const row of rows) {
    const lastOpenedAt = normalizeTimestamp(row.last_opened_at);
    if (lastOpenedAt) result[row.node_id] = { lastOpenedAt, nodeId: row.node_id };
  }
  return result;
}

export function writeNodeOpenStateWithSync(driver: DatabaseDriver, input: {
  deviceId: string;
  lastOpenedAt: string;
  nodeId: string;
}) {
  return driver.transaction(() => writeNodeOpenStateInTransaction(driver, input));
}

function writeNodeOpenStateInTransaction(driver: DatabaseDriver, input: {
  deviceId: string;
  lastOpenedAt: string;
  nodeId: string;
}) {
  const nodeId = input.nodeId.trim();
  const lastOpenedAt = normalizeTimestamp(input.lastOpenedAt);
  if (!nodeId || !lastOpenedAt) return null;
  const existing = driver.queryOne<NodeOpenStateRow>(
    'SELECT node_id, last_opened_at FROM node_open_state WHERE node_id = ?',
    [nodeId]
  );
  if (existing && existing.last_opened_at >= lastOpenedAt) {
    return { lastOpenedAt: existing.last_opened_at, nodeId };
  }
  driver.execute(
    `INSERT INTO node_open_state (node_id, last_opened_at) VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET last_opened_at = excluded.last_opened_at
     WHERE excluded.last_opened_at > node_open_state.last_opened_at`,
    [nodeId, lastOpenedAt]
  );
  const payload = { last_opened_at: lastOpenedAt, node_id: nodeId };
  upsertSyncObjectState(driver, {
    contentHash: computeSyncContentHash('node_open_state', payload),
    lastModifiedByDeviceId: input.deviceId,
    objectId: nodeId,
    objectType: 'node_open_state',
    syncDirty: true,
    updatedAt: lastOpenedAt
  });
  return { lastOpenedAt, nodeId };
}
