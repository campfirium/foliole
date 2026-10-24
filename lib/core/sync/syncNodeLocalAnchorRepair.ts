import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import { isSyncNodeSnapshotIdentical } from './syncNodeSnapshotIdentity.js';

/** What a device rewrites on its own when an anchored parent's text changes. */
const ANCHOR_REPAIR_FIELDS = ['anchor_link', 'image_regions', 'anchor_resolution_status', 'anchor_source_version_id',
  'updated_at'] as const;

interface LocalAnchorRow extends DbRow {
  anchor_link: string | null;
  anchor_resolution_status: string | null;
  anchor_source_version_id: string | null;
  body_text: string | null;
  image_regions: string | null;
  snapshot_json: string;
  updated_at: string;
}

/**
 * Anchor repair is derived from the parent's version alone, so another device can publish the very edit this
 * device holds unpublished. Such an incoming child version carries nothing local work would lose.
 */
export async function isIncomingLocalAnchorRepair(port: DbPort, record: NativeSyncNodeRecord) {
  if (!record.parent_version_id || record.snapshot.deleted_at) return false;
  const [local] = await port.query<LocalAnchorRow>(`SELECT node.anchor_link, node.image_regions,
      node.anchor_resolution_status, node.anchor_source_version_id, node.updated_at, version.snapshot_json, version.body_text
    FROM nodes node JOIN node_sync_versions version ON version.version_id = node.current_version_id
    WHERE node.id = ? AND node.current_version_id = ? AND node.sync_dirty = 1 AND node.deleted_at IS NULL`,
  [record.object_id, record.parent_version_id]);
  if (!local) return false;
  const incoming: Record<string, unknown> = record.snapshot;
  const row: Record<string, unknown> = { ...local };
  if (ANCHOR_REPAIR_FIELDS.some(name => (row[name] ?? null) !== (incoming[name] ?? null))) return false;
  if (local.body_text !== null && record.body_text !== null && local.body_text !== record.body_text) return false;
  // Older versions omit an empty reference list that newer ones spell out.
  const stored = { resource_references: '[]', ...JSON.parse(local.snapshot_json) as Record<string, unknown> };
  return isSyncNodeSnapshotIdentical(JSON.stringify(stored),
    { ...record.snapshot, resource_references: record.snapshot.resource_references ?? '[]' }, ANCHOR_REPAIR_FIELDS);
}
