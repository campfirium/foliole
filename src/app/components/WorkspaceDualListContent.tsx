import { useMemo } from 'react';

import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  TRASH_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import {
  getOrderedVirtualNodeResultNodes,
  getVirtualRootResultNodes
} from '../../features/nodes/model/virtualNodeDetail';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { DUAL_LIST_WIDTH_DEFAULT, useDualListResizer } from '../hooks/useDualListResizer';

import { VirtualResultListPanel } from './VirtualResultListPanel';
import { WorkspaceDualListSplitter } from './WorkspaceDualListSplitter';
import { WorkspaceFolderColumn } from './WorkspaceFolderColumn';
import {
  buildFolderNavigationNodeOrder,
  buildFolderNavigationNodesById,
  buildTopicNavigationNodesById,
  collectTopicColumnNodeIds,
  resolveActiveFolderColumnNodeId,
  resolveFocusedFolderNodeId
} from './workspaceFolderNavigation';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

interface WorkspaceDualListContentProps {
  activeNodeId: string | null;
  activeVirtualNodeId?: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
  onOpenNotesView: WorkspaceLayoutProps['onOpenNotesView'];
  onOpenTrashView: WorkspaceLayoutProps['onOpenTrashView'];
  onOpenVirtualView?: WorkspaceLayoutProps['onOpenVirtualView'];
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: WorkspaceLayoutProps['onSelectTrashNode'];
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

function useWorkspaceDualListState(args: WorkspaceDualListContentProps) {
  return useMemo(() => {
    const folderNodeOrder = buildFolderNavigationNodeOrder(args.nodeOrder, args.listNodesById, args.trashedNodeIds);
    const activeFolderId = args.isTrashViewOpen
      ? TRASH_NODE_ID
      : resolveFocusedFolderNodeId(
          args.activeNodeId,
          args.nodeOrder,
          args.listNodesById,
          args.trashedNodeIds
        );
    const activeFolderColumnId = args.isTrashViewOpen
      ? TRASH_NODE_ID
      : resolveActiveFolderColumnNodeId(
          args.activeNodeId,
          args.nodeOrder,
          args.listNodesById,
          args.trashedNodeIds
        );

    const topicNodeOrder = collectTopicColumnNodeIds(
      activeFolderColumnId,
      args.nodeOrder,
      args.listNodesById,
      args.trashedNodeIds
    );

    return {
      activeFolderColumnId,
      activeFolderId,
      folderNodeOrder,
      folderNodesById: buildFolderNavigationNodesById(
        args.nodeOrder,
        args.listNodesById,
        args.trashedNodeIds
      ),
      topicNodeOrder,
      topicNodesById: buildTopicNavigationNodesById(topicNodeOrder, args.listNodesById)
    };
  }, [
    args.activeNodeId,
    args.isTrashViewOpen,
    args.listNodesById,
    args.nodeOrder,
    args.trashedNodeIds
  ]);
}

function collectVirtualContentItemIds(args: WorkspaceDualListContentProps) {
  const activeVirtualNodeId = args.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return getVirtualRootResultNodes(args.nodeOrder, args.nodesById, args.trashedNodeIds).map((node) => node.id);
  }
  const activeVirtualNode = args.nodesById[activeVirtualNodeId];
  if (!isVirtualNode(activeVirtualNode)) {
    return [];
  }
  return getOrderedVirtualNodeResultNodes(
    activeVirtualNodeId,
    args.nodeOrder,
    args.nodesById,
    (activeVirtualNode as Node).virtualFilter
  ).map((node) => node.id);
}

function renderSingleListFallback(props: WorkspaceDualListContentProps) {
  return (
    <NodeListTree
      activeNodeId={props.activeNodeId}
      isTrashViewOpen={props.isTrashViewOpen}
      isVirtualViewOpen={props.isVirtualViewOpen}
      nodeOrder={props.nodeOrder}
      nodesById={props.listNodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onOpenNotesView={props.onOpenNotesView}
      onSelectNode={props.onSelectNode}
      onSelectTrashNode={props.onSelectTrashNode}
      selectedTrashNodeId={props.selectedTrashNodeId}
    />
  );
}

function renderStandardContentColumn(
  props: WorkspaceDualListContentProps,
  dualListState: ReturnType<typeof useWorkspaceDualListState>,
  topicRootId: string
) {
  if (props.isTrashViewOpen) {
    return (
      <NodeListTree
        activeNodeId={props.selectedTrashNodeId}
        isTrashViewOpen
        isVirtualViewOpen={false}
        nodeOrder={props.nodeOrder}
        nodesById={props.listNodesById}
        onOpenMoveToNode={props.onOpenMoveToNode}
        onOpenNotesView={props.onOpenNotesView}
        onSelectNode={props.onSelectNode}
        onSelectTrashNode={props.onSelectTrashNode}
        selectedTrashNodeId={props.selectedTrashNodeId}
      />
    );
  }

  return (
    <WorkspaceTopicTree
      activeFolderId={topicRootId}
      activeNodeId={props.activeNodeId}
      itemIds={dualListState.topicNodeOrder}
      nodesById={dualListState.topicNodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      onSelectNode={props.onSelectNode}
    />
  );
}

function renderVirtualContentColumn(props: WorkspaceDualListContentProps) {
  const activeVirtualNodeId = props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  const itemIds = collectVirtualContentItemIds(props);
  const items = itemIds.map((nodeId) => props.nodesById[nodeId]).filter((node): node is Node => Boolean(node));
  const folderTitle = props.nodesById[activeVirtualNodeId]?.title ?? 'Virtual';

  return (
    <VirtualResultListPanel
      activeNodeId={props.activeNodeId}
      emptyState={{
        description:
          activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID
            ? 'Right-click Virtual to create your first virtual folder.'
            : 'No items match this virtual folder yet.',
        title: activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID ? 'No virtual folders yet' : 'No items in this virtual folder'
      }}
      folderTitle={folderTitle}
      nodes={items}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
    />
  );
}

export function WorkspaceDualListContent(props: WorkspaceDualListContentProps) {
  const dualListState = useWorkspaceDualListState(props);
  const folderListResize = useDualListResizer(DUAL_LIST_WIDTH_DEFAULT);
  const topicRootId = dualListState.activeFolderColumnId ?? dualListState.activeFolderId ?? null;

  if (!topicRootId && !props.isVirtualViewOpen) {
    return renderSingleListFallback(props);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-bg-panel">
      <div
        className="flex min-h-0 min-w-0 overflow-hidden bg-bg-panel"
        style={{ flex: `0 0 ${folderListResize.width}px` }}
      >
        <WorkspaceFolderColumn
          activeFolderId={dualListState.activeFolderId}
          activeVirtualNodeId={props.activeVirtualNodeId}
          folderNodeOrder={dualListState.folderNodeOrder}
          folderNodesById={dualListState.folderNodesById}
          isTrashViewOpen={props.isTrashViewOpen}
          isVirtualViewOpen={props.isVirtualViewOpen}
          nodeOrder={props.nodeOrder}
          nodesById={props.listNodesById}
          onOpenMoveToNode={props.onOpenMoveToNode}
          onOpenNotesView={props.onOpenNotesView}
          onOpenTrashView={props.onOpenTrashView}
          onOpenVirtualView={props.onOpenVirtualView}
          onSelectNode={props.onSelectNode}
          onSelectNodeInVirtualView={props.onSelectNodeInVirtualView}
          onSelectTrashNode={props.onSelectTrashNode}
          selectedTrashNodeId={props.selectedTrashNodeId}
        />
      </div>
      <WorkspaceDualListSplitter
        isResizing={folderListResize.isResizing}
        onKeyDown={folderListResize.handleKeyDown}
        onPointerDown={folderListResize.handlePointerDown}
        width={folderListResize.width}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas">
        {props.isVirtualViewOpen
          ? renderVirtualContentColumn(props)
          : topicRootId
            ? renderStandardContentColumn(props, dualListState, topicRootId)
            : renderSingleListFallback(props)}
      </div>
    </div>
  );
}
