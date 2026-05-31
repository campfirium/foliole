import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

export function isExistingQueueTopic(reviewSession: WorkspaceState['reviewSession'], currentNodeId: string) {
  return reviewSession.queueNodeIds.includes(currentNodeId);
}

function withoutNodeId(nodeIds: readonly string[] | undefined, nodeId: string) {
  return (nodeIds ?? []).filter((queuedNodeId) => queuedNodeId !== nodeId);
}

function resolveRemainingSessionQueue(args: {
  currentNodeId: string;
  excludedNodeIds?: readonly string[];
  nextNodesById: WorkspaceState['nodesById'];
  snapshot: WorkspaceState;
  state: WorkspaceState;
}) {
  const excludedNodeIds = new Set([args.currentNodeId, ...(args.excludedNodeIds ?? [])]);
  return args.snapshot.reviewSession.queueNodeIds.filter((nodeId) =>
    !excludedNodeIds.has(nodeId) &&
    Boolean(args.nextNodesById[nodeId]) &&
    !args.state.trashedNodeIds.includes(nodeId)
  );
}

export function advanceOrCompleteAfterReadingAction(args: {
  currentNodeId: string;
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  progressDelta: number;
  readingElapsedMsDelta: number;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}) {
  const soonNodeIds = withoutNodeId(args.snapshot.reviewSession.soonNodeIds, args.currentNodeId);
  const remainingQueueNodeIds = resolveRemainingSessionQueue({
    currentNodeId: args.currentNodeId,
    excludedNodeIds: soonNodeIds,
    nextNodesById: args.nextNodesById,
    snapshot: args.snapshot,
    state: args.state
  });
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.state, args.now, {
    excludedNodeIds: [args.currentNodeId, ...soonNodeIds],
    nodesById: args.nextNodesById,
    releaseCurrentPin: true
  });
  const nextQueueNodeId = remainingQueueNodeIds[0] ?? nextQueue.currentNodeId;
  if (nextQueueNodeId) {
    return advanceReviewSession(args.snapshot.reviewSession, {
      handledAt: args.now,
      nextNodeId: nextQueueNodeId,
      queueNodeIds: remainingQueueNodeIds.length > 0 ? remainingQueueNodeIds : nextQueue.taskNodeIds,
      readingElapsedMsDelta: args.readingElapsedMsDelta,
      readTopicDelta: args.progressDelta,
      soonNodeIds
    });
  }
  const nextSoonNodeId = soonNodeIds[0] ?? null;
  if (nextSoonNodeId) {
    return advanceReviewSession(args.snapshot.reviewSession, {
      handledAt: args.now,
      nextNodeId: nextSoonNodeId,
      queueNodeIds: [],
      readingElapsedMsDelta: args.readingElapsedMsDelta,
      readTopicDelta: args.progressDelta,
      soonNodeIds: soonNodeIds.slice(1)
    });
  }
  return completeReviewSession(args.snapshot.reviewSession, {
    completedAt: args.now,
    continueNodeId: nextQueue.extensionNodeIds[0] ?? null,
    readingElapsedMsDelta: args.readingElapsedMsDelta,
    readTopicDelta: args.progressDelta
  });
}

export function advanceAfterSoonAction(args: {
  currentNodeId: string;
  now: string;
  progressDelta: number;
  readingElapsedMsDelta: number;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}) {
  const remainingQueueNodeIds = withoutNodeId(args.snapshot.reviewSession.queueNodeIds, args.currentNodeId)
    .filter((nodeId) => args.state.nodesById[nodeId] && !args.state.trashedNodeIds.includes(nodeId));
  const soonNodeIds = [
    ...withoutNodeId(args.snapshot.reviewSession.soonNodeIds, args.currentNodeId),
    args.currentNodeId
  ];
  const nextQueueNodeId = remainingQueueNodeIds[0] ?? null;
  if (nextQueueNodeId) {
    return advanceReviewSession(args.snapshot.reviewSession, {
      handledAt: args.now,
      nextNodeId: nextQueueNodeId,
      queueNodeIds: remainingQueueNodeIds,
      readingElapsedMsDelta: args.readingElapsedMsDelta,
      readTopicDelta: args.progressDelta,
      soonNodeIds
    });
  }
  const nextSoonNodeId = soonNodeIds[0] ?? null;
  return nextSoonNodeId
    ? advanceReviewSession(args.snapshot.reviewSession, {
        handledAt: args.now,
        nextNodeId: nextSoonNodeId,
        queueNodeIds: [],
        readingElapsedMsDelta: args.readingElapsedMsDelta,
        readTopicDelta: args.progressDelta,
        soonNodeIds: soonNodeIds.slice(1)
      })
    : completeReviewSession(args.snapshot.reviewSession, {
        completedAt: args.now,
        readingElapsedMsDelta: args.readingElapsedMsDelta,
        readTopicDelta: args.progressDelta
      });
}
