import type { StudySessionCompleteSummaryProps } from '../../features/review/components/StudySessionCompleteSummary';
import type { CompactWorkspaceSidebars } from '../hooks/useCompactWorkspaceSidebars';

import { WorkspaceCompactRightPanelActions, WorkspaceCompactSidebarBackdrop } from './WorkspaceCompactSidebarControls';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import {
  WorkspaceDocumentArea,
  WorkspaceListArea,
  type WorkspaceListAreaProps
} from './WorkspaceLayoutGridSections';
import { WorkspaceListSplitter, type WorkspaceListSplitterProps } from './WorkspaceListSplitter';
import { WorkspaceRightSidebar, type WorkspaceRightSidebarProps } from './WorkspaceRightSidebar';
import {
  WorkspaceRightSidebarSplitter,
  type WorkspaceRightSidebarSplitterProps
} from './WorkspaceRightSidebarSplitter';
import { WorkspaceSidebarFocusBoundary } from './WorkspaceSidebarFocusBoundary';

export interface WorkspaceGridColumnProps {
  documentSurfaceProps: WorkspaceDocumentSurfaceProps;
  studySessionCompleteSummaryProps: StudySessionCompleteSummaryProps | null;
  isImmersiveMode: boolean;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  compactSidebars?: CompactWorkspaceSidebars | undefined;
  listAreaProps: WorkspaceListAreaProps;
  listSplitterProps: WorkspaceListSplitterProps;
  rightSidebarProps: WorkspaceRightSidebarProps;
  rightSidebarSplitterProps: WorkspaceRightSidebarSplitterProps;
}

function renderDocumentColumn(
  args: Pick<WorkspaceGridColumnProps, 'documentSurfaceProps' | 'studySessionCompleteSummaryProps'>
) {
  return (
    <WorkspaceDocumentArea
      key="document"
      documentSurfaceProps={args.documentSurfaceProps}
      studySessionCompleteSummaryProps={args.studySessionCompleteSummaryProps}
    />
  );
}

function renderListColumns(
  args: Pick<WorkspaceGridColumnProps, 'isListCollapsed' | 'listAreaProps' | 'listSplitterProps' | 'compactSidebars'>
) {
  return [
    <WorkspaceSidebarFocusBoundary
      side="left" unavailable={args.isListCollapsed}
      data-workspace-side-column="list"
      aria-hidden={args.isListCollapsed}
      hidden={args.compactSidebars?.leftFloating && args.isListCollapsed}
      className={args.compactSidebars?.leftFloating
        ? 'workspace-floating-sidebar workspace-floating-sidebar-left flex min-w-0 flex-col overflow-hidden'
        : 'flex min-w-0 flex-col overflow-hidden max-[1080px]:hidden'}
      key="list"
    >
      <WorkspaceListArea {...args.listAreaProps} />
    </WorkspaceSidebarFocusBoundary>,
    <WorkspaceSidebarFocusBoundary side="left" unavailable={args.isListCollapsed || Boolean(args.compactSidebars?.leftFloating)} aria-hidden={args.isListCollapsed} className="flex min-w-0 overflow-visible max-[1080px]:hidden" key="list-splitter">
      <WorkspaceListSplitter {...args.listSplitterProps} />
    </WorkspaceSidebarFocusBoundary>
  ];
}

function renderRightSidebarColumns(
  args: Pick<
    WorkspaceGridColumnProps,
    'isImmersiveMode' | 'isRightSidebarCollapsed' | 'rightSidebarProps' | 'rightSidebarSplitterProps' | 'compactSidebars'
  >
) {
  return [
    <WorkspaceSidebarFocusBoundary
      side="right" unavailable={args.isImmersiveMode || args.isRightSidebarCollapsed || Boolean(args.compactSidebars?.rightFloating)}
      aria-hidden={args.isRightSidebarCollapsed}
      className="hidden min-w-0 overflow-visible xl:flex"
      key="right-sidebar-splitter"
      style={args.isImmersiveMode ? { display: 'none' } : undefined}
    >
      <WorkspaceRightSidebarSplitter {...args.rightSidebarSplitterProps} />
    </WorkspaceSidebarFocusBoundary>,
    <WorkspaceSidebarFocusBoundary
      side="right" unavailable={args.isImmersiveMode || args.isRightSidebarCollapsed}
      data-workspace-side-column="right"
      aria-hidden={args.isRightSidebarCollapsed}
      hidden={args.isImmersiveMode || (args.compactSidebars?.rightFloating && args.isRightSidebarCollapsed)}
      style={args.isImmersiveMode ? { display: 'none' } : undefined}
      className={args.compactSidebars?.rightFloating
        ? 'workspace-floating-sidebar workspace-floating-sidebar-right flex min-w-0 flex-col overflow-hidden'
        : 'hidden min-w-0 flex-col overflow-hidden xl:flex'}
      key="right-sidebar"
    >
      {args.compactSidebars?.rightFloating
        ? <WorkspaceCompactRightPanelActions activePanelId={args.rightSidebarProps.activePanelId} />
        : null}
      <WorkspaceRightSidebar {...args.rightSidebarProps}
        isPanelContentVisible={!args.isImmersiveMode && !(args.isRightSidebarCollapsed && (
          args.rightSidebarProps.activePanelId === 'assistant' || args.rightSidebarProps.activePanelId === 'performance'
          || args.rightSidebarProps.activePanelId === 'review-queue'
        ))} />
    </WorkspaceSidebarFocusBoundary>
  ];
}

export function renderWorkspaceGridColumns(args: WorkspaceGridColumnProps) {
  if (args.isImmersiveMode) {
    return [renderDocumentColumn(args), ...renderRightSidebarColumns(args)];
  }

  return [
    ...(args.compactSidebars ? [<WorkspaceCompactSidebarBackdrop key="sidebar-backdrop" sidebars={args.compactSidebars} />] : []),
    ...renderListColumns(args),
    renderDocumentColumn(args),
    ...renderRightSidebarColumns(args)
  ];
}
