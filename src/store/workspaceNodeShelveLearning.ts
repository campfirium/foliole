import { findSequentialReadingSourcesForNode } from '../../lib/core/review/sequentialReadingLookup';
import { collectSequentialDerivedTopicIds } from '../../lib/core/review/sequentialReadingSourceOrder';
import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';

import type { WorkspaceState } from './workspaceStoreTypes';

export function workspaceShelveLearningNodeIds(state: WorkspaceState, nodeId: string) {
  const ids = new Set([nodeId]);
  for (const sourceNodeId of findSequentialReadingSourcesForNode(nodeId, state.nodesById)) {
    collectSequentialDerivedTopicIds({ nodeOrder: state.nodeOrder, nodesById: state.nodesById, sourceNodeId })
      .forEach(id => ids.add(id));
  }
  for (const id of state.nodeOrder) {
    const visited = new Set<string>();
    let node = state.nodesById[id];
    while (node?.parentNodeId && !visited.has(node.parentNodeId)) {
      if (node.parentNodeId === nodeId) { ids.add(id); break; }
      visited.add(node.parentNodeId);
      node = state.nodesById[node.parentNodeId];
    }
  }
  return [...ids];
}

export async function readWorkspaceShelveLearning(state: WorkspaceState, nodeId: string) {
  const nodeIds = workspaceShelveLearningNodeIds(state, nodeId);
  const nodesById = await readWorkspaceOperationLearning(state.nodesById, nodeIds, state.libraryScope ?? state.reviewSession.daily?.scope);
  return nodesById ? { nodesById, nodeIds } : null;
}
