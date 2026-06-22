import { resolveCurrentDayStart, resolveStoredReviewDueAt } from '../../lib/core/review/reviewDayBoundary.js';
import type { Node } from '../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode } from '../features/review/model/reviewItemKind';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { definedProps } from '../shared/lib/definedProps';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';
import { resolveReviewQueueReadingAvailableAt } from './reviewQueuePlannerReadingPaths';
import { selectCanonicalReviewQueueSource } from './workspaceCanonicalSelectors';
import type { WorkspaceState } from './workspaceStore';

type ReviewFlowWindowState = Pick<
  WorkspaceState,
  'nodeOrder' | 'nodesById' | 'reviewSessionMode' | 'trashedNodeIds'
> & Partial<Pick<WorkspaceState, 'trashedNodeDeletedAtById'>>;

export interface ReviewFlowWindow {
  dayBuckets: ReviewFlowDayBucket[];
  dayOffsetByNodeId: Record<string, number | undefined>;
  queueNodeIds: string[];
  readyNodeIds: string[];
  upcomingNodeIds: string[];
}

export interface ReviewFlowDayBucket {
  dayOffset: number;
  nodeIds: string[];
}

function uniqueNodeIds(nodeIds: string[]) {
  const seen = new Set<string>();
  return nodeIds.filter((nodeId) => {
    if (seen.has(nodeId)) return false;
    seen.add(nodeId);
    return true;
  });
}

function collectPlanNodeIds(plan: {
  fsrsQueueNodeIds: string[];
  queueNodeIds: string[];
  readingQueueNodeIds: string[];
}) {
  return uniqueNodeIds([...plan.queueNodeIds, ...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds]);
}

function excludeKnownNodeIds(nodeIds: string[], knownNodeIds: Set<string>) {
  return nodeIds.filter((nodeId) => !knownNodeIds.has(nodeId));
}

function buildKnownFlowNodeIds(queueNodeIds: string[], readyNodeIds: string[]) {
  return new Set([...queueNodeIds, ...readyNodeIds]);
}

function resolveFlowNodeAvailableAt(node: Node | undefined, newDayStartsAtHour: number) {
  if (!node) return null;
  if (isFsrsReviewItemNode(node)) {
    return resolveStoredReviewDueAt({
      due: node.review?.due ?? node.createdAt,
      newDayStartsAtHour,
      scheduledDays: node.review?.scheduledDays ?? 0
    });
  }
  return resolveReviewQueueReadingAvailableAt(node, newDayStartsAtHour);
}

function resolveDayOffset(now: string, availableAt: string | null, newDayStartsAtHour: number) {
  if (!availableAt) return 0;
  const nowStart = resolveCurrentDayStart(new Date(now), newDayStartsAtHour).getTime();
  const availableStart = resolveCurrentDayStart(new Date(availableAt), newDayStartsAtHour).getTime();
  if (!Number.isFinite(nowStart) || !Number.isFinite(availableStart)) return 0;
  return Math.round((availableStart - nowStart) / 86_400_000);
}

function buildFlowDayBuckets(args: {
  nodeIds: string[];
  nodesById: Record<string, Node>;
  now: string;
  newDayStartsAtHour: number;
}) {
  const buckets = new Map<number, string[]>();
  args.nodeIds.forEach((nodeId) => {
    const dayOffset = Math.max(0, resolveDayOffset(
      args.now,
      resolveFlowNodeAvailableAt(args.nodesById[nodeId], args.newDayStartsAtHour),
      args.newDayStartsAtHour
    ));
    const bucket = buckets.get(dayOffset) ?? [];
    bucket.push(nodeId);
    buckets.set(dayOffset, bucket);
  });
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([dayOffset, nodeIds]) => ({ dayOffset, nodeIds }));
}

function buildDayOffsetByNodeId(args: {
  nodeIds: string[];
  nodesById: Record<string, Node>;
  now: string;
  newDayStartsAtHour: number;
}) {
  return Object.fromEntries(args.nodeIds.map((nodeId) => [
    nodeId,
    resolveDayOffset(
      args.now,
      resolveFlowNodeAvailableAt(args.nodesById[nodeId], args.newDayStartsAtHour),
      args.newDayStartsAtHour
    )
  ]));
}

export function buildReviewFlowWindow(
  state: ReviewFlowWindowState,
  now: string,
  queueNodeIds: string[],
  overrides: {
    mode?: ReviewSessionMode;
    nodeOrder?: string[];
    nodesById?: Record<string, Node>;
  } = {}
): ReviewFlowWindow {
  const mode = overrides.mode ?? state.reviewSessionMode;
  const canonicalSource = selectCanonicalReviewQueueSource({
    nodeOrder: overrides.nodeOrder ?? state.nodeOrder,
    nodesById: overrides.nodesById ?? state.nodesById,
    ...definedProps({ trashedNodeDeletedAtById: state.trashedNodeDeletedAtById }),
    trashedNodeIds: state.trashedNodeIds
  });
  const baseArgs = {
    mode,
    nodeOrder: canonicalSource.nodeOrder,
    nodesById: canonicalSource.nodesById,
    now,
    pushQueueRules: getCurrentReviewSchedulerSettings().pushQueue,
    trashedNodeIds: canonicalSource.trashedNodeIds
  };
  const newDayStartsAtHour = getCurrentReviewSchedulerSettings().newDayStartsAtHour;
  const readyPlan = buildCachedReviewQueuePlan(baseArgs);
  const queueNodeIdSet = new Set(queueNodeIds);
  const readyNodeIds = excludeKnownNodeIds(collectPlanNodeIds(readyPlan), queueNodeIdSet);
  const scheduledPlan = buildCachedReviewQueuePlan({ ...baseArgs, includeScheduled: true });
  const upcomingNodeIds = excludeKnownNodeIds(
    collectPlanNodeIds(scheduledPlan),
    buildKnownFlowNodeIds(queueNodeIds, readyNodeIds)
  );
  const dayBuckets = buildFlowDayBuckets({
    newDayStartsAtHour,
    nodeIds: upcomingNodeIds,
    nodesById: canonicalSource.nodesById,
    now
  });
  const dayOffsetByNodeId = buildDayOffsetByNodeId({
    newDayStartsAtHour,
    nodeIds: uniqueNodeIds([...queueNodeIds, ...readyNodeIds, ...upcomingNodeIds]),
    nodesById: canonicalSource.nodesById,
    now
  });
  return { dayBuckets, dayOffsetByNodeId, queueNodeIds, readyNodeIds, upcomingNodeIds };
}
