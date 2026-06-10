import type { Node } from '../features/nodes/model/nodeTypes';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { definedProps } from '../shared/lib/definedProps';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';
import { selectCanonicalReviewQueueSource } from './workspaceCanonicalSelectors';
import type { WorkspaceState } from './workspaceStore';

const EXTENSION_NODE_LIMIT = 20;
type ReviewLiveQueueState = Pick<
  WorkspaceState,
  'nodeOrder' | 'nodesById' | 'reviewSession' | 'reviewSessionMode' | 'trashedNodeIds'
> & Partial<Pick<WorkspaceState, 'trashedNodeDeletedAtById'>>;

export interface ReviewLiveQueueOutput {
  currentNodeId: string | null;
  extensionNodeIds: string[];
  taskNodeIds: string[];
  visibleNodeIds: string[];
}

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

function excludeNodeIds(nodeIds: string[], excludedNodeIds: Set<string>) {
  if (excludedNodeIds.size === 0) return nodeIds;
  return nodeIds.filter((nodeId) => !excludedNodeIds.has(nodeId));
}

function resolveTaskNodeIds(args: {
  fsrsQueueNodeIds: string[];
  mode: ReviewSessionMode;
  queueNodeIds: string[];
  readingQueueNodeIds: string[];
}) {
  if (args.mode === 'review-first') return args.fsrsQueueNodeIds;
  if (args.mode === 'reading-only') return args.readingQueueNodeIds;
  return args.queueNodeIds.length > 0 ? args.queueNodeIds : args.readingQueueNodeIds;
}

function buildExtensionNodeIds(args: {
  fsrsQueueNodeIds: string[];
  readingQueueNodeIds: string[];
  taskNodeIds: string[];
}) {
  const taskNodeIds = new Set(args.taskNodeIds);
  return uniqueNodeIds([...args.fsrsQueueNodeIds, ...args.readingQueueNodeIds])
    .filter((nodeId) => !taskNodeIds.has(nodeId))
    .slice(0, EXTENSION_NODE_LIMIT);
}

export function buildLiveReviewQueue(
  state: ReviewLiveQueueState,
  now: string,
  overrides: {
    mode?: ReviewSessionMode;
    nodeOrder?: string[];
    nodesById?: Record<string, Node>;
  } = {}
) {
  return buildLiveReviewQueueOutput(state, now, overrides).taskNodeIds;
}

export function buildStartReviewSessionQueue(state: ReviewLiveQueueState, now: string) {
  const liveQueue = buildLiveReviewQueueOutput(state, now, { mode: state.reviewSessionMode });
  if (liveQueue.taskNodeIds.length > 0) {
    return liveQueue.taskNodeIds;
  }
  if (state.reviewSessionMode === 'recommended') {
    return buildLiveReviewQueue(state, now, { mode: 'reading-only' });
  }
  return [];
}

export function buildLiveReviewQueueOutput(
  state: ReviewLiveQueueState,
  now: string,
  overrides: {
    mode?: ReviewSessionMode;
    nodeOrder?: string[];
    nodesById?: Record<string, Node>;
    excludedNodeIds?: string[];
    pinnedNodeId?: string | null;
  } = {}
): ReviewLiveQueueOutput {
  const mode = overrides.mode ?? state.reviewSessionMode;
  const excludedNodeIds = new Set(overrides.excludedNodeIds ?? []);
  const canonicalSource = selectCanonicalReviewQueueSource({
    nodeOrder: overrides.nodeOrder ?? state.nodeOrder,
    nodesById: overrides.nodesById ?? state.nodesById,
    ...definedProps({ trashedNodeDeletedAtById: state.trashedNodeDeletedAtById }),
    trashedNodeIds: state.trashedNodeIds
  });
  const plan = buildCachedReviewQueuePlan({
    mode,
    nodeOrder: canonicalSource.nodeOrder,
    nodesById: canonicalSource.nodesById,
    now,
    pushQueueRules: getCurrentReviewSchedulerSettings().pushQueue,
    trashedNodeIds: canonicalSource.trashedNodeIds
  });
  const taskNodeIds = excludeNodeIds(
    prioritizePinnedNode(resolveTaskNodeIds({
      fsrsQueueNodeIds: plan.fsrsQueueNodeIds,
      mode,
      queueNodeIds: plan.queueNodeIds,
      readingQueueNodeIds: plan.readingQueueNodeIds
    }), overrides.pinnedNodeId),
    excludedNodeIds
  );
  const extensionNodeIds = buildExtensionNodeIds({
    fsrsQueueNodeIds: excludeNodeIds(plan.fsrsQueueNodeIds, excludedNodeIds),
    readingQueueNodeIds: excludeNodeIds(plan.readingQueueNodeIds, excludedNodeIds),
    taskNodeIds
  });
  const visibleNodeIds = uniqueNodeIds([...taskNodeIds, ...extensionNodeIds]);
  return {
    currentNodeId: taskNodeIds[0] ?? null,
    extensionNodeIds,
    taskNodeIds,
    visibleNodeIds
  };
}

export function buildCurrentReviewSessionQueue(
  state: ReviewLiveQueueState,
  now: string,
  overrides: {
    nodesById?: Record<string, Node>;
  } = {}
) {
  return buildCurrentReviewSessionQueueOutput(state, now, overrides).taskNodeIds;
}

export function buildCurrentReviewSessionQueueOutput(
  state: ReviewLiveQueueState,
  now: string,
  overrides: {
    nodesById?: Record<string, Node>;
    excludedNodeIds?: string[];
    releaseCurrentPin?: boolean;
  } = {}
): ReviewLiveQueueOutput {
  return buildLiveReviewQueueOutput(state, now, {
    pinnedNodeId: overrides.releaseCurrentPin ? null : state.reviewSession.currentNodeId,
    ...definedProps({
      excludedNodeIds: overrides.excludedNodeIds,
      nodesById: overrides.nodesById
    })
  });
}
