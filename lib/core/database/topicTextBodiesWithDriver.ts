import { readTopicTextSnapshot, validateTopicTextBodies } from '../sync/topicTextBodies.js';
import type { TopicTextAlternative } from '../sync/topicTextState.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';

export function loadTopicTextBodiesWithDriver(driver: DatabaseDriver, nodeId: string,
  entries: readonly TopicTextAlternative[]) {
  if (!entries.length) return [];
  const row = driver.queryOne<DatabaseRow & { snapshot_json: string }>(
    `SELECT v.snapshot_json FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id = ?`, [nodeId]);
  if (!row) throw new Error(`text_alternative_version_unavailable:${nodeId}`);
  return validateTopicTextBodies(entries, readTopicTextSnapshot(row.snapshot_json).bodies);
}
