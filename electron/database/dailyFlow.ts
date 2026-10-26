import { definedProps } from '../../lib/core/definedProps.js';
import { dailyFlowCommitSchema, dailyFlowOpenSchema } from '../../lib/core/flow/dailyFlowContract.js';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { saveNodeReadingState } from './nodeReadingState.js';
import { saveNodeReviewState } from './nodeReviewState.js';
import { applyReviewGrade } from './reviewMutations.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

export const desktopDailyFlowPersistence: DailyFlowPersistence = {
  snapshot: async () => {
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

export function openDesktopDailyFlow(args: unknown) {
  return openDailyFlow(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    dailyFlowOpenSchema.parse(args), settings(), desktopDailyFlowPersistence);
}

export function commitDesktopDailyFlow(args: unknown) {
  return commitDailyFlow(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    dailyFlowCommitSchema.parse(args), settings(), desktopDailyFlowPersistence);
}
