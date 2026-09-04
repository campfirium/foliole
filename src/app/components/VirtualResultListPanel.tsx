import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

interface VirtualResultListPanelProps {
  activeNodeId: string | null;
  emptyState: {
    description: string;
    title: string;
  } | null;
  header:
    | { kind: 'root' }
    | { kind: 'description'; text: string; title: string }
    | { kind: 'user-search'; nodeId: string; query: string; title: string };
  nodeOrder: string[];
  nodes: Node[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  preserveItemOrder?: boolean;
  topicFocusAvailable?: boolean;
}

function resolveVirtualFolderId(props: VirtualResultListPanelProps) {
  if (props.header.kind === 'root') {
    return props.nodeOrder.find((nodeId) => props.nodesById[nodeId]?.specialKind === 'virtual-root') ?? 'special-virtual-root';
  }
  if (props.header.kind === 'user-search') {
    return props.header.nodeId;
  }
  if (props.header.kind === 'description') {
    const { title } = props.header;
    return props.nodeOrder.find((nodeId) => props.nodesById[nodeId]?.title === title) ?? props.nodeOrder[0] ?? 'virtual-list';
  }
  return props.nodeOrder[0] ?? 'virtual-list';
}

export function VirtualResultListPanel(props: VirtualResultListPanelProps) {
  const nodeIds = props.nodes.map((node) => node.id);
  const virtualFolderId = resolveVirtualFolderId(props);
  const virtualFolderView = isManualVirtualNodeFilter(props.nodesById[virtualFolderId]?.virtualFilter)
    ? 'manual' as const
    : 'readonly' as const;

  return (
    <WorkspaceTopicTree
      activeFolderId={virtualFolderId}
      activeNodeId={props.activeNodeId}
      {...(props.emptyState ? { emptyState: props.emptyState } : {})}
      itemIds={nodeIds}
      nodesById={toWorkspaceListNodesById(props.nodesById)}
      onOpenMoveToNode={() => undefined}
      onSelectNode={props.onSelectNode}
      preserveItemOrder={props.preserveItemOrder ?? false}
      showCreateTopic={false}
      {...(props.topicFocusAvailable !== undefined ? { topicFocusAvailable: props.topicFocusAvailable } : {})}
      virtualFolderView={virtualFolderView}
    />
  );
}
