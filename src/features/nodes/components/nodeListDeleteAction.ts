import { requestFoliolePublishedDelete } from '../../../shared/platform/runtime/foliolePublishedManagement';

import { sortNodeIdsByVisibleOrder } from './nodeListMenuTargetOrder';

export function requestNodeListDelete(args: {
  deleteNodes: (nodeIds: string[]) => void;
  nodeIds: string[];
  visibleNodeIds: string[];
}) {
  if (args.nodeIds.length === 0) return;
  const nodeIds = sortNodeIdsByVisibleOrder(args.nodeIds, args.visibleNodeIds);
  requestFoliolePublishedDelete({ nodeIds, onAllowed: () => args.deleteNodes(nodeIds) });
}
