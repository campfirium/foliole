import type { ReactNode } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';

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
  return (
    <div
      className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]"
      style={{ gridTemplateColumns: props.isImmersiveMode ? 'minmax(0, 1fr)' : '40px minmax(0, 1fr)' }}
    >
      {props.isImmersiveMode ? null : (
        <WorkspaceLeftRail
          isImportManagementOpen={isImportManagementOpen}
          onOpenImportManagement={onOpenImportManagement}
          onStartClipboardImport={onStartClipboardImport}
          onStartImport={onStartImport}
          props={props}
        />
      )}
      <WorkspaceGridContent
        activeRightPanelId={activeRightPanelId}
        documentNodeId={documentNodeId}
        isImmersiveEditing={isImmersiveEditing}
        onEnterImmersiveEdit={onEnterImmersiveEdit}
        onShouldSuppressSelectionRestore={onShouldSuppressSelectionRestore}
        onSelectNode={onSelectNode}
        props={props}
      />
    </div>
  );
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

function getWorkspaceGridColumns(props: WorkspaceLayoutProps) {
  if (props.isImmersiveMode) {
    return 'grid-cols-1 xl:grid-cols-1';
  }
  if (props.isListCollapsed && props.isRightSidebarCollapsed) {
    return 'grid-cols-1 xl:grid-cols-1';
  }
  if (props.isListCollapsed) {
    return 'grid-cols-1 xl:[grid-template-columns:minmax(0,1fr)_1px_minmax(0,var(--workspace-right-sidebar-width,320px))]';
  }
  if (props.isRightSidebarCollapsed) {
    return '[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)] xl:[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)]';
  }
  return '[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)] xl:[grid-template-columns:minmax(0,var(--workspace-list-width,300px))_1px_minmax(0,1fr)_1px_minmax(0,var(--workspace-right-sidebar-width,320px))]';
}

function WorkspaceGridContent({
  activeRightPanelId,
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
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
        onEnterImmersiveEdit,
        onShouldSuppressSelectionRestore,
        onSelectNode,
        props
      })}
    </WorkspaceLayoutGridFrame>
  );
}

function renderWorkspaceGridColumns(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  props: WorkspaceLayoutProps;
}) {
  const shouldShowList = !args.props.isImmersiveMode && !args.props.isListCollapsed;
  const shouldShowRightSidebar = !args.props.isImmersiveMode && !args.props.isRightSidebarCollapsed;

  return [
    shouldShowList ? <WorkspaceListArea key="list" onSelectNode={args.onSelectNode} props={args.props} /> : null,
    shouldShowList ? (
      <WorkspaceListSplitter
        key="list-splitter"
        isResizingList={args.props.isResizingList}
        listWidth={args.props.listWidth}
        onResetLayout={args.props.onResetLayout}
        onSplitterKeyDown={args.props.onSplitterKeyDown}
        onSplitterPointerDown={args.props.onSplitterPointerDown}
      />
    ) : null,
    <WorkspaceDocumentArea
      key="document"
      documentNodeId={args.documentNodeId}
      isImmersiveEditing={args.isImmersiveEditing}
      onEnterImmersiveEdit={args.onEnterImmersiveEdit}
      onShouldSuppressSelectionRestore={args.onShouldSuppressSelectionRestore}
      props={args.props}
    />,
    shouldShowRightSidebar ? (
      <WorkspaceRightSidebarSplitter
        key="right-sidebar-splitter"
        isResizingRightSidebar={args.props.isResizingRightSidebar}
        onResetLayout={args.props.onResetLayout}
        onRightSidebarSplitterKeyDown={args.props.onRightSidebarSplitterKeyDown}
        onRightSidebarSplitterPointerDown={args.props.onRightSidebarSplitterPointerDown}
        rightSidebarWidth={args.props.rightSidebarWidth}
      />
    ) : null,
    shouldShowRightSidebar ? (
      <WorkspaceRightSidebar
        key="right-sidebar"
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
    ) : null
  ];
}
