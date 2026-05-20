import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  cloneReadingProfile,
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry
} from './workspaceActionHistory';
import {
  advanceReviewSession,
  buildDismissedReadingProfile,
  completeReviewSession
} from './workspaceReviewReading';
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
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    const nextReviewSession = nextNodeId
      ? advanceReviewSession(snapshot.reviewSession, {
          nextNodeId,
          queueNodeIds: nextQueue
        })
      : completeReviewSession(snapshot.reviewSession, { completedAt: now });
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const beforeReading = cloneReadingProfile(node.reading);
      const afterReading = buildDismissedReadingProfile({
        currentNodeId,
        currentReading: node.reading,
        defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
        nodesById: state.nodesById,
        now
      });
      const nextNode: Node = {
        ...node,
        reading: afterReading,
        updatedAt: now
      };
      nextNodeForSync = nextNode;
      return {
        activeNodeId: nextNodeId ?? state.activeNodeId,
        appActionHistory: pushWorkspaceUndoEntry(
          state.appActionHistory,
          createTopicDismissHistoryEntry({
            afterReading,
            afterReviewSession: nextReviewSession,
            beforeReading,
            beforeReviewSession: snapshot.reviewSession,
            nodeId: currentNodeId
          })
        ),
        nodesById: {
          ...state.nodesById,
          [currentNodeId]: nextNode
        },
        reviewSession: nextReviewSession
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
