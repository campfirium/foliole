import { recordReviewHistoryWithDb } from '../../../../../lib/core/database/reviewLogRecord';
import { recomputeNodeReviewWithDb } from '../../../../../lib/core/database/reviewProjection';
import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';
import type { DailyFlowOpenArgs } from '../../../../../lib/core/flow/dailyFlowContract';
import { loadDailyFlowLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowLearningSnapshot';
import { openDailyFlow, type DailyFlowPersistence } from '../../../../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import { reviewHistoryOpId } from '../../../../../lib/core/review/reviewEventIdentity';
import { getCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { toReadingPayload } from '../../companionSyncStateWriters';
import { loadCompanionSnapshotNodeRows } from '../sync/workspace-state/companionSnapshotNodeRows';
import { buildIosWorkspaceNodes } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotRows';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { clearCompanionHistoryLearning } from './companionHistoryLearning';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { saveIosReadingWithDb, saveIosReviewWithDb } from './iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

export const companionDailyFlowPersistence: DailyFlowPersistence = {
  learningSnapshot: async (db, ids) => loadDailyFlowLearningSnapshot(db, await iosCompanionHostName(db), ids),
  snapshot: async (db, nodeIds) => {
    if (nodeIds) return { ...buildIosWorkspaceNodes(await loadCompanionSnapshotNodeRows(db, await iosCompanionHostName(db), nodeIds, true)), nodeOrder: [...nodeIds] };
    return (await loadIosCompanionWorkspaceSnapshot(db)) ?? { nodeOrder: [], nodesById: {}, trashedNodeIds: [] };
  },
  grade: async (db, value, opId) => {
    const result = await saveIosReviewWithDb(db, { node_id: value.nodeId, review_json: '{}',
      review_log_json: JSON.stringify({ ...value, opId }) });
    if (!('card' in result)) throw new Error('daily_flow_grade_missing');
    return result.card;
  },
  reading: async (db, value) => {
    if (!value.after) return clearCompanionHistoryLearning(db, 'node_reading', value.nodeId);
    await saveIosReadingWithDb(db, { node_id: value.nodeId, reading_json: JSON.stringify(toReadingPayload(value.after)),
      ...(value.completedReviewDay === undefined ? {} : { completedReviewDay: value.completedReviewDay }) });
  },
  reviewHistory: async (db, value, now) => {
    await recordReviewHistoryWithDb(db, { nodeId: value.nodeId, hostName: await iosCompanionHostName(db),
      opId: reviewHistoryOpId(value.targetOpId, now, value.mode), updatedAt: now,
      history: { mode: value.mode, targetOpId: value.targetOpId } });
    return recomputeNodeReviewWithDb(db, value.nodeId);
  }
};

export function companionDailyFlowSettings() {
  const value = getCurrentReviewSchedulerSettings();
  return { scope: hashTextBody(getIosCompanionDatabaseOwner().databasePath), newDayStartsAtHour: value.newDayStartsAtHour, pushQueue: value.pushQueue };
}

export function openCompanionDailyFlow(args: DailyFlowOpenArgs) {
  return writeIosCompanionDatabase(db => openDailyFlow(db, args, companionDailyFlowSettings(), companionDailyFlowPersistence));
}

export function loadCompanionDailySession() {
  return readIosCompanionDatabase(async db => (await readDailyFlow(db))?.session ?? null);
}
