import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';

import {
  collectOrderedSubtreeIds,
  insertNodeBlockUnderParent,
  isNodeInSubtree
} from './workspaceNodeTreeOrder';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function createChildNodeAction(set: WorkspaceSet): WorkspaceState['createChildNode'] {
  return (parentNodeId, content = '') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    set((state) => {
      if (!state.nodesById[parentNodeId] || state.trashedNodeIds.includes(parentNodeId)) {
        return state;
      }

      return {
        activeNodeId: nodeId,
        nodeOrder: insertNodeBlockUnderParent(
          state.nodeOrder,
          [nodeId],
          parentNodeId,
          state.nodesById
        ),
        nodesById: {
          ...state.nodesById,
          [nodeId]: {
            id: nodeId,
            parentNodeId,
            title: deriveNodeTitleFromContent(content),
            content,
            anchorLink: null,
            reveal: null,
            review: null,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        }
      };
    });

    return nodeId;
  };
}

export function createMoveNodeAction(set: WorkspaceSet): WorkspaceState['moveNode'] {
  return (nodeId, nextParentNodeId) => {
    let moved = false;

    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || state.trashedNodeIds.includes(nodeId) || node.anchorLink) {
        return state;
      }
      if (nextParentNodeId === nodeId) {
        return state;
      }
      if (
        nextParentNodeId &&
        (!state.nodesById[nextParentNodeId] || state.trashedNodeIds.includes(nextParentNodeId))
      ) {
        return state;
      }
      if (nextParentNodeId && isNodeInSubtree(nextParentNodeId, nodeId, state.nodesById)) {
        return state;
      }
      if (node.parentNodeId === nextParentNodeId) {
        return state;
      }

      const movedNodeIds = collectOrderedSubtreeIds(nodeId, state.nodeOrder, state.nodesById);
      if (movedNodeIds.length === 0) {
        return state;
      }

      const nextNodesById = {
        ...state.nodesById,
        [nodeId]: {
          ...node,
          parentNodeId: nextParentNodeId,
          updatedAt: new Date().toISOString()
        }
      };
      moved = true;

      return {
        nodeOrder: insertNodeBlockUnderParent(
          state.nodeOrder,
          movedNodeIds,
          nextParentNodeId,
          nextNodesById
        ),
        nodesById: nextNodesById
      };
    });

    return moved;
  };
}
