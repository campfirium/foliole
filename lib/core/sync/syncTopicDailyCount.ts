import { topicDailyCountId, validateReviewDayKey } from '../review/topicDailyCountIdentity.js';

import type { DbPort } from './dbPort.js';
import type { DbStatement } from './dbStatements.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncObjectRecord } from './syncObjectRecord.js';


export async function applyTopicDailyCount(port: DbPort, record: SyncObjectRecord) {
  if (record.deleted_at) throw new Error('Daily counts cannot be deleted by a snapshot');
  const payload = asObject(record);
  const day = text(payload.day_key);
  const nodeId = text(payload.node_id);
  validateReviewDayKey(day);
  if (!nodeId || record.object_id !== topicDailyCountId(day, nodeId)) {
    throw new Error('Invalid daily count identity');
  }
  const statement = topicDailyCountStatement(day!, nodeId);
  await port.run(statement.sql, statement.params);
}

export function topicDailyCountStatement(day: string, nodeId: string): DbStatement {
  validateReviewDayKey(day);
  return { sql: 'INSERT OR IGNORE INTO topic_daily_count_entries(id, day_key, node_id) VALUES (?, ?, ?)',
    params: [topicDailyCountId(day, nodeId), day, nodeId] };
}
