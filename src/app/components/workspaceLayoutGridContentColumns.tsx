import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import {
  WorkspaceDocumentArea,
  WorkspaceListArea
} from './WorkspaceLayoutGridSections';
import { WorkspaceListSplitter } from './WorkspaceListSplitter';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';
import { WorkspaceRightSidebarSplitter } from './WorkspaceRightSidebarSplitter';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

interface WorkspaceGridColumnArgs {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  listNodesById: WorkspaceListNodesById;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  props: WorkspaceLayoutProps;
}

function renderDocumentColumn(args: WorkspaceGridColumnArgs) {
  return (
    <WorkspaceDocumentArea
      key="document"
      documentNodeId={args.documentNodeId}
      isImmersiveEditing={args.isImmersiveEditing}
      onEnterImmersiveEdit={args.onEnterImmersiveEdit}
      onShouldSuppressSelectionRestore={args.onShouldSuppressSelectionRestore}
      props={args.props}
    />
  );
}

function renderListColumns(args: Pick<WorkspaceGridColumnArgs, 'listNodesById' | 'onSelectNode' | 'props'> & { isCollapsed: boolean }) {
  return [
    <div aria-hidden={args.isCollapsed} className="flex min-w-0 flex-col overflow-hidden" key="list">
      <WorkspaceListArea
        activeNodeId={args.props.activeNodeId}
        activeVirtualNodeId={args.props.activeVirtualNodeId ?? null}
        externalEntriesByFolderId={args.props.externalEntriesByFolderId}
        externalFolders={args.props.externalFolders}
        externalSelection={args.props.externalSelection}
        isExternalViewOpen={args.props.isExternalViewOpen}
        isTrashViewOpen={args.props.isTrashViewOpen}
        isVirtualViewOpen={args.props.isVirtualViewOpen}
        isWorkspaceHydrated={args.props.isWorkspaceHydrated}
        listNodesById={args.listNodesById}
        nodesById={args.props.nodesById}
        nodeOrder={args.props.nodeOrder}
        onOpenMoveToNode={args.props.onOpenMoveToNode}
        onOpenNotesView={args.props.onOpenNotesView}
        onOpenExternalSelection={args.props.onOpenExternalSelection}
        onOpenExternalLibrarySettings={args.props.onOpenExternalLibrarySettings}
        onOpenTrashView={args.props.onOpenTrashView}
        onOpenVirtualView={args.props.onOpenVirtualView}
        onSelectNode={args.onSelectNode}
        onSelectNodeInVirtualView={args.props.onSelectNodeInVirtualView}
        onSelectTrashNode={args.props.onSelectTrashNode}
        selectedTrashNodeId={args.props.selectedTrashNodeId}
        trashedNodeIds={args.props.trashedNodeIds}
      />
    </div>,
    <div aria-hidden={args.isCollapsed} className="flex min-w-0 overflow-visible" key="list-splitter">
      <WorkspaceListSplitter
        isCollapsed={args.isCollapsed}
        isResizingList={args.props.isResizingList}
        listWidth={args.props.listWidth}
        onResetLayout={args.props.onResetLayout}
        onSplitterKeyDown={args.props.onSplitterKeyDown}
        onSplitterPointerDown={args.props.onSplitterPointerDown}
      />
    </div>
  ];
}

function renderRightSidebarColumns(
  args: Pick<WorkspaceGridColumnArgs, 'activeRightPanelId' | 'documentNodeId' | 'onSelectNode' | 'props'> & { isCollapsed: boolean }
) {
  return [
    <div
      aria-hidden={args.isCollapsed}
      className="hidden min-w-0 overflow-visible xl:flex"
      key="right-sidebar-splitter"
    >
      <WorkspaceRightSidebarSplitter
        isCollapsed={args.isCollapsed}
        isResizingRightSidebar={args.props.isResizingRightSidebar}
        onResetLayout={args.props.onResetLayout}
        onRightSidebarSplitterKeyDown={args.props.onRightSidebarSplitterKeyDown}
        onRightSidebarSplitterPointerDown={args.props.onRightSidebarSplitterPointerDown}
        rightSidebarWidth={args.props.rightSidebarWidth}
      />
    </div>,
    <div
      aria-hidden={args.isCollapsed}
      className="hidden min-w-0 flex-col overflow-hidden xl:flex"
      key="right-sidebar"
    >
      <WorkspaceRightSidebar
        activePanelId={args.activeRightPanelId}
        activeNodeId={args.documentNodeId}
        nodeOrder={args.props.nodeOrder}
        trashedNodeIds={args.props.trashedNodeIds}
        nodesById={args.props.nodesById}
        onRevealAnchorInDocument={args.props.onRevealAnchorInDocument}
        onSelectBreadcrumbNode={args.props.onSelectBreadcrumbNode}
        onSelectNode={args.onSelectNode}
        reviewCurrentNodeId={args.props.reviewCurrentNodeId}
        reviewQueueNodeIds={args.props.reviewPanelQueueNodeIds}
        reviewSchedulerSettings={args.props.reviewSchedulerSettings}
      />
    </div>
  ];
}

export function renderWorkspaceGridColumns(args: WorkspaceGridColumnArgs) {
  if (args.props.isImmersiveMode) {
    return [renderDocumentColumn(args)];
  }

  return [
    ...renderListColumns({ isCollapsed: args.props.isListCollapsed, listNodesById: args.listNodesById, onSelectNode: args.onSelectNode, props: args.props }),
    renderDocumentColumn(args),
    ...renderRightSidebarColumns({
      activeRightPanelId: args.activeRightPanelId,
      documentNodeId: args.documentNodeId,
      isCollapsed: args.props.isRightSidebarCollapsed,
      onSelectNode: args.onSelectNode,
      props: args.props
    })
  ];
}
