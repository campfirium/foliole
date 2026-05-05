import { parseAnchorBlocks } from '../features/editor/model/anchorBlocks';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';

import { collectNodeSubtreeIds, findFallbackActiveNodeId } from './workspaceHelpers';
import { INITIAL_WORKSPACE_NAVIGATION_STATE, sanitizeNavigationState } from './workspaceNavigation';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

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

export function createWorkspaceTrashActions(set: WorkspaceSet): Pick<WorkspaceState, 'deleteNode' | 'restoreNode' | 'deleteNodePermanently'> {
  return {
    deleteNode: (nodeId) => {
      set((state) => {
        if (!state.nodesById[nodeId] || state.trashedNodeIds.includes(nodeId)) {
          return state;
        }

        const deletedParentId = state.nodesById[nodeId]?.parentNodeId ?? null;
        const idsToDelete = collectNodeSubtreeIds(nodeId, state.nodesById);
        const idsToDeleteSet = new Set(idsToDelete);
        const nextTrashedNodeIds = [...new Set([...state.trashedNodeIds, ...idsToDelete])];
        const nextTrashedNodeIdsSet = new Set(nextTrashedNodeIds);
        const nextNodesById = { ...state.nodesById };

        for (const deletedId of idsToDelete) {
          const deletedNode = state.nodesById[deletedId];
          const anchorLink = deletedNode?.anchorLink;
          const parentNodeId = deletedNode?.parentNodeId;
          if (!anchorLink || !parentNodeId || idsToDeleteSet.has(parentNodeId)) {
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
            updatedAt: new Date().toISOString()
          };
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
          activeNodeId: nextActiveNodeId,
          navigation: nextNavigation,
          nodesById: nextNodesById,
          trashedNodeIds: nextTrashedNodeIds
        };
      });
    },
    restoreNode: (nodeId) => {
      set((state) => {
        if (!state.nodesById[nodeId] || !state.trashedNodeIds.includes(nodeId)) {
          return state;
        }

        const idsToRestore = collectNodeSubtreeIds(nodeId, state.nodesById);
        const idsToRestoreSet = new Set(idsToRestore);
        const nextTrashedNodeIds = state.trashedNodeIds.filter((id) => !idsToRestoreSet.has(id));
        const nextActiveNodeId = state.activeNodeId ?? nodeId;

        return {
          activeNodeId: nextActiveNodeId,
          trashedNodeIds: nextTrashedNodeIds
        };
      });
    },
    deleteNodePermanently: (nodeId) => {
      set((state) => {
        if (!state.nodesById[nodeId]) {
          return state;
        }

        const idsToDelete = collectNodeSubtreeIds(nodeId, state.nodesById);
        const idsToDeleteSet = new Set(idsToDelete);
        const nextNodeOrder = state.nodeOrder.filter((id) => !idsToDeleteSet.has(id));
        const nextNodesById = Object.fromEntries(
          Object.entries(state.nodesById).filter(([id]) => !idsToDeleteSet.has(id))
        );
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

        return {
          activeNodeId: nextActiveNodeId,
          navigation: nextNavigation,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById,
          trashedNodeIds: nextTrashedNodeIds
        };
      });
    }
  };
}
