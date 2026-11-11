import { computeSyncContentHash } from '../database/syncState.js';

import type { DbPort } from './dbPort.js';
import { mergeReadingResumeStates, parseReadingResumeState } from './readingResumeState.js';
import type { SyncObjectRecord } from './syncObjectRecord.js';

export const READ_READING_RESUME_SQL = 'SELECT payload_json FROM node_reading_resume WHERE node_id = ?';
export const WRITE_READING_RESUME_SQL = `INSERT INTO node_reading_resume (node_id, payload_json) VALUES (?, ?)
  ON CONFLICT(node_id) DO UPDATE SET payload_json = excluded.payload_json`;

export async function applyReadingResumeRecord(port: DbPort, record: SyncObjectRecord) {
  if (record.deleted_at || !record.payload_json) throw new Error('reading_resume_payload_missing');
  const incoming = parseReadingResumeState(record.payload_json);
  if (computeSyncContentHash('node_reading_resume', incoming) !== record.content_hash) {
    throw new Error('sync_content_hash_mismatch:node_reading_resume');
  }
  const [node] = await port.query('SELECT 1 FROM nodes WHERE id = ?', [record.object_id]);
  if (!node) throw new Error(`sync_reading_resume_node_missing:${record.object_id}`);
  const [current] = await port.query<{ payload_json: string }>(READ_READING_RESUME_SQL, [record.object_id]);
  const merged = mergeReadingResumeStates(current ? parseReadingResumeState(current.payload_json) : null, incoming);
  const payload = JSON.stringify(merged);
  if (current?.payload_json === payload) return null;
  await port.run(WRITE_READING_RESUME_SQL, [record.object_id, payload]);
  return { ...record, content_hash: computeSyncContentHash('node_reading_resume', merged), payload_json: payload };
}
