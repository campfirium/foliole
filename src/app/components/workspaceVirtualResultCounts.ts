import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID, isVirtualNode } from '../../features/nodes/model/specialNodes';
import {
  getOrderedVirtualNodeResultNodes,
  getVirtualRootResultNodes
} from '../../features/nodes/model/virtualNodeDetail';

export function buildVirtualResultCountById(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const countById = new Map<string, number>();
  const rootCount = getVirtualRootResultNodes(args.nodeOrder, args.nodesById, args.trashedNodeIds).length;
  if (rootCount > 0) countById.set(VIRTUAL_ROOT_NODE_ID, rootCount);
  args.nodeOrder.forEach((nodeId) => {
    const node = args.nodesById[nodeId];
    if (!isVirtualNode(node)) return;
    const count = getOrderedVirtualNodeResultNodes(node.id, args.nodeOrder, args.nodesById, node.virtualFilter).length;
    if (count > 0) countById.set(node.id, count);
  });
  return countById;
}
