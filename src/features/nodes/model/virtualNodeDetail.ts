import type { Node } from './nodeTypes';

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isVirtualNodeResultCandidate(node: Node, activeNodeId: string) {
  return node.id !== activeNodeId && !node.specialKind && node.kind !== 'folder';
}

export function getVirtualNodeResultNodes(activeNodeId: string, nodesById: Record<string, Node>, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  return Object.values(nodesById).filter(
    (node): node is Node =>
      Boolean(
        node &&
          isVirtualNodeResultCandidate(node, activeNodeId) &&
          `${node.title}\n${node.content}`.toLocaleLowerCase().includes(normalizedQuery)
      )
  );
}
