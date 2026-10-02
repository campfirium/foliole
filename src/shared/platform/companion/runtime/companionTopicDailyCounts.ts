import { topicDailyCountId, validateReviewDayKey } from '../../../../../lib/core/review/topicDailyCountIdentity';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applyTopicDailyCount } from '../../../../../lib/core/sync/syncTopicDailyCount';

import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

export async function recordCompanionTopicDailyCount(db: DbPort, day: string, nodeId: string) {
  validateReviewDayKey(day);
  const [node] = await db.query('SELECT kind FROM nodes WHERE id = ?', [nodeId]);
  if (node?.kind !== 'topic') throw new Error('Daily count requires a completed Topic review');
  const objectId = topicDailyCountId(day, nodeId);
  const payload = { day_key: day, node_id: nodeId };
  const contentHash = await iosCompanionContentHash(payload);
  const updatedAt = `${day}T00:00:00.000Z`;
  await applyTopicDailyCount(db, {
    object_type: 'topic_daily_count', object_id: objectId, content_hash: contentHash,
    deleted_at: null, payload_json: JSON.stringify(payload), updated_at: updatedAt
  });
  await markIosCompanionMutation({
    db, hostName: await iosCompanionHostName(db), objectType: 'topic_daily_count',
    objectId, contentHash, updatedAt, skipUnchanged: true
  });
}
