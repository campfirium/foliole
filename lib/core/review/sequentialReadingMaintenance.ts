import {
  buildSequentialReadingSourcePatch,
  findEnabledSequentialReadingSourceId,
  type SequentialReadingChange
} from './sequentialReading.js';
import { findSequentialReadingSourcesForNode } from './sequentialReadingLookup.js';
import type { SequentialReadingNode, SequentialReadingProfile as NodeReadingProfile, SequentialReadingNodes } from './sequentialReadingTypes.js';
import type { PushQueuePriority } from './unifiedPushQueueRules.js';



function collectSubtreeNodeIds(
  rootNodeId: string,
  nodeOrder: string[],
  nodesById: SequentialReadingNodes
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
  nextNodesById: SequentialReadingNodes;
  nodeId: string;
  now: string;
}) {
  const node = args.nextNodesById[args.nodeId];
  if (!node?.reading || node.reading.state !== 'locked') {
    return;
  }
  const nextReading: NodeReadingProfile = { ...node.reading, state: 'active' };
  args.nextNodesById[args.nodeId] = { ...node, reading: nextReading };
  args.changes.push({ afterReading: nextReading, beforeReading: node.reading, nodeId: args.nodeId });
}

export function buildSequentialReadingMaintenancePatch<T extends SequentialReadingNode>(args: {
  changedRootNodeIds: string[];
  defaultPriority: PushQueuePriority;
  nodeOrder: string[];
  nodesById: Record<string, T>;
  now: string;
  previousNodesById?: Record<string, T>;
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
      if (nextNodesById === args.nodesById) {
        nextNodesById = { ...nextNodesById };
      }
      applyActiveReadingState({ ...args, changes, nextNodesById, nodeId });
    }
  }
  return changes.length === 0 ? null : { changes, nodesById: nextNodesById };
}
