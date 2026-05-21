import { hasNodeContent, type Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  cloneReadingProfile,
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry
} from './workspaceActionHistory';
import { buildDismissedReadingProfile } from './workspaceReviewReading';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { buildSequentialReadingDismissPatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export function createDismissNodeAction(set: WorkspaceSet): WorkspaceState['dismissNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let dismissed = false;
    let nextNodesForSync: WorkspaceState['nodesById'][string][] = [];
    set((state) => {
      const node = state.nodesById[nodeId];
      if (
        !node ||
        isProtectedRootNode(node) ||
        !hasNodeContent(node) ||
        !isReadingReviewItemNode(node) ||
        node.reading?.state === 'dismissed'
      ) {
        return state;
      }
      dismissed = true;
      const beforeReading = cloneReadingProfile(node.reading);
      const defaultPriority = getCurrentReviewSchedulerSettings().pushQueue.defaultPriority;
      const afterReading = buildDismissedReadingProfile({
        currentNodeId: nodeId,
        currentReading: node.reading,
        defaultPriority,
        nodesById: state.nodesById,
        now
      });
      const nextNode: Node = {
        ...node,
        reading: afterReading,
        updatedAt: now
      };
      const nextNodesById = { ...state.nodesById, [nodeId]: nextNode };
      const sequentialPatch = buildSequentialReadingDismissPatch({
        defaultPriority,
        dismissedNodeId: nodeId,
        nodeOrder: state.nodeOrder,
        nodesById: nextNodesById,
        now
      });
      const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
      nextNodesForSync = [nextNode, ...(sequentialPatch?.changes ?? [])
        .map((change) => finalNodesById[change.nodeId])
        .filter((changedNode): changedNode is Node => Boolean(changedNode))];
      return {
        appActionHistory: pushWorkspaceUndoEntry(
          state.appActionHistory,
          createTopicDismissHistoryEntry({
            afterReading,
            beforeReading,
            nodeId,
            ...(sequentialPatch?.changes.length ? { relatedReadings: sequentialPatch.changes } : {})
          })
        ),
        nodesById: finalNodesById
      };
    });
    nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
    return dismissed;
  };
}
