import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  cloneReadingProfile,
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry
} from './workspaceActionHistory';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
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

function buildNextDismissReviewSession(args: {
  currentNodeId: string;
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}) {
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.state, args.now, {
    excludedNodeIds: [args.currentNodeId],
    nodesById: args.nextNodesById,
    releaseCurrentPin: true
  });
  const nextNodeId = nextQueue.currentNodeId;
  const continueNodeId = nextQueue.extensionNodeIds[0] ?? null;
  return {
    nextNodeId,
    nextReviewSession: nextNodeId
      ? advanceReviewSession(args.snapshot.reviewSession, {
          nextNodeId,
          queueNodeIds: nextQueue.taskNodeIds
        })
      : completeReviewSession(args.snapshot.reviewSession, { completedAt: args.now, continueNodeId })
  };
}

export function createDismissReviewItemAction(set: WorkspaceSet, get: WorkspaceGet) {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
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
      const nextNodesById = { ...state.nodesById, [currentNodeId]: nextNode };
      const { nextNodeId, nextReviewSession } = buildNextDismissReviewSession({
        currentNodeId,
        nextNodesById,
        now,
        snapshot,
        state
      });
      return {
        activeNodeId: nextNodeId ?? nextReviewSession.continueNodeId ?? state.activeNodeId,
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
        nodesById: nextNodesById,
        reviewSession: nextReviewSession
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
