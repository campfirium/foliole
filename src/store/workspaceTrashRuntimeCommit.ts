import type {
  WorkspaceDeleteNodesPermanentlyResult,
  WorkspaceSoftDeleteNodesResult
} from '../shared/platform/workspaceRuntimeTypes';

import type { WorkspaceState } from './workspaceStore';
import type { RestoreNodeRuntimeHandlers } from './workspaceStoreRestoreAction';
import type { DeleteNodeMutationResult } from './workspaceTrashMutations';

export interface TrashRuntimeHandlers {
  syncNodeContent: (node: WorkspaceState['nodesById'][string], position?: number) => void;
  syncSoftDeleteNodes: (
    payload: { nodeIds: string[]; deletedAt: string }
  ) => Promise<WorkspaceSoftDeleteNodesResult | undefined> | WorkspaceSoftDeleteNodesResult | undefined;
  syncRestoreNodes: RestoreNodeRuntimeHandlers['syncRestoreNodes'];
  syncDeleteNodesPermanently: (
    payload: { nodeIds: string[]; nodeOrder: string[] }
  ) => Promise<WorkspaceDeleteNodesPermanentlyResult | undefined> | WorkspaceDeleteNodesPermanentlyResult | undefined;
}

export async function commitSoftDeleteMutation(
  runtimeHandlers: TrashRuntimeHandlers,
  mutation: DeleteNodeMutationResult | null
) {
  if (!mutation || mutation.nodeIds.length === 0) {
    return null;
  }
  const result = await runtimeHandlers.syncSoftDeleteNodes({
    nodeIds: mutation.nodeIds,
    deletedAt: mutation.deletedAt
  });
  if (!result || result.deletedNodeIds.length === 0) {
    return null;
  }
  for (const parentNode of mutation.parentNodesToSync) {
    runtimeHandlers.syncNodeContent(parentNode);
  }
  return result;
}

export async function commitPermanentDeleteMutation(
  runtimeHandlers: TrashRuntimeHandlers,
  mutation: DeleteNodeMutationResult | null
) {
  if (!mutation || mutation.nodeIds.length === 0 || !mutation.nodeOrder) {
    return null;
  }
  const result = await runtimeHandlers.syncDeleteNodesPermanently({
    nodeIds: mutation.nodeIds,
    nodeOrder: mutation.nodeOrder
  });
  if (!result || result.removedNodeIds.length === 0) {
    return null;
  }
  for (const parentNode of mutation.parentNodesToSync) {
    runtimeHandlers.syncNodeContent(parentNode);
  }
  return result;
}
