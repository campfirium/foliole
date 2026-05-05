import { useMemo, useRef, type ReactNode } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';
import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';

import { WorkspaceBottomReviewToolbar } from './WorkspaceBottomReviewToolbar';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import {
  WorkspaceDocumentArea,
  WorkspaceLeftRail,
  WorkspaceListArea
} from './WorkspaceLayoutGridSections';
import { WorkspaceListSplitter } from './WorkspaceListSplitter';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';
import { WorkspaceRightSidebarSplitter } from './WorkspaceRightSidebarSplitter';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';
export function WorkspaceLayoutGrid({
  activeRightPanelId,
  documentNodeId,
  isImportManagementOpen,
  onEnterImmersiveEdit,
  onOpenImportManagement,
  onShouldSuppressSelectionRestore,
  onStartClipboardImport,
  onStartImport,
  onSelectNode,
  isImmersiveEditing,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onEnterImmersiveEdit: () => void;
  onOpenImportManagement: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutProps;
}) {
  recordComponentRender('workspaceGrid');
  const listNodesById = useProjectedListNodesById(props.nodesById);
  return (
    <div
      className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]"
      style={{
        gridTemplateColumns: props.isImmersiveMode
          ? 'minmax(0, 1fr)'
          : 'var(--workspace-rail-width) minmax(0, 1fr)'
      }}
    >
      {props.isImmersiveMode ? null : (
        <WorkspaceLeftRail
          isImportManagementOpen={isImportManagementOpen}
          onOpenImportManagement={onOpenImportManagement}
          onStartClipboardImport={onStartClipboardImport}
          onStartImport={onStartImport}
          showStudyDock={!props.isStudyMode}
          props={props}
        />
      )}
      <WorkspaceGridContent
        activeRightPanelId={activeRightPanelId}
        documentNodeId={documentNodeId}
        isImmersiveEditing={isImmersiveEditing}
        listNodesById={listNodesById}
        onEnterImmersiveEdit={onEnterImmersiveEdit}
        onShouldSuppressSelectionRestore={onShouldSuppressSelectionRestore}
        onSelectNode={onSelectNode}
        props={props}
      />
      <WorkspaceBottomReviewToolbar props={props} />
    </div>
  );
}

function useProjectedListNodesById(nodesById: WorkspaceLayoutProps['nodesById']) {
  const previousListNodesByIdRef = useRef<WorkspaceListNodesById>({});
  return useMemo(() => {
    const nextProjection = projectWorkspaceListNodesById(
      nodesById,
      previousListNodesByIdRef.current
    );
    previousListNodesByIdRef.current = nextProjection;
    return nextProjection;
  }, [nodesById]);
}

function WorkspaceLayoutGridFrame({
  children,
  isImmersiveMode,
  isResizingList,
  isResizingRightSidebar,
  props
}: {
  children: ReactNode;
  isImmersiveMode: boolean;
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className={`${isImmersiveMode ? 'col-start-1' : 'col-start-2'} min-h-0 min-w-0 overflow-hidden max-[1080px]:col-start-1`}>
      <div
        className={`grid h-full min-h-0 gap-0 overflow-hidden ${getWorkspaceGridColumns(props)} max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,38dvh)_minmax(0,1fr)]`}
        data-resizing={isResizingList || isResizingRightSidebar}
      >
        {children}
      </div>
    </div>
  );
}

function WorkspaceGridContent({
  activeRightPanelId,
  documentNodeId,
  isImmersiveEditing,
  listNodesById,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  listNodesById: WorkspaceListNodesById;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <WorkspaceLayoutGridFrame
      isImmersiveMode={props.isImmersiveMode}
      isResizingList={props.isResizingList}
      isResizingRightSidebar={props.isResizingRightSidebar}
      props={props}
    >
      {renderWorkspaceGridColumns({
        activeRightPanelId,
        documentNodeId,
        isImmersiveEditing,
        listNodesById,
        onEnterImmersiveEdit,
        onShouldSuppressSelectionRestore,
        onSelectNode,
        props
      })}
    </WorkspaceLayoutGridFrame>
  );
}

function renderListColumns(args: {
  isCollapsed: boolean;
  listNodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  props: WorkspaceLayoutProps;
}) {
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

function renderRightSidebarColumns(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isCollapsed: boolean;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  props: WorkspaceLayoutProps;
}) {
  return [
    <div aria-hidden={args.isCollapsed} className="flex min-w-0 overflow-visible" key="right-sidebar-splitter">
      <WorkspaceRightSidebarSplitter
        isCollapsed={args.isCollapsed}
        isResizingRightSidebar={args.props.isResizingRightSidebar}
        onResetLayout={args.props.onResetLayout}
        onRightSidebarSplitterKeyDown={args.props.onRightSidebarSplitterKeyDown}
        onRightSidebarSplitterPointerDown={args.props.onRightSidebarSplitterPointerDown}
        rightSidebarWidth={args.props.rightSidebarWidth}
      />
    </div>,
    <div aria-hidden={args.isCollapsed} className="flex min-w-0 flex-col overflow-hidden" key="right-sidebar">
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

function renderWorkspaceGridColumns(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  listNodesById: WorkspaceListNodesById;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  props: WorkspaceLayoutProps;
}) {
  return [
    ...renderListColumns({ ...args, isCollapsed: args.props.isImmersiveMode || args.props.isListCollapsed }),
    <WorkspaceDocumentArea
      key="document"
      documentNodeId={args.documentNodeId}
      isImmersiveEditing={args.isImmersiveEditing}
      onEnterImmersiveEdit={args.onEnterImmersiveEdit}
      onShouldSuppressSelectionRestore={args.onShouldSuppressSelectionRestore}
      props={args.props}
    />,
    ...renderRightSidebarColumns({ ...args, isCollapsed: args.props.isImmersiveMode || args.props.isRightSidebarCollapsed })
  ];
}
