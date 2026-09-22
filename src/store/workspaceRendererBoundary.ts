import { readNodeAuthorText } from '../../lib/core/nodes/nodeAuthorFrontmatter';
import type { Node } from '../features/nodes/model/nodeTypes';
import {
  readWorkspaceRecordPatch,
  recordWorkspaceRecordPatch
} from '../shared/workspaceRecordPatch';

import {
  syncWorkspaceNodeDocumentCacheFromNode,
  updateWorkspaceNodeDocumentRetentionPins
} from './workspaceNodeDocumentCache';
import { isNodeDocumentLoaded } from './workspaceRendererBoundaryDocument';
import {
  listDocumentWorksetNodeIds,
  hasMatchingNodeIds,
  reconcileFocusedRendererBoundaryNodes
} from './workspaceRendererBoundaryFocused';
import { resolveNodeContentState, resolveNodeRevealState } from './workspaceRendererBoundaryState';
import { hasMatchingBoundaryPreservedFields } from './workspaceSnapshotFieldManifest';
export {
  getNodeDocumentStatus,
  isNodeDocumentLoaded,
  mergeWorkspaceNodeDocument,
  type WorkspaceNodeDocument,
  type WorkspaceNodeDocumentStatus
} from './workspaceRendererBoundaryDocument';

interface WorkspaceRendererBoundaryStateLike {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
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
  const authorText = isNodeDocumentLoaded(node) ? readNodeAuthorText(node.content) : node.authorText ?? null;
  if (keepDocument) {
    return {
      ...node,
      authorText,
      ...(nextHasContent !== undefined ? { hasContent: nextHasContent } : {}),
      ...(nextHasReveal !== undefined ? { hasReveal: nextHasReveal } : {})
    };
  }
  return {
    ...node,
    authorText,
    content: '',
    ...(nextHasContent !== undefined ? { hasContent: nextHasContent } : {}),
    reveal: null,
    ...(nextHasReveal !== undefined ? { hasReveal: nextHasReveal } : {}),
    imageSources: null
  };
}

function projectRendererBoundaryNode(node: Node, keepDocument: boolean) {
  if (!keepDocument && isNodeDocumentLoaded(node)) {
    syncWorkspaceNodeDocumentCacheFromNode(node);
  }
  return toRendererBoundaryNode(node, keepDocument);
}

export function trimWorkspaceNodesForRendererBoundary(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  keepNodeIds: ReadonlySet<string> = new Set()
) {
  return Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [
      nodeId,
      toRendererBoundaryNode(node, shouldKeepNodeDocument(nodeId, activeNodeId, keepNodeIds))
    ])
  );
}

function isBoundaryProjectionReusable(currentNode: Node | undefined, sourceNode: Node, keepDocument: boolean) {
  if (!currentNode) {
    return false;
  }

  return (
    hasMatchingBoundaryPreservedFields(currentNode, sourceNode) &&
    currentNode.hasContent === resolveNodeContentState(sourceNode) &&
    currentNode.hasReveal === resolveNodeRevealState(sourceNode) &&
    currentNode.authorText === (
      isNodeDocumentLoaded(sourceNode) ? readNodeAuthorText(sourceNode.content) : sourceNode.authorText ?? null
    ) &&
    currentNode.content === (keepDocument ? sourceNode.content : '') &&
    currentNode.reveal === (keepDocument ? sourceNode.reveal : null) &&
    currentNode.imageSources === (keepDocument ? sourceNode.imageSources : null)
  );
}

function reconcileWorkspaceRendererBoundaryNodes(
  currentNodesById: Record<string, Node>,
  nextNodesById: Record<string, Node>,
  activeNodeId: string | null,
  keepNodeIds: ReadonlySet<string>
) {
  let changed = Object.keys(currentNodesById).length !== Object.keys(nextNodesById).length;
  const nextBoundaryNodesById: Record<string, Node> = {};

  for (const [nodeId, node] of Object.entries(nextNodesById)) {
    const keepDocument = shouldKeepNodeDocument(nodeId, activeNodeId, keepNodeIds);
    const currentNode = currentNodesById[nodeId];
    if (currentNode && isBoundaryProjectionReusable(currentNode, node, keepDocument)) {
      nextBoundaryNodesById[nodeId] = currentNode;
      continue;
    }
    nextBoundaryNodesById[nodeId] = projectRendererBoundaryNode(node, keepDocument);
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
  const affectedNodeIds = new Set<string>([...currentKeepNodeIds, ...keepNodeIds]);
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
    const keepDocument = shouldKeepNodeDocument(nodeId, nextActiveNodeId, keepNodeIds);
    if (isBoundaryProjectionReusable(node, node, keepDocument)) {
      continue;
    }
    nextNodesById[nodeId] = projectRendererBoundaryNode(node, keepDocument);
    changed = true;
  }

  return changed
    ? recordWorkspaceRecordPatch(currentState.nodesById, nextNodesById, [...affectedNodeIds])
    : currentState.nodesById;
}

function updateRetentionPins(
  nodesById: Record<string, Node>,
  activeNodeId: string | null,
  keepNodeIds: ReadonlySet<string>
) {
  const pinnedNodeIds = new Set(keepNodeIds);
  if (activeNodeId) pinnedNodeIds.add(activeNodeId);
  updateWorkspaceNodeDocumentRetentionPins(nodesById, pinnedNodeIds);
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
  const changedNodeIds = readWorkspaceRecordPatch(nextNodesById, currentState.nodesById);
  const nextKeepNodeIds = new Set(keepNodeIds);
  const canUsePatchReconcile = Boolean(
    changedNodeIds?.every((nodeId) => nodeId in currentState.nodesById && nodeId in nextNodesById)
  );
  const canUseFocusedReconcile =
    'activeNodeId' in state &&
    'nodesById' in state &&
    (changedNodeIds?.every((nodeId) => nodeId in currentState.nodesById && nodeId in nextNodesById) ??
      hasMatchingNodeIds(currentState.nodesById, nextNodesById));
  const documentWorksetNodeIds =
    changedNodeIds ?? (!('activeNodeId' in state) || canUseFocusedReconcile
      ? listDocumentWorksetNodeIds(currentState.nodesById, nextNodesById)
      : []);
  updateRetentionPins(nextNodesById, nextActiveNodeId, nextKeepNodeIds);

  const reconciledNodesById =
    (canUseFocusedReconcile || canUsePatchReconcile) && documentWorksetNodeIds.length <= 4
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
            toRendererBoundaryNode: projectRendererBoundaryNode
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
