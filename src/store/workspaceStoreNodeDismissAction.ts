import { hasNodeContent, type Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { buildDismissedReadingProfile } from './workspaceReviewReading';
import { buildSequentialReadingDismissPatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function persistDismissedReadingNodes(nodes: WorkspaceState['nodesById'][string][], updatedAt: string) {
  nodes.forEach((node) => void saveNodeReadingStateToRuntime({
    nodeId: node.id,
    reading: node.reading ?? null,
    updatedAt
  }));
}

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
        reading: afterReading
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
        nodesById: finalNodesById
      };
    });
    persistDismissedReadingNodes(nextNodesForSync, now);
    return dismissed;
  };
}
