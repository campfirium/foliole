import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildNextReadingProfile, buildDismissedReadingProfile } from './workspaceReviewReading';
import type { SequentialReadingChange } from './workspaceSequentialReading';
import {
  buildSequentialReadingDismissPatch,
  buildSequentialReadingReadPatch
} from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';
import { buildNextReadingReviewState } from './workspaceStoreReadingReviewSchedule';

export type ReadingReviewDomainAction = 'read' | 'later' | 'dismiss';

export interface ReadingReviewDomainPatch {
  afterReading: Node['reading'];
  beforeReading: Node['reading'];
  nextNode: Node;
  nextNodesById: WorkspaceState['nodesById'];
  nextNodesForSync: Node[];
  sequentialChanges: SequentialReadingChange[];
}

function buildReadOrLaterPatch(args: {
  action: Extract<ReadingReviewDomainAction, 'read' | 'later'>;
  currentNode: Node;
  currentNodeId: string;
  now: string;
  releaseSequentialReading?: boolean;
  snapshot: Pick<WorkspaceState, 'nodesById'>;
  state: Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>;
}): ReadingReviewDomainPatch {
  const nextReading = buildNextReadingReviewState({
    currentNode: args.currentNode,
    currentNodeId: args.currentNodeId,
    ...(args.action === 'later' ? { growthFactorExponent: 0.5 } : {}),
    now: args.now,
    snapshot: args.snapshot
  });
  const afterReading = buildNextReadingProfile(nextReading, args.currentNode.reading);
  const nextNode: Node = { ...args.currentNode, reading: afterReading, updatedAt: args.now };
  const nextNodesById = { ...args.state.nodesById, [args.currentNodeId]: nextNode };
  const sequentialPatch = args.action === 'read' && args.releaseSequentialReading
    ? buildSequentialReadingReadPatch({
        defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
        nodeOrder: args.state.nodeOrder,
        nodesById: nextNodesById,
        now: args.now,
        readNodeId: args.currentNodeId
      })
    : null;
  const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
  return {
    afterReading,
    beforeReading: args.currentNode.reading,
    nextNode,
    nextNodesById: finalNodesById,
    nextNodesForSync: [
      nextNode,
      ...(sequentialPatch?.changes ?? [])
        .map((change) => finalNodesById[change.nodeId])
        .filter((changedNode): changedNode is Node => Boolean(changedNode))
    ],
    sequentialChanges: sequentialPatch?.changes ?? []
  };
}

function buildDismissPatch(args: {
  currentNode: Node;
  currentNodeId: string;
  now: string;
  state: Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>;
}): ReadingReviewDomainPatch {
  const defaultPriority = getCurrentReviewSchedulerSettings().pushQueue.defaultPriority;
  const afterReading = buildDismissedReadingProfile({
    currentNodeId: args.currentNodeId,
    currentReading: args.currentNode.reading,
    defaultPriority,
    nodesById: args.state.nodesById,
    now: args.now
  });
  const nextNode: Node = { ...args.currentNode, reading: afterReading, updatedAt: args.now };
  const nextNodesById = { ...args.state.nodesById, [args.currentNodeId]: nextNode };
  const sequentialPatch = buildSequentialReadingDismissPatch({
    defaultPriority,
    dismissedNodeId: args.currentNodeId,
    nodeOrder: args.state.nodeOrder,
    nodesById: nextNodesById,
    now: args.now
  });
  const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
  return {
    afterReading,
    beforeReading: args.currentNode.reading,
    nextNode,
    nextNodesById: finalNodesById,
    nextNodesForSync: [
      nextNode,
      ...(sequentialPatch?.changes ?? [])
        .map((change) => finalNodesById[change.nodeId])
        .filter((changedNode): changedNode is Node => Boolean(changedNode))
    ],
    sequentialChanges: sequentialPatch?.changes ?? []
  };
}

export function buildReadingReviewDomainPatch(args: {
  action: ReadingReviewDomainAction;
  currentNodeId: string;
  now: string;
  releaseSequentialReading?: boolean;
  snapshot: Pick<WorkspaceState, 'nodesById'>;
  state: Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>;
}): ReadingReviewDomainPatch | null {
  const currentNode = args.state.nodesById[args.currentNodeId];
  if (!currentNode) return null;
  if (args.action === 'dismiss') {
    return buildDismissPatch({ ...args, currentNode });
  }
  return buildReadOrLaterPatch({ ...args, action: args.action, currentNode });
}
