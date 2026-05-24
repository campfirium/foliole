import type { Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import type { WorkspaceState } from './workspaceStore';

function isFolderNode(node: Node | undefined) {
  return node?.kind === 'folder';
}

export function isSequentialReadingSourceFolder(node: Node | null | undefined) {
  return Boolean(node && node.kind === 'folder' && !isProtectedRootNode(node));
}

export function isSequentialReadingSourceTopic(
  node: Node | null | undefined,
  nodesById: WorkspaceState['nodesById']
) {
  if (!node || node.kind !== 'topic' || isProtectedRootNode(node)) {
    return false;
  }
  return isFolderNode(node.parentNodeId ? nodesById[node.parentNodeId] : undefined);
}

export function isSequentialReadingSourceNode(
  node: Node | null | undefined,
  nodesById: WorkspaceState['nodesById']
) {
  return isSequentialReadingSourceFolder(node) || isSequentialReadingSourceTopic(node, nodesById);
}
