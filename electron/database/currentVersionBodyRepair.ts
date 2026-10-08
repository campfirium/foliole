import { randomUUID } from 'node:crypto';

import { hashTextBody } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody } from '../../lib/core/database/nodeBodyResolution.js';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs.js';
import { storedSyncNodeVersionBody, type StoredSyncNodeVersionRow } from '../../lib/core/sync/syncNodeGraph.js';

import { upsertNodeSyncState } from './nodeSyncStateRows.js';
import {
  buildNodeSyncSnapshotFromDriver, computeNodeSyncVersionHashFromDriver,
  loadNodeSyncVersionSourceFromDriver, type NodeSyncVersionSourceRow
} from './nodeSyncVersionSourceFromDriver.js';

export interface CurrentVersionBodyRepairInput {
  nodeId: string;
  expectedVersionId: string;
  expectedBodyBlobHash: string;
  hostName: string;
  now: string;
}

/** Explicit repair of one inspected node; never changes or collects old version facts. */
export function repairCurrentVersionBodyWithDriver(driver: DatabaseDriver, input: CurrentVersionBodyRepairInput) {
  return driver.transaction(() => {
    const row = loadNodeSyncVersionSourceFromDriver(driver, input.nodeId);
    if (!row?.current_version_id) throw new Error('current_body_repair_node_unavailable');
    const body = requireResolvedNodeBody(row);
    if (!body.bodyBlobHash || hashTextBody(body.content) !== body.bodyBlobHash) {
      throw new Error('current_body_repair_blob_invalid');
    }
    const version = driver.queryOne<StoredSyncNodeVersionRow>(
      'SELECT * FROM node_sync_versions WHERE version_id = ?', [row.current_version_id]);
    if (!version || version.object_id !== row.id) throw new Error('current_body_repair_version_unavailable');
    const snapshot = JSON.parse(version.snapshot_json) as { body_blob_hash?: string | null };
    if (storedSyncNodeVersionBody(version) === body.content &&
        (!snapshot.body_blob_hash || snapshot.body_blob_hash === body.bodyBlobHash)) return null;
    assertRepairBaseline(driver, input, row);
    return appendRepairVersion(driver, input, { ...row, content: body.content });
  });
}

function assertRepairBaseline(driver: DatabaseDriver, input: CurrentVersionBodyRepairInput, row: NodeSyncVersionSourceRow) {
  if (row.current_version_id !== input.expectedVersionId || row.body_blob_hash !== input.expectedBodyBlobHash ||
      row.sync_dirty !== 0) throw new Error('current_body_repair_baseline_changed');
  if (driver.queryOne('SELECT 1 FROM node_version_local_holds WHERE object_id = ? LIMIT 1', [row.id])) {
    throw new Error('current_body_repair_editor_active');
  }
}

function appendRepairVersion(driver: DatabaseDriver, input: CurrentVersionBodyRepairInput, row: NodeSyncVersionSourceRow) {
  const versionId = createOpaqueVersionRef(randomUUID());
  const contentHash = computeNodeSyncVersionHashFromDriver(driver, row, row.id);
  driver.execute(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, body_text, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [versionId, row.id, row.current_version_id, input.hostName, input.now, contentHash, row.content,
    JSON.stringify(buildNodeSyncSnapshotFromDriver(driver, row, row.id))]);
  driver.execute('INSERT INTO node_version_local_origins (version_id) VALUES (?)', [versionId]);
  driver.execute(`INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
    VALUES (?, ?, 0)`, [versionId, row.current_version_id]);
  driver.execute('UPDATE nodes SET current_version_id = ?, last_modified_by_host_name = ? WHERE id = ?',
    [versionId, input.hostName, row.id]);
  upsertNodeSyncState({ contentHash, currentVersionId: versionId, deletedAt: row.deleted_at,
    hostName: input.hostName, nodeId: row.id, updatedAt: row.updated_at }, driver);
  driver.execute('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
  return versionId;
}
