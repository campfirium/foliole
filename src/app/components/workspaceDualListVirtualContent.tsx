import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import { buildVirtualNodeResultIndex, getVirtualNodePrimaryKeyword } from '../../features/nodes/model/virtualNodeDetail';

import { VirtualResultListPanel } from './VirtualResultListPanel';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';
import { resolveVirtualContentItemIds } from './workspaceVirtualContentModel';

function resolveVirtualHeader(args: {
  activeVirtualNode: Node | undefined;
  activeVirtualNodeId: string;
  isRemovedView: boolean;
  isShelvedView: boolean;
}) {
  if (args.activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return { kind: 'root' as const };
  }
  if (isVirtualNode(args.activeVirtualNode)) {
    return {
      kind: 'user-search' as const,
      nodeId: args.activeVirtualNode.id,
      query: getVirtualNodePrimaryKeyword(args.activeVirtualNode.virtualFilter),
      title: args.activeVirtualNode.title
    };
  }
  if (args.isRemovedView) {
    return {
      kind: 'description' as const,
      text: 'List deleted topics with linked sources.',
      title: 'Removed'
    };
  }
  return {
    kind: 'description' as const,
    text: args.isShelvedView
      ? 'List topics that are shelved.'
      : '',
    title: args.isShelvedView ? 'Shelved' : 'Virtual'
  };
}

export function renderVirtualContentColumn(
  props: WorkspaceDualListContentProps,
  virtualResultIndex: ReturnType<typeof buildVirtualNodeResultIndex>
) {
  const activeVirtualNodeId = props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return <div aria-label="Current folder contents" className="flex min-h-0 min-w-0 flex-1" />;
  }
  const isRemovedView = activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID;
  const isShelvedView = activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID;
  const itemIds = resolveVirtualContentItemIds(props, virtualResultIndex);
  const items = itemIds.map((nodeId) => props.nodesById[nodeId]).filter((node): node is Node => Boolean(node));

  return (
    <VirtualResultListPanel
      activeNodeId={props.activeNodeId}
      emptyState={{
        description: isRemovedView
          ? 'Removed topics will appear here.'
          : isShelvedView
          ? 'Shelved topics will appear here.'
          : activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID
            ? 'Try another topic search.'
            : 'No topics match this saved search yet.',
        title: isRemovedView
          ? 'No removed topics'
          : isShelvedView
          ? 'No shelved topics'
          : activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID ? 'No matching topics' : 'No matching topics'
      }}
      header={resolveVirtualHeader({
        activeVirtualNode: props.nodesById[activeVirtualNodeId],
        activeVirtualNodeId,
        isRemovedView,
        isShelvedView
      })}
      nodeOrder={props.nodeOrder}
      nodes={items}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
    />
  );
}
