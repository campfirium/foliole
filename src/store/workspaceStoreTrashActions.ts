import { parseAnchorBlocks } from '../features/editor/model/anchorBlocks';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import type { Node } from '../features/nodes/model/nodeTypes';

import { collectNodeSubtreeIds, findFallbackActiveNodeId } from './workspaceHelpers';
import { INITIAL_WORKSPACE_NAVIGATION_STATE, sanitizeNavigationState } from './workspaceNavigation';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type WorkspaceTrashActions = Pick<WorkspaceState, 'deleteNode' | 'restoreNode' | 'deleteNodePermanently'>;

interface TrashRuntimeHandlers {
  syncNodeContent: (node: Node, position?: number) => void;
  syncSoftDeleteNodes: (payload: { nodeIds: string[]; deletedAt: string }) => void;
  syncRestoreNodes: (payload: { nodeIds: string[] }) => void;
  syncDeleteNodesPermanently: (payload: { nodeIds: string[]; nodeOrder: string[] }) => void;
}

interface DeleteNodeMutationResult {
  deletedAt: string;
  nodeIds: string[];
  parentNodesToSync: Node[];
  patch: Pick<WorkspaceState, 'activeNodeId' | 'navigation' | 'nodesById' | 'trashedNodeIds'>;
}

function removeAnchorTagsForLink(content: string, anchor: { id: string; kind: 'highlight' | 'cloze' }) {
  const matchedBlock = parseAnchorBlocks(content).blocks.find((block) => block.id === anchor.id && block.kind === anchor.kind);
  if (!matchedBlock) {
    return content;
  }
  const before = content.slice(0, matchedBlock.openTagFrom);
  const inner = content.slice(matchedBlock.openTagTo, matchedBlock.closeTagFrom);
  const after = content.slice(matchedBlock.closeTagTo);
  return `${before}${inner}${after}`;
}

function computeDeleteNodeMutation(state: WorkspaceState, nodeId: string): DeleteNodeMutationResult | null {
  if (!state.nodesById[nodeId] || state.trashedNodeIds.includes(nodeId)) {
    return null;
  }
  const deletedParentId = state.nodesById[nodeId]?.parentNodeId ?? null;
  const nodeIds = collectNodeSubtreeIds(nodeId, state.nodesById);
  const nodeIdsSet = new Set(nodeIds);
  const nextTrashedNodeIds = [...new Set([...state.trashedNodeIds, ...nodeIds])];
  const nextTrashedNodeIdsSet = new Set(nextTrashedNodeIds);
  const nextNodesById = { ...state.nodesById };
  const parentNodesToSync = new Map<string, Node>();
  const deletedAt = new Date().toISOString();

  for (const deletedId of nodeIds) {
    const deletedNode = state.nodesById[deletedId];
    const anchorLink = deletedNode?.anchorLink;
    const parentNodeId = deletedNode?.parentNodeId;
    if (!anchorLink || !parentNodeId || nodeIdsSet.has(parentNodeId)) {
      continue;
    }
    const parentNode = nextNodesById[parentNodeId];
    if (!parentNode) {
      continue;
    }
    const cleanedContent = removeAnchorTagsForLink(parentNode.content, anchorLink);
    if (cleanedContent === parentNode.content) {
      continue;
    }
    nextNodesById[parentNodeId] = {
      ...parentNode,
      content: cleanedContent,
      title: deriveNodeTitleFromContent(cleanedContent),
      updatedAt: deletedAt
    };
    parentNodesToSync.set(parentNodeId, nextNodesById[parentNodeId]);
  }

  const nextActiveNodeId =
    state.activeNodeId && !nextTrashedNodeIdsSet.has(state.activeNodeId)
      ? state.activeNodeId
      : findFallbackActiveNodeId(deletedParentId, state.nodeOrder, nextNodesById, nextTrashedNodeIdsSet);
  const nextNavigation =
    nextActiveNodeId === null
      ? { ...INITIAL_WORKSPACE_NAVIGATION_STATE }
      : sanitizeNavigationState(state.navigation, nextNodesById, nextTrashedNodeIdsSet);

  return {
    deletedAt,
    nodeIds,
    parentNodesToSync: [...parentNodesToSync.values()],
    patch: {
      activeNodeId: nextActiveNodeId,
      navigation: nextNavigation,
      nodesById: nextNodesById,
      trashedNodeIds: nextTrashedNodeIds
    }
  };
}

function syncDeleteMutation(runtimeHandlers: TrashRuntimeHandlers, mutation: DeleteNodeMutationResult | null) {
  if (!mutation || mutation.nodeIds.length === 0) {
    return;
  }
  for (const parentNode of mutation.parentNodesToSync) {
    runtimeHandlers.syncNodeContent(parentNode);
  }
  runtimeHandlers.syncSoftDeleteNodes({
    nodeIds: mutation.nodeIds,
    deletedAt: mutation.deletedAt
  });
}

function createDeleteNodeAction(set: WorkspaceSet, runtimeHandlers: TrashRuntimeHandlers): WorkspaceTrashActions['deleteNode'] {
  return (nodeId) => {
    let mutation: DeleteNodeMutationResult | null = null;
    set((state) => {
      mutation = computeDeleteNodeMutation(state, nodeId);
      return mutation ? mutation.patch : state;
    });
    syncDeleteMutation(runtimeHandlers, mutation);
  };
}

function createRestoreNodeAction(set: WorkspaceSet, runtimeHandlers: TrashRuntimeHandlers): WorkspaceTrashActions['restoreNode'] {
  return (nodeId) => {
    let idsToRestoreForSync: string[] = [];

    set((state) => {
      if (!state.nodesById[nodeId] || !state.trashedNodeIds.includes(nodeId)) {
        return state;
      }
      const idsToRestore = collectNodeSubtreeIds(nodeId, state.nodesById);
      const idsToRestoreSet = new Set(idsToRestore);
      const nextTrashedNodeIds = state.trashedNodeIds.filter((id) => !idsToRestoreSet.has(id));
      const nextActiveNodeId = state.activeNodeId ?? nodeId;
      idsToRestoreForSync = idsToRestore;
      return {
        activeNodeId: nextActiveNodeId,
        trashedNodeIds: nextTrashedNodeIds
      };
    });

    if (idsToRestoreForSync.length === 0) {
      return;
    }
    runtimeHandlers.syncRestoreNodes({ nodeIds: idsToRestoreForSync });
  };
}

function createDeleteNodePermanentlyAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers
): WorkspaceTrashActions['deleteNodePermanently'] {
  return (nodeId) => {
    let idsToDeleteForSync: string[] = [];
    let nodeOrderForSync: string[] = [];

    set((state) => {
      if (!state.nodesById[nodeId]) {
        return state;
      }
      const idsToDelete = collectNodeSubtreeIds(nodeId, state.nodesById);
      const idsToDeleteSet = new Set(idsToDelete);
      const nextNodeOrder = state.nodeOrder.filter((id) => !idsToDeleteSet.has(id));
      const nextNodesById = Object.fromEntries(Object.entries(state.nodesById).filter(([id]) => !idsToDeleteSet.has(id)));
      const nextTrashedNodeIds = state.trashedNodeIds.filter((id) => !idsToDeleteSet.has(id));
      const hiddenNodeIds = new Set(nextTrashedNodeIds);

      const nextActiveNodeId =
        state.activeNodeId && !idsToDeleteSet.has(state.activeNodeId) && !hiddenNodeIds.has(state.activeNodeId)
          ? state.activeNodeId
          : findFallbackActiveNodeId(
              state.nodesById[nodeId]?.parentNodeId ?? null,
              nextNodeOrder,
              nextNodesById,
              hiddenNodeIds
            );
      const nextNavigation =
        nextActiveNodeId === null
          ? { ...INITIAL_WORKSPACE_NAVIGATION_STATE }
          : sanitizeNavigationState(state.navigation, nextNodesById, new Set([...idsToDelete, ...nextTrashedNodeIds]));

      idsToDeleteForSync = idsToDelete;
      nodeOrderForSync = nextNodeOrder;

      return {
        activeNodeId: nextActiveNodeId,
        navigation: nextNavigation,
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        trashedNodeIds: nextTrashedNodeIds
      };
    });

    if (idsToDeleteForSync.length === 0) {
      return;
    }
    runtimeHandlers.syncDeleteNodesPermanently({
      nodeIds: idsToDeleteForSync,
      nodeOrder: nodeOrderForSync
    });
  };
}

export function createWorkspaceTrashActions(set: WorkspaceSet, runtimeHandlers: TrashRuntimeHandlers): WorkspaceTrashActions {
  return {
    deleteNode: createDeleteNodeAction(set, runtimeHandlers),
    restoreNode: createRestoreNodeAction(set, runtimeHandlers),
    deleteNodePermanently: createDeleteNodePermanentlyAction(set, runtimeHandlers)
  };
}
