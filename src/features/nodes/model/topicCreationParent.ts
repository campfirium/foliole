import type { WorkspaceNodeSnapshot } from '../../../../lib/core/database/workspaceSnapshotHelpers';

import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from './specialNodes';

export function resolveTopicCreationParentId(nodeId: string | null, nodes: Record<string, WorkspaceNodeSnapshot>) {
  if (!nodeId || nodeId === HOME_NODE_ID) return INBOX_NODE_ID;
  const visited = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId && !visited.has(currentId)) {
    const node: WorkspaceNodeSnapshot | undefined = nodes[currentId];
    if (currentId === TRASH_NODE_ID || currentId === VIRTUAL_ROOT_NODE_ID || node?.virtualFilter) return INBOX_NODE_ID;
    visited.add(currentId);
    currentId = node?.parentNodeId ?? null;
  }
  return nodeId;
}

export function canCreateTopicInside(node: WorkspaceNodeSnapshot | null | undefined) {
  return Boolean(node && !node.deletedAt && node.kind !== 'item'
    && resolveTopicCreationParentId(node.id, { [node.id]: node }) === node.id);
}
