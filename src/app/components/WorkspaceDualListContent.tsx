import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import { DUAL_LIST_WIDTH_DEFAULT, useDualListResizer } from '../hooks/useDualListResizer';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { RemovedSourcesPanel } from './RemovedSourcesPanel';
import { TrashResultListPanel } from './TrashResultListPanel';
import { VirtualResultListPanel } from './VirtualResultListPanel';
import { renderExternalContentColumn } from './workspaceDualListExternalContent';
import { WorkspaceDualListFolderColumn } from './WorkspaceDualListFolderColumn';
import { WorkspaceDualListSplitter } from './WorkspaceDualListSplitter';
import { useWorkspaceDualListState } from './workspaceDualListState';
import { useWorkspaceDualListViewRoot } from './workspaceDualListViewRoot';
import { useWorkspaceFolderWidthCssVar } from './workspaceFolderWidthCssVar';
import type { WorkspaceLayoutFlatProps } from './workspaceLayoutProps';
import { WorkspaceTopicTree } from './WorkspaceTopicTree';

export interface WorkspaceDualListContentProps {
  activeNodeId: string | null;
  activeVirtualNodeId?: string | null;
  externalEntriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  externalFolders: ExternalLibraryFolder[];
  externalSelection: ExternalLibrarySelection;
  isExternalViewOpen: boolean;
  isStudyMode: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  onOpenMoveToNode: WorkspaceLayoutFlatProps['onOpenMoveToNode'];
  onOpenPostponeTopicPanel?: WorkspaceLayoutFlatProps['onOpenPostponeTopicPanel'];
  onOpenNotesView: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings?: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  reviewCurrentNodeId: string | null;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

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
      childrenByParent={dualListState.topicChildrenByParent}
      forceVisibleNodeId={props.isStudyMode ? props.reviewCurrentNodeId : null}
      itemIds={dualListState.topicNodeOrder}
      nodesById={dualListState.topicNodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      {...definedProps({ onOpenPostponeTopicPanel: props.onOpenPostponeTopicPanel })}
      onSelectNode={props.onSelectNode}
    />
  );
}

function renderVirtualContentColumn(
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
            ? 'Right-click Virtual to create your first virtual folder.'
            : 'No items match this virtual folder yet.',
        title: isShelvedView
          ? 'No shelved topics'
          : activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID ? 'No virtual folders yet' : 'No items in this virtual folder'
      }}
      nodes={items}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
    />
  );
}

export function WorkspaceDualListContent(props: WorkspaceDualListContentProps) {
  const viewRoot = useWorkspaceDualListViewRoot(props);
  const dualListState = useWorkspaceDualListState({
    ...props,
    preferredFolderColumnId: viewRoot.preferredFolderColumnId
  });
  const folderListResize = useDualListResizer(DUAL_LIST_WIDTH_DEFAULT);
  const topicRootId = dualListState.activeFolderColumnId ?? dualListState.activeFolderId ?? null;
  const virtualResultIndex = useMemo(
    () => buildVirtualNodeResultIndex(props),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );
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
        <WorkspaceDualListFolderColumn
          dualListState={dualListState}
          onSelectFolderColumnNode={viewRoot.selectFolderColumnNode}
          props={props}
          virtualResultCountById={virtualResultIndex.countById}
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
          ? renderVirtualContentColumn(props, virtualResultIndex)
          : props.isExternalViewOpen
            ? renderExternalContentColumn(props)
          : topicRootId
            ? renderStandardContentColumn(props, dualListState, topicRootId)
            : renderSingleListFallback(props)}
      </div>
    </div>
  );
}
