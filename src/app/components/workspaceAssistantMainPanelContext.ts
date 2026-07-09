import type { NativeAssistantWorkspaceContext } from '../../../lib/platform/nativeAssistantContract';
import { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

import { findManualVirtualCollection } from './manualVirtualCollectionModel';
import { resolveAssistantVisibleListWorkspaceContext } from './workspaceRightSidebarAssistantContext';
import type { WorkspaceGridContentProjectionSource } from './workspaceGridContentProps';
import { resolveVirtualContentItemIds } from './workspaceVirtualContentModel';

export function resolveAssistantMainPanelWorkspaceContext(args: {
  props: Pick<WorkspaceGridContentProjectionSource, 'nodeList' | 'trash' | 'virtualView'>;
}): NativeAssistantWorkspaceContext | undefined {
  const virtualNodeId = args.props.virtualView.activeVirtualNodeId;
  if (!args.props.virtualView.isVirtualViewOpen || !virtualNodeId) return undefined;
  const itemNodeIds = resolveVirtualContentItemIds({
    activeVirtualNodeId: virtualNodeId,
    manualVirtualCollections: args.props.virtualView.manualVirtualCollections,
    nodeOrder: args.props.nodeList.nodeOrder,
    nodesById: args.props.nodeList.nodesById,
    trashedNodeIds: args.props.trash.trashedNodeIds
  }, buildVirtualNodeResultIndex({
    nodeOrder: args.props.nodeList.nodeOrder,
    nodesById: args.props.nodeList.nodesById,
    trashedNodeIds: args.props.trash.trashedNodeIds
  }));
  return resolveAssistantVisibleListWorkspaceContext({
    activeNodeId: virtualNodeId,
    itemNodeIds,
    nodesById: args.props.nodeList.nodesById,
    title: resolveVirtualPanelTitle(virtualNodeId, args.props)
  });
}

function resolveVirtualPanelTitle(
  virtualNodeId: string,
  props: Pick<WorkspaceLayoutProps, 'nodeList' | 'virtualView'>
) {
  return (
    findManualVirtualCollection(props.virtualView.manualVirtualCollections, virtualNodeId)?.title ||
    props.nodeList.nodesById[virtualNodeId]?.title ||
    'Virtual'
  );
}
