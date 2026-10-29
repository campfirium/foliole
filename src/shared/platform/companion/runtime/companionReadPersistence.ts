import { loadDailyFlowLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowLearningSnapshot';
import type { DailyFlowPersistence } from '../../../../../lib/core/flow/dailyFlowService';
import { topicDailyCountId } from '../../../../../lib/core/review/topicDailyCountIdentity';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { supportsDbBatch } from '../../../../../lib/core/sync/dbStatements';
import { nodeReadingStatement } from '../../../../../lib/core/sync/syncObjectLearningPayloadExecutor';
import { topicDailyCountStatement } from '../../../../../lib/core/sync/syncTopicDailyCount';
import { toReadingPayload } from '../../companionSyncStateWriters';

import { companionDailyFlowPersistence } from './companionDailyFlow';
import { companionMutationStatement, iosCompanionContentHash, iosCompanionHostName } from './iosCompanionMutationState';

// A single transaction owns this host value and its learning facts.
export function companionReadPersistence(): DailyFlowPersistence {
  let host: Promise<string> | undefined;
  const hostName = (db: DbPort) => host ??= iosCompanionHostName(db);
  return { ...companionDailyFlowPersistence, readingPreservesPosition: true,
    learningSnapshot: async (db, ids) => ids
      ? loadDailyFlowLearningSnapshot(db, await hostName(db), ids)
      : companionDailyFlowPersistence.learningSnapshot(db),
    async reading(db, value, now) {
      if (!value.after) throw new Error('read_intent_learning_missing');
      if (!supportsDbBatch(db)) throw new Error('read_intent_batch_unavailable');
      const { reading_position: ignored, ...payload } = toReadingPayload(value.after);
      void ignored;
      const host = await hostName(db);
      const readingHash = await iosCompanionContentHash({ ...payload, node_id: value.nodeId });
      const statements = [nodeReadingStatement({ object_type: 'node_reading', object_id: value.nodeId,
        payload_json: JSON.stringify(payload), content_hash: readingHash, updated_at: now, deleted_at: null }),
      companionMutationStatement({ objectType: 'node_reading', objectId: value.nodeId,
        contentHash: readingHash, hostName: host, updatedAt: now })];
      if (value.completedReviewDay !== undefined) {
        const day = value.completedReviewDay;
        statements.push(topicDailyCountStatement(day, value.nodeId), companionMutationStatement({
          objectType: 'topic_daily_count', objectId: topicDailyCountId(day, value.nodeId),
          contentHash: await iosCompanionContentHash({ day_key: day, node_id: value.nodeId }),
          hostName: host, updatedAt: `${day}T00:00:00.000Z`, skipUnchanged: true }));
      }
      await db.batch(statements);
    }
  };
}
