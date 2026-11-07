import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';

import type { DbPort } from './dbPort.js';
import { TOPIC_ALTERNATIVE_METADATA_COLUMNS, topicAlternativeHash, type TopicAlternativeMetadata, type TopicAlternativeRecord } from './topicAlternativeRecord.js';
import { normalizeTextAlternativesForHash, type TopicTextAlternative } from './topicTextState.js';

export const AVAILABLE_TOPIC_ALTERNATIVES_SQL = `SELECT * FROM node_text_alternatives
  WHERE node_id = ? AND status = 'available' ORDER BY created_at DESC, alternative_id DESC`;

export function topicAlternativeEntry(row: TopicAlternativeMetadata): TopicTextAlternative {
  return { id: row.alternative_id, body_blob_hash: row.body_blob_hash,
    source_host_name: row.source_host_name, created_at: row.created_at, expires_at: row.expires_at };
}

export async function readTopicAlternativeRecords(db: DbPort, nodeId: string) {
  return db.query<TopicAlternativeRecord>(AVAILABLE_TOPIC_ALTERNATIVES_SQL, [nodeId]);
}

export async function writeTopicAlternative(db: DbPort, record: TopicAlternativeRecord, local: boolean) {
  const [existing] = await db.query<TopicAlternativeMetadata>(
    `SELECT ${TOPIC_ALTERNATIVE_METADATA_COLUMNS} FROM node_text_alternatives WHERE alternative_id = ?`, [record.alternative_id]);
  if (existing && (existing.node_id !== record.node_id || existing.body_blob_hash !== record.body_blob_hash)) {
    throw new Error('text_alternative_identity_mismatch');
  }
  const selected = existing ? resolveTopicAlternative(existing, record) : record;
  if (existing && topicAlternativeHash(existing) === topicAlternativeHash(selected)) return false;
  await db.run(`INSERT INTO node_text_alternatives
    (alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at,
      body_blob_hash, expires_at, resource_references, image_sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(alternative_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at,
      body_text = excluded.body_text, expires_at = excluded.expires_at,
      source_version_id = excluded.source_version_id, source_host_name = excluded.source_host_name,
      created_at = excluded.created_at,
      resource_references = excluded.resource_references, image_sources = excluded.image_sources`,
  [record.alternative_id, record.node_id, record.source_version_id, record.body_text, record.source_host_name,
    record.created_at, record.status, record.updated_at, record.body_blob_hash, record.expires_at,
    record.resource_references, record.image_sources]);
  if (local) await publishTopicAlternative(db, record);
  return true;
}

export async function publishTopicAlternative(db: DbPort, record: TopicAlternativeMetadata) {
  await db.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node_text_alternative', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, updated_at = excluded.updated_at, sync_dirty = 1,
      last_modified_by_host_name = excluded.last_modified_by_host_name, deleted_at = NULL`,
  [record.alternative_id, topicAlternativeHash(record), record.source_host_name, record.updated_at]);
}

/** Removed choices cannot be reactivated by a delayed creation; repeats never renew the deadline. */
export function resolveTopicAlternative<T extends TopicAlternativeMetadata>(left: T, right: T): T {
  if (left.status === 'available' && right.status !== 'available') return right;
  if (left.status !== 'available' && right.status === 'available') return left;
  if (left.status === 'available') {
    const a = `${left.expires_at}\n${topicAlternativeHash(left)}`;
    const b = `${right.expires_at}\n${topicAlternativeHash(right)}`;
    return a <= b ? left : right;
  }
  const a = `${left.updated_at}\n${left.status}\n${topicAlternativeHash(left)}`;
  const b = `${right.updated_at}\n${right.status}\n${topicAlternativeHash(right)}`;
  return a >= b ? left : right;
}

export async function retireTopicAlternative(db: DbPort, record: TopicAlternativeMetadata,
  status: Exclude<TopicAlternativeRecord['status'], 'available'>, now: string) {
  return writeTopicAlternative(db, { ...record, status, updated_at: now,
    body_text: '', resource_references: '[]', image_sources: null }, true);
}

/** Called by alternative operations and conflict handling, never by ordinary main-body saves. */
export async function settleTopicAlternatives(db: DbPort, nodeId: string, mainHash: string, now: string) {
  const records = await db.query<TopicAlternativeMetadata>(`SELECT ${TOPIC_ALTERNATIVE_METADATA_COLUMNS}
    FROM node_text_alternatives WHERE node_id = ? AND status = 'available'`, [nodeId]);
  return settleRecords(db, records, mainHash, now);
}

/** Read affected choices once after the batch's main bodies and independent choice facts are applied. */
export async function settleTopicAlternativesForNodes(db: DbPort,
  nodes: readonly { id: string; body_blob_hash: string }[], now: string) {
  if (!nodes.length) return;
  const records = await db.query<TopicAlternativeMetadata>(`SELECT ${TOPIC_ALTERNATIVE_METADATA_COLUMNS}
    FROM node_text_alternatives WHERE node_id IN (SELECT value FROM json_each(?)) AND status = 'available'`,
  [JSON.stringify(nodes.map(node => node.id))]);
  const grouped = new Map<string, TopicAlternativeMetadata[]>();
  for (const record of records) {
    const group = grouped.get(record.node_id) ?? [];
    group.push(record);
    grouped.set(record.node_id, group);
  }
  for (const node of nodes) {
    await settleRecords(db, grouped.get(node.id) ?? [], node.body_blob_hash, now);
  }
}

async function settleRecords(db: DbPort, records: readonly TopicAlternativeMetadata[], mainHash: string, now: string) {
  const selected = normalizeTextAlternativesForHash(records.map(topicAlternativeEntry), mainHash, now);
  const retained = new Set(selected.map(entry => entry.id));
  for (const record of records) if (!retained.has(record.alternative_id)) {
    await retireTopicAlternative(db, record, record.expires_at <= now ? 'expired' : 'superseded', now);
  }
  return selected;
}
