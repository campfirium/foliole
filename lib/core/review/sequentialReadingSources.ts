import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../database/specialNodeIds.js';

import type { SequentialReadingStateNode as Node, SequentialReadingStateNodes as SequentialReadingNodes } from './sequentialReadingState.js';

function isProtectedRootNode(node: Node) {
  return ['home', 'inbox', 'trash', 'virtual-root'].includes(node.specialKind ?? '') ||
    [HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID].includes(node.id);
}



function isFolderNode(node: Node | undefined) {
  return node?.kind === 'folder';
}

export function isSequentialReadingSourceFolder(node: Node | null | undefined) {
  return Boolean(node && node.kind === 'folder' && !isProtectedRootNode(node));
}

export function isSequentialReadingSourceTopic(
  node: Node | null | undefined,
  nodesById: SequentialReadingNodes
) {
  if (!node || node.kind !== 'topic' || isProtectedRootNode(node)) {
    return false;
  }
  return isFolderNode(node.parentNodeId ? nodesById[node.parentNodeId] : undefined);
}

export function isSequentialReadingSourceNode(
  node: Node | null | undefined,
  nodesById: SequentialReadingNodes
) {
  return isSequentialReadingSourceFolder(node) || isSequentialReadingSourceTopic(node, nodesById);
}

export function findEnabledSequentialReadingSourceId(
  nodeId: string,
  nodesById: SequentialReadingNodes
) {
  let current = nodesById[nodeId];
  const visited = new Set<string>();
  while (current?.parentNodeId && !visited.has(current.parentNodeId)) {
    const parent = nodesById[current.parentNodeId];
    if (!parent) {
      break;
    }
    if (isSequentialReadingSourceNode(parent, nodesById) && parent.sequentialReadingEnabled === true) {
      return parent.id;
    }
    visited.add(current.parentNodeId);
    current = parent;
  }
  return null;
}
