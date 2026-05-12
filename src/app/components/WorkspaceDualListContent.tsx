import type { CSSProperties } from 'react';
import { useEffect } from 'react';

import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_ROOT_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import {
  getOrderedVirtualNodeResultNodes,
  getVirtualRootResultNodes
} from '../../features/nodes/model/virtualNodeDetail';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import { DUAL_LIST_WIDTH_DEFAULT, useDualListResizer } from '../hooks/useDualListResizer';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { ExternalLibraryListPanel } from './ExternalLibraryListPanel';
import { TrashResultListPanel } from './TrashResultListPanel';
import { VirtualResultListPanel } from './VirtualResultListPanel';
import { WorkspaceDualListSplitter } from './WorkspaceDualListSplitter';
import { useWorkspaceDualListState } from './workspaceDualListState';
import { WorkspaceFolderColumn } from './WorkspaceFolderColumn';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

interface WorkspaceDualListContentProps {
  activeNodeId: string | null;
  activeVirtualNodeId?: string | null;
  externalEntriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  externalFolders: ExternalLibraryFolder[];
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings?: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
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
      <TrashResultListPanel
        nodeOrder={props.nodeOrder}
        nodesById={props.listNodesById}
        onSelectTrashNode={props.onSelectTrashNode}
        selectedTrashNodeId={props.selectedTrashNodeId}
        trashedNodeIds={props.trashedNodeIds}
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
      nodes={items}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
    />
  );
}

function renderExternalContentColumn(props: WorkspaceDualListContentProps) {
  return (
    <ExternalLibraryListPanel
      entriesByFolderId={props.externalEntriesByFolderId}
      folders={props.externalFolders}
      onOpenExternalSelection={props.onOpenExternalSelection}
      selection={props.externalSelection}
    />
  );
}

function useWorkspaceFolderWidthCssVar(width: number) {
  useEffect(() => {
    document.documentElement.style.setProperty('--workspace-folder-column-width', `${width}px`);
  }, [width]);
}

export function WorkspaceDualListContent(props: WorkspaceDualListContentProps) {
  const dualListState = useWorkspaceDualListState(props);
  const folderListResize = useDualListResizer(DUAL_LIST_WIDTH_DEFAULT);
  const topicRootId = dualListState.activeFolderColumnId ?? dualListState.activeFolderId ?? null;
  useWorkspaceFolderWidthCssVar(folderListResize.width);

  if (!topicRootId && !props.isVirtualViewOpen && !props.isExternalViewOpen) {
    return renderSingleListFallback(props);
  }

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden"
      style={{ '--workspace-folder-column-width': `${folderListResize.width}px` } as CSSProperties}
    >
      <div
        className="workspace-region-main-folder flex min-h-0 min-w-0 overflow-hidden"
        style={{ flex: `0 0 ${folderListResize.width}px` }}
      >
        <WorkspaceFolderColumn
          activeFolderId={dualListState.activeFolderId}
          activeVirtualNodeId={props.activeVirtualNodeId}
          externalEntriesByFolderId={props.externalEntriesByFolderId}
          externalFolders={props.externalFolders}
          externalSelection={props.externalSelection}
          isExternalViewOpen={props.isExternalViewOpen}
          folderNodeOrder={dualListState.folderNodeOrder}
          folderNodesById={dualListState.folderNodesById}
          isTrashViewOpen={props.isTrashViewOpen}
          isVirtualViewOpen={props.isVirtualViewOpen}
          nodeOrder={props.nodeOrder}
          nodesById={props.listNodesById}
          onOpenMoveToNode={props.onOpenMoveToNode}
          onOpenNotesView={props.onOpenNotesView}
          onOpenExternalSelection={props.onOpenExternalSelection}
          onOpenExternalLibrarySettings={props.onOpenExternalLibrarySettings}
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
      <div className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {props.isVirtualViewOpen
          ? renderVirtualContentColumn(props)
          : props.isExternalViewOpen
            ? renderExternalContentColumn(props)
          : topicRootId
            ? renderStandardContentColumn(props, dualListState, topicRootId)
            : renderSingleListFallback(props)}
      </div>
    </div>
  );
}
