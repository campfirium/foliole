import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';
import type { ReviewFlowState } from './workspaceStoreReadingReviewSessionFlow';

export function buildNextDismissReviewSession(args: {
  currentNodeId: string;
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  snapshot: ReviewFlowState;
  state: ReviewFlowState;
}) {
  const soonNodeIds = (args.snapshot.reviewSession.soonNodeIds ?? []).filter((nodeId) => nodeId !== args.currentNodeId);
  const remainingQueueNodeIds = args.snapshot.reviewSession.queueNodeIds.filter((nodeId) =>
    nodeId !== args.currentNodeId &&
    !soonNodeIds.includes(nodeId) &&
    Boolean(args.nextNodesById[nodeId]) &&
    !args.state.trashedNodeIds.includes(nodeId)
  );
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.state, args.now, {
    excludedNodeIds: [args.currentNodeId, ...soonNodeIds],
    nodesById: args.nextNodesById,
    releaseCurrentPin: true
  });
  const nextNodeId = remainingQueueNodeIds[0] ?? nextQueue.currentNodeId ?? soonNodeIds[0] ?? null;
  const nextSoonNodeIds = remainingQueueNodeIds.length > 0 || nextQueue.currentNodeId ? soonNodeIds : soonNodeIds.slice(1);
  const continueNodeId = nextQueue.extensionNodeIds[0] ?? null;
  const readingElapsedMsDelta = calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now);
  const readTopicDelta = args.snapshot.reviewSession.queueNodeIds.includes(args.currentNodeId) ? 1 : 0;
  return {
    nextNodeId,
    nextReviewSession: nextNodeId
      ? advanceReviewSession(args.snapshot.reviewSession, {
          handledAt: args.now,
          nextNodeId,
          queueNodeIds: remainingQueueNodeIds.length > 0 ? remainingQueueNodeIds : nextQueue.currentNodeId ? nextQueue.taskNodeIds : [],
          readingElapsedMsDelta,
          readTopicDelta,
          soonNodeIds: nextSoonNodeIds
        })
      : completeReviewSession(args.snapshot.reviewSession, {
          completedAt: args.now,
          continueNodeId,
          readingElapsedMsDelta,
          readTopicDelta
        })
  };
}
