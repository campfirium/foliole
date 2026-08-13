import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeRepository';
import type { WorkspaceMoveNodesPayload, WorkspaceMoveNodesResult } from '../shared/platform/workspaceRuntimeTypes';

import {
  syncCreateNodeMutationToRuntime,
  syncCreateNodeToRuntime,
  syncDeleteNodesPermanentlyToRuntime,
  syncMoveNodesToRuntime,
  syncNodeContentMutationToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import type { TrashRuntimeHandlers } from './workspaceTrashRuntimeCommit';

type NodeSnapshot = WorkspaceState['nodesById'][string];

export interface WorkspaceMutationRepository extends TrashRuntimeHandlers {
  syncNodeCreation: (
    node: NodeSnapshot,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => ReturnType<typeof syncCreateNodeMutationToRuntime>;
  syncNodeOrder: (nodeOrder: string[]) => void;
  syncMoveNodes: (payload: WorkspaceMoveNodesPayload) => Promise<WorkspaceMoveNodesResult | undefined>;
  syncNodeMutation: typeof syncNodeContentMutationToRuntime;
}

function createRuntimeWorkspaceMutationRepository(): WorkspaceMutationRepository {
  return {
    syncDeleteNodesPermanently: syncDeleteNodesPermanentlyToRuntime,
    syncMoveNodes: syncMoveNodesToRuntime,
    syncNodeMutation: (node, position) => syncNodeContentMutationToRuntime(node, position),
    syncNodeContent: syncNodeContentToRuntime,
    syncNodeCreation: async (node, nodeOrder, activeNodeId, position) => {
      if (!nodeOrder) {
        syncCreateNodeToRuntime(node);
        return null;
      }
      return syncCreateNodeMutationToRuntime(node, nodeOrder, activeNodeId, position);
    },
    syncNodeOrder: syncNodeOrderToRuntime,
    syncRestoreNodes: syncRestoreNodesToRuntime,
    syncSoftDeleteNodes: syncSoftDeleteNodesToRuntime
  };
}

export function createBrowserLocalWorkspaceMutationRepository(): WorkspaceMutationRepository {
  return {
    syncDeleteNodesPermanently: ({ nodeIds, nodeOrder }) => ({ nodeOrder, removedNodeIds: nodeIds }),
    syncMoveNodes: async ({ nodeOrder, nodes }) => ({
      movedNodeIds: nodes.map((node) => node.nodeId),
      nodeOrder
    }),
    syncNodeMutation: async (node, position) => {
      return {
        nodes: [createWorkspaceRuntimeNodeSnapshot(node, position)],
        updatedNodeIds: [node.id]
      };
    },
    syncNodeContent: () => undefined,
    syncNodeCreation: async () => null,
    syncNodeOrder: () => undefined,
    syncRestoreNodes: ({ nodeIds }) => ({ restoredNodeIds: nodeIds, skippedConflicts: [] }),
    syncSoftDeleteNodes: ({ nodeIds }) => ({ deletedNodeIds: nodeIds })
  };
}

let activeRepository: WorkspaceMutationRepository = createRuntimeWorkspaceMutationRepository();

export function installWorkspaceMutationRepository(repository: WorkspaceMutationRepository) {
  activeRepository = repository;
}

export function resetWorkspaceMutationRepository() {
  activeRepository = createRuntimeWorkspaceMutationRepository();
}

export function getWorkspaceMutationRepository() {
  return activeRepository;
}
