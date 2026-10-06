import { canonicalPrivateStatePayloadJson } from './canonicalPrivateStatePayload.js';
import type { DbPort } from './dbPort.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from './syncObjectPayloadSql.js';

export async function readFramedSyncObjectPayload(
  db: DbPort, key: { globalId: string; objectType: string }
): Promise<string | null> {
  if (key.objectType === 'view_state') return readViewState(db, key.globalId);
  const sql = key.objectType === 'external_document' ? `SELECT json_object(
    'body_blob_hash', body_blob_hash, 'content_hash', content_hash, 'document_id', document_id,
    'extension', extension, 'file_name', file_name, 'folder_id', folder_id,
    'reference_json', reference_json, 'reference_kind', reference_kind,
    'relative_path', relative_path, 'title', title) AS payload_json
    FROM external_documents WHERE document_id = ?`
    : SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[key.objectType as keyof typeof SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE];
  if (!sql) throw new Error('framed_sync_object_state_type_invalid');
  const [row] = await db.query<{ payload_json: string }>(sql, [key.globalId]);
  if (!row) return null;
  return key.objectType === 'setting'
    ? canonicalPrivateStatePayloadJson('setting', JSON.parse(row.payload_json)) : row.payload_json;
}

async function readViewState(db: DbPort, id: string) {
  const [scope, platform, formFactor, hostName, ...parts] = id.split(':');
  const key = parts.join(':');
  if (!scope || !platform || !formFactor || !hostName || !key) throw new Error('framed_sync_view_state_identity_invalid');
  const identity = { scope, platform, form_factor: formFactor, host_name: hostName, key };
  if (key === 'active_node') {
    const [row] = await db.query<{ active_node_id: string | null }>(
      "SELECT NULLIF(value, '') AS active_node_id FROM workspace_meta WHERE key = 'active_node_id'");
    return canonicalPrivateStatePayloadJson('view_state', { ...identity, active_node_id: row?.active_node_id ?? null });
  }
  if (!key.startsWith('node:')) throw new Error('framed_sync_view_state_identity_invalid');
  const [row] = await db.query(`SELECT node_id, scroll_top, selection_from, selection_to
    FROM node_view_state WHERE node_id = ? AND host_name = ?`, [key.slice(5), hostName]);
  return row ? canonicalPrivateStatePayloadJson('view_state', { ...row, ...identity }) : null;
}
