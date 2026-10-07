import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord } from './syncNodeGraph.js';
import type { NodeVersionBodyStorage } from './syncNodeTombstoneVersion.js';
import { loadVerifiedSyncNodeVersion } from './syncNodeVerifiedGraph.js';
import { readBodyText } from './verifiedBody.js';

/** Editing may materialize one selected article; alternative bodies remain references. */
export async function loadEditorSyncNodeVersion(db: DbPort, versionId: string, includeAncestors = false,
  bodyStorage: NodeVersionBodyStorage = 'continuous'): Promise<NativeSyncNodeRecord | null> {
  if (bodyStorage === 'continuous') return loadStoredSyncNodeVersionRecord(db, versionId, includeAncestors);
  const record = await loadVerifiedSyncNodeVersion(db, versionId, includeAncestors);
  if (!record) return null;
  if (record.body.kind !== 'readable') throw new Error(`sync_node_version_body_unavailable:${versionId}`);
  const [row] = await db.query<{ snapshot_json: string }>(
    'SELECT snapshot_json FROM node_sync_versions WHERE version_id = ? LIMIT 1', [versionId]);
  if (!row) throw new Error(`sync_node_version_body_unavailable:${versionId}`);
  const snapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  if (snapshot.content !== null) throw new Error('content_edit_snapshot_body_invalid');
  const body = await readBodyText(db, record.body.ref);
  snapshot.content = body;
  return { ...record.metadata, snapshot, body_text: body };
}

export async function loadCurrentEditorSyncNode(db: DbPort, nodeId: string, includeAncestors = false,
  bodyStorage: NodeVersionBodyStorage = 'continuous'): Promise<NativeSyncNodeRecord | null> {
  if (bodyStorage === 'continuous') return loadCurrentSyncNodeRecord(db, nodeId, includeAncestors);
  const [row] = await db.query<{ current_version_id: string | null }>(
    'SELECT current_version_id FROM nodes WHERE id = ? LIMIT 1', [nodeId]);
  return row?.current_version_id
    ? loadEditorSyncNodeVersion(db, row.current_version_id, includeAncestors, bodyStorage) : null;
}
