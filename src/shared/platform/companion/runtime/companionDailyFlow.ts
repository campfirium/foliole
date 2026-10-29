import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionNodeResourceQueryDefinitions';
import { recordReviewHistoryWithDb } from '../../../../../lib/core/database/reviewLogRecord';
import { recomputeNodeReviewWithDb } from '../../../../../lib/core/database/reviewProjection';
import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';
import type { DailyFlowOpenArgs, DailyFlowSettings } from '../../../../../lib/core/flow/dailyFlowContract';
import { loadDailyFlowLearningFromNodeIndex, loadDailyFlowLearningSnapshot } from '../../../../../lib/core/flow/dailyFlowLearningSnapshot';
import { predictDailyFlowDocument, type DailyFlowPredictionArgs } from '../../../../../lib/core/flow/dailyFlowPrediction';
import { refreshDailyFlowAfterSync } from '../../../../../lib/core/flow/dailyFlowRefresh.js';
import { openDailyFlow, type DailyFlowPersistence } from '../../../../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import { readDailyFlowView } from '../../../../../lib/core/flow/dailyFlowView';
import type { DailyFlowViewArgs } from '../../../../../lib/core/flow/dailyFlowViewContract';
import { reviewHistoryOpId } from '../../../../../lib/core/review/reviewEventIdentity';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import { getCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { toReadingPayload } from '../../companionSyncStateWriters';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { loadCompanionSnapshotNodeRows } from '../sync/workspace-state/companionSnapshotNodeRows';
import { buildIosWorkspaceNodes } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotRows';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { clearCompanionHistoryLearning } from './companionHistoryLearning';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { saveIosReadingWithDb, saveIosReviewWithDb } from './iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

export const companionDailyFlowPersistence: DailyFlowPersistence = {
  learningSnapshot: async (db, ids) => {
    const snapshot = await loadDailyFlowLearningSnapshot(db, await iosCompanionHostName(db), ids);
    if (ids) return snapshot;
    const order = await db.query<{ id: string }>(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceOrderedNodeIds.sql);
    return { ...snapshot, nodeOrder: order.map(row => row.id) };
  },
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

export function ownedCompanionDailyFlowPersistence(settings: DailyFlowSettings): DailyFlowPersistence {
  return { ...companionDailyFlowPersistence,
    learningSnapshot: async (tx, ids) => {
      const metadata = ids ? undefined : getIosCompanionDatabaseOwner().readNodeMetadata(tx) ?? undefined;
      const hostName = await iosCompanionHostName(tx);
      const snapshot = metadata ? await loadDailyFlowLearningFromNodeIndex(tx, hostName, metadata)
        : await loadDailyFlowLearningSnapshot(tx, hostName, ids);
      if (ids) return snapshot;
      const index = await getIosCompanionDatabaseOwner()
        .readNodeIndex(tx, settings.pushQueue.defaultPriority, metadata ? undefined : Object.values(snapshot.nodesById)
          .map(node => ({ ...node, anchorKind: node.anchorLink?.kind ?? null })));
      const nodeOrder = await getIosCompanionDatabaseOwner().readNodeOrder(tx);
      return { ...snapshot, nodeOrder: [...nodeOrder], nodePriorities: index.priorities, nodePaths: index.paths };
    } };
}

export function openCompanionDailyFlow(args: DailyFlowOpenArgs) {
  return runCompanionSyncWriterTask(() => writeIosCompanionDatabase(async db => {
    const settings = companionDailyFlowSettings();
    return openDailyFlow(db, args, settings, ownedCompanionDailyFlowPersistence(settings));
  }));
}

export function loadCompanionDailySession() {
  return readIosCompanionDatabase(async db => (await readDailyFlow(db))?.session ?? null);
}

export function predictCompanionFlowDocument(args: DailyFlowPredictionArgs, signal: AbortSignal) {
  const owner = getIosCompanionDatabaseOwner();
  const settings = companionDailyFlowSettings();
  return owner.readBackgroundSnapshot(db => predictDailyFlowDocument(db, args, settings,
    companionDailyFlowPersistence), signal);
}

export function readCompanionDailyFlowView(args: DailyFlowViewArgs) {
  return readIosCompanionDatabase(db => readDailyFlowView(db, args, companionDailyFlowSettings(), companionDailyFlowPersistence));
}

export function refreshCompanionDailyFlowAfterSync(db: DbPort) {
  const settings = companionDailyFlowSettings();
  return refreshDailyFlowAfterSync(db, new Date().toISOString(), settings, ownedCompanionDailyFlowPersistence(settings));
}
