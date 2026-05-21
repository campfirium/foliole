import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import type { WorkspaceState } from './workspaceStore';

type NodeSnapshot = WorkspaceState['nodesById'][string];
type MovePatch = Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>;

export function applySequentialReadingCreatedChild(args: {
  nextNode: NodeSnapshot;
  nextNodeOrder: string[];
  nextNodesById: WorkspaceState['nodesById'];
  nodeId: string;
  state: WorkspaceState;
  timestamp: string;
}) {
  const sequentialPatch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: [args.nodeId],
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    nodeOrder: args.nextNodeOrder,
    nodesById: args.nextNodesById,
    now: args.timestamp,
    previousNodesById: args.state.nodesById
  });
  const finalNodesById = sequentialPatch?.nodesById ?? args.nextNodesById;
  return {
    nextNode: finalNodesById[args.nodeId] ?? args.nextNode,
    nodesById: finalNodesById,
    sequentialChangedNodes: (sequentialPatch?.changes ?? [])
      .map((change) => finalNodesById[change.nodeId])
      .filter((node): node is NodeSnapshot => Boolean(node))
  };
}

export function applySequentialReadingMovedNodes(args: {
  patch: MovePatch;
  rootNodeIds: string[];
  state: WorkspaceState;
}) {
  const sequentialPatch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: args.rootNodeIds,
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    nodeOrder: args.patch.nodeOrder,
    nodesById: args.patch.nodesById,
    now: new Date().toISOString(),
    previousNodesById: args.state.nodesById
  });
  const patch = sequentialPatch ? { ...args.patch, nodesById: sequentialPatch.nodesById } : args.patch;
  return {
    patch,
    syncNodeIds: [...args.rootNodeIds, ...(sequentialPatch?.changes.map((change) => change.nodeId) ?? [])]
  };
}
