import { useMemo } from 'react';

import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

interface VirtualResultListPanelProps {
  activeNodeId: string | null;
  virtualFolderId?: string;
  continueAfterDelete?: boolean;
  childrenByParent?: Map<string | null, string[]>;
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

function getManualRootIds(ids: string[], nodesById: Record<string, Node>) {
  const matches = new Set(ids);
  return ids.filter(id => {
    const seen = new Set([id]);
    let parent = nodesById[id]?.parentNodeId;
    while (parent && !seen.has(parent)) {
      if (nodesById[parent]?.kind === 'folder') break;
      if (matches.has(parent)) return false;
      seen.add(parent);
      parent = nodesById[parent]?.parentNodeId;
    }
    return true;
  });
}

export function VirtualResultListPanel(props: VirtualResultListPanelProps) {
  // Each of these walks the result set or the whole library; rebuilding them per render
  // also invalidated every tree model memo below that keys on them.
  // Hosts rebuild the result array per render, so key the ids by content.
  const nodeIdsKey = props.nodes.map((node) => node.id).join('\u0000');
  const nodeIds = useMemo(() => (nodeIdsKey ? nodeIdsKey.split('\u0000') : []), [nodeIdsKey]);
  const listNodesById = useMemo(() => toWorkspaceListNodesById(props.nodesById), [props.nodesById]);
  const virtualFolderId = props.virtualFolderId ?? resolveVirtualFolderId(props);
  const virtualFolderView = isManualVirtualNodeFilter(props.nodesById[virtualFolderId]?.virtualFilter)
    ? 'manual' as const
    : 'readonly' as const;

  const manualRoots = virtualFolderView === 'manual' && Boolean(props.childrenByParent);
  const itemIds = useMemo(
    () => (manualRoots ? getManualRootIds(nodeIds, props.nodesById) : nodeIds),
    [nodeIds, props.nodesById, manualRoots]
  );

  return (
    <WorkspaceTopicTree
      activeFolderId={virtualFolderId}
      activeNodeId={props.activeNodeId}
      {...(props.continueAfterDelete ? { deleteBrowseRootId: virtualFolderId } : {})}
      {...(props.emptyState ? { emptyState: props.emptyState } : {})}
      {...(virtualFolderView === 'manual' && props.childrenByParent ? { childrenByParent: props.childrenByParent } : {})}
      itemIds={itemIds}
      nodesById={listNodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={props.onSelectNode}
      preserveItemOrder={props.preserveItemOrder ?? false}
      showCreateTopic={false}
      {...(props.topicFocusAvailable !== undefined ? { topicFocusAvailable: props.topicFocusAvailable } : {})}
      virtualFolderView={virtualFolderView}
    />
  );
}
