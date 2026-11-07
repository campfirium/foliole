import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort, DbRow } from './dbPort.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import { isSyncNodeSnapshotIdentical } from './syncNodeSnapshotIdentity.js';

/** What a device rewrites on its own when an anchored parent's text changes. */
const ANCHOR_REPAIR_FIELDS = ['anchor_link', 'image_regions', 'anchor_resolution_status', 'anchor_source_version_id',
  'updated_at'] as const;

interface LocalAnchorRow extends DbRow {
  current_version_id: string;
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
  const [local] = await port.query<LocalAnchorRow>(`SELECT node.id, node.parent_id, node.kind, node.priority, node.desired_retention,
      node.enable_short_term, node.sequential_reading_enabled, node.shelved_at, node.initial_review_due,
      node.manual_child_order, node.title, node.is_title_manual, node.hide_title_heading, node.body_blob_hash,
      node.opening_text, node.virtual_filter, node.reveal, node.anchor_link, node.anchor_resolution_status,
      node.anchor_source_version_id, node.image_regions, node.image_sources, node.resource_references,
      node.import_source_fingerprint, node.import_content_fingerprint, node.position, node.created_at,
      node.updated_at, node.deleted_at, node.current_version_id, version.snapshot_json, version.body_text
    FROM nodes node JOIN node_sync_versions version ON version.version_id = node.current_version_id
    WHERE node.id = ? AND node.sync_dirty = 1 AND node.deleted_at IS NULL`,
  [record.object_id]);
  if (!local) return false;
  const incoming: Record<string, unknown> = record.snapshot;
  const row: Record<string, unknown> = { ...local };
  if (ANCHOR_REPAIR_FIELDS.some(name => (row[name] ?? null) !== (incoming[name] ?? null))) return false;
  if (local.body_text !== null && record.body_text !== null && local.body_text !== record.body_text) return false;
  if (!matchesLiveNode(local, record)) return false;
  const stored = JSON.parse(local.snapshot_json) as Record<string, unknown>;
  // Ordinary versions no longer carry alternatives; an empty historical list carries no extra fact.
  const matchesBase = isSyncNodeSnapshotIdentical(JSON.stringify({ resource_references: '[]', ...stored,
    text_alternatives: stored.text_alternatives ?? [] }),
  { ...record.snapshot, resource_references: record.snapshot.resource_references ?? '[]',
    text_alternatives: record.snapshot.text_alternatives ?? [] }, ANCHOR_REPAIR_FIELDS);
  return matchesBase && (local.current_version_id === record.parent_version_id
    || await isStoredAncestorVersion(port, local.current_version_id, record.parent_version_id));
}

function matchesLiveNode(local: LocalAnchorRow, record: NativeSyncNodeRecord) {
  const body = record.body_text ?? record.snapshot.content;
  const bodyHash = record.snapshot.body_blob_hash ?? (typeof body === 'string' ? hashTextBody(body) : null);
  if (!bodyHash || local.body_blob_hash !== bodyHash) return false;
  const live = { ...local };
  for (const name of ['is_title_manual', 'hide_title_heading', 'enable_short_term', 'sequential_reading_enabled']) {
    live[name] = local[name] == null ? null : local[name] === 1;
  }
  // These version-only facts are checked against the immutable parent separately, not the live node row.
  return isSyncNodeSnapshotIdentical(JSON.stringify(live),
    { ...record.snapshot, resource_references: record.snapshot.resource_references ?? '[]' },
    ['attachments', 'text_selection', 'text_alternatives']);
}
