import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';

import {
  isSameNodeOrder,
  resolveInsertIndex,
  resolveNextParentNodeId,
  type NodeDropIntent
} from './workspaceMoveNodes';
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

type NodeSnapshot = WorkspaceState['nodesById'][string];

function collectMoveRootIds(
  nodeIds: string[],
  nodeOrder: string[],
  nodesById: WorkspaceState['nodesById']
) {
  const selectedSet = new Set(nodeIds.filter((nodeId) => Boolean(nodesById[nodeId])));
  return nodeOrder.filter((nodeId) => {
    if (!selectedSet.has(nodeId)) {
      return false;
    }
    let cursorId = nodesById[nodeId]?.parentNodeId ?? null;
    while (cursorId) {
      if (selectedSet.has(cursorId)) {
        return false;
      }
      cursorId = nodesById[cursorId]?.parentNodeId ?? null;
    }
    return true;
  });
}

function collectMovedNodeBlock(
  rootNodeIds: string[],
  nodeOrder: string[],
  nodesById: WorkspaceState['nodesById']
) {
  const movedNodeIds = rootNodeIds.flatMap((nodeId) =>
    collectOrderedSubtreeIds(nodeId, nodeOrder, nodesById)
  );
  return [...new Set(movedNodeIds)];
}

function resolveMovableRootNodeIds(
  state: WorkspaceState,
  nodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  const rootNodeIds = collectMoveRootIds(nodeIds, state.nodeOrder, state.nodesById).filter(
    (nodeId) => {
      const node = state.nodesById[nodeId];
      return Boolean(node && !state.trashedNodeIds.includes(nodeId) && !node.anchorLink);
    }
  );
  if (rootNodeIds.length === 0) {
    return null;
  }
  if (
    intent !== 'root' &&
    (!targetNodeId ||
      !state.nodesById[targetNodeId] ||
      state.trashedNodeIds.includes(targetNodeId))
  ) {
    return null;
  }
  return rootNodeIds;
}

function canMoveToTarget(
  state: WorkspaceState,
  rootNodeIds: string[],
  movedNodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  if (targetNodeId && movedNodeIds.includes(targetNodeId)) {
    return false;
  }
  if (intent !== 'child' || !targetNodeId) {
    return true;
  }
  return rootNodeIds.every(
    (rootNodeId) => !isNodeInSubtree(targetNodeId, rootNodeId, state.nodesById)
  );
}

function buildMovedState(
  state: WorkspaceState,
  rootNodeIds: string[],
  movedNodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  const nextParentNodeId = resolveNextParentNodeId(intent, targetNodeId, state.nodesById);
  const timestamp = new Date().toISOString();
  const nextNodesById = { ...state.nodesById };
  for (const rootNodeId of rootNodeIds) {
    const node = nextNodesById[rootNodeId];
    if (!node) {
      continue;
    }
    nextNodesById[rootNodeId] = { ...node, parentNodeId: nextParentNodeId, updatedAt: timestamp };
  }

  const movedNodeIdSet = new Set(movedNodeIds);
  const remainingNodeOrder = state.nodeOrder.filter((nodeId) => !movedNodeIdSet.has(nodeId));
  const insertIndex = resolveInsertIndex(
    remainingNodeOrder,
    intent === 'root' ? null : targetNodeId,
    intent,
    nextNodesById
  );
  const nextNodeOrder = [
    ...remainingNodeOrder.slice(0, insertIndex),
    ...movedNodeIds,
    ...remainingNodeOrder.slice(insertIndex)
  ];
  const changedParent = rootNodeIds.some(
    (rootNodeId) => state.nodesById[rootNodeId]?.parentNodeId !== nextParentNodeId
  );

  if (!changedParent && isSameNodeOrder(state.nodeOrder, nextNodeOrder)) {
    return null;
  }
  return { nodeOrder: nextNodeOrder, nodesById: nextNodesById };
}

function createMoveNodesPatch(
  state: WorkspaceState,
  nodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  const rootNodeIds = resolveMovableRootNodeIds(state, nodeIds, targetNodeId, intent);
  if (!rootNodeIds) {
    return null;
  }
  const movedNodeIds = collectMovedNodeBlock(rootNodeIds, state.nodeOrder, state.nodesById);
  if (movedNodeIds.length === 0 || !canMoveToTarget(state, rootNodeIds, movedNodeIds, targetNodeId, intent)) {
    return null;
  }
  return buildMovedState(state, rootNodeIds, movedNodeIds, targetNodeId, intent);
}

export function createChildNodeAction(
  set: WorkspaceSet,
  onNodeCreated?: (node: NodeSnapshot) => void,
  onNodeOrderChanged?: (nodeOrder: string[]) => void
): WorkspaceState['createChildNode'] {
  return (parentNodeId, content = '') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      if (!state.nodesById[parentNodeId] || state.trashedNodeIds.includes(parentNodeId)) {
        return state;
      }
      const nextNode = {
        id: nodeId,
        parentNodeId,
        title: deriveNodeTitleFromContent(content),
        content,
        anchorLink: null,
        reveal: null,
        review: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      createdNode = nextNode;

      return {
        activeNodeId: nodeId,
        nodeOrder: (nextNodeOrder = insertNodeBlockUnderParent(
          state.nodeOrder,
          [nodeId],
          parentNodeId,
          state.nodesById
        )),
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
    });
    if (createdNode) {
      onNodeCreated?.(createdNode);
      if (nextNodeOrder) {
        onNodeOrderChanged?.(nextNodeOrder);
      }
    }

    return nodeId;
  };
}

export function createMoveNodesAction(
  set: WorkspaceSet,
  onNodesMoved?: (nodes: NodeSnapshot[]) => void,
  onNodeOrderChanged?: (nodeOrder: string[]) => void
): WorkspaceState['moveNodes'] {
  return (nodeIds, targetNodeId, intent) => {
    let moved = false;
    let movedRootNodeSnapshots: NodeSnapshot[] = [];
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const rootNodeIds = resolveMovableRootNodeIds(state, nodeIds, targetNodeId, intent);
      if (!rootNodeIds) {
        return state;
      }
      const patch = createMoveNodesPatch(state, nodeIds, targetNodeId, intent);
      if (!patch) {
        return state;
      }
      movedRootNodeSnapshots = rootNodeIds
        .map((nodeId) => patch.nodesById[nodeId])
        .filter((node): node is NodeSnapshot => Boolean(node));
      nextNodeOrder = patch.nodeOrder;
      moved = true;
      return patch;
    });
    if (moved && movedRootNodeSnapshots.length > 0) {
      onNodesMoved?.(movedRootNodeSnapshots);
      if (nextNodeOrder) {
        onNodeOrderChanged?.(nextNodeOrder);
      }
    }

    return moved;
  };
}

export function createMoveNodeAction(
  set: WorkspaceSet,
  onNodesMoved?: (nodes: NodeSnapshot[]) => void,
  onNodeOrderChanged?: (nodeOrder: string[]) => void
): WorkspaceState['moveNode'] {
  const moveNodes = createMoveNodesAction(set, onNodesMoved, onNodeOrderChanged);
  return (nodeId, nextParentNodeId) => moveNodes([nodeId], nextParentNodeId, 'child');
}
