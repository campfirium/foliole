import type { ReactNode } from 'react';

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
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onSelectNode: (nodeId: string) => void;
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutProps;
}) {
  recordComponentRender('workspaceGrid');
  if (props.isImmersiveMode) {
    return (
      <div className="grid min-h-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <WorkspaceDocumentArea
          documentNodeId={documentNodeId}
          isImmersiveEditing={isImmersiveEditing}
          onEnterImmersiveEdit={onEnterImmersiveEdit}
          props={props}
        />
      </div>
    );
  }
  return (
    <div className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]" style={{ gridTemplateColumns: '40px minmax(0, 1fr)' }}>
      <WorkspaceLeftRail
        isImportManagementOpen={isImportManagementOpen}
        onOpenImportManagement={onOpenImportManagement}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        props={props}
      />
      <WorkspaceGridContent
        activeRightPanelId={activeRightPanelId}
        documentNodeId={documentNodeId}
        isImmersiveEditing={isImmersiveEditing}
        onEnterImmersiveEdit={onEnterImmersiveEdit}
        onSelectNode={onSelectNode}
        props={props}
      />
    </div>
  );
}

function WorkspaceLayoutGridFrame({
  children,
  isResizingList,
  isResizingRightSidebar,
  props
}: {
  children: ReactNode;
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className="col-start-2 min-h-0 min-w-0 overflow-hidden max-[1080px]:col-start-1">
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
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <WorkspaceLayoutGridFrame
      isResizingList={props.isResizingList}
      isResizingRightSidebar={props.isResizingRightSidebar}
      props={props}
    >
      {renderWorkspaceGridColumns({
        activeRightPanelId,
        documentNodeId,
        isImmersiveEditing,
        onEnterImmersiveEdit,
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
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <>
      {!args.props.isListCollapsed ? <WorkspaceListArea onSelectNode={args.onSelectNode} props={args.props} /> : null}
      {!args.props.isListCollapsed ? (
        <WorkspaceListSplitter
          isResizingList={args.props.isResizingList}
          listWidth={args.props.listWidth}
          onResetLayout={args.props.onResetLayout}
          onSplitterKeyDown={args.props.onSplitterKeyDown}
          onSplitterPointerDown={args.props.onSplitterPointerDown}
        />
      ) : null}
      <WorkspaceDocumentArea
        documentNodeId={args.documentNodeId}
        isImmersiveEditing={args.isImmersiveEditing}
        onEnterImmersiveEdit={args.onEnterImmersiveEdit}
        props={args.props}
      />
      {!args.props.isRightSidebarCollapsed ? (
        <WorkspaceRightSidebarSplitter
          isResizingRightSidebar={args.props.isResizingRightSidebar}
          onResetLayout={args.props.onResetLayout}
          onRightSidebarSplitterKeyDown={args.props.onRightSidebarSplitterKeyDown}
          onRightSidebarSplitterPointerDown={args.props.onRightSidebarSplitterPointerDown}
          rightSidebarWidth={args.props.rightSidebarWidth}
        />
      ) : null}
      {!args.props.isRightSidebarCollapsed ? (
        <WorkspaceRightSidebar
          activePanelId={args.activeRightPanelId}
          activeNodeId={args.documentNodeId}
          nodeOrder={args.props.nodeOrder}
          trashedNodeIds={args.props.trashedNodeIds}
          nodesById={args.props.nodesById}
          onRevealAnchorInDocument={args.props.onRevealAnchorInDocument}
          onSelectNode={args.onSelectNode}
          reviewCurrentNodeId={args.props.reviewCurrentNodeId}
          reviewQueueNodeIds={args.props.reviewPanelQueueNodeIds}
          reviewSchedulerSettings={args.props.reviewSchedulerSettings}
        />
      ) : null}
    </>
  );
}
