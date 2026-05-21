import type { Node } from '../../features/nodes/model/nodeTypes';

type WebLookupTitleNode = Pick<Node, 'id' | 'kind' | 'parentNodeId' | 'title'>;

function normalizeTitle(title: string) {
  return title.trim() || 'Untitled';
}

function collectNodePath(activeNodeId: string, nodesById: Record<string, WebLookupTitleNode | undefined>) {
  const path: WebLookupTitleNode[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = activeNodeId;
  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const node: WebLookupTitleNode | undefined = nodesById[cursorId];
    if (!node) break;
    path.push(node);
    cursorId = node.parentNodeId;
  }
  return path.reverse();
}

function isSourceTopic(node: WebLookupTitleNode, nodesById: Record<string, WebLookupTitleNode | undefined>) {
  if (node.kind !== 'topic') {
    return false;
  }
  const parentNode = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  return !parentNode || parentNode.kind === 'folder';
}

export function resolveWebLookupTitle(
  activeNodeId: string,
  nodesById: Record<string, WebLookupTitleNode | undefined>
) {
  const path = collectNodePath(activeNodeId, nodesById);
  const sourceTopic = path.find((node) => isSourceTopic(node, nodesById));
  return normalizeTitle(sourceTopic?.title ?? nodesById[activeNodeId]?.title ?? '');
}
