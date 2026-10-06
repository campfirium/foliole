import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { SYNC_POLICY_HOST_PRIVATE_OBJECT_TYPES } from './syncObjectPolicy.js';

/** Existing write-maintained object identities, matching the native identity copy surface. */
export const FRAMED_SYNC_STATE_OBJECT_TYPES = [
  'external_document', 'external_folder', 'import_source', 'node_open_state', 'node_review',
  'node_text_alternative', 'parent_child_order', 'order_version', 'node_position',
  'pdf_page_text', 'setting', 'view_state', 'watched_folder', 'topic_daily_count',
  'foreground_daily_time'
] as const;

const sharedTypes = FRAMED_SYNC_STATE_OBJECT_TYPES.filter((type) =>
  type !== 'view_state' || !SYNC_POLICY_HOST_PRIVATE_OBJECT_TYPES.includes(type));

const sharedSettingPrefix = 'user_space:';

export function isFramedSyncSharedStateObject(type: string, objectId: string) {
  return sharedTypes.some((candidate) => candidate === type)
    && (type !== 'setting' || objectId.startsWith(sharedSettingPrefix));
}

interface StateRow extends DbRow {
  content_hash: string;
  current_version_id: string | null;
  object_id: string;
  object_type: string;
  body_blob_hash: string | null;
}

export async function readFramedSyncObjectStateInventory(
  port: DbPort, key?: Readonly<{ globalId: string; objectType: string }>
): Promise<FramedSyncInventoryEntry[]> {
  const types = sharedTypes.map((type) => `'${type}'`).join(',');
  const rows = await port.query<StateRow>(`SELECT object_type, object_id, content_hash, current_version_id,
    CASE WHEN object_type = 'external_document' AND deleted_at IS NULL THEN
      (SELECT body_blob_hash FROM external_documents WHERE document_id = object_id
        AND EXISTS (SELECT 1 FROM content_blob_data WHERE hash = body_blob_hash))
      ELSE NULL END AS body_blob_hash
    FROM sync_object_state WHERE object_type IN (${types})
      AND (object_type != 'setting' OR object_id LIKE '${sharedSettingPrefix}%')
      AND (object_type != 'node_review' OR deleted_at IS NOT NULL OR EXISTS
        (SELECT 1 FROM nodes WHERE id = object_id))
      ${key ? 'AND object_type = ? AND object_id = ?' : ''}
    ORDER BY object_type, object_id`, key ? [key.objectType, key.globalId] : []);
  return rows.map((row) => {
    if (!/^[a-f0-9]{64}$/u.test(row.content_hash)) {
      throw new Error('framed_sync_inventory_state_hash_invalid');
    }
    return { frontierFactIds: [], globalId: row.object_id, objectType: row.object_type,
      requiredRelationIds: [], resourceHashes: row.body_blob_hash ? [hexToBytes(row.body_blob_hash)] : [], reviewFactIds: [],
      sharedStateHash: hexToBytes(row.content_hash),
      stateFactIds: [framedSyncObjectStateFactId(row.object_type, row.content_hash, row.current_version_id)] };
  });
}

export function framedSyncObjectStateFactId(type: string, hash: string, head: string | null) {
  return type === 'parent_child_order' ? `${type}:${hash}:${head ?? ''}` : `${type}:${hash}`;
}
