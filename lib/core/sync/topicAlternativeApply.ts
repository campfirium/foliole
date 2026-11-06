import { computeSyncContentHash } from '../database/syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';

import type { DbPort } from './dbPort.js';
import type { SyncObjectRecord } from './syncObjectRecord.js';
import { topicAlternativeHash, validateTopicAlternativeRecord } from './topicAlternativeRecord.js';
import { publishTopicAlternative, writeTopicAlternative } from './topicAlternativeStore.js';

/** Independent choice facts use their own terminal state, not absence from a main-body version. */
export async function applyTopicAlternativeRecord(db: DbPort, record: SyncObjectRecord) {
  if (record.deleted_at) {
    const [owner] = await db.query<{ node_id: string }>(
      "SELECT node_id FROM sync_node_child_owners WHERE object_type = 'node_text_alternative' AND object_id = ?", [record.object_id]);
    await deleteTopicAlternative(db, record.object_id, record.deleted_at, record.content_hash, owner?.node_id);
    return `node_text_alternative:${record.object_id}`;
  }
  if (!record.payload_json) throw new Error('text_alternative_state_invalid');
  const incoming = validateTopicAlternativeRecord(JSON.parse(record.payload_json));
  if (incoming.alternative_id !== record.object_id || topicAlternativeHash(incoming) !== record.content_hash
    || incoming.updated_at !== record.updated_at) throw new Error('text_alternative_state_hash_mismatch');
  const [deleted] = await db.query("SELECT 1 FROM sync_object_state WHERE object_type = 'node_text_alternative' AND object_id = ? AND deleted_at IS NOT NULL", [record.object_id]);
  if (deleted) return null;
  const [parent] = await db.query<{ deleted_at: string }>('SELECT deleted_at FROM node_sync_tombstones WHERE node_id = ?', [incoming.node_id]);
  if (parent) {
    await deleteTopicAlternative(db, incoming.alternative_id, parent.deleted_at, undefined, incoming.node_id);
    return `node_text_alternative:${record.object_id}`;
  }
  const changed = await writeTopicAlternative(db, incoming, false);
  if (changed) await publishTopicAlternative(db, incoming);
  return changed ? `node_text_alternative:${record.object_id}` : null;
}

export function topicAlternativeDeletionHash(id: string, deletedAt: string) {
  return computeSyncContentHash('node_text_alternative', { alternative_id: id, deleted_at: deletedAt });
}

export async function deleteTopicAlternative(db: DbPort, id: string, deletedAt: string,
  expectedHash?: string, nodeId?: string) {
  const hash = topicAlternativeDeletionHash(id, deletedAt);
  if (expectedHash && expectedHash !== hash) throw new Error('text_alternative_deletion_hash_mismatch');
  await db.run('DELETE FROM node_text_alternatives WHERE alternative_id = ?', [id]);
  await db.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('node_text_alternative', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, 'sync-remote', ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1
    WHERE sync_object_state.deleted_at IS NULL OR sync_object_state.deleted_at < excluded.deleted_at`,
  [id, hash, deletedAt, deletedAt]);
  if (nodeId) await db.run(`INSERT INTO sync_node_child_owners VALUES ('node_text_alternative', ?, ?)
    ON CONFLICT(object_type, object_id) DO UPDATE SET node_id = excluded.node_id`, [id, nodeId]);
}
