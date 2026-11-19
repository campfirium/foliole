import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { selectCanonicalVisibleNodeIds } from '../../shared/workspaceCanonicalSelectors';

export interface WorkspaceListChildrenIndex {
  countChange: 'none' | 'rebuild' | { nodeId: string };
  visibleChildrenByParent: Map<string | null, string[]>;
  visibleNodeIds: string[];
  visibleNodeIdSet: ReadonlySet<string>;
}

interface PreviousIndex {
  index: WorkspaceListChildrenIndex;
  nodesById: WorkspaceListNodesById;
}

function changedCountStructure(nodeId: string, nodesById: WorkspaceListNodesById, previous: PreviousIndex) {
  if (!previous.index.visibleNodeIdSet.has(nodeId)) return true;
  const before = previous.nodesById[nodeId];
  const after = nodesById[nodeId];
  return before !== after && (
    before?.parentNodeId !== after?.parentNodeId ||
    before?.kind !== after?.kind ||
    before?.specialKind !== after?.specialKind
  );
}

function resolveCountChange(
  previous: PreviousIndex | undefined,
  currentIds: ReadonlySet<string>,
  changedNodeId: string | undefined,
  added: number,
  changed: number
): WorkspaceListChildrenIndex['countChange'] {
  if (!previous || changed > 1) return 'rebuild';
  const removed = previous.index.visibleNodeIdSet.size - currentIds.size + added;
  if (removed + changed > 1) return 'rebuild';
  if (changedNodeId !== undefined) return { nodeId: changedNodeId };
  if (removed === 1) {
    for (const id of previous.index.visibleNodeIdSet) {
      if (!currentIds.has(id)) return { nodeId: id };
    }
  }
  return 'none';
}

export function buildWorkspaceListChildrenIndex(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[],
  previous?: PreviousIndex
): WorkspaceListChildrenIndex {
  const visibleChildrenByParent = new Map<string | null, string[]>();
  const visibleNodeIds = selectCanonicalVisibleNodeIds({ nodeOrder, nodesById, trashedNodeIds });
  const visibleNodeIdSet = new Set(visibleNodeIds);
  let added = 0;
  let changed = 0;
  let changedNodeId: string | undefined;

  for (const nodeId of visibleNodeIds) {
    const parentId = nodesById[nodeId]?.parentNodeId ?? null;
    const children = visibleChildrenByParent.get(parentId);
    if (children) children.push(nodeId);
    else visibleChildrenByParent.set(parentId, [nodeId]);

    if (previous && changed <= 1 && changedCountStructure(nodeId, nodesById, previous)) {
      if (!previous.index.visibleNodeIdSet.has(nodeId)) added += 1;
      changed += 1;
      changedNodeId = nodeId;
    }
  }

  return {
    countChange: resolveCountChange(previous, visibleNodeIdSet, changedNodeId, added, changed),
    visibleChildrenByParent,
    visibleNodeIds,
    visibleNodeIdSet
  };
}
