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
  onOpenImportManagement,
  onStartClipboardImport,
  onStartImport,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  recordComponentRender('workspaceGrid');
  return (
    <div className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]" style={{ gridTemplateColumns: '40px minmax(0, 1fr)' }}>
      <WorkspaceLeftRail
        isImportManagementOpen={isImportManagementOpen}
        onOpenImportManagement={onOpenImportManagement}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        props={props}
      />
      <WorkspaceGridContent activeRightPanelId={activeRightPanelId} documentNodeId={documentNodeId} onSelectNode={onSelectNode} props={props} />
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
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  props: WorkspaceLayoutProps;
}) {
  return (
    <WorkspaceLayoutGridFrame
      isResizingList={props.isResizingList}
      isResizingRightSidebar={props.isResizingRightSidebar}
      props={props}
    >
      {!props.isListCollapsed ? <WorkspaceListArea onSelectNode={onSelectNode} props={props} /> : null}
      {!props.isListCollapsed ? (
        <WorkspaceListSplitter
          isResizingList={props.isResizingList}
          listWidth={props.listWidth}
          onResetLayout={props.onResetLayout}
          onSplitterKeyDown={props.onSplitterKeyDown}
          onSplitterPointerDown={props.onSplitterPointerDown}
        />
      ) : null}
      <WorkspaceDocumentArea documentNodeId={documentNodeId} props={props} />
      {!props.isRightSidebarCollapsed ? (
        <WorkspaceRightSidebarSplitter
          isResizingRightSidebar={props.isResizingRightSidebar}
          onResetLayout={props.onResetLayout}
          onRightSidebarSplitterKeyDown={props.onRightSidebarSplitterKeyDown}
          onRightSidebarSplitterPointerDown={props.onRightSidebarSplitterPointerDown}
          rightSidebarWidth={props.rightSidebarWidth}
        />
      ) : null}
      {!props.isRightSidebarCollapsed ? (
        <WorkspaceRightSidebar
          activePanelId={activeRightPanelId}
          activeNodeId={documentNodeId}
          nodeOrder={props.nodeOrder}
          trashedNodeIds={props.trashedNodeIds}
          nodesById={props.nodesById}
          onRevealAnchorInDocument={props.onRevealAnchorInDocument}
          onSelectNode={onSelectNode}
          reviewCurrentNodeId={props.reviewCurrentNodeId}
          reviewQueueNodeIds={props.reviewPanelQueueNodeIds}
          reviewSchedulerSettings={props.reviewSchedulerSettings}
        />
      ) : null}
    </WorkspaceLayoutGridFrame>
  );
}
