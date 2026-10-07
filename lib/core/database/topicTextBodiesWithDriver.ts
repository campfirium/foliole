import type { TopicTextAlternative } from '../sync/topicTextState.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { hashTextBody } from './textBodyHash.js';

export function loadTopicTextBodiesWithDriver(driver: DatabaseDriver, entries: readonly TopicTextAlternative[]) {
  return entries.map((entry) => {
    const row = driver.queryOne<DatabaseRow & { data: Uint8Array | string }>(
      'SELECT data FROM content_blob_data WHERE hash = ?', [entry.body_blob_hash]);
    if (!row) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
    const text = typeof row.data === 'string' ? row.data : new TextDecoder('utf-8', { fatal: true }).decode(row.data);
    if (hashTextBody(text) !== entry.body_blob_hash) throw new Error('text_alternative_body_hash_mismatch');
    return { hash: entry.body_blob_hash, text };
  });
}
