import { adoptVerifiedBodyWithDriver } from '../../lib/core/database/bodyContentWriteWithDriver.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { resolveNodeBody } from '../../lib/core/database/nodeBodyResolution.js';
import { computeNodeSyncHashWithBody } from '../../lib/core/database/nodeSyncHashWithBody.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { loadVerifiedBodyRefWithDriver } from '../../lib/core/database/verifiedBodyWithDriver.js';

import { buildNodeSyncSnapshotFromDriver, computeNodeSyncVersionHashFromDriver,
  loadNodeSyncVersionSourceFromDriver } from './nodeSyncVersionSourceFromDriver.js';

export function prepareNodeSyncVersionFromDriver(driver: DatabaseDriver, nodeId: string,
  now: string, storage: 'continuous' | 'chunked') {
  const row = loadNodeSyncVersionSourceFromDriver(driver, nodeId, storage);
  if (!row || (row.sync_dirty !== 1 && row.current_version_id)) return null;
  if (storage === 'chunked') {
    const ref = row.body_blob_hash ? loadVerifiedBodyRefWithDriver(driver, row.body_blob_hash) : null;
    if (!ref) return null;
    const snapshot = buildNodeSyncSnapshotFromDriver(driver, row, nodeId, ref.hash);
    const contentHash = computeNodeSyncHashWithBody(driver,
      { ...nodeSyncSnapshotHashMetadata(snapshot), textAlternatives: snapshot.text_alternatives }, ref);
    adoptVerifiedBodyWithDriver(driver, ref, now);
    return { row, body: null, contentHash, snapshot };
  }
  const body = resolveNodeBody(row);
  if (body.status === 'unavailable') return null;
  const resolvedRow = { ...row, content: body.content };
  return { row, body: body.content, contentHash: computeNodeSyncVersionHashFromDriver(driver, resolvedRow, nodeId),
    snapshot: buildNodeSyncSnapshotFromDriver(driver, resolvedRow, nodeId) };
}
