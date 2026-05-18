import type { Node } from '../../features/nodes/model/nodeTypes';
import { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';

export function buildVirtualResultCountById(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  return buildVirtualNodeResultIndex(args).countById;
}
