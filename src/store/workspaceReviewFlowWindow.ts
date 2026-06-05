import type { Node } from '../features/nodes/model/nodeTypes';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { definedProps } from '../shared/lib/definedProps';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';
import { selectCanonicalReviewQueueSource } from './workspaceCanonicalSelectors';
import type { WorkspaceState } from './workspaceStore';

type ReviewFlowWindowState = Pick<
  WorkspaceState,
  'nodeOrder' | 'nodesById' | 'reviewSessionMode' | 'trashedNodeIds'
> & Partial<Pick<WorkspaceState, 'trashedNodeDeletedAtById'>>;

export interface ReviewFlowWindow {
  queueNodeIds: string[];
  readyNodeIds: string[];
  upcomingNodeIds: string[];
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
  const readyPlan = buildCachedReviewQueuePlan(baseArgs);
  const queueNodeIdSet = new Set(queueNodeIds);
  const readyNodeIds = excludeKnownNodeIds(collectPlanNodeIds(readyPlan), queueNodeIdSet);
  return { queueNodeIds, readyNodeIds, upcomingNodeIds: [] };
}
