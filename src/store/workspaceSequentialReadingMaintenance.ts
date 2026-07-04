import type { NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import type { PushQueuePriority } from '../features/review/model/unifiedPushQueueRules';

import {
  buildSequentialReadingSourcePatch,
  findEnabledSequentialReadingSourceId,
  type SequentialReadingChange
} from './workspaceSequentialReading';
import { findSequentialReadingSourcesForNode } from './workspaceSequentialReadingLookup';
import type { WorkspaceState } from './workspaceStore';

function collectSubtreeNodeIds(
  rootNodeId: string,
  nodeOrder: string[],
  nodesById: WorkspaceState['nodesById']
) {
  return nodeOrder.filter((nodeId) => {
    let current = nodesById[nodeId];
    const visited = new Set<string>();
    while (current?.parentNodeId && !visited.has(current.parentNodeId)) {
      if (current.parentNodeId === rootNodeId) {
        return true;
      }
      visited.add(current.parentNodeId);
      current = nodesById[current.parentNodeId];
    }
    return nodeId === rootNodeId;
  });
}

function applyActiveReadingState(args: {
  changes: SequentialReadingChange[];
  defaultPriority: PushQueuePriority;
  nextNodesById: WorkspaceState['nodesById'];
  nodeId: string;
  now: string;
}) {
  const node = args.nextNodesById[args.nodeId];
  if (!node?.reading || node.reading.state !== 'locked') {
    return;
  }
  const nextReading: NodeReadingProfile = { ...node.reading, state: 'active' };
  args.nextNodesById[args.nodeId] = { ...node, reading: nextReading, updatedAt: args.now };
  args.changes.push({ afterReading: nextReading, beforeReading: node.reading, nodeId: args.nodeId });
}

export function buildSequentialReadingMaintenancePatch(args: {
  changedRootNodeIds: string[];
  defaultPriority: PushQueuePriority;
  nodeOrder: string[];
  nodesById: WorkspaceState['nodesById'];
  now: string;
  previousNodesById?: WorkspaceState['nodesById'];
}) {
  let nextNodesById = args.nodesById;
  const changes: SequentialReadingChange[] = [];
  const sourceNodeIds = new Set<string>();
  for (const nodeId of args.changedRootNodeIds) {
    findSequentialReadingSourcesForNode(nodeId, args.nodesById).forEach((sourceId) => sourceNodeIds.add(sourceId));
    if (args.previousNodesById) {
      findSequentialReadingSourcesForNode(nodeId, args.previousNodesById).forEach((sourceId) => sourceNodeIds.add(sourceId));
    }
  }
  for (const sourceNodeId of sourceNodeIds) {
    if (nextNodesById[sourceNodeId]?.sequentialReadingEnabled !== true) {
      continue;
    }
    const patch = buildSequentialReadingSourcePatch({ ...args, enabled: true, nodesById: nextNodesById, sourceNodeId });
    if (patch) {
      nextNodesById = patch.nodesById;
      changes.push(...patch.changes);
    }
  }
  for (const rootNodeId of args.changedRootNodeIds) {
    for (const nodeId of collectSubtreeNodeIds(rootNodeId, args.nodeOrder, nextNodesById)) {
      if (nextNodesById[nodeId]?.reading?.state !== 'locked' || findEnabledSequentialReadingSourceId(nodeId, nextNodesById)) {
        continue;
      }
      const patchNodesById = { ...nextNodesById };
      applyActiveReadingState({ ...args, changes, nextNodesById: patchNodesById, nodeId });
      nextNodesById = patchNodesById;
    }
  }
  return changes.length === 0 ? null : { changes, nodesById: nextNodesById };
}
