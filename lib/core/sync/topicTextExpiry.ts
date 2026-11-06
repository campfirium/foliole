import type { DbPort } from './dbPort.js';
import { TOPIC_ALTERNATIVE_METADATA_COLUMNS, type TopicAlternativeMetadata } from './topicAlternativeRecord.js';
import { retireTopicAlternative } from './topicAlternativeStore.js';

export async function findTopicsWithExpiredText(db: DbPort, nodeIds: readonly string[], now: string) {
  if (!nodeIds.length) return new Set<string>();
  const rows = await db.query<{ node_id: string }>(`SELECT DISTINCT node_id FROM node_text_alternatives
    WHERE node_id IN (SELECT value FROM json_each(?)) AND status = 'available' AND expires_at <= ?`,
  [JSON.stringify(nodeIds), now]);
  return new Set(rows.map(row => row.node_id));
}

/** Expiration retires only the choice; it does not create a new main-body version. */
export async function expireTopicText(db: DbPort, nodeId: string, now: string) {
  return db.transaction(async tx => {
    const rows = await tx.query<TopicAlternativeMetadata>(`SELECT ${TOPIC_ALTERNATIVE_METADATA_COLUMNS} FROM node_text_alternatives
      WHERE node_id = ? AND status = 'available' AND expires_at <= ?`, [nodeId, now]);
    for (const row of rows) await retireTopicAlternative(tx, row, 'expired', now);
    return rows.length > 0;
  });
}
