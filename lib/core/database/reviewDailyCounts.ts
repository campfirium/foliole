import { topicDailyCountId, validateReviewDayKey } from '../review/topicDailyCountIdentity.js';

import type { DatabaseDriver } from './driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export function recordTopicDailyCount(driver: DatabaseDriver, input: {
  day: string; nodeId: string; hostName: string;
}) {
  validateReviewDayKey(input.day);
  const id = topicDailyCountId(input.day, input.nodeId);
  driver.transaction(() => {
    const result = driver.execute(
      'INSERT OR IGNORE INTO topic_daily_count_entries(id, day_key, node_id) VALUES (?, ?, ?)',
      [id, input.day, input.nodeId]
    );
    if (!result.changes) return;
    upsertSyncObjectState(driver, {
      objectType: 'topic_daily_count', objectId: id,
      contentHash: computeSyncContentHash('topic_daily_count', {
        day_key: input.day, node_id: input.nodeId
      }),
      lastModifiedByHostName: input.hostName,
      updatedAt: `${input.day}T00:00:00.000Z`, syncDirty: true
    });
  });
}
