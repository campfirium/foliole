import { textAlternativesSchema } from '../sync/topicTextState.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';

export function loadTopicTextStateWithDriver(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<DatabaseRow & { alternatives: string | null }>(
    `SELECT json_extract(v.snapshot_json, '$.text_alternatives') AS alternatives
     FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = ?`, [nodeId]);
  return textAlternativesSchema.parse(JSON.parse(row?.alternatives ?? '[]'));
}
