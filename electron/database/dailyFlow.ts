import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { queryWorkspaceRows } from '../../lib/core/database/workspaceListSnapshot.js';
import { buildWorkspaceListNodesById } from '../../lib/core/database/workspaceListSnapshotNodes.js';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning.js';
import { definedProps } from '../../lib/core/definedProps.js';
import { dailyFlowCommitSchema, dailyFlowOpenSchema } from '../../lib/core/flow/dailyFlowContract.js';
import { dailyFlowSettingsForInstant } from '../../lib/core/flow/dailyFlowDayWindow.js';
import { flowDay } from '../../lib/core/flow/dailyFlowPlanning.js';
import { refreshDailyFlowAfterSync } from '../../lib/core/flow/dailyFlowRefresh.js';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { dailyFlowSourceSettingsSchema, saveDailyFlowSourceSettings } from '../../lib/core/flow/dailyFlowSourceSettings.js';
import { readDailyFlowView } from '../../lib/core/flow/dailyFlowView.js';
import { dailyFlowViewSchema } from '../../lib/core/flow/dailyFlowViewContract.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { scheduleDesktopFlowDocumentPreparation } from './dailyFlowDocumentPreparation.js';
import { loadDesktopDailyFlowLearning } from './desktopDailyFlowLearning.js';
import { prepareDesktopNodeIndex } from './desktopNodeIndex.js';
import { saveNodeReadingState } from './nodeReadingState.js';
import { saveNodeReviewState } from './nodeReviewState.js';
import { applyReviewGrade } from './reviewMutations.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

export const desktopDailyFlowPersistence: DailyFlowPersistence = {
  learningSnapshot: loadDesktopDailyFlowLearning,
  snapshot: async (_db, nodeIds) => {
    const driver = openDatabaseConnection().driver;
    const withLearning = (nodes: ReturnType<typeof buildWorkspaceListNodesById>['nodesById']) => {
      const facts = readWorkspaceNodeLearning(driver, Object.keys(nodes));
      return Object.fromEntries(facts.map(value => [value.nodeId, definedProps({ ...nodes[value.nodeId]!, reading: value.reading, review: value.review })]));
    };
    if (nodeIds) {
      const { nodesById, trashedNodeIds } = buildWorkspaceListNodesById(queryWorkspaceRows(openDatabaseConnection().driver, nodeIds));
      return { nodeOrder: [...nodeIds], nodesById: withLearning(nodesById), trashedNodeIds };
    }
    const snapshot = loadWorkspaceListSnapshot({ includePdfOpenings: false });
    return { ...snapshot, nodesById: withLearning(snapshot.nodesById) };
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
  const input = dailyFlowOpenSchema.parse(args);
  const { sqlite } = openDatabaseConnection();
  const config = await dailyFlowSettingsForInstant(createBetterSqliteDbPort(sqlite), settings(), input.now);
  const state = sqlite.prepare('SELECT day_key, invalidated, settings_key FROM daily_flow_state WHERE id = 1').get() as
    { day_key: string; invalidated: number; settings_key: string } | undefined;
  if (!sqlite.inTransaction && (!state || state.invalidated || state.day_key !== flowDay(input.now, config)
    || state.settings_key !== JSON.stringify(config) || (input.startup && input.mode !== 'recommended'))) {
    prepareDesktopNodeIndex(sqlite, config.pushQueue.defaultPriority);
  }
  const result = await openDailyFlow(createBetterSqliteDbPort(sqlite), input, config, desktopDailyFlowPersistence);
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

export function refreshDesktopDailyFlowAfterSync(db: DbPort) {
  return refreshDailyFlowAfterSync(db, new Date().toISOString(), settings(), desktopDailyFlowPersistence);
}
