import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort, DbRow } from './dbPort.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import { isSyncNodeSnapshotIdentical } from './syncNodeSnapshotIdentity.js';

/** What a device rewrites on its own when an anchored parent's text changes. */
const ANCHOR_REPAIR_FIELDS = ['anchor_link', 'image_regions', 'anchor_resolution_status', 'anchor_source_version_id',
  'updated_at'] as const;
/** The anchor itself. The other repair fields only record how it was last checked against the parent. */
const ANCHOR_VALUE_FIELDS = ['anchor_link', 'image_regions'] as const;
/** Kept by the version alone, so the live row cannot hold an unpublished change to them. */
const VERSION_ONLY_FIELDS = ['attachments', 'text_selection', 'text_alternatives'] as const;

interface LocalAnchorRow extends DbRow {
  current_version_id: string;
  anchor_link: string | null;
  image_regions: string | null;
  body_blob_hash: string | null;
  body_text: string | null;
  snapshot_json: string;
}

/**
 * Anchor repair is derived from the parent's version alone and a device may never publish it. A dirty mark that
 * carries nothing else must not hold back a successor: every other fact still equals the current version, and the
 * anchor is either that version's or the one the successor already carries.
 */
export async function isIncomingLocalAnchorRepair(port: DbPort, record: NativeSyncNodeRecord) {
  if (!record.parent_version_id || record.snapshot.deleted_at) return false;
  const [local] = await port.query<LocalAnchorRow>(`SELECT node.id, node.parent_id, node.kind, node.priority, node.enforce_priority, node.desired_retention,
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
  const base = JSON.parse(local.snapshot_json) as Record<string, unknown>;
  if (!matchesCurrentVersion(local, base)) return false;
  const incoming: Record<string, unknown> = record.snapshot;
  if (ANCHOR_VALUE_FIELDS.some(name => (local[name] ?? null) !== (base[name] ?? null) &&
      (local[name] ?? null) !== (incoming[name] ?? null))) return false;
  return local.current_version_id === record.parent_version_id
    || await isStoredAncestorVersion(port, local.current_version_id, record.parent_version_id);
}

function matchesCurrentVersion(local: LocalAnchorRow, base: Record<string, unknown>) {
  const bodyHash = base.body_blob_hash ?? (local.body_text === null ? null : hashTextBody(local.body_text));
  if (!bodyHash || local.body_blob_hash !== bodyHash) return false;
  const live: Record<string, unknown> = { ...local };
  live.enforce_priority = local.enforce_priority === 1 ? true : null;
  for (const name of ['is_title_manual', 'hide_title_heading', 'enable_short_term', 'sequential_reading_enabled']) {
    live[name] = local[name] == null ? null : local[name] === 1;
  }
  return isSyncNodeSnapshotIdentical(JSON.stringify({ resource_references: '[]', ...base }),
    live as unknown as NativeSyncNodeRecord['snapshot'], [...VERSION_ONLY_FIELDS, ...ANCHOR_REPAIR_FIELDS]);
}
