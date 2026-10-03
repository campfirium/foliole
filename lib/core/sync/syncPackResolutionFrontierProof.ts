import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { storedSyncNodeVersionBody, type StoredSyncNodeVersionRow } from './syncNodeGraph.js';
import { buildResolutionRecord } from './syncNodeResolution.js';
import type { SyncPackNodeVersionParentRow } from './syncPackNodeVersions.js';

// Independently collected copies of a resolution can retain opposite direct parents.
// Only reconstructing that exact resolution proves these two frontiers compatible.
export async function proveSyncPackResolutionFrontier(port: DbPort, versionId: string,
  incoming: SyncPackNodeVersionParentRow[], incomingAlias: string) {
  const stored = await port.query<{ parent_version_id: string }>(
    'SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?', [versionId]);
  const received = [...new Set(incoming.filter(edge => edge.version_id === versionId)
    .map(edge => edge.parent_version_id))];
  if (stored.length !== 1 || received.length !== 1 || stored[0]!.parent_version_id === received[0]) return false;
  const head = await loadRecord(port, 'main', versionId);
  if (!head || head.host_name !== 'desktop-resolution' || head.snapshot.kind !== 'topic') return false;
  const left = await loadRecord(port, 'main', stored[0]!.parent_version_id);
  const right = await loadRecord(port, incomingAlias, received[0]!);
  if (!left || !right || [left, right].some(record => record.object_id !== head.object_id ||
      record.snapshot.kind !== 'topic' || !Number.isFinite(Date.parse(record.version_created_at ?? '')))) return false;
  const rebuilt = buildResolutionRecord([left, right], head, head.body_text!, head.snapshot);
  return rebuilt.version_id === versionId && rebuilt.content_hash === head.content_hash;
}

async function loadRecord(port: DbPort, alias: string, versionId: string): Promise<NativeSyncNodeRecord | null> {
  const table = `"${alias.replaceAll('"', '""')}".node_sync_versions`;
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    `SELECT * FROM ${table} WHERE version_id = ?`, [versionId]);
  if (!row) return null;
  const body = storedSyncNodeVersionBody(row);
  if (body === null) return null;
  const snapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  return { ancestor_version_ids: [], body_text: body, content_hash: row.content_hash,
    host_name: row.host_name, object_id: row.object_id, object_type: 'node',
    parent_version_id: null, parent_version_ids: [], snapshot,
    updated_at: snapshot.updated_at, version_created_at: row.created_at, version_id: row.version_id };
}
