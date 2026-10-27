import { projectParentChildOrder, readParentChildOrders } from '../../lib/core/database/parentChildOrder.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { queryWorkspaceRows } from '../../lib/core/database/workspaceListSnapshot.js';
import { buildWorkspaceListNodesById } from '../../lib/core/database/workspaceListSnapshotNodes.js';
import { definedProps } from '../../lib/core/definedProps.js';
import { dailyFlowCommitSchema, dailyFlowOpenSchema } from '../../lib/core/flow/dailyFlowContract.js';
import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { dailyFlowSourceSettingsSchema, saveDailyFlowSourceSettings } from '../../lib/core/flow/dailyFlowSourceSettings.js';
import { readDailyFlowView } from '../../lib/core/flow/dailyFlowView.js';
import { dailyFlowViewSchema } from '../../lib/core/flow/dailyFlowViewContract.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { scheduleDesktopFlowDocumentPreparation } from './dailyFlowDocumentPreparation.js';
import { saveNodeReadingState } from './nodeReadingState.js';
import { saveNodeReviewState } from './nodeReviewState.js';
import { applyReviewGrade } from './reviewMutations.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

export const desktopDailyFlowPersistence: DailyFlowPersistence = {
  learningSnapshot: async (db, ids) => {
    const driver = openDatabaseConnection().driver;
    const snapshot = await loadDailyFlowLearningSnapshot(db, requireDatabaseHostName(driver), ids);
    if (ids) return snapshot;
    const members = Object.values(snapshot.nodesById).map(node => ({ id: node.id, parent_id: node.parentNodeId,
      created_at: node.createdAt, deleted_at: node.deletedAt ?? null }));
    return { ...snapshot, nodeOrder: projectParentChildOrder(members, readParentChildOrders(driver)) };
  },
  snapshot: async (_db, nodeIds) => {
    if (nodeIds) {
      const { nodesById, trashedNodeIds } = buildWorkspaceListNodesById(queryWorkspaceRows(openDatabaseConnection().driver, nodeIds));
      return { nodeOrder: [...nodeIds], nodesById: Object.fromEntries(Object.entries(nodesById).map(([id, node]) => [id, definedProps({ ...node })])), trashedNodeIds };
    }
    const snapshot = loadWorkspaceListSnapshot({ includePdfOpenings: false });
    return { ...snapshot, nodesById: Object.fromEntries(Object.entries(snapshot.nodesById)
      .map(([id, node]) => [id, definedProps(node)])) };
  },
  grade: async (_db, value, opId) => applyReviewGrade({ ...value, opId }),
  reading: async (_db, value, now) => {
    saveNodeReadingState({ nodeId: value.nodeId, reading: value.after, updatedAt: now,
      ...(value.completedReviewDay === undefined ? {} : { completedReviewDay: value.completedReviewDay }) });
  },
  reviewHistory: async (_db, value, now) => saveNodeReviewState({ nodeId: value.nodeId, review: value.after,
    updatedAt: now, history: { mode: value.mode, targetOpId: value.targetOpId } })
};

function settings() {
  const value = loadReviewSchedulerSettings();
  return { scope: currentLibraryScope(), newDayStartsAtHour: value.newDayStartsAtHour, pushQueue: value.pushQueue };
}

export async function openDesktopDailyFlow(args: unknown) {
  const result = await openDailyFlow(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    dailyFlowOpenSchema.parse(args), settings(), desktopDailyFlowPersistence);
  scheduleDesktopFlowDocumentPreparation(result.session, settings(), desktopDailyFlowPersistence);
  return result;
}

export async function commitDesktopDailyFlow(args: unknown) {
  const result = await commitDailyFlow(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    dailyFlowCommitSchema.parse(args), settings(), desktopDailyFlowPersistence);
  scheduleDesktopFlowDocumentPreparation(result.session, settings(), desktopDailyFlowPersistence);
  return result;
}

export function readDesktopDailyFlowView(args: unknown) {
  return readDailyFlowView(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    dailyFlowViewSchema.parse(args), settings(), desktopDailyFlowPersistence);
}

export function saveDesktopDailyFlowSourceSettings(args: unknown) {
  return saveDailyFlowSourceSettings(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    dailyFlowSourceSettingsSchema.parse(args), desktopDailyFlowPersistence, requireDatabaseHostName(openDatabaseConnection().driver), currentLibraryScope());
}
