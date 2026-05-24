import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { isCanonicalVisibleNodeId } from '../../shared/workspaceCanonicalSelectors';

export interface WorkspaceListChildrenIndex {
  orderIndexById: Map<string, number>;
  visibleChildrenByParent: Map<string | null, string[]>;
  visibleNodeIds: string[];
  visibleNodeIdSet: Set<string>;
}

export function buildWorkspaceListChildrenIndex(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
): WorkspaceListChildrenIndex {
  const orderIndexById = new Map<string, number>();
  const visibleChildrenByParent = new Map<string | null, string[]>();
  const visibleNodeIds: string[] = [];
  const canonicalSource = { nodeOrder, nodesById, trashedNodeIds };

  nodeOrder.forEach((nodeId, index) => {
    orderIndexById.set(nodeId, index);
    if (!isCanonicalVisibleNodeId(canonicalSource, nodeId)) return;
    const node = nodesById[nodeId];
    if (!node) return;

    visibleNodeIds.push(nodeId);
    const parentId = node.parentNodeId ?? null;
    const children = visibleChildrenByParent.get(parentId);
    if (children) {
      children.push(nodeId);
    } else {
      visibleChildrenByParent.set(parentId, [nodeId]);
    }
  });

  return {
    orderIndexById,
    visibleChildrenByParent,
    visibleNodeIds,
    visibleNodeIdSet: new Set(visibleNodeIds)
  };
}
