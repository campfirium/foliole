import { useMemo, useRef } from 'react';

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

function hasSameItems(previous: readonly Node[], next: readonly Node[]) {
  return previous.length === next.length && previous.every((node, index) => node === next[index]);
}

// Collects the active virtual folder's results only when the library inputs it reads change,
// and keeps the item array identity while the resolved nodes stay the same.
export function useVirtualContentItems(
  activeVirtualNodeId: string,
  args: Omit<VirtualContentSnapshot, 'activeVirtualNodeId'>,
  virtualResultIndex: VirtualResultIndex
) {
  const { nodeOrder, nodesById, trashedNodeIds } = args;
  const itemIds = useMemo(
    () => resolveVirtualContentItemIds({ activeVirtualNodeId, nodeOrder, nodesById, trashedNodeIds }, virtualResultIndex),
    [activeVirtualNodeId, nodeOrder, nodesById, trashedNodeIds, virtualResultIndex]
  );
  const previousItemsRef = useRef<Node[]>([]);
  return useMemo(() => {
    // unstable-reference-ok: virtualResultIndex comes from the ref-cached useVirtualNodeResultIndex; ids only change with real library inputs.
    const items = itemIds.map((nodeId) => nodesById[nodeId]).filter((node): node is Node => Boolean(node));
    if (hasSameItems(previousItemsRef.current, items)) {
      return previousItemsRef.current;
    }
    previousItemsRef.current = items;
    return items;
  }, [itemIds, nodesById]);
}
