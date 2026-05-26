import {
  getWorkspaceListReviewItemKind,
  isFsrsWorkspaceListNode,
  type WorkspaceListNode,
  type WorkspaceListNodesById
} from '../model/workspaceListNode';

export function canReturnNode(node: WorkspaceListNode | undefined) {
  return canRelearnNode(node);
}

export function canDismissNode(node: WorkspaceListNode | undefined) {
  if (!node?.hasContent) {
    return false;
  }
  if (getWorkspaceListReviewItemKind(node) !== 'reading') {
    return false;
  }
  return node.reading?.state !== 'dismissed';
}

export function canPostponeTopic(node: WorkspaceListNode | undefined) {
  return Boolean(node?.kind === 'topic' && node.reading?.state !== 'dismissed');
}

export function canShelveTopic(node: WorkspaceListNode | undefined) {
  return Boolean(node?.kind === 'topic' && !node.specialKind && !node.anchorLink && !node.shelvedAt);
}

export function canUnshelveTopic(node: WorkspaceListNode | undefined) {
  return Boolean(node?.kind === 'topic' && !node.specialKind && !node.anchorLink && node.shelvedAt);
}

function collectDescendantIds(rootNodeId: string, nodesById: WorkspaceListNodesById) {
  const descendants: string[] = [];
  const pending = [rootNodeId];
  while (pending.length > 0) {
    const currentId = pending.shift();
    if (!currentId) {
      continue;
    }
    for (const node of Object.values(nodesById)) {
      if (node?.parentNodeId === currentId) {
        descendants.push(node.id);
        pending.push(node.id);
      }
    }
  }
  return descendants;
}

export function collectDismissEntireTopicTargets(rootNodeId: string, nodesById: WorkspaceListNodesById) {
  const rootNode = nodesById[rootNodeId];
  if (rootNode?.kind !== 'topic') {
    return [];
  }
  return [rootNodeId, ...collectDescendantIds(rootNodeId, nodesById)].filter((nodeId) => canDismissNode(nodesById[nodeId]));
}

export function canRelearnNode(node: WorkspaceListNode | undefined) {
  if (!node || node.specialKind) {
    return false;
  }
  if (isFsrsWorkspaceListNode(node)) {
    return true;
  }
  return getWorkspaceListReviewItemKind(node) === 'reading';
}

export function hasRelearnTargets(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  return nodeIds.some((nodeId) => canRelearnNode(nodesById[nodeId]));
}

export function hasReturnTargets(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  return nodeIds.some((nodeId) => canReturnNode(nodesById[nodeId]));
}

export function hasDismissTargets(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  return nodeIds.some((nodeId) => canDismissNode(nodesById[nodeId]));
}

export function hasDismissEntireTopicTargets(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  if (nodeIds.length !== 1) {
    return false;
  }
  const rootNodeId = nodeIds[0];
  return Boolean(rootNodeId && collectDismissEntireTopicTargets(rootNodeId, nodesById).length > 0);
}

export function hasShelveTopicTarget(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  if (nodeIds.length !== 1) {
    return false;
  }
  const nodeId = nodeIds[0];
  return nodeId !== undefined && canShelveTopic(nodesById[nodeId]);
}

export function hasUnshelveTopicTarget(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  if (nodeIds.length !== 1) {
    return false;
  }
  const nodeId = nodeIds[0];
  return nodeId !== undefined && canUnshelveTopic(nodesById[nodeId]);
}

export function canToggleSequentialReading(node: WorkspaceListNode | undefined, nodesById: WorkspaceListNodesById) {
  if (!node || node.specialKind) {
    return false;
  }
  if (node.kind === 'folder') {
    return true;
  }
  if (node.kind !== 'topic' || node.parentNodeId === null) {
    return false;
  }
  return nodesById[node.parentNodeId]?.kind === 'folder';
}
