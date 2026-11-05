import { selectCanonicalVisibleNodeIds, type WorkspaceCanonicalSource } from '../../../shared/workspaceCanonicalSelectors';

interface RelatedNode { id: string; parentNodeId: string | null; deletedAt?: string | null }

export function collectVisibleNodeDescendants<TNode extends RelatedNode>(
  source: WorkspaceCanonicalSource<TNode>, rootId: string
) {
  const visibleIds = selectCanonicalVisibleNodeIds(source);
  const childrenById: Record<string, string[]> = {};
  const nodeIds: string[] = [];
  if (!visibleIds.includes(rootId)) return { childrenById, nodeIds };
  const index = new Map<string, string[]>();
  for (const id of visibleIds) {
    const parentId = source.nodesById[id]?.parentNodeId;
    if (!parentId) continue;
    const children = index.get(parentId) ?? [];
    children.push(id);
    index.set(parentId, children);
  }
  const visited = new Set([rootId]);
  const pending = [rootId];
  childrenById[rootId] = [];
  while (pending.length) {
    const parentId = pending.pop()!;
    for (const id of index.get(parentId) ?? []) {
      if (visited.has(id)) continue;
      visited.add(id);
      childrenById[parentId]!.push(id);
      childrenById[id] = [];
      nodeIds.push(id);
      pending.push(id);
    }
  }
  return { childrenById, nodeIds };
}
