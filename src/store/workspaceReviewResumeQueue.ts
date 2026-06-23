import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import { buildReviewFlowWindow } from './workspaceReviewFlowWindow';
import {
  buildCurrentReviewSessionQueue,
  buildLiveReviewQueue
} from './workspaceReviewLiveQueue';
import type { ReviewSessionResumeOptions, WorkspaceState } from './workspaceStore';

type ReviewResumeQueueState = Pick<
  WorkspaceState,
  'nodeOrder' | 'nodesById' | 'reviewSession' | 'reviewSessionMode' | 'trashedNodeIds'
> & Partial<Pick<WorkspaceState, 'trashedNodeDeletedAtById'>>;

function uniqueNodeIds(nodeIds: string[]) {
  const seen = new Set<string>();
  return nodeIds.filter((nodeId) => {
    if (seen.has(nodeId)) return false;
    seen.add(nodeId);
    return true;
  });
}

function prioritizePinnedNode(nodeIds: string[], pinnedNodeId: string | null | undefined) {
  if (!pinnedNodeId || !nodeIds.includes(pinnedNodeId)) {
    return nodeIds;
  }
  return [pinnedNodeId, ...nodeIds.filter((nodeId) => nodeId !== pinnedNodeId)];
}

function buildCurrentSessionTaskQueue(state: ReviewResumeQueueState, now: string) {
  if (
    state.reviewSession.queueNodeIds.length > 0 &&
    state.reviewSession.queueNodeIds.every((nodeId) => isReadingReviewItemNode(state.nodesById[nodeId]))
  ) {
    return buildLiveReviewQueue(state, now, { mode: 'reading-only' });
  }
  return buildCurrentReviewSessionQueue(state, now);
}

function prioritizeResumeNode(args: {
  currentNodeId: string | null;
  preferredNodeId: string | null | undefined;
  queueNodeIds: string[];
}) {
  const pinnedNodeId =
    args.currentNodeId && args.queueNodeIds.includes(args.currentNodeId)
      ? args.currentNodeId
      : args.preferredNodeId && args.queueNodeIds.includes(args.preferredNodeId)
        ? args.preferredNodeId
        : null;
  return prioritizePinnedNode(args.queueNodeIds, pinnedNodeId);
}

function buildScheduledResumeFallbackQueue(
  state: ReviewResumeQueueState,
  now: string,
  preferredNodeId?: string | null
) {
  const flowWindow = buildReviewFlowWindow(state, now, []);
  const visibleNodeIds = uniqueNodeIds([
    ...flowWindow.readyNodeIds,
    ...flowWindow.dayBuckets.flatMap((bucket) => bucket.nodeIds)
  ]);
  if (preferredNodeId && visibleNodeIds.includes(preferredNodeId)) {
    return prioritizePinnedNode(visibleNodeIds, preferredNodeId);
  }
  if (flowWindow.readyNodeIds.length > 0) {
    return flowWindow.readyNodeIds;
  }
  const firstDayBucket = flowWindow.dayBuckets.find((bucket) => bucket.nodeIds.length > 0);
  return firstDayBucket?.nodeIds ?? [];
}

export function buildResumeReviewSessionQueue(
  state: ReviewResumeQueueState,
  now: string,
  options: ReviewSessionResumeOptions = {}
) {
  const currentQueueNodeIds = prioritizeResumeNode({
    currentNodeId: state.reviewSession.currentNodeId,
    preferredNodeId: options.preferredNodeId,
    queueNodeIds: buildCurrentSessionTaskQueue(state, now)
  });
  if (currentQueueNodeIds.length > 0) {
    return currentQueueNodeIds;
  }
  if (!options.includeScheduledFallback) {
    return [];
  }
  return buildScheduledResumeFallbackQueue(state, now, options.preferredNodeId);
}
