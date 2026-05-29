import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { compareNaturalName } from './workspaceContentSort';

export function compareVirtualNodeTitle(
  leftId: string,
  rightId: string,
  nodesById: WorkspaceListNodesById
) {
  if (leftId === VIRTUAL_ROOT_NODE_ID) return -1;
  if (rightId === VIRTUAL_ROOT_NODE_ID) return 1;
  return compareNaturalName(nodesById[leftId]?.title ?? '', nodesById[rightId]?.title ?? '');
}
