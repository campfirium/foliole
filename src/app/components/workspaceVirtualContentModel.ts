import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import type { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';
import type { WorkspaceManualVirtualCollection } from '../../store/workspaceStore';

import { collectManualVirtualCollectionTopicIds, findManualVirtualCollection } from './manualVirtualCollectionModel';

interface VirtualContentSnapshot {
  activeVirtualNodeId?: string | null;
  manualVirtualCollections?: readonly WorkspaceManualVirtualCollection[];
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

export function collectShelvedTopicIds(args: VirtualContentSnapshot) {
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return args.nodeOrder.filter((nodeId) => {
    const node = args.nodesById[nodeId];
    return Boolean(
      node?.shelvedAt &&
        node.kind === 'topic' &&
        !node.anchorLink &&
        !node.specialKind &&
        !trashedNodeIds.has(nodeId)
    );
  });
}

export function collectRemovedTopicIds(args: VirtualContentSnapshot) {
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return args.nodeOrder.filter((nodeId) => {
    const node = args.nodesById[nodeId];
    return Boolean(
      node &&
        node.kind === 'topic' &&
        !node.anchorLink &&
        !node.specialKind &&
        trashedNodeIds.has(nodeId)
    );
  });
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
  const manualCollection = findManualVirtualCollection(args.manualVirtualCollections, activeVirtualNodeId);
  if (manualCollection) {
    const trashedNodeIds = new Set(args.trashedNodeIds);
    return collectManualVirtualCollectionTopicIds(manualCollection, args.nodesById).filter(
      (nodeId) => !trashedNodeIds.has(nodeId)
    );
  }
  return collectSavedSearchTopicIds(args, virtualResultIndex);
}
