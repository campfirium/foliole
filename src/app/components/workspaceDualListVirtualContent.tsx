import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import { buildVirtualNodeResultIndex, getVirtualNodePrimaryKeyword } from '../../features/nodes/model/virtualNodeDetail';

import { RemovedSourcesPanel } from './RemovedSourcesPanel';
import { VirtualResultListPanel } from './VirtualResultListPanel';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';

function collectVirtualContentItemIds(
  args: WorkspaceDualListContentProps,
  virtualResultIndex: ReturnType<typeof buildVirtualNodeResultIndex>
) {
  const activeVirtualNodeId = args.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return virtualResultIndex.rootResultIds;
  }
  const activeVirtualNode = args.nodesById[activeVirtualNodeId];
  if (!isVirtualNode(activeVirtualNode)) {
    return [];
  }
  return virtualResultIndex.resultIdsByVirtualId.get(activeVirtualNodeId) ?? [];
}

function collectShelvedTopicIds(props: WorkspaceDualListContentProps) {
  const trashedNodeIds = new Set(props.trashedNodeIds);
  return props.nodeOrder.filter((nodeId) => {
    const node = props.nodesById[nodeId];
    return Boolean(
      node?.shelvedAt &&
        node.kind === 'topic' &&
        !node.anchorLink &&
        !node.specialKind &&
        !trashedNodeIds.has(nodeId)
    );
  });
}

function resolveVirtualHeader(args: {
  activeVirtualNode: Node | undefined;
  isShelvedView: boolean;
}) {
  if (isVirtualNode(args.activeVirtualNode)) {
    return {
      kind: 'user-search' as const,
      nodeId: args.activeVirtualNode.id,
      query: getVirtualNodePrimaryKeyword(args.activeVirtualNode.virtualFilter)
    };
  }
  return {
    kind: 'description' as const,
    text: args.isShelvedView
      ? 'Shelved topics stay here until you return them to active reading.'
      : 'Virtual combines results from saved searches below.'
  };
}

export function renderVirtualContentColumn(
  props: WorkspaceDualListContentProps,
  virtualResultIndex: ReturnType<typeof buildVirtualNodeResultIndex>
) {
  const activeVirtualNodeId = props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID) {
    return <RemovedSourcesPanel onSelectNode={props.onSelectNode} />;
  }
  const itemIds = activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID
    ? collectShelvedTopicIds(props)
    : collectVirtualContentItemIds(props, virtualResultIndex);
  const items = itemIds.map((nodeId) => props.nodesById[nodeId]).filter((node): node is Node => Boolean(node));
  const isShelvedView = activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID;

  return (
    <VirtualResultListPanel
      activeNodeId={props.activeNodeId}
      emptyState={{
        description: isShelvedView
          ? 'Shelved topics will appear here.'
          : activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID
            ? 'Use the plus button on Virtual to create your first saved search.'
            : 'No topics match this saved search yet.',
        title: isShelvedView
          ? 'No shelved topics'
          : activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID ? 'No saved searches yet' : 'No matching topics'
      }}
      header={resolveVirtualHeader({ activeVirtualNode: props.nodesById[activeVirtualNodeId], isShelvedView })}
      nodes={items}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
    />
  );
}
