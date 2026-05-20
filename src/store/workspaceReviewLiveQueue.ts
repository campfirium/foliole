import type { Node } from '../features/nodes/model/nodeTypes';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';
import type { WorkspaceState } from './workspaceStore';

export function buildLiveReviewQueue(
  state: WorkspaceState,
  now: string,
  overrides: {
    mode?: ReviewSessionMode;
    nodeOrder?: string[];
    nodesById?: Record<string, Node>;
  } = {}
) {
  return buildCachedReviewQueuePlan({
    mode: overrides.mode ?? state.reviewSessionMode,
    nodeOrder: overrides.nodeOrder ?? state.nodeOrder,
    nodesById: overrides.nodesById ?? state.nodesById,
    now,
    pushQueueRules: getCurrentReviewSchedulerSettings().pushQueue,
    trashedNodeIds: state.trashedNodeIds
  }).queueNodeIds;
}

export function buildCurrentReviewSessionQueue(
  state: WorkspaceState,
  now: string,
  overrides: {
    nodesById?: Record<string, Node>;
  } = {}
) {
  const nodesById = overrides.nodesById ?? state.nodesById;
  const sessionNodeIds = state.reviewSession.currentNodeId
    ? [state.reviewSession.currentNodeId, ...state.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== state.reviewSession.currentNodeId)]
    : state.reviewSession.queueNodeIds;
  const plan = buildCachedReviewQueuePlan({
    nodeOrder: sessionNodeIds,
    nodesById,
    now,
    pushQueueRules: getCurrentReviewSchedulerSettings().pushQueue,
    trashedNodeIds: state.trashedNodeIds
  });
  const actionableNodeIds = new Set([...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds]);
  if (actionableNodeIds.size === 0) {
    return buildLiveReviewQueue(state, now, { nodesById });
  }
  if (plan.fsrsQueueNodeIds.length === 0) return plan.readingQueueNodeIds;
  return sessionNodeIds.filter((nodeId) => actionableNodeIds.has(nodeId));
}
