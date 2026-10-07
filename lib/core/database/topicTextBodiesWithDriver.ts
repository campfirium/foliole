import type { TopicTextAlternative } from '../sync/topicTextState.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { hashTextBody } from './textBodyHash.js';
import { loadVerifiedBodyRefWithDriver, readBodyTextWithDriver } from './verifiedBodyWithDriver.js';

export function loadTopicTextBodiesWithDriver(driver: DatabaseDriver, entries: readonly TopicTextAlternative[], storage: 'continuous' | 'chunked' = 'continuous') {
  return entries.map((entry) => {
    if (storage === 'chunked') {
      const ref = loadVerifiedBodyRefWithDriver(driver, entry.body_blob_hash);
      if (!ref) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
      return { hash: entry.body_blob_hash, text: readBodyTextWithDriver(driver, ref) };
    }
    const row = driver.queryOne<DatabaseRow & { data: Uint8Array | string }>(
      'SELECT data FROM content_blob_data WHERE hash = ?', [entry.body_blob_hash]);
    if (!row) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
    const text = typeof row.data === 'string' ? row.data : new TextDecoder('utf-8', { fatal: true }).decode(row.data);
    if (hashTextBody(text) !== entry.body_blob_hash) throw new Error('text_alternative_body_hash_mismatch');
    return { hash: entry.body_blob_hash, text };
  });
}
