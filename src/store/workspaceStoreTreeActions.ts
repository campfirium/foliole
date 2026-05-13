import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  isSameNodeOrder,
  resolveInsertIndex,
  resolveNextParentNodeId,
  type NodeDropIntent
} from './workspaceMoveNodes';
import { canCreateChildUnderParent, canMoveRootsIntoTarget } from './workspaceNodeKindRules';
import {
  collectOrderedSubtreeIds,
  insertNodeBlockAsFirstChild,
  insertNodeBlockUnderParent
} from './workspaceNodeTreeOrder';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { collectMovedNodeBlock, collectMoveRootIds } from './workspaceStoreMoveHelpers';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type NodeSnapshot = WorkspaceState['nodesById'][string];

function resolveMovableRootNodeIds(
  state: WorkspaceState,
  nodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  const rootNodeIds = collectMoveRootIds(nodeIds, state.nodeOrder, state.nodesById).filter(
    (nodeId) => {
      const node = state.nodesById[nodeId];
      return Boolean(node && !state.trashedNodeIds.includes(nodeId) && canNodeBeMoved(node));
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
  return canMoveRootsIntoTarget(state, rootNodeIds, movedNodeIds, targetNodeId, intent);
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
  const movedNodeIds = collectMovedNodeBlock(
    rootNodeIds,
    state.nodeOrder,
    collectOrderedSubtreeIds,
    state.nodesById
  );
  if (movedNodeIds.length === 0 || !canMoveToTarget(state, rootNodeIds, movedNodeIds, targetNodeId, intent)) {
    return null;
  }
  return buildMovedState(state, rootNodeIds, movedNodeIds, targetNodeId, intent);
}

function buildCreatedChildState(
  state: WorkspaceState,
  parentNodeId: string,
  nodeId: string,
  content: string,
  kind: NodeKind,
  timestamp: string,
  specialKind?: NodeSnapshot['specialKind']
) {
  const untitledState = resolveCreatedNodeTitleState(
    deriveNodeTitleFromContent(content),
    parentNodeId,
    state
  );
  const nextNode = {
    id: nodeId,
    parentNodeId,
    kind,
    ...(specialKind ? { specialKind } : {}),
    title: untitledState.title,
    hasContent: content.trim().length > 0,
    hideTitleHeading: false,
    content,
    anchorLink: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const nextNodeOrder =
    parentNodeId === INBOX_NODE_ID
      ? insertNodeBlockAsFirstChild(state.nodeOrder, [nodeId], parentNodeId, state.nodesById)
      : insertNodeBlockUnderParent(state.nodeOrder, [nodeId], parentNodeId, state.nodesById);
  const nextNodesById = {
    ...state.nodesById,
    [nodeId]: nextNode
  };

  return {
    nextNode,
    nextNodeOrder,
    patch: {
      activeNodeId: nodeId,
      nodeOrder: nextNodeOrder,
      nodesById: nextNodesById,
      untitledSequenceByParent: untitledState.untitledSequenceByParent,
      reviewSession: reconcileReviewSession(
        {
          ...state,
          activeNodeId: nodeId,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById,
          untitledSequenceByParent: untitledState.untitledSequenceByParent
        },
        nodeId
      )
    }
  };
}


export function createChildNodeAction(
  set: WorkspaceSet,
  onNodeCreated?: (node: NodeSnapshot) => void,
  onNodeOrderChanged?: (nodeOrder: string[]) => void
): WorkspaceState['createChildNode'] {
  return (parentNodeId, content = '', kind: NodeKind = 'topic') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      if (!state.nodesById[parentNodeId] || state.trashedNodeIds.includes(parentNodeId)) {
        return state;
      }
      if (!canCreateChildUnderParent(state, parentNodeId, kind)) {
        return state;
      }
      const nextChildState = buildCreatedChildState(state, parentNodeId, nodeId, content, kind, timestamp);
      createdNode = nextChildState.nextNode;
      nextNodeOrder = nextChildState.nextNodeOrder;
      return nextChildState.patch;
    });
    if (createdNode) {
      onNodeCreated?.(createdNode);
      if (kind === 'folder' && nextNodeOrder) {
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
      if (movedRootNodeSnapshots.every((node) => node.kind === 'folder') && nextNodeOrder) {
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
