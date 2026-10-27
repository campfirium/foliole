import { normalizeManualChildOrder, updateFolderManualChildOrder } from '../features/nodes/model/manualChildOrder';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { hasDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import { saveWorkspaceFlowSourceSettings } from './workspaceDailyFlowSourceSettingsActions';
import { buildLiveReviewQueueOutput } from './workspaceReviewLiveQueue';
import { resolveReviewSessionProgress } from './workspaceReviewSessionProgress';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { buildSequentialReadingSourcePatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function buildManualOrderReviewSessionPatch(state: WorkspaceState, nodesById: WorkspaceState['nodesById'], now: string) {
  if (!state.reviewSession.currentNodeId) {
    return null;
  }
  const queue = buildLiveReviewQueueOutput({ ...state, nodesById }, now);
  const currentNodeId = queue.currentNodeId;
  if (!currentNodeId) {
    return null;
  }
  if (
    currentNodeId === state.reviewSession.currentNodeId &&
    queue.taskNodeIds.length === state.reviewSession.queueNodeIds.length &&
    queue.taskNodeIds.every((nodeId, index) => nodeId === state.reviewSession.queueNodeIds[index])
  ) {
    return null;
  }
  const completedCount = resolveReviewSessionProgress(state.reviewSession).reviewCompletedCount;
  return {
    activeNodeId: currentNodeId,
    reviewSession: {
      ...state.reviewSession,
      currentItemStartedAt: now,
      currentNodeId,
      isAnswerRevealed: false,
      queueNodeIds: queue.taskNodeIds,
      totalNodeCount: completedCount + queue.taskNodeIds.length
    }
  };
}

function buildManualOrderSourcePatch(state: WorkspaceState, folderNodeId: string, manualChildOrder: string[], now: string) {
      const folder = state.nodesById[folderNodeId];
      if (!folder || folder.kind !== 'folder') {
        return null;
      }
      const nextNode = updateFolderManualChildOrder(folder, normalizeManualChildOrder(manualChildOrder), now);
      if (nextNode === folder) {
        return null;
      }
      let nodesById = { ...state.nodesById, [folderNodeId]: nextNode };
      const syncNodeIds = new Set([folderNodeId]);
      const sequentialPatch = nextNode.sequentialReadingEnabled === true
        ? buildSequentialReadingSourcePatch({
            defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
            enabled: true,
            nodeOrder: state.nodeOrder,
            nodesById,
            now,
            sourceNodeId: folderNodeId
          })
        : null;
      if (sequentialPatch) {
        nodesById = sequentialPatch.nodesById;
        syncNodeIds.add(sequentialPatch.sourceNodeId);
        sequentialPatch.changes.forEach((change) => syncNodeIds.add(change.nodeId));
      }
      return { nodesById, syncNodeIds };
}

export function createSetFolderManualChildOrderAction(set: WorkspaceSet, get?: () => WorkspaceState): NonNullable<WorkspaceState['setFolderManualChildOrder']> {
  return (folderNodeId: string, manualChildOrder: string[], now = new Date().toISOString()) => {
    if (get && hasDailyFlowRuntime()) {
      const before = get();
      const patch = buildManualOrderSourcePatch(before, folderNodeId, manualChildOrder, now);
      return patch ? saveWorkspaceFlowSourceSettings(set, get, before, folderNodeId, patch.nodesById,
        [...patch.syncNodeIds], now) : false;
    }
    let nextNodesForSync: WorkspaceState['nodesById'][string][] = [];
    set((state) => {
      const patch = buildManualOrderSourcePatch(state, folderNodeId, manualChildOrder, now);
      if (!patch) return state;
      const { nodesById, syncNodeIds } = patch;
      const reviewSessionPatch = buildManualOrderReviewSessionPatch(state, nodesById, now);
      nextNodesForSync = [...syncNodeIds]
        .map((nodeId) => nodesById[nodeId])
        .filter((node): node is NonNullable<WorkspaceState['nodesById'][string]> => Boolean(node));
      return {
        nodesById,
        ...(reviewSessionPatch ?? {})
      };
    });
    if (nextNodesForSync.length > 0) {
      nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
      return true;
    }
    return false;
  };
}
