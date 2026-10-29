import { planSequentialReadingSourceStates } from '../../lib/core/review/sequentialReadingSourceStates';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { hasDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import { saveWorkspaceFlowSourceSettings } from './workspaceDailyFlowSourceSettingsActions';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { buildSequentialReadingSourcePatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;


export function createSetNodeSequentialReadingAction(
  set: WorkspaceSet, get?: () => WorkspaceState
): WorkspaceState['setNodeSequentialReading'] {
  return (nodeId, enabled, now = new Date().toISOString()) => {
    if (get && hasDailyFlowRuntime()) {
      const before = get();
      const plan = planSequentialReadingSourceStates({ enabled, nodeOrder: before.nodeOrder,
        nodesById: before.nodesById, sourceNodeId: nodeId });
      return plan ? saveWorkspaceFlowSourceSettings(set, get, before, nodeId, {
        shelvedAt: before.nodesById[nodeId]!.shelvedAt ?? null, manualChildOrder: before.nodesById[nodeId]!.manualChildOrder ?? null, sequentialReadingEnabled: enabled
      }, plan.changes, now) : false;
    }
    let nextNodesForSync: WorkspaceState['nodesById'][string][] = [];
    let updated = false;
    set((state) => {
      const patch = buildSequentialReadingSourcePatch({
        defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
        enabled,
        nodeOrder: state.nodeOrder,
        nodesById: state.nodesById,
        now,
        sourceNodeId: nodeId
      });
      if (!patch) {
        return state;
      }
      const affectedNodeIds = new Set([patch.sourceNodeId, ...patch.changes.map((change) => change.nodeId)]);
      nextNodesForSync = [...affectedNodeIds]
        .map((affectedNodeId) => patch.nodesById[affectedNodeId])
        .filter((node): node is NonNullable<WorkspaceState['nodesById'][string]> => Boolean(node));
      updated = true;
      return {
        nodesById: patch.nodesById,
      };
    });
    nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
    return updated;
  };
}
