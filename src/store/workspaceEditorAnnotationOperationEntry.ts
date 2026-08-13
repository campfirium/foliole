import type {
  EditorAnnotationOperationEntry,
  EditorAnnotationOperationSnapshot
} from '../features/editor/model/editorOperationHistory';
import type { Node } from '../features/nodes/model/nodeTypes';

import type { WorkspaceState } from './workspaceStore';

type WorkspaceNode = Node;

function getAnnotationKind(node: WorkspaceNode): EditorAnnotationOperationSnapshot['kind'] {
  return node.anchorLink?.kind === 'cloze' ? 'cloze' : 'highlight';
}

export function createEditorAnnotationSnapshot(
  state: WorkspaceState,
  nodeId: string,
  fallbackParentNodeId?: string,
  nodeOrder = state.nodeOrder
): EditorAnnotationOperationSnapshot | null {
  const node = state.nodesById[nodeId];
  if (!node) {
    return null;
  }
  const parentNodeId = node.parentNodeId ?? fallbackParentNodeId ?? state.activeNodeId ?? node.id;
  return {
    ...(node.anchorLink?.id ? { anchorId: node.anchorLink.id } : {}),
    kind: getAnnotationKind(node),
    nodeId,
    orderIndex: nodeOrder.indexOf(nodeId),
    parentNodeId
  };
}

export function createEditorAnnotationCreateEntry(
  nodes: WorkspaceNode[],
  parentNodeId: string,
  nodeOrder: string[]
): EditorAnnotationOperationEntry | null {
  const annotations: EditorAnnotationOperationSnapshot[] = nodes
    .map((node): EditorAnnotationOperationSnapshot => ({
      ...(node.anchorLink?.id ? { anchorId: node.anchorLink.id } : {}),
      kind: getAnnotationKind(node),
      nodeId: node.id,
      orderIndex: nodeOrder.indexOf(node.id),
      parentNodeId
    }))
    .filter((snapshot) => Boolean(snapshot));
  if (annotations.length === 0) {
    return null;
  }
  return {
    annotations,
    canonical: 'pending',
    nodeId: parentNodeId,
    title: 'Create Annotation',
    type: 'annotation.create'
  };
}

export function createEditorAnnotationDeleteEntry(
  state: WorkspaceState,
  nodeIds: string[],
  fallbackParentNodeId?: string
): EditorAnnotationOperationEntry | null {
  const annotations = nodeIds
    .map((nodeId) => createEditorAnnotationSnapshot(state, nodeId, fallbackParentNodeId))
    .filter((snapshot): snapshot is EditorAnnotationOperationSnapshot => Boolean(snapshot));
  const parentNodeId = annotations[0]?.parentNodeId;
  if (!parentNodeId || annotations.length === 0) {
    return null;
  }
  return {
    annotations,
    canonical: 'confirmed',
    nodeId: parentNodeId,
    title: 'Delete Annotation',
    type: 'annotation.delete'
  };
}
