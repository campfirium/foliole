import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeRepository';
import type { WorkspaceMoveNodesPayload, WorkspaceMoveNodesResult } from '../shared/platform/workspaceRuntimeTypes';

import {
  syncCreateNodeMutationToRuntime,
  syncDeleteNodesPermanentlyToRuntime,
  syncMoveNodesToRuntime,
  syncNodeContentMutationToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncPdfImageExcerptNodeMutationToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import type { TrashRuntimeHandlers } from './workspaceTrashRuntimeCommit';

type NodeSnapshot = WorkspaceState['nodesById'][string];

export interface WorkspaceMutationRepository extends TrashRuntimeHandlers {
  syncNodeCreation: (
    node: NodeSnapshot,
    activeNodeId?: string | null
  ) => ReturnType<typeof syncCreateNodeMutationToRuntime>;
  syncPdfImageExcerptCreation: typeof syncPdfImageExcerptNodeMutationToRuntime;
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
    syncNodeCreation: (node, activeNodeId) => syncCreateNodeMutationToRuntime(node, activeNodeId),
    syncPdfImageExcerptCreation: syncPdfImageExcerptNodeMutationToRuntime,
    syncNodeOrder: syncNodeOrderToRuntime,
    syncRestoreNodes: syncRestoreNodesToRuntime,
    syncSoftDeleteNodes: syncSoftDeleteNodesToRuntime
  };
}

export function createBrowserLocalWorkspaceMutationRepository(): WorkspaceMutationRepository {
  return {
    syncDeleteNodesPermanently: ({ nodeIds }) => ({ removedNodeIds: nodeIds }),
    syncMoveNodes: async (payload) => {
      const [{ buildBrowserMoveResult }, { useWorkspaceStore }] = await Promise.all([
        import('./workspaceBrowserMoveResult'), import('./workspaceStore')
      ]);
      return buildBrowserMoveResult(useWorkspaceStore.getState(), payload);
    },
    syncNodeMutation: async (node, position) => {
      return {
        nodes: [createWorkspaceRuntimeNodeSnapshot(node, position)],
        updatedNodeIds: [node.id]
      };
    },
    syncNodeContent: () => undefined,
    syncNodeCreation: async () => null,
    syncPdfImageExcerptCreation: async () => null,
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
