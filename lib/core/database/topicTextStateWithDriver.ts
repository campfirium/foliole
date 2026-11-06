import { textAlternativesSchema } from '../sync/topicTextState.js';

import type { DatabaseDriver } from './driver.js';

export function loadTopicTextStateWithDriver(driver: DatabaseDriver, nodeId: string) {
  const rows = driver.queryAll<{ id: string; body_blob_hash: string; source_host_name: string;
    created_at: string; expires_at: string }>(`SELECT alternative_id AS id, body_blob_hash,
      source_host_name, created_at, expires_at FROM node_text_alternatives
    WHERE node_id = ? AND status = 'available' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ORDER BY created_at DESC, alternative_id DESC`, [nodeId]);
  return textAlternativesSchema.parse(rows);
}
