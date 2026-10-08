import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { resolveNodeBody } from '../../lib/core/database/nodeBodyResolution.js';

import { buildNodeSyncSnapshotFromDriver, computeNodeSyncVersionHashFromDriver,
  loadNodeSyncVersionSourceFromDriver } from './nodeSyncVersionSourceFromDriver.js';

export function prepareNodeSyncVersionFromDriver(driver: DatabaseDriver, nodeId: string) {
  const row = loadNodeSyncVersionSourceFromDriver(driver, nodeId);
  if (!row || (row.sync_dirty !== 1 && row.current_version_id)) return null;
  const body = resolveNodeBody(row);
  const resolvedRow = { ...row, content: body.content };
  return { row, body: body.content, contentHash: computeNodeSyncVersionHashFromDriver(driver, resolvedRow, nodeId),
    snapshot: buildNodeSyncSnapshotFromDriver(driver, resolvedRow, nodeId) };
}
