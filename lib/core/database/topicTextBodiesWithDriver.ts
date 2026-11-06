import { validateTopicTextBodies } from '../sync/topicTextBodies.js';
import type { TopicTextAlternative } from '../sync/topicTextState.js';

import type { DatabaseDriver } from './driver.js';

export function loadTopicTextBodiesWithDriver(driver: DatabaseDriver, nodeId: string,
  entries: readonly TopicTextAlternative[]) {
  if (!entries.length) return [];
  const rows = driver.queryAll<{ hash: string; text: string }>(`SELECT body_blob_hash AS hash, body_text AS text
    FROM node_text_alternatives WHERE node_id = ? AND status = 'available'
      AND alternative_id IN (SELECT value FROM json_each(?))`, [nodeId, JSON.stringify(entries.map(entry => entry.id))]);
  return validateTopicTextBodies(entries, rows);
}
