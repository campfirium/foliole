import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';

import { isSameNodeReading } from './workspaceNodeLearningComparison';
import { workspaceShelveLearningNodeIds } from './workspaceNodeShelveLearning';
import type { WorkspaceState } from './workspaceStoreTypes';

export async function prepareWorkspaceDismissLearning(before: WorkspaceState, nodeIds: string[], get: () => WorkspaceState,
  accept: (nodesById: WorkspaceState['nodesById']) => void) {
  const ids = [...new Set(nodeIds.flatMap(id => workspaceShelveLearningNodeIds(before, id)))];
  const scope = before.libraryScope ?? before.reviewSession.daily?.scope;
  const facts = await readWorkspaceOperationLearning(before.nodesById, ids, scope);
  const latest = get();
  if (!facts || (latest.libraryScope ?? latest.reviewSession.daily?.scope) !== scope ||
    latest.appActionHistory.pendingAction || latest.appActionHistory.applying || latest.appActionHistory.pendingCreate ||
    ids.some(id => !latest.nodesById[id] || latest.trashedNodeIds.includes(id) ||
      !isSameNodeReading(latest.nodesById[id], before.nodesById[id]))) return;
  const nodesById = { ...latest.nodesById };
  for (const id of ids) if (facts[id]) nodesById[id] = { ...nodesById[id]!, reading: facts[id]!.reading ?? null };
  accept(nodesById);
}
