import type { Node } from '../features/nodes/model/nodeTypes';

import {
  listDocumentWorksetNodeIds,
  hasMatchingNodeIds,
  reconcileFocusedRendererBoundaryNodes
} from './workspaceRendererBoundaryFocused';
import { resolveNodeContentState, resolveNodeRevealState } from './workspaceRendererBoundaryState';
export { isNodeDocumentLoaded, mergeWorkspaceNodeDocument, type WorkspaceNodeDocument } from './workspaceRendererBoundaryDocument';

interface WorkspaceRendererBoundaryStateLike {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
}

function listActiveFolderChildNodeIds(activeNodeId: string | null, nodesById: Record<string, Node>) {
  if (!activeNodeId) {
    return [];
  }
  const activeNode = nodesById[activeNodeId];
  if (!activeNode || activeNode.kind !== 'folder' || activeNode.specialKind === 'inbox') {
    return [];
  }
  return Object.values(nodesById)
    .filter((node) => node.parentNodeId === activeNodeId)
    .map((node) => node.id);
}

function collectRendererBoundaryKeepNodeIds(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  keepNodeIds: ReadonlySet<string>
) {
  const nextKeepNodeIds = new Set(keepNodeIds);
  for (const nodeId of listActiveFolderChildNodeIds(activeNodeId, nodesById)) {
    nextKeepNodeIds.add(nodeId);
  }
  return nextKeepNodeIds;
}

function shouldKeepNodeDocument(
  nodeId: string,
  activeNodeId: string | null,
  keepNodeIds: ReadonlySet<string>
) {
  return nodeId === activeNodeId || keepNodeIds.has(nodeId);
}

export function toRendererBoundaryNode(node: Node, keepDocument: boolean): Node {
  const nextHasContent = resolveNodeContentState(node);
  const nextHasReveal = resolveNodeRevealState(node);
  if (keepDocument) {
    return {
      ...node,
      ...(nextHasContent !== undefined ? { hasContent: nextHasContent } : {}),
      ...(nextHasReveal !== undefined ? { hasReveal: nextHasReveal } : {})
    };
  }
  return {
    ...node,
    content: '',
    ...(nextHasContent !== undefined ? { hasContent: nextHasContent } : {}),
    reveal: null,
    ...(nextHasReveal !== undefined ? { hasReveal: nextHasReveal } : {})
  };
}

export function trimWorkspaceNodesForRendererBoundary(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  keepNodeIds: ReadonlySet<string> = new Set()
) {
  const nextKeepNodeIds = collectRendererBoundaryKeepNodeIds(activeNodeId, nodesById, keepNodeIds);

  return Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [
      nodeId,
      toRendererBoundaryNode(node, shouldKeepNodeDocument(nodeId, activeNodeId, nextKeepNodeIds))
    ])
  );
}

function isBoundaryProjectionReusable(currentNode: Node | undefined, sourceNode: Node, keepDocument: boolean) {
  if (!currentNode) {
    return false;
  }

  return (
    currentNode.id === sourceNode.id &&
    currentNode.parentNodeId === sourceNode.parentNodeId &&
    currentNode.kind === sourceNode.kind &&
    currentNode.priority === sourceNode.priority &&
    currentNode.desiredRetention === sourceNode.desiredRetention &&
    currentNode.specialKind === sourceNode.specialKind &&
    currentNode.title === sourceNode.title &&
    currentNode.isTitleManual === sourceNode.isTitleManual &&
    currentNode.hideTitleHeading === sourceNode.hideTitleHeading &&
    currentNode.anchorLink === sourceNode.anchorLink &&
    currentNode.imageRegions === sourceNode.imageRegions &&
    currentNode.virtualFilter === sourceNode.virtualFilter &&
    currentNode.reading === sourceNode.reading &&
    currentNode.review === sourceNode.review &&
    currentNode.createdAt === sourceNode.createdAt &&
    currentNode.updatedAt === sourceNode.updatedAt &&
    currentNode.hasContent === resolveNodeContentState(sourceNode) &&
    currentNode.hasReveal === resolveNodeRevealState(sourceNode) &&
    currentNode.content === (keepDocument ? sourceNode.content : '') &&
    currentNode.reveal === (keepDocument ? sourceNode.reveal : null)
  );
}

function reconcileWorkspaceRendererBoundaryNodes(
  currentNodesById: Record<string, Node>,
  nextNodesById: Record<string, Node>,
  activeNodeId: string | null,
  keepNodeIds: ReadonlySet<string>
) {
  const nextKeepNodeIds = collectRendererBoundaryKeepNodeIds(activeNodeId, nextNodesById, keepNodeIds);
  let changed = Object.keys(currentNodesById).length !== Object.keys(nextNodesById).length;
  const nextBoundaryNodesById: Record<string, Node> = {};

  for (const [nodeId, node] of Object.entries(nextNodesById)) {
    const keepDocument = shouldKeepNodeDocument(nodeId, activeNodeId, nextKeepNodeIds);
    const currentNode = currentNodesById[nodeId];
    if (currentNode && isBoundaryProjectionReusable(currentNode, node, keepDocument)) {
      nextBoundaryNodesById[nodeId] = currentNode;
      continue;
    }
    nextBoundaryNodesById[nodeId] = toRendererBoundaryNode(node, keepDocument);
    changed = true;
  }

  return changed ? nextBoundaryNodesById : currentNodesById;
}

function reconcileActiveNodeBoundaryChange(
  currentState: WorkspaceRendererBoundaryStateLike & { rendererBoundaryKeepNodeIds?: string[] },
  nextActiveNodeId: string | null,
  currentKeepNodeIds: ReadonlySet<string>,
  keepNodeIds: ReadonlySet<string>
) {
  const previousKeepNodeIds = collectRendererBoundaryKeepNodeIds(
    currentState.activeNodeId,
    currentState.nodesById,
    currentKeepNodeIds
  );
  const nextKeepNodeIds = collectRendererBoundaryKeepNodeIds(
    nextActiveNodeId,
    currentState.nodesById,
    keepNodeIds
  );
  const affectedNodeIds = new Set<string>([...previousKeepNodeIds, ...nextKeepNodeIds]);
  if (currentState.activeNodeId) {
    affectedNodeIds.add(currentState.activeNodeId);
  }
  if (nextActiveNodeId) {
    affectedNodeIds.add(nextActiveNodeId);
  }

  let changed = false;
  const nextNodesById = { ...currentState.nodesById };
  for (const nodeId of affectedNodeIds) {
    const node = currentState.nodesById[nodeId];
    if (!node) {
      continue;
    }
    const keepDocument = shouldKeepNodeDocument(nodeId, nextActiveNodeId, nextKeepNodeIds);
    if (isBoundaryProjectionReusable(node, node, keepDocument)) {
      continue;
    }
    nextNodesById[nodeId] = toRendererBoundaryNode(node, keepDocument);
    changed = true;
  }

  return changed ? nextNodesById : currentState.nodesById;
}

export function enforceWorkspaceRendererBoundary<T extends WorkspaceRendererBoundaryStateLike>(
  state: T | Partial<T>,
  currentState: T & { rendererBoundaryKeepNodeIds?: string[] },
  keepNodeIds: ReadonlySet<string> = new Set()
): T | Partial<T> {
  if (!('activeNodeId' in state) && !('nodesById' in state)) {
    return state;
  }

  const nextActiveNodeId = 'activeNodeId' in state ? state.activeNodeId ?? null : currentState.activeNodeId;
  const nextNodesById = 'nodesById' in state ? state.nodesById ?? currentState.nodesById : currentState.nodesById;
  const nextKeepNodeIds = new Set(keepNodeIds);
  const shouldPreserveDocumentWorkset = !('activeNodeId' in state);
  const canUseFocusedReconcile =
    'activeNodeId' in state &&
    'nodesById' in state &&
    hasMatchingNodeIds(currentState.nodesById, nextNodesById);
  const documentWorksetNodeIds =
    shouldPreserveDocumentWorkset || canUseFocusedReconcile
      ? listDocumentWorksetNodeIds(currentState.nodesById, nextNodesById)
      : [];

  if (shouldPreserveDocumentWorkset) {
    for (const nodeId of documentWorksetNodeIds) {
      nextKeepNodeIds.add(nodeId);
    }
  }

  const reconciledNodesById =
    canUseFocusedReconcile && documentWorksetNodeIds.length <= 4
      ? reconcileFocusedRendererBoundaryNodes(
          {
            activeNodeId: nextActiveNodeId,
            currentKeepNodeIds: new Set(currentState.rendererBoundaryKeepNodeIds ?? []),
            currentNodesById: currentState.nodesById,
            documentWorksetNodeIds,
            isBoundaryProjectionReusable,
            keepNodeIds: nextKeepNodeIds,
            nextNodesById,
            shouldKeepNodeDocument,
            toRendererBoundaryNode
          }
        )
      :
    !('nodesById' in state) && 'activeNodeId' in state && state.activeNodeId !== currentState.activeNodeId
      ? reconcileActiveNodeBoundaryChange(
          currentState,
          nextActiveNodeId,
          new Set(currentState.rendererBoundaryKeepNodeIds ?? []),
          nextKeepNodeIds
        )
      : reconcileWorkspaceRendererBoundaryNodes(
          currentState.nodesById,
          nextNodesById,
          nextActiveNodeId,
          nextKeepNodeIds
        );

  return {
    ...state,
    nodesById: reconciledNodesById
  };
}
