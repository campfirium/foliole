import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildDismissedReadingProfile, createEmptyReviewSession } from './workspaceReviewReading';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

export function createDismissReviewItemAction(set: WorkspaceSet, get: WorkspaceGet) {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextNode: Node = {
        ...node,
        reading: buildDismissedReadingProfile({
          currentNodeId,
          currentReading: node.reading,
          defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
          nodesById: state.nodesById,
          now
        }),
        updatedAt: now
      };
      nextNodeForSync = nextNode;
      return {
        activeNodeId: nextNodeId ?? state.activeNodeId,
        nodesById: {
          ...state.nodesById,
          [currentNodeId]: nextNode
        },
        reviewSession: nextNodeId
          ? {
              currentNodeId: nextNodeId,
              isAnswerRevealed: false,
              queueNodeIds: nextQueue,
              totalNodeCount: snapshot.reviewSession.totalNodeCount
            }
          : createEmptyReviewSession()
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
