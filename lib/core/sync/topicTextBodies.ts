import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';
import { upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';
import { textAlternatives, type TopicTextBody, type TopicTextAlternative } from './topicTextState.js';

export async function loadTopicTextBodies(db: DbPort, record: NativeSyncNodeRecord): Promise<TopicTextBody[]> {
  return Promise.all(textAlternatives(record).map((entry) => loadTopicTextBody(db, entry)));
}

export async function loadTopicTextBody(db: DbPort, entry: TopicTextAlternative): Promise<TopicTextBody> {
  const [row] = await db.query<{ data: Uint8Array | string }>(
    'SELECT data FROM content_blob_data WHERE hash = ?', [entry.body_blob_hash]);
  if (!row) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
  const text = typeof row.data === 'string' ? row.data : new TextDecoder('utf-8', { fatal: true }).decode(row.data);
  if (hashTextBody(text) !== entry.body_blob_hash) throw new Error('text_alternative_body_hash_mismatch');
  return { hash: entry.body_blob_hash, text };
}

export async function retainTopicTextBodies(db: DbPort, record: NativeSyncNodeRecord) {
  const supplied = new Map((record.alternative_bodies ?? []).map((body) => [body.hash, body.text]));
  for (const entry of textAlternatives(record)) {
    const body = supplied.get(entry.body_blob_hash);
    if (body !== undefined) {
      if (hashTextBody(body) !== entry.body_blob_hash) throw new Error('text_alternative_body_hash_mismatch');
      await upsertTextBodyBlob(db, body, record.updated_at, entry.body_blob_hash);
    }
  }
  await loadTopicTextBodies(db, record);
  await recordFramedSyncResourceAvailability(db, textAlternatives(record).map((entry) => entry.body_blob_hash), true);
}
