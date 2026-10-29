import { sameLearningProfile } from '../../lib/core/flow/cycleFlowLearning';
import type { DailyFlowSourceSettingsArgs } from '../../lib/core/flow/dailyFlowSourceSettings';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { saveDailyFlowSourceSettingsRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

import { openWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;
export const sourcePreferences = (node: WorkspaceState['nodesById'][string]) => ({
  shelvedAt: node.shelvedAt ?? null, manualChildOrder: node.manualChildOrder ?? null, sequentialReadingEnabled: node.sequentialReadingEnabled ?? null
});

export async function saveWorkspaceFlowSourceSettings(set: Set, get: () => WorkspaceState, before: WorkspaceState,
  sourceNodeId: string, after: DailyFlowSourceSettingsArgs['after'], readings: DailyFlowSourceSettingsArgs['readings'], now: string) {
  const source = before.nodesById[sourceNodeId]!;
  try {
    const scope = before.libraryScope ?? before.reviewSession.daily?.scope;
    if (!scope) throw new Error('daily_flow_library_missing');
    const result = await saveDailyFlowSourceSettingsRuntime({ scope, sourceNodeId, now, before: sourcePreferences(source), after, readings,
      defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority }, before.nodesById);
    if (get().libraryScope !== before.libraryScope) return false;
    set(state => {
      const merged = { ...state.nodesById };
      for (const value of result.readings) {
        const node = merged[value.nodeId];
        if (node && sameLearningProfile(node.reading, before.nodesById[value.nodeId]?.reading)) merged[value.nodeId] = { ...node, reading: value.reading };
      }
      const current = merged[sourceNodeId];
      if (current && JSON.stringify(sourcePreferences(current)) === JSON.stringify(sourcePreferences(source))) {
        merged[sourceNodeId] = { ...current, ...after, updatedAt: result.updatedAt };
      }
      return { nodesById: merged };
    });
    if (get().reviewSession.daily) await openWorkspaceDailyFlow(set, get, { now, mode: get().reviewSessionMode,
      refresh: true, prepareOnly: !get().reviewSession.sessionStartedAt }, undefined, true);
    return true;
  } catch (error) {
    logRuntimeError('could not save Flow source settings', { area: 'persistence', action: 'save_daily_flow_source_settings', error });
    return false;
  }
}
