import { sameLearningProfile } from '../../lib/core/flow/cycleFlowLearning';
import { saveDailyFlowSourceSettingsRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

import { openWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;
const sourcePreferences = (node: WorkspaceState['nodesById'][string]) => ({
  manualChildOrder: node.manualChildOrder ?? null, sequentialReadingEnabled: node.sequentialReadingEnabled ?? null
});

export async function saveWorkspaceFlowSourceSettings(set: Set, get: () => WorkspaceState, before: WorkspaceState,
  sourceNodeId: string, nodesById: WorkspaceState['nodesById'], changedIds: string[], now: string) {
  const readings = changedIds.filter(id => !sameLearningProfile(before.nodesById[id]?.reading, nodesById[id]?.reading))
    .map(nodeId => ({ nodeId, before: before.nodesById[nodeId]?.reading ?? null, after: nodesById[nodeId]?.reading ?? null }));
  const source = before.nodesById[sourceNodeId]!;
  const after = sourcePreferences(nodesById[sourceNodeId]!);
  try {
    const scope = before.libraryScope ?? before.reviewSession.daily?.scope;
    if (!scope) throw new Error('daily_flow_library_missing');
    if (!await saveDailyFlowSourceSettingsRuntime({ scope, sourceNodeId, now, before: sourcePreferences(source), after, readings })) return false;
    if (get().libraryScope !== before.libraryScope) return false;
    set(state => {
      const merged = { ...state.nodesById };
      for (const value of readings) {
        const node = merged[value.nodeId];
        if (node && sameLearningProfile(node.reading, value.before)) merged[value.nodeId] = { ...node, reading: value.after };
      }
      const current = merged[sourceNodeId];
      if (current && JSON.stringify(sourcePreferences(current)) === JSON.stringify(sourcePreferences(source))) {
        merged[sourceNodeId] = { ...current, ...after, updatedAt: now };
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
