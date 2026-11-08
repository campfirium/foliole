import { collectRemovedTopicIds, collectShelvedTopicIds } from '../../features/nodes/model/builtinVirtualTopicIds';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import type { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';

interface VirtualContentSnapshot {
  activeVirtualNodeId?: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}

type VirtualResultIndex = ReturnType<typeof buildVirtualNodeResultIndex>;

function collectSavedSearchTopicIds(
  args: VirtualContentSnapshot,
  virtualResultIndex: VirtualResultIndex
) {
  const activeVirtualNodeId = args.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return [];
  }
  const activeVirtualNode = args.nodesById[activeVirtualNodeId];
  if (!isVirtualNode(activeVirtualNode)) {
    return [];
  }
  return virtualResultIndex.resultIdsByVirtualId.get(activeVirtualNodeId) ?? [];
}

export function resolveVirtualContentItemIds(
  args: VirtualContentSnapshot,
  virtualResultIndex: VirtualResultIndex
) {
  const activeVirtualNodeId = args.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID) {
    return collectShelvedTopicIds(args);
  }
  if (activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID) {
    return collectRemovedTopicIds(args);
  }
  return collectSavedSearchTopicIds(args, virtualResultIndex);
}
